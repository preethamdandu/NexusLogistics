# NexusLogistics — agent guide

**One-liner:** Polyglot demo stack for vehicle location ingestion (gRPC → Kafka), tracking API (Node + Redis + Postgres), a Java route worker (Kafka in/out), Next.js map UI, and Nginx/Prometheus/Grafana around Docker Compose.

**Deep dive:** **`PHASE1_INVESTIGATION.md`** — full Phase 1 inventory, every topic, verification commands, benchmark truth table, K8s/probe issues, prom-client registry bug. **`STATUS.md`** — shorter snapshot. This file stays task-oriented.

## Architecture

| Piece | Role | Listens (compose) |
|-------|------|-------------------|
| **frontend** | Next.js dashboard calling the gateway | `:3002` → app `:3000` |
| **gateway** | Nginx: HTTP proxy, rate limits, `/health` static JSON | `:80` |
| **ingestion-service** | Go gRPC `SendPing` → Kafka topic `vehicle-locations`; Prometheus metrics | gRPC `:50051`, metrics `:9091` (→ container `:9090`) |
| **tracking-service** | Node Express: REST + Kafka consumer; writes Redis + Postgres | `:3000` |
| **route-service** | Spring Boot: Kafka `route-requests` → Redis lock → `route-updates`; REST `POST /calculate`, `GET /status/{vehicleId}`; `RouteUpdateConsumer` writes Redis `route:status:{id}` | `:8081` → `:8080` |
| **kafka**, **zookeeper**, **redis**, **nexus_postgres** | Infra | Kafka `:9092`/`:29092`, Redis `:6379`, Postgres `:5432` — **from other containers use hostname `postgres`**, not `container_name` |
| **prometheus**, **grafana**, **kafka-ui** | Observability / UI | `:9090`, `:3001`, `:8080` |

**Request flow (happy path):**

1. Client → **gRPC** `localhost:50051` → ingestion serializes ping JSON → **Kafka** `vehicle-locations`.
2. **tracking-service** consumer reads topic → **Redis** `SET vehicle:{id}:latest EX 86400` + **Postgres** `INSERT vehicle_locations`.
3. Browser or API client → **Nginx** `:80` → **tracking** `/tracking/:id` (Redis read-through / DB fallback + cache fill), live aggregate endpoints, or **SSE** `GET /api/live/stream` → tracking `GET /live/stream` (broadcasts each Kafka-ingested location to connected clients).
4. **route-service** (if messages exist on `route-requests`) → Redis `SETNX` lock → simulated work (`Thread.sleep`) → **Kafka** `route-updates` → same service’s consumer → Redis `route:status:{vehicleId}` (TTL 300s).
5. **Gateway** `POST /api/routes/calculate` → route-service `POST /calculate` (Kafka enqueue); `GET /api/routes/status/{id}` → cached JSON or **404** JSON on miss.
6. **AI fleet bar (Next.js):** Browser → Nginx **`/api/ai/tags`** / **`/api/ai/chat`** → host **Ollama** model **`gemma4:e2b`** with **`format: json`** → structured **`FleetAiAction`** JSON → map (`highlight` / `filter_by_type` / `filter_by_speed` / `zoom_to` / `route_vehicle` + status poll / dashed route polyline / `clear_filters`). Live fleet context is built only from **`useLiveVehicleStream`** (same `EventSource` as the dashboard); no extra npm AI SDKs.

```
[Client] --gRPC:50051--> [ingestion] --produce--> [Kafka vehicle-locations]
                                                      |
                                                      v
[Client] --HTTP:80--> [nginx] --HTTP--> [tracking] --> Redis / Postgres
                           |
[Next :3002] -------------+

[Kafka route-requests] --> [route-service] --produce--> [Kafka route-updates] --> [route-service Redis writer]
```

## Directory map (repo root)

