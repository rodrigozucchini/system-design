# GraphQL

## Punto de partida: ¿quién decide la forma de la respuesta?

Cualquier API tiene que resolver una pregunta implícita: cuando el cliente pide datos, ¿quién decide qué forma tiene la respuesta? En REST la respuesta es "el servidor, de antemano": quien diseña el endpoint `GET /usuarios/1` decide, una vez, qué campos vienen — y esa forma queda fija para todos los clientes que lo llamen, hoy y en el futuro.

Eso funciona mientras haya un solo tipo de cliente con necesidades estables. El problema aparece apenas hay varios consumidores con necesidades distintas — una app móvil que quiere lo mínimo para ahorrar datos, un dashboard web que quiere todo, un panel de admin que quiere campos que ningún otro usa. Con la forma fijada del lado servidor, eso se traduce en dos síntomas concretos:

- **Over-fetching**: pedís `GET /usuarios/1` y el servidor te devuelve el usuario completo (email, dirección, preferencias, fecha de alta...) aunque la pantalla solo necesite el nombre y el avatar. La forma es una sola para todos los clientes, así que por diseño le sobra a la mayoría.
- **Under-fetching**: para armar una pantalla de perfil necesitás el usuario, sus posts y sus seguidores. Si cada uno es un recurso separado, eso son 3 requests (`/usuarios/1`, `/usuarios/1/posts`, `/usuarios/1/seguidores`), 3 round trips, cada uno con su propia latencia — porque la forma de cada endpoint fue pensada recurso por recurso, no pantalla por pantalla.

Los dos síntomas son la misma causa vista desde ángulos distintos: la forma de la respuesta está fijada en el lugar equivocado. GraphQL invierte esa decisión — **el cliente describe la forma exacta de los datos que necesita, en una sola request**, y el servidor devuelve exactamente eso — ni más ni menos.

```graphql
# una sola request, exactamente los campos que la pantalla necesita
query {
  usuario(id: 1) {
    nombre
    avatarUrl
    posts(limit: 5) {
      titulo
    }
    seguidores {
      nombre
    }
  }
}
```

## El modelo: un solo endpoint, queries flexibles

A diferencia de REST (un recurso = una URL, muchos endpoints) o gRPC (un método = una llamada, muchos métodos), GraphQL expone **un único endpoint** — típicamente `POST /graphql` — y toda la variabilidad vive en el *body* de la request, no en la URL ni en el verbo HTTP. Siempre es POST, incluso para lecturas, porque el "query" en sí puede ser largo y no encaja bien en una URL ni en los verbos semánticos de REST (no hay un "GET-pero-con-forma-custom").

Esto invierte el control: en REST el servidor decide la forma de la respuesta (el cliente elige *qué recurso*, no *qué forma*); en GraphQL el cliente decide la forma, dentro de lo que el schema permite.

## El contrato: schema (SDL)

Igual que gRPC tiene el `.proto`, GraphQL tiene un schema escrito en **SDL** (Schema Definition Language). Es el contrato: qué tipos existen, qué campos tiene cada uno, qué operaciones se pueden hacer. También es *a priori* y fuertemente tipado, no informal como suele ser REST/OpenAPI.

```graphql
type Usuario {
  id: ID!
  nombre: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  titulo: String!
  autor: Usuario!
}

type Query {
  usuario(id: ID!): Usuario
  posts(limit: Int = 10): [Post!]!
}

type Mutation {
  crearPost(titulo: String!, autorId: ID!): Post!
}

type Subscription {
  postCreado: Post!
}
```

`Query`, `Mutation` y `Subscription` son los tres tipos raíz: lectura, escritura, y datos push en tiempo real (subscriptions corren típicamente sobre WebSockets — ver `04_websockets` de este mismo folder). El `!` marca no-nullable; `[Post!]!` es "una lista no-nula de posts no-nulos".

## Queries y mutations con variables

