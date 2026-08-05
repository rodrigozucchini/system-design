# WebSockets

## Punto de partida: ¿qué es lo que realmente falta?

Antes de definir qué es un WebSocket conviene preguntarse qué problema *físico* existe. TCP, la capa de transporte debajo de todo esto (ver `01_networking`), ya es **full-duplex**: una vez que dos sockets están conectados, cualquiera de los dos lados puede mandar bytes en cualquier momento, sin turnos. El cable no tiene el problema.

El problema lo agrega **HTTP**, la capa de aplicación que corre arriba de TCP. HTTP/1.1 define un patrón estricto: el cliente manda una request, el servidor manda una response, y ahí termina el intercambio. El servidor no puede, por su cuenta, decidir mandarte un mensaje — solo puede *responder* a algo que vos ya preguntaste. Si el servidor tiene una novedad (llegó un mensaje de chat, cambió un precio, terminó un job), no tiene forma de avisarte: tiene que esperar a que vos volvas a preguntar.

Eso llevó a dos parches, ambos construidos encima de request/response porque es lo único que HTTP ofrece:

- **Polling**: el cliente pregunta "¿hay algo nuevo?" cada N segundos. Simple, pero desperdicia requests cuando no hay nada nuevo, y agrega hasta N segundos de latencia para lo que sí es nuevo.
- **Long polling**: el cliente pregunta, pero el servidor **no responde de inmediato** — deja la request abierta hasta que hay algo que contar (o hasta un timeout), responde, y el cliente inmediatamente abre una request nueva. Reduce el desperdicio de polling, pero sigue siendo request/response por debajo: cada mensaje del servidor cierra una conexión HTTP y obliga a abrir otra.

Ambos son *simulaciones* de push sobre un protocolo que fue diseñado sin push. WebSocket ataca la causa raíz en vez de parchear el síntoma: si el problema es que HTTP le impone request/response a una conexión TCP que ya es full-duplex, la solución es sacar a HTTP del medio después de establecer la conexión, y dejar que cliente y servidor usen esa conexión TCP como lo que siempre fue — un canal en el que cualquiera manda cuando quiere.

## La idea central: upgrade, no un protocolo nuevo desde cero

Para lograr esto, WebSocket no abre una conexión nueva desde cero (eso implicaría un nuevo TCP handshake, y potencialmente quedar bloqueado por firewalls que solo dejan pasar HTTP en el puerto 80/443). En cambio, reutiliza la conexión TCP que ya abriste para hacer una request HTTP normal, y le pide al servidor que la **actualice** (`Upgrade`) a un protocolo distinto:

```
GET /chat HTTP/1.1
Host: localhost:3000
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

Es una request HTTP común y corriente — cualquier proxy o firewall que entienda HTTP la deja pasar sin problema, que es exactamente el punto: WebSocket viaja disfrazado de HTTP hasta el momento del handshake. Si el servidor soporta el upgrade, responde:

```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

`101 Switching Protocols` es la clave: le dice al cliente "a partir de este mismo socket TCP, ya no hablamos más HTTP". Después de este intercambio, ese socket queda abierto indefinidamente y los datos que viajan por él ya no son requests/responses HTTP — son **frames** de WebSocket, en cualquier dirección, sin que nadie tenga que "preguntar" nada.

### `Sec-WebSocket-Key` / `Sec-WebSocket-Accept`: ¿para qué sirve este baile?

No es autenticación ni seguridad — es una prueba de que el servidor del otro lado *entiende el protocolo WebSocket* y no es, por ejemplo, un servidor HTTP viejo, un proxy cacheante, o algo que simplemente hizo eco de la request sin darse cuenta de que era un upgrade. El cliente manda una key aleatoria en base64; el servidor debe concatenarla con un GUID fijo del spec (`258EAFA5-E914-47DA-95CA-C5AB0DC85B11`), sacarle SHA-1 y devolver eso en base64. Un servidor que no implementa el protocolo no va a producir ese valor exacto — con lo cual el handshake falla limpio en vez de dejar al cliente creyendo que tiene un WebSocket cuando en realidad tiene una conexión HTTP rota.

## Frames: la unidad real de comunicación

Una vez completado el handshake, todo lo que viaja por el socket son **frames** binarios, no texto libre. Cada frame tiene, simplificado:

```
 0               1               2               3
 7 6 5 4 3 2 1 0 7 6 5 4 3 2 1 0 7 6 5 4 3 2 1 0
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| payload len |    payload len extendido...  |
|I|S|S|S|  (4)  |A|     (7)     |   (si len == 126 o 127)      |
|N|V|V|V|       |S|             |                               |
+-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
|                     máscara (4 bytes, si MASK=1)             |
+ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
|                     payload (XOR con la máscara)             |
```

Lo importante de esto, aunque en la práctica casi nadie parsea frames a mano (los navegadores y librerías lo hacen por vos):

