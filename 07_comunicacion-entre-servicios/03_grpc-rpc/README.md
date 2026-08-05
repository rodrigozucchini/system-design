# RPC y gRPC

## Punto de partida: la ilusión de una llamada local

Dos procesos corriendo en máquinas distintas no comparten memoria ni pueden saltar directamente al código del otro — la única forma real de comunicarse es mandarse bytes por una red y esperar una respuesta. Frente a eso hay dos caminos de diseño: exponer esa realidad tal cual es (armar una request, mandarla, parsear la response — el camino de REST) o **esconderla detrás de la sintaxis de una llamada a función común**, como si el código remoto estuviera ahí mismo. RPC es ese segundo camino:

```
resultado = usuarioService.getUsuario(id)
```

En lugar de pensar en términos de "hacer una request HTTP a `/usuarios/123`", en RPC pensás en términos de "invocar el método `getUsuario`". El cliente no construye URLs ni verbos HTTP; llama a un método, con parámetros tipados, y recibe una respuesta tipada — la red desaparece de la superficie del código, aunque siga estando ahí por debajo.

Para sostener esa ilusión hacen falta dos cosas. Primero, un **contrato** compartido de antemano (qué métodos existen, qué parámetros reciben, qué devuelven) — sin eso, el cliente no sabría qué "función" está invocando ni cómo interpretar la respuesta. Segundo, algo que traduzca esa llamada "local" en tráfico de red real: eso se llama **stub** (del lado del cliente) y **skeleton** (del lado del servidor). El stub serializa los argumentos, los manda por la red, espera la respuesta y la deserializa — todo transparente para quien hizo la llamada. Ese trabajo de traducción es exactamente lo que un framework RPC automatiza; sin él, cada equipo tendría que escribirlo a mano por cada método.

RPC existe desde los 80 (Sun RPC, CORBA, Java RMI, SOAP...) mucho antes de REST. gRPC es la implementación moderna que ganó tracción en microservicios.

## gRPC: qué le falta a "RPC sobre HTTP/1.1 + JSON" para comunicación interna de alto rendimiento

Nada impide construir RPC sobre HTTP/1.1 con JSON — de hecho es una opción válida y común. gRPC parte de un caso de uso más exigente: llamadas **servicio a servicio, internas, en volumen alto**, donde cada milisegundo de latencia y cada byte de payload se multiplican por la cantidad de llamadas por segundo. Ahí, dos elecciones de REST/JSON que son razonables para una API pública empiezan a pesar:

- JSON es texto: legible, pero cada campo carga su propio nombre en el payload y hay que parsearlo carácter por carácter.
- HTTP/1.1 es una request por vez por conexión (con pipelining limitado en la práctica): para N llamadas concurrentes al mismo servicio, hacen falta N conexiones o encolarlas.

gRPC (**g**oogle **RPC**) responde a esas dos limitaciones con dos piezas concretas, no arbitrarias:

1. **HTTP/2** como protocolo de transporte — multiplexa muchos streams sobre una sola conexión TCP, así que N llamadas concurrentes no necesitan N conexiones.
2. **Protocol Buffers (protobuf)** como lenguaje de definición de interfaz (IDL) y formato de serialización binaria — el contrato define de antemano qué campos existen y en qué orden, así que el payload no necesita repetir los nombres de los campos.

### El contrato: archivos `.proto`

El contrato se define en un archivo `.proto`, independiente del lenguaje:

```protobuf
syntax = "proto3";

service UsuarioService {
  rpc GetUsuario (GetUsuarioRequest) returns (Usuario);
}

message GetUsuarioRequest {
  int32 id = 1;
}

message Usuario {
  int32 id = 1;
  string nombre = 2;
  string email = 3;
}
```

De ese `.proto` se **generan automáticamente** el cliente (stub) y el servidor (skeleton) en el lenguaje que corresponda (Go, Java, TypeScript, Python...). Esto es "schema-first" o "contract-first": el contrato existe antes que el código, y el código se deriva de él. Es lo opuesto a REST, donde normalmente el contrato (OpenAPI/Swagger) se documenta *después* de escribir los endpoints, y nada obliga a que se mantenga sincronizado.