En la práctica las queries no van hardcodeadas con valores literales, se parametrizan con variables (equivalente a los params de una request REST):

```graphql
query ObtenerUsuario($id: ID!) {
  usuario(id: $id) {
    nombre
    posts { titulo }
  }
}
```

```json
{ "id": "1" }
```

```graphql
mutation {
  crearPost(titulo: "Hola mundo", autorId: "1") {
    id
    titulo
  }
}
```

La convención (no impuesta por el protocolo) es: `Query` para leer sin efectos secundarios, `Mutation` para escribir — el nombre ya te dice la intención, parecido a cómo REST usa GET vs POST/PUT/DELETE.

## Resolvers

El schema describe *qué* datos existen, pero no *de dónde* salen. Eso lo resuelve un **resolver**: una función asociada a cada campo del schema, responsable de devolver el valor de ese campo. El motor de GraphQL ejecuta el árbol de la query llamando al resolver de cada campo pedido, de forma recursiva.

```js
// Apollo Server / graphql-js — firma estándar: (parent, args, context, info)
const resolvers = {
  Query: {
    usuario: (parent, { id }, context) => {
      return db.usuarios.findById(id);
    },
  },
  Usuario: {
    // se ejecuta solo si la query pidió el campo `posts`
    posts: (usuarioPadre, args, context) => {
      return db.posts.findByAutorId(usuarioPadre.id);
    },
  },
  Mutation: {
    crearPost: (parent, { titulo, autorId }, context) => {
      return db.posts.create({ titulo, autorId });
    },
  },
};
```

Claves de esta firma:

- `parent`: el resultado del resolver del campo padre (para `Usuario.posts`, `parent` es el usuario ya resuelto).
- `args`: los argumentos del campo (`{ id }`, `{ titulo, autorId }`).
- `context`: objeto compartido entre todos los resolvers de una misma request (típicamente lleva el usuario autenticado, conexión a DB, dataloaders — ver abajo).
- `info`: metadata sobre la query en ejecución (qué campos se pidieron, el AST) — se usa poco, principalmente para optimizaciones avanzadas.

Un resolver solo se ejecuta si el cliente pidió ese campo. Si la query no pide `posts`, el resolver `Usuario.posts` ni se llama — esto es lo que hace que no haya over-fetching a nivel de resolución, no solo a nivel de payload.

## El problema N+1 (y por qué existe DataLoader)

La naturalidad de los resolvers anidados esconde una trampa de performance. Con la query del ejemplo inicial (usuario + sus posts + sus seguidores), si tenés una lista de 50 usuarios y por cada uno resolvés `posts` con una query a la DB, terminás con 1 query para traer los usuarios + 50 queries para traer los posts de cada uno = **N+1 queries**.

```js
// naive: 1 query por cada usuario en la lista
Usuario: {
  posts: (usuario) => db.posts.findByAutorId(usuario.id), // se llama 50 veces, 50 round trips a la DB
}
```

La solución estándar es **DataLoader**: batchea todas las llamadas que ocurren en el mismo tick del event loop y las resuelve con una sola query `WHERE autor_id IN (...)`, devolviendo a cada resolver individual su parte correspondiente.

```js
const postsPorAutorLoader = new DataLoader(async (autorIds) => {
  const posts = await db.posts.findByAutorIds(autorIds); // 1 sola query para todos
  return autorIds.map(id => posts.filter(p => p.autorId === id));
});

Usuario: {
  posts: (usuario, args, context) => context.postsPorAutorLoader.load(usuario.id),
}
```

Esto no es opcional en la práctica: cualquier API GraphQL con relaciones anidadas que no use DataLoader (o equivalente) tiene un problema de performance latente que aparece apenas hay datos reales.

## Introspection y herramientas

