# CI/CD

## Punto de partida: integrar y desplegar a mano no escala

Sin automatización, cada dev trabaja en su rama durante días o semanas y recién integra su código al final — momento en el que aparecen conflictos y roturas difíciles de rastrear, porque el problema pudo haberse introducido en cualquiera de los muchos commits acumulados ("integration hell"). Y del otro lado, desplegar a producción a mano (copiar archivos, correr comandos en el server) es lento, no repetible entre personas, y un solo paso salteado rompe el ambiente.

**CI/CD** es la automatización de esas dos etapas: **Continuous Integration** ataca el primer problema (detectar roturas apenas se introducen, no semanas después), **Continuous Delivery/Deployment** ataca el segundo (llevar código ya probado a producción de forma repetible).

## Continuous Integration: probar cada cambio, apenas se sube

La práctica es simple de enunciar: cada vez que alguien sube código (push o PR), un pipeline automatizado corre lint, tests y build **antes** de que el cambio se pueda mergear. Si algo rompe, se sabe en minutos, con el contexto fresco de ese commit puntual — no semanas después, buscando entre cientos de commits cuál lo causó.

```yaml
# .github/workflows/ci.yml
on: [pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

## Continuous Delivery vs Continuous Deployment: hasta dónde llega la automatización

Son dos niveles distintos, que se confunden seguido por compartir la sigla "CD":

- **Continuous Delivery**: el pipeline deja el código en un estado *siempre desplegable* (pasó todos los checks, generó el artefacto/imagen) pero el paso final a producción lo dispara una persona a mano — un botón, no un merge.
- **Continuous Deployment**: no hay botón. Si el pipeline pasa, se despliega solo a producción, sin intervención humana.

La diferencia es una decisión de riesgo/control, no de capacidad técnica: el pipeline técnico es el mismo, lo que cambia es si el último paso es automático o requiere un click humano.

## El pipeline completo

Encadenando ambas etapas, un pipeline típico se ve así:

```
lint → test → build → package (imagen Docker) → push a registro → deploy
```

El resultado del `build`/`package` normalmente es una imagen de contenedor versionada (`api:1.4.0`), que el paso de `deploy` aplica contra el cluster de Kubernetes actualizando el `Deployment` correspondiente (ver `00_kubernetes-orquestacion`) — Kubernetes se encarga de aplicar ese cambio gradualmente vía rolling update, sin caída de servicio.

## Cuándo usar CI/CD (y cuándo no)

**A favor:**
- Prácticamente siempre que hay más de un dev tocando el mismo repo, o despliegues más frecuentes que "una vez cada tanto a mano". El costo de configurarlo se paga solo la primera vez que atrapa un bug antes de llegar a producción.
- Incluso en proyectos solo-dev, correr tests automáticamente en cada push da una red de seguridad barata.

**En contra:**
- Para un prototipo descartable de un solo uso, configurar un pipeline completo puede ser más esfuerzo del que el proyecto va a vivir.
- Pipelines mal diseñados (muy lentos, flaky) generan el efecto contrario al buscado: la gente empieza a ignorarlos o a saltearlos, y ahí pierden todo el valor.

## Conexión con el resto de `11_infraestructura-y-operaciones`

- El destino final del pipeline suele ser **Kubernetes** (`00_kubernetes-orquestacion`): CI/CD construye y valida, Kubernetes aplica el cambio en el cluster de forma controlada.
- La estrategia de despliegue en el último paso (rolling, blue-green, canary) es lo que garantiza **Zero-downtime deployments** — CI/CD es el mecanismo que dispara el despliegue, la estrategia elegida es lo que evita el corte de servicio.
- **Observabilidad** (`02_observabilidad`) cierra el ciclo: después de cada deploy, las métricas y logs son lo que permite confirmar que el cambio no rompió nada (o disparar un rollback automático si algo empeora).
