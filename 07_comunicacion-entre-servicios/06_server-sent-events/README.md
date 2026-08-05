# Server-Sent Events (SSE)

## Punto de partida: ¿y si el problema real es más chico de lo que parece?

WebSocket resuelve "necesito bidireccional persistente" saliéndose de HTTP. Long polling resuelve "necesito push sin salir de HTTP" reabriendo una request por cada mensaje. Pero en un montón de casos reales — notificaciones, un feed de precios, el progreso de un job, logs en vivo — el cliente **nunca** necesita mandar nada por ese mismo canal. Es servidor→cliente, punto. Pedirle a WebSocket que resuelva eso es usar una herramienta bidireccional para un problema unidireccional: funciona, pero cargás con complejidad (framing binario, manejar reconexión vos mismo, un protocolo separado de HTTP) que ese caso de uso no necesita.

SSE parte de una pregunta distinta a la de WebSocket: no "¿cómo hago full-duplex sobre TCP?", sino "¿qué es lo mínimo que necesito para que el servidor me mande datos indefinidamente, sin jamás salir de una request HTTP normal?".

## La idea: una response que nunca termina

Una response HTTP normal tiene un `Content-Length` (el cliente sabe cuándo termina) o usa `Transfer-Encoding: chunked` (el servidor manda pedazos y al final un chunk de tamaño 0 que marca el fin). SSE explota exactamente esa segunda mecánica, pero **nunca manda el chunk final**: abre la response, pone el header `Content-Type: text/event-stream`, y a partir de ahí va escribiendo texto al socket cada vez que hay algo nuevo, sin cerrar nunca la conexión (salvo error o que el servidor decida cortar).

```
GET /events HTTP/1.1
Accept: text/event-stream

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"precio": 105.2}

data: {"precio": 105.4}

data: {"precio": 104.9}

...(la conexión sigue abierta indefinidamente)
```

No hay handshake especial como en WebSocket (no hay `Upgrade`, no hay `101`) — es un `200 OK` común, con un content-type que le dice al cliente "esto no termina, y cada bloque separado por una línea en blanco es un evento". Cualquier proxy, CDN o firewall que entienda HTTP normal deja pasar esto sin configuración especial (con la salvedad de que algunos hacen buffering de la response y hay que desactivarlo explícitamente para que los datos lleguen en el momento y no todos juntos al final).

## El formato: texto plano, deliberadamente simple

El protocolo entero cabe en unas pocas líneas de spec:

```
data: este es el contenido del evento
<línea en blanco -> fin del evento>

event: nombre-custom
data: evento con un tipo específico, no solo "message"
<línea en blanco>

id: 42
data: este evento tiene un id, para poder reanudar después
<línea en blanco>

retry: 3000
data: le dice al cliente cuánto esperar antes de reintentar si se corta
<línea en blanco>
```

Es **solo texto UTF-8** — a diferencia de WebSocket (que soporta frames binarios), SSE no tiene forma de mandar binario directo; si necesitás mandar algo binario, lo codificás en base64 dentro de `data:`. Esa limitación es aceptable porque el caso de uso típico (notificaciones, JSON, logs) es texto de por sí.

## La pieza clave: reconexión automática con `Last-Event-ID`

Acá está la diferencia más grande con long polling, y es la razón por la que SSE en la práctica requiere mucho menos código manual. El browser expone una API nativa, `EventSource`, que:

1. Abre la conexión a la URL indicada.
2. Si la conexión se corta (por la razón que sea: red, timeout de un proxy, el servidor reinició), **reconecta sola**, sin que el desarrollador escriba ni una línea de retry logic.
3. En esa reconexión, manda automáticamente un header `Last-Event-ID: <el id del último evento que vio>`, tomado del campo `id:` de los eventos recibidos.

```js
const es = new EventSource('/events');
es.onmessage = (e) => console.log(e.data);
// no hay que escribir ningún try/catch, ningún setTimeout de retry: es gratis
```

Del lado del servidor, si asignás un `id:` incremental a cada evento y leés `Last-Event-ID` en las reconexiones, podés **reproducir los eventos que el cliente se perdió** mientras estuvo desconectado, antes de seguir con los nuevos. Esto es lo que hace que SSE sea robusto ante cortes de red intermitentes (wifi de celular, por ejemplo) sin que el desarrollador tenga que reconstruir esa lógica a mano — que es exactamente lo que sí hay que escribir manualmente tanto en long polling (`05_long-polling`, el loop de fetch) como en WebSocket (no reconecta solo).

