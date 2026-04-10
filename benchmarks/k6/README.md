# k6 load harness (Phase 2 slice A)

Sustained **60s** scenarios with **`constant-vus`** executors. Percentiles come from k6’s end-of-run summary (`med` = **P50**). Scripts use **`k6/net/grpc`** (Grafana k6 **0.56.x**).

## Prerequisites

- Docker (used to run `grafana/k6` if `k6` is not installed on the host).
- Stack up with host-published ports: **ingestion gRPC `:50051`**, **tracking HTTP `:3000`** (`docker compose up -d`).
- On macOS/Windows, scripts default to **`host.docker.internal`** inside the container.

## Run

```bash
cd benchmarks/k6
chmod +x run-all.sh   # once
./run-all.sh
```

Or a single script:

```bash
docker run --rm -i \
  -v "$(pwd):/scripts" -w /scripts \
  --add-host=host.docker.internal:host-gateway \
  grafana/k6:0.56.0 run \
  -e GRPC_ADDR=host.docker.internal:50051 \
  grpc_ingestion.js
```

Native k6 (if installed): omit Docker, set `GRPC_ADDR=127.0.0.1:50051` and `HTTP_BASE=http://127.0.0.1:3000`.

## Scenarios

| Script | Target | Concurrency | What it measures |
|--------|--------|-------------|------------------|
| `grpc_ingestion.js` | `TrackerService.SendPing` | **25** VUs | Unary gRPC to ingestion |
| `http_tracking_hit.js` | `GET /tracking/k6-cache-hit` on tracking | **40** VUs | Redis hot path (setup sends one gRPC ping, then polls until **200**) |
| `http_tracking_miss.js` | `GET /tracking/k6-miss-…` (unique id) | **40** VUs | **404 lookup path** (no Redis key, no Postgres row — not DB-backfill-after-cache-miss) |

HTTP tests hit **tracking directly** (`:3000`), not Nginx, so numbers are the Node service, not gateway `limit_req`.

## Measured results (recorded run)

**Environment:** Docker Compose on macOS (Docker Desktop), **2026-04-10**. Image **`grafana/k6:0.56.0`**. k6 container → **`host.docker.internal`** → host ports.

### gRPC — `grpc_ingestion.js` (25 VUs, 60s)

| Metric | Value |
|--------|--------|
| Iteration rate | **~3402/s** (204149 iterations) |
| `grpc_req_duration` **avg** | **7.28ms** |
| **P50** (`med`) | **7.12ms** |
| **P95** | **8.62ms** |
| **P99** | **10.37ms** |
| Checks (`grpc ok`) | **100%** |

### HTTP — cache hit — `http_tracking_hit.js` (40 VUs, 60s)

| Metric | Value |
|--------|--------|
| Request rate | **~12471/s** (748688 iterations) |
| `http_req_duration` **avg** | **3.16ms** |
| **P50** (`med`) | **2.63ms** |
| **P95** | **5.57ms** |
| **P99** | **7.66ms** |
| Checks (HTTP **200**) | **100%** |

### HTTP — 404 lookup path — `http_tracking_miss.js` (40 VUs, 60s)

| Metric | Value |
|--------|--------|
| Request rate | **~7850/s** (471055 iterations) |
| `http_req_duration` **avg** | **5.05ms** |
| **P50** (`med`) | **4.63ms** |
| **P95** | **7.34ms** |
| **P99** | **9.42ms** |
| Checks (HTTP **404**) | **100%** |

**Note:** k6 may still show `http_req_failed` high for this scenario because **404** counts as a failed request in that metric; the **`404` check** and **`http_req_duration`** trend are the authoritative pass/fail for this test.

## Artifacts

- `./run-all.sh` — runs all three scenarios and writes JSON summaries under `results/` (gitignored).