- **`opcode`** dice qué tipo de frame es: `0x1` texto, `0x2` binario, `0x8` close, `0x9` ping, `0xA` pong. Los frames de control (`ping`/`pong`/`close`) son cómo cada lado detecta que el otro sigue vivo o quiere cortar, sin necesitar una request HTTP para eso.
- **`MASK`**: todo frame que viaja **cliente → servidor** tiene que venir enmascarado (XOR con una clave de 4 bytes que va en el frame). Esto no es cifrado — es una defensa específica contra proxies intermedios mal escritos que podrían interpretar bytes de un payload controlado por el atacante como si fueran comandos HTTP válidos (cache poisoning). Los frames **servidor → cliente** no se enmascaran, porque el servidor no está detrás de un proxy que un atacante externo pueda envenenar de la misma forma.
- El frame es liviano a propósito: 2 bytes de overhead mínimo (contra headers HTTP completos en cada mensaje de long polling). Eso es lo que hace viable mandar muchos mensajes chicos por segundo (juegos, cursores colaborativos, chats) sin que el overhead del protocolo domine el tráfico real.

## Full-duplex real, sin turnos

La diferencia observable, no solo teórica: en HTTP request/response (incluso long polling), el servidor **nunca** puede hablar primero. En WebSocket, el servidor puede escribir al socket en cualquier momento — un timer, un evento de otro cliente, lo que sea — sin que el cliente haya pedido nada. El demo de este folder lo muestra literalmente: el servidor manda un `heartbeat` cada 5 segundos a todos los conectados, sin que ningún cliente lo haya solicitado.

## WebSocket vs Long Polling vs SSE vs gRPC streaming

| | Long polling | SSE | WebSocket | gRPC streaming |
|---|---|---|---|---|
| Transporte | HTTP/1.1, una request tras otra | HTTP/1.1, una request larga | TCP, tras upgrade desde HTTP | HTTP/2 |
| Dirección | Servidor→cliente (simulado) | Solo servidor→cliente | Bidireccional real | Bidireccional real (modo bidi) |
| Overhead por mensaje | Alto (headers HTTP completos cada vez) | Bajo (misma conexión) | Muy bajo (2 bytes de frame) | Bajo (multiplexado) |
| Formato | Lo que definas (típ. JSON) | Texto (`text/event-stream`) | Lo que definas (texto o binario) | Protobuf (binario, tipado) |
| Reconexión automática | Manual | Nativa del navegador (`EventSource`) | Manual | Depende del cliente |
| Cliente browser nativo | `fetch`/`XMLHttpRequest` | `EventSource` | `WebSocket` | Necesita `grpc-web` |
| Atraviesa proxies/firewalls viejos | Sí (es HTTP normal) | Sí (es HTTP normal) | Generalmente sí (empieza como HTTP) | A veces problemático (HTTP/2 puro) |

## Cuándo usar WebSockets (y cuándo no)

**A favor:**
- Necesitás que **ambos lados** inicien mensajes: chat, juegos multijugador, cursores/ediciones colaborativas (Google Docs style), trading en tiempo real donde el cliente también manda órdenes.
- Volumen alto de mensajes chicos, donde el overhead de headers HTTP repetidos (long polling) sería el cuello de botella.
- Ya tenés lógica de reconexión y manejo de estado del lado cliente, o la necesitás igual (WebSocket no reconecta solo).

**En contra:**
- Solo necesitás **servidor → cliente** (notificaciones, updates de progreso, feed de noticias) y nada más: **SSE** te da eso mismo con reconexión automática gratis y sobre HTTP puro, con menos partes móviles.
- Necesitás pasar por infraestructura vieja que no soporta `Upgrade` (poco común hoy, pero existe en entornos corporativos legacy) — ahí long polling sigue siendo el fallback más compatible.
- La comunicación es **servicio a servicio interno**, no con un cliente final/browser: ahí gRPC streaming (`03_grpc-rpc`) da lo mismo (bidireccional, persistente) pero con contrato tipado y mejor rendimiento binario.
- Necesitás que el balanceador de carga o el CDN cacheen o inspeccionen tráfico por request: una conexión WebSocket es larga y opaca para esas capas, así que requiere que la infraestructura (load balancers, proxies) esté configurada explícitamente para sostener conexiones persistentes y hacer *sticky sessions* si el estado vive en un solo nodo del servidor.

## Conexión con el resto de `07_comunicacion-entre-servicios`

- Comparado con **gRPC** (`03_grpc-rpc`): mismo problema de fondo (comunicación bidireccional persistente) resuelto en capas distintas — WebSocket lo resuelve haciendo upgrade desde HTTP/1.1 a un protocolo propio y agnóstico de formato; gRPC lo resuelve nativamente sobre HTTP/2 multiplexado, con contrato `.proto` tipado. WebSocket es más simple de adoptar desde un browser; gRPC gana en servicio-a-servicio de alto rendimiento.
- Comparado con **GraphQL** (`02_graphql`): las `Subscription` de GraphQL no son transporte, son contrato — típicamente se implementan *mandando el protocolo GraphQL sobre una conexión WebSocket*. GraphQL define la forma de los datos que llegan; WebSocket resuelve cómo llegan en tiempo real.
- Long polling y SSE son los otros dos puntos de este mismo folder: ambos son formas de conseguir push del servidor sin abandonar el modelo request/response de HTTP; WebSocket es la única de las tres que efectivamente lo abandona.
