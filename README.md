# Roadmap de System Design

Guía de estudio armada:

## 00_fundamentos-y-vocabulario-base

Escalabilidad vertical/horizontal, Performance vs Scalability, Latencia vs Throughput, Availability vs Reliability, HA vs Fault Tolerance, Nines de disponibilidad, SLA, SLO, SLI

## 01_networking

**IP (versiones/tipos)**, **Modelo OSI**, TCP, UDP, DNS, SSL/TLS/mTLS

## 02_entrega-de-trafico

Load Balancer (L4/L7, algoritmos), Clustering, Forward Proxy, Reverse Proxy, CDN (push/pull)

## 03_consistencia-y-disponibilidad-distribuida

CAP Theorem, PACELC Theorem, ACID, BASE, Consistency patterns (weak/eventual/strong), Availability patterns (failover, replicación)

## 04_bases-de-datos

Temas cubiertos: SQL vs NoSQL (document, key-value, graph, wide column, time series), Índices (dense/sparse), Normalización/Denormalización, Replicación (master-slave/master-master), Sharding, Federation, SQL tuning, Transacciones distribuidas (2PC/3PC)

Sin cobertura en los repos: Consistent Hashing

## 05_storage

RAID, Volúmenes, File storage, Block storage, Object storage, NAS, HDFS

## 06_cache

Cache hit/miss, Invalidación (write-through/around/back), Eviction policies, Distributed cache, Global cache, Caching por capa (cliente, CDN, DB, app)

## 07_comunicacion-entre-servicios

**HTTP**, **REST**, GraphQL, **gRPC**, **RPC**, **WebSockets**, Long polling, Server-Sent Events

## 08_arquitectura-de-aplicacion

N-tier architecture, Monolitos vs Microservicios, API Gateway, Service Discovery, Message Brokers/Queues, Pub-Sub, ESB, Event-Driven Architecture, Event Sourcing, CQRS

## 09_confiabilidad-y-resiliencia

Temas cubiertos: Circuit Breaker, Rate Limiting, Disaster Recovery

Sin cobertura en los repos: Idempotencia, Heartbeat / health checks, Leader election, Algoritmos de consenso (Raft, Paxos), Distributed Locking

## 10_seguridad

**Auth0**, OAuth 2.0, OIDC, SSO — se apoya en SSL/TLS de 01_networking

## 11_infraestructura-y-operaciones

Temas cubiertos: VMs y Containers

Kubernetes / orquestación, CI/CD, Infraestructura como código, Observabilidad (logging, tracing, métricas), Chaos Engineering, Zero-downtime deployments, Cost optimization

## 12_estructuras-y-tecnicas-especificas

Temas cubiertos: Geohashing, Quadtrees

Checksums / data integrity, Batch vs Stream processing (Lambda/Kappa), WebRTC

## 13_estimacion-y-practica

Temas cubiertos: 
Back-of-the-envelope calculations, Latency numbers every programmer should know, Testing de sistemas distribuidos

---

### Por qué este orden

00–02: vocabulario y cómo viaja un request por la red.
03: los pilares teóricos de todo sistema distribuido.
04–06: cómo se guardan y sirven los datos.
07–08: cómo se comunican los servicios entre sí.
09–10: cómo se hace todo esto confiable y seguro.
11–13: cómo se opera en producción y se estima capacidad.
14: se aplica todo lo anterior en diseños completos.

---

### Casos de estudio con código (`case-studies/`)

    