# Observabilidad (logging, tracing, métricas)

## Punto de partida: en un sistema distribuido, "revisar el server" ya no alcanza

Con un monolito en una sola máquina, cuando algo falla se puede entrar por SSH y mirar. Con un sistema de varios microservicios (ver `08_arquitectura-de-aplicacion`), una request cruza N servicios distintos, y el problema puede estar en cualquiera de ellos — no hay "el server" a revisar. **Observabilidad** es la capacidad de entender qué está pasando *adentro* de un sistema mirando solo lo que sale de él (logs, métricas, traces), sin tener que agregar código nuevo cada vez que aparece una pregunta distinta.

Esto la distingue de **monitoring**: monitoring es vigilar fallas ya conocidas de antemano (un dashboard con la métrica de CPU, una alerta si el error rate sube). Observabilidad apunta a los **unknown unknowns** — poder responder preguntas nuevas ("¿por qué esta request puntual tardó 4 segundos?") sin haber anticipado esa pregunta específica cuando se instrumentó el sistema.

## Los tres pilares

### Logs: qué pasó, exactamente, en un momento puntual

Un log es un registro discreto de un evento, con timestamp y contexto. La versión útil en un sistema distribuido es **logging estructurado** (JSON, no texto libre), porque así se puede filtrar y buscar por campo:

```json
{"timestamp": "2026-08-11T14:32:01Z", "level": "error", "service": "checkout", "trace_id": "abc123", "msg": "pago rechazado", "user_id": 42, "gateway": "stripe"}
```

El `trace_id` es la clave que conecta este log con el resto del pilar siguiente: es lo que permite, dado un problema puntual, encontrar todos los logs de todos los servicios que participaron en esa request específica.

### Métricas: números agregados a lo largo del tiempo

Una métrica es un número que se agrega en el tiempo — no "qué pasó en esta request puntual" sino "cómo viene el sistema en general": latencia p50/p99, requests por segundo, error rate, uso de CPU/memoria. Son baratas de almacenar (se agregan, no se guarda cada evento individual) y son la base natural para **dashboards y alertas** ("avisame si el error rate supera 1% durante 5 minutos").

El costo es que se pierde el detalle individual: una métrica te dice *que* el p99 de latencia subió, no *cuál* request específica fue lenta ni *por qué* — para eso hacen falta logs o traces.

### Tracing: seguir una request a través de varios servicios

En una arquitectura de microservicios, una sola request de usuario puede disparar llamadas a 5 servicios distintos. Un **trace** representa ese recorrido completo: un `trace_id` único por request, dividido en **spans** — uno por cada operación (una llamada HTTP, una query a DB) — con su propio tiempo de inicio/fin, formando un árbol.

```
trace_id: abc123
├─ span: api-gateway            (120ms)
│  ├─ span: checkout-service    (95ms)
│  │  ├─ span: db query         (12ms)
│  │  └─ span: pago-gateway     (78ms)  <- acá está el cuello de botella
│  └─ span: inventario-service  (18ms)
```

Sin tracing, "la request tardó 120ms" es lo único que se sabe. Con tracing, se ve exactamente qué span concentra el tiempo — en este caso, la llamada al gateway de pago externo, no la lógica propia. **OpenTelemetry** es hoy el estándar de instrumentación (vendor-neutral) para generar estos traces; **Jaeger** o **Zipkin** son backends típicos para visualizarlos.

## Herramientas típicas por pilar

| Pilar | Qué responde | Herramientas comunes |
|---|---|---|
| Logs | "¿Qué pasó exactamente en este caso?" | ELK stack (Elasticsearch/Logstash/Kibana), Loki |
| Métricas | "¿Está algo mal ahora mismo, en general?" | Prometheus + Grafana, Datadog |
| Traces | "¿Dónde, en esta cadena de servicios, se fue el tiempo?" | OpenTelemetry + Jaeger/Zipkin |

## Cómo se usan juntos, en la práctica

El flujo típico de debugging real combina los tres, en este orden: una **métrica** dispara una alerta (p99 de latencia subió) → se buscan **traces** de ese período para encontrar cuáles requests fueron lentas y en qué span → con el `trace_id` de una request puntual, se buscan los **logs** de ese trace en los servicios involucrados para ver el detalle exacto de qué pasó. Cada pilar responde una pregunta que el anterior no puede.

## Conexión con el resto de `11_infraestructura-y-operaciones`

- El **Horizontal Pod Autoscaler** de Kubernetes (`00_kubernetes-orquestacion`) depende directamente de métricas — sin observabilidad real, el autoscaling escala a ciegas.
- **CI/CD** (`01_ci-cd`) usa métricas y logs post-deploy para confirmar que un despliegue no rompió nada, o para disparar un rollback automático (esto es lo que habilita un despliegue **canary**: desplegar a una fracción chica de tráfico y observar métricas antes de completar el rollout).
- Es un prerequisito de **Chaos Engineering**: para probar que el sistema tolera fallas hay que poder *observar* qué pasa cuando se rompe algo a propósito — sin observabilidad, un experimento de chaos engineering es solo romper cosas a ciegas.