### Serialización binaria vs JSON

REST típicamente serializa en JSON: texto plano, legible por humanos, pero verboso y lento de parsear. Protobuf serializa a **binario**: cada campo tiene un número (`= 1`, `= 2`...) y un tipo, así que en el wire no viaja ni el nombre del campo. Esto lo hace mucho más compacto y rápido de serializar/deserializar que JSON, a costa de no ser legible a simple vista (para debuggear necesitás herramientas que conozcan el `.proto`, no podés simplemente leer el body con `curl`).

### HTTP/2 y los 4 modos de comunicación

REST sobre HTTP/1.1 es fundamentalmente **request/response**: un cliente pide, un servidor responde, listo. gRPC, apoyado en el multiplexing de HTTP/2 (múltiples streams sobre una sola conexión TCP), soporta cuatro modos:

| Modo | Descripción | Ejemplo de uso |
|---|---|---|
| **Unary** | 1 request → 1 response. Igual que REST tradicional. | `GetUsuario(id)` |
| **Server streaming** | 1 request → N responses (stream). | Servidor manda updates de precio en tiempo real |
| **Client streaming** | N requests (stream) → 1 response. | Cliente sube un archivo en chunks, servidor confirma al final |
| **Bidirectional streaming** | N requests ↔ N responses, ambos lados mandan y reciben de forma independiente. | Chat, video call signaling |

Esta es la diferencia más grande frente a REST: gRPC tiene streaming real de primera clase, sin necesidad de WebSockets ni hacks como long polling (ver los otros temas de esta carpeta `07_`).

## gRPC vs REST vs GraphQL

| | REST | GraphQL | gRPC |
|---|---|---|---|
| Transporte | HTTP/1.1 (típico) | HTTP/1.1 (típico) | HTTP/2 |
| Formato | JSON (texto) | JSON (texto) | Protobuf (binario) |
| Contrato | Informal / OpenAPI (a posteriori) | Schema GraphQL (a priori) | `.proto` (a priori) |
| Modelo | Recursos (verbos HTTP) | Un endpoint, queries flexibles | Llamadas a métodos (RPC) |
| Streaming | No nativo | No nativo (subscriptions aparte) | Nativo, 4 modos |
| Legible por humanos | Sí | Sí | No (binario) |
| Cliente desde el browser | Directo | Directo | Necesita `grpc-web` (proxy) |
| Generación de código cliente/servidor | Opcional (a partir de OpenAPI) | Opcional | Obligatoria y automática desde el `.proto` |

## Cuándo usar gRPC (y cuándo no)

**A favor:**
- Comunicación **interna entre microservicios** (servicio a servicio, no cliente final). Es el caso de uso principal.
- Necesitás **baja latencia y alto throughput** (binario + HTTP/2 multiplexado le ganan a JSON + HTTP/1.1).
- Sistemas **polyglot**: el `.proto` genera stubs consistentes en cualquier lenguaje soportado, evitando que cada equipo mantenga su propio cliente HTTP a mano.
- Necesitás **streaming** real (updates continuos, uploads grandes en chunks, chat).
- Querés el contrato como **fuente de verdad forzada por el compilador** — si el `.proto` cambia y no actualizás el código, no compila.

**En contra:**
- **APIs públicas** de cara a internet: REST/JSON sigue siendo el estándar porque cualquiera puede consumirlo con `curl`, Postman, o código improvisado sin generar nada.
- **Clientes browser directos**: los browsers no exponen la API HTTP/2 de bajo nivel que gRPC necesita, así que hace falta `grpc-web` + un proxy (típicamente Envoy) que traduzca. Es una capa extra de infraestructura.
- **Debugging humano rápido**: no podés simplemente mirar el payload en el body de la request, porque es binario.
- Equipo/organización sin experiencia previa: la curva de adopción (protobuf, generación de código, tooling) es mayor que la de un endpoint REST.

## Conexión con el resto de `07_comunicacion-entre-servicios`