| Path | Purpose |
|------|---------|
| `ingestion-service/` | Go gRPC server, Kafka producer, `cmd/client` (one-shot demo), **`cmd/simulator`** (continuous looped routes → `SendPing`), `cmd/bench`, `proto/` |
| `tracking-service/` | Node API, Kafka consumer, Redis/Postgres config, `migrations/init.sql` + `post-init-002-vehicle-locations-unique.sql` (Compose init order after `init.sql`) |
| `route-service/` | Spring Boot Kafka + Redis, `application.properties`, `cmd/bench` (Kafka producer to `route-requests`) |
| `frontend/` | Next.js 16 app (map, API client) |
| `gateway/` | `nginx.conf` for `:80` |
| `docker-compose.yml` | Full local stack |
| `k8s/` | Kustomize manifests (deployments, services, ingress, HPA, configmaps) |
| `monitoring/` | Prometheus scrape config, Grafana provisioning |
| `benchmarks/` | `run-all.sh` (curl-based; overwrites `docs/PERFORMANCE.md`), `README.md` (points to real gRPC bench), `tracking-load.sh` (needs `hey`) |
| `gateway-bench/`, `frontend-bench/` | Small Go HTTP stress tools; each has `go.mod` — `go run .` from that directory |
| `docs/` | `PERFORMANCE.md` (overwritten by `run-all.sh`; header mentions hey/wr but script uses `curl`) |
| `.github/workflows/` | `ci.yaml` Docker build + `kustomize build`; `test.yaml` Go/Node/Java/frontend jobs |

## Run locally (verified)

Project path may contain quotes/spaces; always `cd` to the real repo root.

```bash
docker compose up -d
```

**Worked on:** Docker Desktop macOS, 2026-04-10 — all compose services reached `Up`, including `kafka` and `zookeeper`.

**Checks used:**

```bash
docker compose ps
curl -s http://127.0.0.1/health
curl -s http://127.0.0.1:8081/actuator/health   # expect {"status":"UP"} when REDIS_HOST/KAFKA_BROKERS set (see `route-service/.../application.properties`)
```

**gRPC sample (host → published port):**

```bash
cd ingestion-service && go run ./cmd/client
```

**Continuous vehicle simulator (host binary, not in Compose):** sends `SendPing` every **~1.5s** (flag `-tick`) for **6** vehicles on looped waypoint routes (SF / LA / Seattle), **~60 km/h** along the polyline (`-speed`), metadata **`x-vehicle-type`** = `truck` or `bus` (ingestion copies into Kafka JSON `vehicle_type`). Graceful **SIGINT/SIGTERM**.

```bash
cd ingestion-service && go run ./cmd/simulator
# optional: -addr localhost:50051 -tick 1500ms -speed 60
```

**Live SSE:** after `docker compose up -d`, `curl -N http://localhost/api/live/stream` (or `:80`) — first event **`connected`**, then **`location-update`** with the same JSON shape the consumer processes (including **`vehicle_type`** when the ingestion image includes current `tracker.go`); **`:ping`** every **15s**. Nginx uses **`location = /api/live/stream`** with buffering off and **no** `limit_req`. If you edit `gateway/nginx.conf`, reload: `docker exec gateway nginx -s reload` (or recreate the gateway container). After changing **tracking-service** or **ingestion-service** code, rebuild those images so Compose containers match what you run on the host.

**Important:** `route-service` requires `src/main/resources/application.properties` with `spring.data.redis.host` / `spring.kafka.bootstrap-servers` from env; without it the JVM defaults to `localhost` inside the container and Actuator stays `DOWN`.

## Tests (what exists)

| Area | Command | Observed |
|------|---------|----------|
| Go ingestion | `cd ingestion-service && go vet ./... && go test ./...` | vet OK; **no `*_test.go` files** — tests are vacuous |
| Route Java | `cd route-service && mvn test` | **No `src/test` sources** — Surefire runs zero tests |
| Tracking Node | `npm test` | Jest (`tracking.read-path.test.ts`) |
| Tracking build | `cd tracking-service && npm run build` | `tsc` succeeds |
| Frontend | `cd frontend && npm run lint && npm run build` | **0** / **0** (ESLint + Next **16.1.1**); AI command bar + map actions live under `frontend/src/components` and `frontend/src/lib` |