## Por qué es una sola dirección, y por qué eso es una ventaja, no una limitación

SSE no tiene forma de mandar datos cliente→servidor por el mismo canal — el `EventSource` no tiene un método `.send()`. Si el cliente necesita mandar algo, usa una request HTTP normal aparte (`fetch`/`POST`), completamente desacoplada del stream de eventos. Esto no es una carencia accidental: es la simplicidad del protocolo reflejando exactamente el problema que resuelve. Un canal que solo puede ir en una dirección es más fácil de razonar, cachear en el medio (parcialmente) y depurar que uno bidireccional — usarlo cuando el problema real es unidireccional es la elección correcta, no una limitación a tolerar.

## SSE vs WebSocket vs Long polling vs gRPC server streaming

| | Long polling | WebSocket | SSE | gRPC server streaming |
|---|---|---|---|---|
| Transporte | HTTP, requests repetidas | TCP tras upgrade | HTTP, una request larga | HTTP/2 |
| Dirección | Servidor→cliente (simulado) | Bidireccional real | Solo servidor→cliente | Solo servidor→cliente (en este modo) |
| Reconexión | Manual (reabrir fetch) | Manual | **Automática**, nativa del browser | Depende del cliente |
| Formato | Lo que definas (típ. JSON) | Texto o binario | Solo texto UTF-8 | Protobuf (binario, tipado) |
| Replay de eventos perdidos | No nativo | No nativo | Nativo (`Last-Event-ID`) | No nativo |
| Overhead por mensaje | Alto (headers HTTP repetidos) | Muy bajo (~2 bytes) | Bajo (misma conexión) | Bajo (multiplexado) |
| Cliente browser nativo | `fetch` | `WebSocket` | `EventSource` | Necesita `grpc-web` |
| Atraviesa proxies/firewalls viejos | Sí | Generalmente sí | Sí (es HTTP normal) | A veces problemático |

## Cuándo usar SSE (y cuándo no)

**A favor:**
- El flujo de datos es **estrictamente servidor→cliente**: notificaciones, updates de progreso, feeds de precios/scores, logs en vivo, resultados de un job largo.
- Querés reconexión robusta gratis, sin escribir lógica de retry — importa especialmente en clientes móviles con conectividad inestable.
- Necesitás que el replay de eventos perdidos durante un corte sea trivial de implementar (con `id:` incremental es prácticamente gratis del lado servidor).
- Preferís texto simple (JSON típicamente) por sobre la complejidad de framing binario.

**En contra:**
- Necesitás que el cliente también mande datos por el mismo canal de baja latencia (chat, juegos, ediciones colaborativas): ahí **WebSocket** es la herramienta correcta, SSE ni siquiera lo permite en el mismo canal.
- Sobre HTTP/1.1 puro, los browsers limitan a ~6 conexiones simultáneas por dominio — si una pestaña abre varias `EventSource` al mismo host, se puede agotar ese límite rápido (se resuelve sirviendo sobre HTTP/2, que multiplexa sin ese límite).
- Necesitás mandar binario de forma eficiente: SSE lo obliga a pasar por base64 dentro de texto, WebSocket lo manda nativo.
- Comunicación servicio-a-servicio interna: ahí gRPC streaming (`03_grpc-rpc`) da lo mismo con contrato tipado y mejor rendimiento.

## Conexión con el resto de `07_comunicacion-entre-servicios`

- Comparado con **long polling** (`05_long-polling`): SSE es, en la práctica, "long polling bien resuelto" para el caso unidireccional — una sola conexión real que se mantiene abierta (no se reabre por cada mensaje) y con reconexión + replay que en long polling habría que escribir a mano.
- Comparado con **WebSockets** (`04_websockets`): mismo objetivo de fondo (push del servidor) pero SSE renuncia deliberadamente a la mitad bidireccional a cambio de quedarse 100% dentro de HTTP normal — sin `Upgrade`, sin framing binario, con reconexión gratis.
- Comparado con **gRPC** (`03_grpc-rpc`) y **GraphQL Subscriptions** (`02_graphql`): las subscriptions de GraphQL también podrían implementarse transportando el evento sobre SSE en vez de WebSocket cuando el flujo es unidireccional — el contrato de datos (GraphQL) es independiente del transporte elegido para llevarlo en tiempo real.
