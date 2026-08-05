# Long Polling

## Punto de partida: el mismo problema que WebSockets, resuelto sin salir de HTTP

En `04_websockets` el punto de partida fue: HTTP es request/response, el servidor no puede hablar si nadie le preguntó antes. WebSocket resuelve eso saliéndose de HTTP (`Upgrade` a un protocolo propio). Long polling parte del mismo problema pero con una restricción distinta: **no podés (o no querés) salir de HTTP** — quizás por infraestructura vieja que no soporta `Upgrade`, quizás porque no necesitás la complejidad de mantener un protocolo binario aparte. La pregunta que responde long polling es: *¿cuánto push podés conseguir quedándote 100% adentro de request/response?*

## El punto de partida ingenuo: short polling

La primera idea, la más obvia, es simplemente preguntar seguido:

```js
setInterval(() => fetch('/mensajes?desde=' + ultimoId).then(...), 3000);
```

Esto tiene un problema estructural: **la latencia de un mensaje nuevo está atada al intervalo**, no a cuándo realmente ocurrió. Si el intervalo es 3s y el mensaje llegó justo después de la última pregunta, tarda casi 3s en notarse. Bajar el intervalo (preguntar cada 500ms) reduce la latencia pero dispara el número de requests — la gran mayoría de las cuales van a responder "no hay nada nuevo". Es un trade-off directo entre latencia y desperdicio, y no hay forma de hacerlo bien: cualquier intervalo fijo es un compromiso, no una solución.

## La idea de long polling: invertir quién controla cuándo se responde

La mejora no es preguntar más rápido, es cambiar *quién decide cuándo termina la request*. En vez de que el servidor responda inmediatamente "no hay nada" y el cliente vuelva a preguntar en 3s, el servidor **no responde todavía** — deja la conexión HTTP abierta, sin mandar la response, hasta que efectivamente haya algo que contar (o hasta un timeout de seguridad, típicamente 20-30s). En el momento en que hay una novedad, el servidor responde de inmediato con eso. El cliente, apenas recibe la response, abre **otra** request idéntica al toque.

```
Cliente:  GET /poll?desde=42          (se queda esperando...)
Servidor: (nada nuevo todavía, la request sigue abierta)
                                       ...pasan 8 segundos...
                                       (llega un mensaje nuevo)
Servidor: 200 OK  { mensajes: [...], desde: 43 }   <- ahora sí responde
Cliente:  GET /poll?desde=43          (inmediatamente abre la próxima)
```

El resultado observable se parece mucho a push: el cliente se entera del mensaje casi en el instante en que ocurrió (no hay que esperar un intervalo fijo), sin la ráfaga de requests vacías del polling corto. Pero por debajo **sigue siendo puro HTTP request/response** — no hay ningún protocolo nuevo, ningún `Upgrade`, ningún socket especial. Es la misma primitiva de siempre, usada con paciencia.

## El costo real: una request completa por cada mensaje

Esa simplicidad tiene un precio que no tiene WebSocket: **cada mensaje del servidor implica abrir y cerrar una request HTTP entera**, con sus headers completos (cookies, user-agent, todo lo que el cliente mande por default) yendo y viniendo cada vez. Comparado con un frame de WebSocket (2 bytes de overhead), una request HTTP de long polling son cientos de bytes de headers repetidos por cada mensaje individual. Para un mensaje cada tanto (notificaciones, actualizaciones poco frecuentes) es insignificante. Para un chat activo o un feed de alta frecuencia, ese overhead repetido es exactamente el cuello de botella que WebSocket evita.

También hay un costo del lado servidor que no es obvio a primera vista: mantener miles de requests HTTP "colgadas" esperando requiere un modelo de I/O asíncrono (event loop, como Node, o NIO en otros stacks). Un modelo viejo de thread-per-request se quedaría sin threads enseguida si cada conexión ociosa bloquea un thread entero durante 20-30 segundos.

