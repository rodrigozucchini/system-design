"""Compara escalar vertical (1 nodo potente) vs horizontal (varios nodos chicos),
incluyendo qué pasa cuando falla un nodo en cada esquema."""

import time
from concurrent.futures import ThreadPoolExecutor

TOTAL_TASKS = 20
BASE_TASK_TIME = 0.1  # segundos que tarda 1 unidad de "power" en procesar una tarea


def process(task_id: int, worker_power: float) -> int:
    time.sleep(BASE_TASK_TIME / worker_power)
    return task_id


def run_vertical(power: float) -> float:
    start = time.perf_counter()
    for i in range(TOTAL_TASKS):
        process(i, power)
    return time.perf_counter() - start


def run_horizontal(num_workers: int, power_per_worker: float) -> float:
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = [executor.submit(process, i, power_per_worker) for i in range(TOTAL_TASKS)]
        for f in futures:
            f.result()
    return time.perf_counter() - start


def run_horizontal_with_failure(num_workers: int, power_per_worker: float, failed_workers: int) -> float:
    surviving = num_workers - failed_workers
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=surviving) as executor:
        futures = [executor.submit(process, i, power_per_worker) for i in range(TOTAL_TASKS)]
        for f in futures:
            f.result()
    return time.perf_counter() - start


if __name__ == "__main__":
    vertical_time = run_vertical(power=4)
    horizontal_time = run_horizontal(num_workers=4, power_per_worker=1)
    horizontal_degraded = run_horizontal_with_failure(num_workers=4, power_per_worker=1, failed_workers=1)

    print(f"Vertical   (1 nodo,  power=4):        {vertical_time:.2f}s")
    print(f"Horizontal (4 nodos, power=1 c/u):    {horizontal_time:.2f}s")
    print(f"Horizontal con 1 nodo caído (3/4):    {horizontal_degraded:.2f}s   <- se degrada, sigue sirviendo")
    print("Vertical con el nodo caído:            N/A     <- 0% de capacidad, no hay a quién redirigir")
