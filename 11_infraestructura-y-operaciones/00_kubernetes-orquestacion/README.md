# Kubernetes / Orquestación de contenedores

## Punto de partida: contenedores resuelven "funciona en mi máquina", pero no "quién los corre dónde"

Un **contenedor** (Docker es el runtime de facto) empaqueta una app junto con todas sus dependencias en una unidad aislada y portable: la misma imagen corre igual en la laptop del dev, en staging y en producción, porque no depende de qué esté instalado en el host. Eso resuelve el problema de consistencia entre entornos.

Pero apenas hay más de un contenedor y más de una máquina, aparece un problema distinto: **¿en qué máquina corre cada contenedor? ¿Qué pasa si esa máquina se cae? ¿Cómo escalo de 3 réplicas a 10 sin hacerlo a mano? ¿Cómo encuentra un contenedor a otro si las IPs cambian cada vez que se reinicia uno?** Eso ya no es un problema de empaquetado, es un problema de **orquestación** — y es el que resuelve Kubernetes.

## El modelo: estado deseado + reconciliación continua

La idea central de Kubernetes no es "ejecutá este comando", es **declarar el estado deseado y dejar que el sistema lo mantenga solo**. En vez de decirle paso a paso qué hacer, le decís *qué querés que exista* (por ejemplo, "quiero 3 réplicas de esta imagen corriendo siempre") y un **controlador** compara continuamente ese estado deseado contra el estado real del cluster, corrigiendo la diferencia sin intervención humana: si un nodo se cae y se pierden 2 réplicas, el controlador las vuelve a crear en otro nodo automáticamente. Este ciclo (observar → comparar → corregir) es el **reconciliation loop**, y es lo que hace que Kubernetes sea "self-healing" en vez de solo un ejecutor de comandos.

## Las piezas principales

- **Pod**: la unidad mínima que Kubernetes programa — uno o más contenedores que siempre corren juntos en el mismo nodo (típicamente un contenedor principal + sidecars, como un proxy de logging). Los Pods son **efímeros**: cuando mueren no se reviven, se reemplazan por Pods nuevos con IPs nuevas.
- **Node**: una máquina (VM o física) del cluster que efectivamente corre Pods.
- **Deployment**: describe el estado deseado de una app — qué imagen, cuántas réplicas, cómo actualizarlas. Es el objeto que usás para desplegar y actualizar apps sin downtime (rolling updates).
- **Service**: como los Pods son efímeros y cambian de IP, nada se debería conectar directo a un Pod. El Service da una **IP/nombre DNS estable** que balancea tráfico hacia las réplicas actuales del Deployment, sean cuales sean en cada momento.
- **Scheduler**: decide en qué Node corre cada Pod nuevo, en base a recursos disponibles (CPU/RAM) y restricciones declaradas.
- **ConfigMap / Secret**: configuración y credenciales desacopladas de la imagen, inyectadas como variables de entorno o archivos.
- **Horizontal Pod Autoscaler (HPA)**: ajusta el número de réplicas automáticamente en base a métricas (CPU, o métricas custom) — necesita observabilidad real para funcionar bien (ver `02_observabilidad`).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: mi-registro/api:1.4.0
          ports: [{ containerPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: 8080 }]
```

Con esto declarado, `kubectl apply -f` no "crea contenedores" en el sentido imperativo — le dice al cluster "este es el estado que quiero", y el reconciliation loop se encarga de que 3 Pods de `api:1.4.0` existan y estén saludables, todo el tiempo, sin que nadie tenga que monitorear a mano cuál murió y relanzarlo.

## Cuándo usar Kubernetes (y cuándo no)

**A favor:**
- Muchos microservicios independientes que necesitan escalar por separado, con despliegues frecuentes y necesidad real de self-healing y balanceo automático.
- Ya se opera a una escala donde hacerlo a mano (o con scripts propios) es más trabajo que aprender la plataforma.

**En contra:**
- Para una app monolítica simple o un equipo chico, Kubernetes agrega una complejidad operativa considerable (aprender el modelo, mantener el cluster, YAML por todos lados) que no se justifica — ahí conviene algo más simple: `docker compose`, o un PaaS gestionado (Cloud Run, Heroku, App Runner) que abstrae la orquestación.
- Si el equipo no tiene experiencia operando clusters, el costo de mantenimiento (upgrades, seguridad, networking) puede superar el beneficio.

## Conexión con el resto de `11_infraestructura-y-operaciones`

- **CI/CD** (`01_ci-cd`) es lo que efectivamente empuja imágenes nuevas al cluster: el pipeline construye la imagen, la sube a un registro, y actualiza el Deployment — Kubernetes se encarga de aplicar ese cambio de forma gradual (rolling update).
- **Observabilidad** (`02_observabilidad`) es lo que le da al HPA y a los operadores humanos visibilidad de qué está pasando adentro del cluster — sin métricas, el autoscaling y el debugging de Pods que reinician en loop son imposibles.
- Las **Zero-downtime deployments** y el **Chaos Engineering** de este mismo roadmap se apoyan directamente en las primitivas de Kubernetes (rolling updates, y la capacidad de matar Pods para probar que el sistema se recupera).