## Por qué existe el timeout

Dejar una request abierta indefinidamente no es gratis ni seguro: proxies, load balancers y el propio browser tienen timeouts de conexión ociosa (a veces tan bajos como 30-60s) que van a cortar la conexión igual si nadie manda nada. Por eso el servidor se auto-impone un timeout más corto que esos límites (en el demo, 25s) y responde con una lista vacía si no pasó nada — el cliente lo interpreta igual que cualquier otra respuesta y abre la próxima request de inmediato. Esto también funciona como heartbeat implícito: si el cliente deja de recibir ni siquiera esas respuestas vacías, sabe que algo se rompió en el medio.

## Long polling vs Short polling vs WebSocket vs SSE

| | Short polling | Long polling | WebSocket | SSE |
|---|---|---|---|---|
| Transporte | HTTP, requests periódicas | HTTP, requests que se demoran | TCP tras upgrade | HTTP, una request larga |
| Latencia de un mensaje nuevo | Hasta 1 intervalo completo | Casi inmediata | Inmediata | Inmediata |
| Requests "vacías" desperdiciadas | Muchas | Ninguna (solo el timeout ocasional) | Ninguna | Ninguna |
| Overhead por mensaje | Headers HTTP completos | Headers HTTP completos | ~2 bytes | Bajo (misma conexión) |
| Dirección | Servidor→cliente (simulado) | Servidor→cliente (simulado) | Bidireccional real | Solo servidor→cliente |
| Requiere infraestructura especial | No | No (solo timeouts generosos) | Sí (soporte de `Upgrade`) | No |
| Modelo de servidor necesario | Cualquiera | Async I/O (muchas conexiones colgadas) | Async I/O | Async I/O |

## Cuándo usar long polling (y cuándo no)

**A favor:**
- Necesitás push del servidor pero **no podés** (por infraestructura, proxies corporativos viejos, políticas de firewall) atravesar un `Upgrade` a WebSocket. Es el fallback más compatible que existe porque es HTTP puro, indistinguible de cualquier otra request.
- Frecuencia de mensajes baja o media, donde el overhead de una request completa por mensaje no es un problema real.
- Querés evitar mantener un protocolo/librería aparte para algo que en el fondo son notificaciones esporádicas.

**En contra:**
- Alto volumen de mensajes o baja latencia crítica bajo carga: el overhead por mensaje (una request HTTP entera cada vez) escala mal. Ahí **WebSocket** gana claramente.
- Solo necesitás servidor→cliente (nunca al revés) y tenés control sobre la infraestructura: **SSE** da la misma experiencia con reconexión automática incluida en el browser y menos código manual (no hay que reabrir la request vos mismo).
- Hoy en día, si podés elegir libremente y el caso de uso es push simple, long polling casi siempre pierde contra SSE (mismo modelo de compatibilidad HTTP, menos trabajo manual) o WebSocket (si además necesitás bidireccional). Long polling sigue vivo sobre todo como fallback quirúrgico, no como primera opción.

## Conexión con el resto de `07_comunicacion-entre-servicios`

- Comparado con **WebSockets** (`04_websockets`): mismo objetivo (push del servidor), pero long polling se queda dentro de HTTP request/response en vez de reemplazarlo — a costa de overhead por mensaje y de que el cliente tiene que reabrir la conexión a mano cada vez.
- Comparado con **SSE** (`06_server-sent-events`): SSE es, en cierto sentido, "long polling hecho bien" cuando solo necesitás una dirección — una sola conexión que se mantiene abierta de verdad (no se reabre por cada mensaje) y con reconexión automática nativa del browser.
- Comparado con **gRPC streaming** (`03_grpc-rpc`): gRPC resuelve el mismo problema de fondo nativamente vía HTTP/2, sin necesitar ningún patrón manual como este — pero exige un contrato `.proto` y no es apto para un cliente browser sin un proxy `grpc-web` de por medio.