- Comparado con **WebSockets**: ambos dan comunicación bidireccional persistente, pero WebSockets es agnóstico de formato (vos definís qué mandás) mientras gRPC bidireccional viene con contrato tipado de fábrica.
- Comparado con **Long polling / SSE**: esos son workarounds sobre HTTP/1.1 request/response para simular server push; gRPC streaming lo resuelve nativamente vía HTTP/2.
- Comparado con **REST y GraphQL** (mismo folder): son los tres estilos dominantes de API hoy. La elección real en la industria suele ser "gRPC entre microservicios internos + REST o GraphQL en el borde público" — no es uno u otro, es por capa.

## Código: NestJS

`@nestjs/microservices` soporta gRPC de forma nativa (`Transport.GRPC`). El ejemplo tiene dos proyectos Nest separados que comparten el mismo contrato (`proto/usuario.proto`):

```
03_grpc-rpc/
├── proto/
│   └── usuario.proto        # contrato compartido: GetUsuario (unary) + WatchUsuarios (server streaming)
├── grpc-server/              # microservicio Nest puro, expone gRPC en :5000
│   └── src/usuario/
│       ├── usuario.controller.ts   # @GrpcMethod('UsuarioService', 'GetUsuario' | 'WatchUsuarios')
│       ├── usuario.service.ts      # datos en memoria + Observable para el stream
│       └── usuario.module.ts
└── api-gateway/               # app Nest normal (HTTP), cliente gRPC hacia grpc-server, escucha en :3000
    └── src/usuario/
        ├── usuario.module.ts        # ClientsModule.register(Transport.GRPC) apuntando a localhost:5000
        ├── usuario.constants.ts     # token de inyección del cliente gRPC
        ├── usuario.interfaces.ts    # tipado del stub (UsuarioServiceClient)
        └── usuarios.controller.ts   # GET /usuarios/:id (unary) y GET /usuarios/stream (SSE)
```

`api-gateway` es el patrón real: **REST en el borde, gRPC entre servicios internos**. El cliente HTTP nunca ve protobuf ni gRPC — pide `GET /usuarios/1` como cualquier endpoint Nest normal, y por debajo esa llamada se resuelve como una invocación gRPC unary contra `grpc-server`. Lo mismo con `GET /usuarios/stream`: adentro es un `Observable` que recibe un mensaje por cada streameado por gRPC, y Nest lo re-expone como Server-Sent Events para que se pueda ver en el browser o con `curl -N`.

### Cómo correrlo

```bash
# terminal 1
cd grpc-server && npm install && npm run start

# terminal 2
cd api-gateway && npm install && npm run start
```

```bash
# unary — llamada normal, tipo GET a un recurso
curl http://localhost:3000/usuarios/1
curl http://localhost:3000/usuarios/99   # -> 404, mapeado desde el error de gRPC

# server streaming — un mensaje nuevo cada 1.5s, sin que el cliente vuelva a pedir nada
curl -N http://localhost:3000/usuarios/stream
```

### Detalles que valen la pena mirar en el código

- El `.proto` es la única fuente de verdad: tanto `grpc-server` como `api-gateway` apuntan al mismo archivo (`proto/usuario.proto`) en vez de cada uno mantener su copia — así se ve en la práctica lo de "contrato antes que código".
- `WatchUsuarios` está declarado en el `.proto` como `returns (stream Usuario)`, pero del lado de Nest el handler (`@GrpcMethod`) simplemente devuelve un `Observable<Usuario>` — Nest se encarga de ir emitiendo cada valor como un mensaje del stream gRPC.
- Del lado del `api-gateway`, ese mismo stream aparece como un `Observable` al llamar al stub (`this.usuarioService.watchUsuarios({})`) — no hay callbacks ni polling, es reactivo de punta a punta.
- Bug real que apareció armando esto y vale la pena señalar: en Nest, las rutas HTTP se resuelven en **orden de declaración**, no por especificidad. `GET /usuarios/stream` tenía que declararse *antes* que `GET /usuarios/:id` en el controller — si no, `:id` matcheaba `"stream"` como si fuera un id y explotaba con un 400.