El schema es **introspectable**: el propio servidor GraphQL expone una query especial (`__schema`) que describe todos sus tipos, campos y argumentos. Esto es lo que permite que herramientas como GraphiQL o Apollo Sandbox generen documentación y autocompletado automáticamente, sin mantenimiento manual — a diferencia de OpenAPI/Swagger en REST, que normalmente hay que escribir o generar aparte y puede desincronizarse del código real.

## GraphQL vs REST vs gRPC

| | REST | GraphQL | gRPC |
|---|---|---|---|
| Endpoints | Muchos (uno por recurso) | Uno (`/graphql`) | Muchos (uno por método RPC) |
| Forma de la respuesta | Fija, la decide el servidor | La decide el cliente, campo por campo | Fija, la decide el `.proto` |
| Transporte | HTTP/1.1 (típico) | HTTP/1.1 (típico), sobre POST | HTTP/2 |
| Formato | JSON (texto) | JSON (texto) | Protobuf (binario) |
| Contrato | Informal / OpenAPI (a posteriori) | Schema GraphQL (a priori, introspectable) | `.proto` (a priori) |
| Over/under-fetching | Común | Resuelto por diseño | No aplica (RPC, no recursos) |
| Riesgo de performance propio | N/A | N+1 en resolvers anidados | N/A |
| Cacheable por HTTP (CDN, browser) | Sí, naturalmente (GET + URL) | Difícil (todo es POST a la misma URL) | No |
| Streaming | No nativo | Subscriptions (vía WebSocket aparte) | Nativo, 4 modos |

## Cuándo usar GraphQL (y cuándo no)

**A favor:**
- Clientes con necesidades de datos muy variables o cambiantes (apps móviles, muchos frontends distintos consumiendo el mismo backend) — cada cliente pide su propia forma sin que el backend tenga que crear un endpoint a medida.
- Pantallas que agregan datos de múltiples "recursos" relacionados: evita el problema de under-fetching (varios round trips) de REST.
- Cuando el contrato tipado y auto-documentado (introspection) importa para la velocidad de desarrollo del frontend.

**En contra:**
- **Cacheo HTTP estándar** (CDN, browser cache, reverse proxy por URL) no funciona igual de bien: todo pasa por `POST /graphql`, no hay URLs distintas por recurso para cachear con las herramientas de siempre. Requiere cacheo a nivel de aplicación (normalized cache en el cliente, persisted queries, etc.).
- **Complejidad del lado servidor**: hay que diseñar resolvers, pensar en N+1 desde el día uno, y potencialmente lidiar con queries maliciosas o carísimas que el cliente puede construir libremente dentro del schema (mitigable con límites de profundidad/costo de query).
- Para una API interna simple, con forma de datos estable y pocos consumidores, REST directo suele ser más simple de operar y debuggear (`curl` plano, cacheable, sin capa de resolvers).
- No es la opción natural para comunicación **servicio a servicio de alto rendimiento** — ahí gRPC gana por transporte binario y contrato compilado.

## Conexión con el resto de `07_comunicacion-entre-servicios`

- Comparado con **REST** (mismo folder): mismo transporte (HTTP/1.1, JSON) pero modelo inverso — REST fija la forma por endpoint, GraphQL la deja abierta por query.
- Comparado con **gRPC** (`03_grpc-rpc`): ambos tienen contrato tipado a priori, pero gRPC apunta a comunicación interna de alto rendimiento (binario, HTTP/2, streaming nativo) mientras GraphQL apunta al borde público, optimizando la experiencia del cliente que consume datos, no la performance de transporte.
- Comparado con **WebSockets / SSE**: las `Subscription` de GraphQL no son un mecanismo de transporte propio, típicamente se implementan *sobre* WebSockets — GraphQL define el contrato de qué datos llegan, WebSockets resuelve cómo llegan en tiempo real.
- En arquitecturas reales es común ver GraphQL como capa de agregación en el borde (un **BFF**, Backend for Frontend) que por debajo llama a varios servicios internos vía REST o gRPC — no es necesariamente "GraphQL en vez de los otros", sino "GraphQL orquestando a los otros".
