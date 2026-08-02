# Escalabilidad vertical vs horizontal

**Vertical (scale up):** el mismo nodo, más potente — más CPU, más RAM. Simple, sin coordinación entre procesos, pero tiene techo físico y es un único punto de falla.

**Horizontal (scale out):** más nodos, cada uno con menos potencia, repartiendo el trabajo. Sin techo teórico y sobrevive a que un nodo se caiga, pero suma complejidad: hay que coordinar y repartir el trabajo entre nodos.

## Demo

`demo.py` simula la misma carga de trabajo total (20 tareas) de dos formas:

1. **Vertical** — 1 nodo con `power=4`.
2. **Horizontal** — 4 nodos con `power=1` cada uno (misma potencia total que el caso vertical).
3. **Horizontal degradado** — los mismos 4 nodos, pero 1 está caído.

La potencia de cada nodo se simula como cuánto tarda en procesar una tarea (`tiempo_base / power`).

```bash
python3 demo.py
```

Salida real de una corrida:

```
Vertical   (1 nodo,  power=4):        0.50s
Horizontal (4 nodos, power=1 c/u):    0.51s
Horizontal con 1 nodo caído (3/4):    0.71s   <- se degrada, sigue sirviendo
Vertical con el nodo caído:           N/A     <- 0% de capacidad, no hay a quién redirigir
```

## Qué muestra esto

- Con la misma potencia total, vertical y horizontal tardan prácticamente lo mismo — la ventaja de horizontal no es velocidad, es **redundancia**.
- Si se cae el único nodo vertical, la capacidad es 0%. Si se cae un nodo horizontal, la capacidad baja (acá 25%) pero el sistema sigue respondiendo — esto es la conexión directa con `04_ha-vs-fault-tolerance` de esta misma fase.
- Vertical tiene techo (existe un límite físico de CPU/RAM en una sola máquina); horizontal en teoría no, a costa de la complejidad de coordinar N nodos.