CI (`.github/workflows/test.yaml`) mirrors the above expectations; it does not guarantee non-zero tests for Go/Java/tracking.

## Benchmarks

**Script that works without extra tools:**

```bash
bash benchmarks/run-all.sh
```

Requires `curl`, `bc`, `jq` (for route health JSON), gateway up at `http://localhost/`. Regenerates `docs/PERFORMANCE.md` with **50 sequential** `curl` requests per HTTP test (not hey/wr).

**gRPC load (real latencies):**

```bash
cd ingestion-service && go run ./cmd/bench -addr localhost:50051 -c 25 -d 5s
```

**Note:** Prefer `ingestion-service/cmd/bench` for gRPC load. `gateway-bench/`, `frontend-bench/`, and `tracking-service/cmd/bench/` each include a `go.mod` — run with `PATH` containing `/usr/local/go/bin`.

## Kubernetes manifests

Validate without a local `kustomize` binary:

```bash
docker run --rm -v "$PWD:/work" -w /work registry.k8s.io/kustomize/kustomize:v5.4.3 build k8s
```

**Probes:** `route-service` enables Spring Boot 3 **liveness/readiness** groups (`management.endpoint.health.probes.enabled=true`, etc.) so `/actuator/health/readiness` and `/liveness` match `k8s/deployments/route.yaml`.

## Design choices (code-backed)

- **Ingestion:** gRPC for typed pings; optional metadata **`x-vehicle-type`** (`truck` \| `bus`) → JSON field **`vehicle_type`** on the Kafka payload (`ingestion-service/internal/service/tracker.go`); Kafka `acks=all` on producer (`ingestion-service/internal/kafka/producer.go`).
- **Tracking read path:** Redis key `vehicle:{id}:latest` first; on miss, Postgres latest row then `SET` with **TTL 86400s** (`tracking-service/src/api/server.ts`).
- **Tracking write path (consumer):** On each Kafka message, Redis `SET` with same TTL + Postgres `INSERT ... ON CONFLICT (vehicle_id, timestamp) DO NOTHING` after migration `post-init-002-vehicle-locations-unique.sql` adds the unique constraint.
- **Route optimization:** Redis `SETNX` lock per vehicle; **`RouteOptimizer`** snaps positions to an internal **road graph**, runs **A\*** (A-star), publishes JSON with **`path`** `{lat,lng}` points, **`total_distance_meters`**, **`eta_seconds`** (`route-service/.../RouteOptimizer.java` + `com.nexus.route.graph`).
- **Gateway:** `limit_req` 100 r/s (burst 50) on most APIs; **10 r/s** on `/api/metrics` (`gateway/nginx.conf`). README “10 req/s/IP” globally is inaccurate.
- **gRPC** is not proxied on `:80`; clients use ingestion **`:50051`** directly. Nginx defines `upstream route_service` for `/api/routes/`.

## Conventions

- **Go:** standard library + gRPC; small internal packages (`internal/kafka`, `internal/service`); Prometheus via `promauto` counters.
- **Node/Express:** single `server.ts`; `prom-client` uses one **`Registry`**: `startConsumer(register)` registers `tracking_messages_consumed_total` on it, and Express exposes the same register on `/metrics`.
- **Kafka** via `kafkajs`; **Redis** via `ioredis`; **Postgres** via `pg` pool.
- **Java:** Lombok on models/services; Spring Kafka `@KafkaListener`; minimal Actuator exposure in properties.
- **Redis:** `/vehicles` and `/live/all` use **`SCAN`** for `vehicle:*:latest` keys instead of `KEYS`.

## Postgres hostname (Compose)

Use the **Compose service name** `postgres` as `POSTGRES_HOST` from other containers (matches `k8s/configmaps/app-config.yaml`). `container_name: nexus_postgres` is for operator commands like `docker exec -it nexus_postgres psql`, not for inter-service DNS.

## Current truth

See **`STATUS.md`** for last-run commands, HTTP/gRPC results, metrics, benchmark numbers, and README/code discrepancies.
