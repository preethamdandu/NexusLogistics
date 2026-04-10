# Phase 1 — Full investigation & verification

**Purpose:** Exhaustive inventory of the NexusLogistics repo: structure, code paths, data flow, infra, and **what was actually run** (not README claims).

**Verification date:** 2026-04-10  
**Environment:** macOS, Docker Desktop, repo path containing quotes/spaces (use careful `cd`).

---

## 1. Repository inventory (top level)

| Path | Role |
|------|------|
| `ingestion-service/` | Go: gRPC server, Kafka producer to `vehicle-locations`, Prometheus `:9090` (host-mapped `:9091`) |
| `tracking-service/` | Node/Express: REST + Kafka consumer, Redis + Postgres, `migrations/init.sql` |
| `route-service/` | Spring Boot: Kafka `route-requests` → Redis lock + sleep + publish `route-updates`; Actuator only |
| `frontend/` | Next.js 16 app, Leaflet map, calls gateway |
| `gateway/` | `nginx.conf` — HTTP only on `:80`; proxies to tracking; **no gRPC `location`** |
| `docker-compose.yml` | Zookeeper, Kafka, Postgres, Redis, all apps, Prometheus, Grafana, Kafka UI |
| `k8s/` | Kustomize bundle: namespace, configmap, secret, 4 deployments, 4 services, HPA, ingress |
| `monitoring/` | Prometheus `prometheus.yml`, Grafana provisioning (Prometheus datasource + dashboard JSON) |
| `benchmarks/` | `run-all.sh` (curl + `bc`), `ingestion-load.go` (**stub** — see §10), `tracking-load.sh` (needs `hey`) |
| `gateway-bench/`, `frontend-bench/` | Standalone Go stress tools (`go.mod` added for `go run .`) |
| `docs/` | `PERFORMANCE.md` (overwritten by `run-all.sh`) |
| `.github/workflows/` | `ci.yaml` image builds + kustomize; `test.yaml` Go/Node/Java/frontend |
| `CLAUDE.md`, `SKILLS.md`, `STATUS.md` | Agent/skill/status docs |
| `.env.example` | Documented env vars (not wired into compose automatically) |

---

## 2. Kafka topics (code-defined; auto-created by brokers)

| Topic | Producers | Consumers |
|-------|-----------|-----------|
| `vehicle-locations` | Go `ingestion-service` (`internal/kafka/producer.go`, JSON value) | Node `tracking-service` (`locationConsumer.ts`, `fromBeginning: true`) |
| `route-requests` | `route-service/cmd/bench/main.go` (stress); **no first-party API** produces in normal flow | Java `RouteRequestConsumer` |
| `route-updates` | Java `RouteOptimizer` after mock “optimization” | **None in repo** |

**Payload shapes:**

- **vehicle-locations:** JSON `{"vehicle_id","latitude","longitude","timestamp"}` (Go struct tags in `tracker.go` → marshaled keys).
- **route-requests:** JSON `{"vehicleId","currentLat","currentLong"}` per `RouteRequest.java` + bench struct.
- **route-updates:** JSON string from `ObjectMapper` map (vehicle_id, status, next_stop, eta_seconds).

---

## 3. Redis

| Pattern | Where | TTL |
|---------|--------|-----|
| Latest location cache | `vehicle:{vehicle_id}:latest` | **86400 s** on `SET` (consumer + read-path populate) |
| Route optimization lock | `lock:route:{vehicleId}` | **10 s** `SETNX` in Java |

**Read path (`GET /tracking/:id`):** Redis GET → hit returns JSON; miss → Postgres `SELECT ... ORDER BY timestamp DESC LIMIT 1` → `SET` with `EX 86400` (cache-aside on read).

**Write path (consumer):** Each consumed message → `SET` latest + `INSERT` history (**dual-write** on ingest).

**Operational note:** `GET /vehicles` and `/live/all` use `KEYS vehicle:*:latest` — O(N) over keyspace; unsafe at scale.

---

## 4. PostgreSQL

**Schema:** `tracking-service/migrations/init.sql` — table `vehicle_locations(id, vehicle_id, latitude, longitude, timestamp, created_at)` + index `(vehicle_id, timestamp DESC)`.

**Queries in code:**

- Consumer: `INSERT INTO vehicle_locations (...) VALUES ($1..$4)`.
- API: `SELECT ... WHERE vehicle_id = $1 ORDER BY timestamp DESC LIMIT 1`.

**Verified (2026-04-10):** After producing one JSON message to `vehicle-locations` via `kafka-console-producer`, row appeared for `phase1provekafka` and HTTP `GET /tracking/phase1provekafka` returned 200 with matching JSON.

---

## 5. Service-by-service (entrypoints & contracts)

### 5.1 Ingestion (Go)

- **Entry:** `ingestion-service/main.go` — fails fast if Kafka producer cannot be created.
- **gRPC:** `proto/tracker.proto` — `TrackerService/SendPing(LocationPing) returns PingResponse`.
- **Reflection:** enabled (`grpc/reflection`) — verified with `grpcurl` in Docker: lists `tracker.TrackerService`.
- **Metrics:** `promhttp` on container `:9090` → host `:9091` in compose. Counters `ingestion_pings_received_total`, `ingestion_pings_produced_total` in `internal/service/tracker.go`.
- **Dockerfile:** multi-stage Maven-style not used — Go build in container.

### 5.2 Tracking (Node)

- **Entry:** `tracking-service/src/api/server.ts` — `startServer()` awaits `startConsumer()` then `listen(3000)`.
- **Routes (Express, direct):**  
  `GET /metrics`, `GET /tracking/:vehicleId`, `GET /vehicles`, `GET /health`,  
  `GET /live/aircraft`, `/live/trucks`, `/live/buses`, `/live/all`.
- **Gateway mapping (`nginx.conf`):**  
  `/api/tracking/` → strip to `/tracking/`; `/api/vehicles` → `/vehicles`; `/api/live/` → `/live/`; `/api/metrics` → `/metrics` (stricter rate limit).
- **Prometheus:** `prom-client` **custom Registry** in `server.ts` for histogram + defaults. **Bug:** `locationConsumer.ts` registers `tracking_messages_consumed_total` on **`client.register` (global)** while `/metrics` serves the **other** Registry — counter **does not appear** in `/metrics` output (verified by listing metric names).

### 5.3 Route (Java)

- **Entry:** `RouteServiceApplication.java`.
- **Config:** `src/main/resources/application.properties` — `REDIS_HOST`, `REDIS_PORT`, `KAFKA_BROKERS`; without this file, container used localhost and health was DOWN (fixed in repo).
- **Actuator (verified):**  
  - `GET /actuator/health` → **200** `{"status":"UP"}` when Redis/Kafka reachable.  
  - `GET /actuator/health/readiness` → **404**  
  - `GET /actuator/health/liveness` → **404**  
  **Implication:** `k8s/deployments/route.yaml` readinessProbe on `/actuator/health/readiness` **does not match** default Spring Boot 3.1 exposure (probe will fail in K8s unless endpoints added/configured).
- **Business API:** **None** — no `@RestController`. **Ingress** `k8s/gateway/ingress.yaml` defines `/api/routes` → `route-service:8080`, but **compose Nginx has no such path** — `curl http://127.0.0.1/api/routes/x` → **404**.

### 5.4 Frontend (Next.js)

- **Version:** `frontend/package.json` → `next@16.1.1` (README badge still says 15).
- **API client:** `src/lib/api.ts` — `NEXT_PUBLIC_API_URL` default `http://localhost:80`.
- **Lint:** `npm run lint` **fails** (e.g. `no-explicit-any` in `page.tsx`, `no-require-imports` in `tailwind.config.ts`).

---

## 6. End-to-end flows (ground truth)

### Flow A — Location ping to queryable state

1. Client → **gRPC** `host:50051` `SendPing` OR produce JSON to `vehicle-locations`.
2. Kafka holds message; **tracking** consumer commits processing (at-least-once; no idempotent constraint).
3. Consumer → Redis `SET vehicle:{id}:latest EX 86400` + Postgres `INSERT`.
4. Client → **HTTP** gateway `:80` `/api/tracking/{id}` → tracking `GET /tracking/:id` → Redis hit or DB fallback.

**Verified:** Unique vehicle `phase1provekafka` — 404 before produce; after `kafka-console-producer`, Redis key populated, HTTP 200, Postgres row present.

### Flow B — Route request (manual / bench only)

1. Message JSON on `route-requests` with `vehicleId`, `currentLat`, `currentLong`.
2. `RouteOptimizer` tries Redis lock → `Thread.sleep(2000)` → `kafkaTemplate.send("route-updates", ...)`.
3. **No service consumes `route-updates` in this repo.**

**Verified:** `docker logs route-service` shows `Acquired lock` / `Route calculation complete` (including backlog from prior `route-service/cmd/bench` runs).

### Flow C — Live map data

- `/live/all` merges Redis-backed vehicles (typed `truck`), OpenSky aircraft (with fallback simulation), and **always** adds simulated trucks and buses from in-code arrays.
- **External dependency:** OpenSky can fail; observed `GET /api/live/aircraft` **500** in one run; `/api/live/all` can still 200 with fallbacks.

---

## 7. Kubernetes (`k8s/`)

**Build:** `kustomize build` succeeded using:

```bash
docker run --rm -v "$REPO:/work" -w /work registry.k8s.io/kustomize/kustomize:v5.4.3 build k8s
```

**Output:** 389 YAML documents (line count from `wc -l` on rendered stream).

**Not verified:** Apply to a real cluster; image names `nexus/*:latest` vs GHCR in CI; ConfigMap uses `POSTGRES_HOST: postgres` while compose service is `nexus_postgres` — **naming mismatch** for copy-paste from compose to K8s without adjustment.

**Issues flagged:**

| Item | Problem |
|------|---------|
| `route.yaml` probes | `/actuator/health/readiness` returns **404** on running container |
| Ingress `/api/routes` | No matching implementation on `route-service` (no REST controller) |
| Tracking HPA | Manifest only; not validated with metrics-server |

---

## 8. Observability

| Component | Config | Verified |
|-----------|--------|----------|
| Prometheus | `monitoring/prometheus/prometheus.yml` scrapes ingestion:9090, tracking:3000, route `/actuator/prometheus` | `up==1` for all three jobs via `/api/v1/query?query=up` |
| Grafana | Datasource `http://prometheus:9090` | `GET /api/health` → database ok, version 12.3.1; root redirects **302** |
| Kafka UI | compose `:8080` | HTTP **200** on `/` |
| Ingestion metrics | `:9091/metrics` | Counters present |
| Tracking metrics | `:3000/metrics` | Histogram + Node defaults; **missing** consumer counter (registry bug §5.2) |

---

## 9. Tests & static analysis (commands run)

| Scope | Command | Outcome |
|-------|---------|---------|
| Go | `cd ingestion-service && go vet ./...` | OK |
| Go | `go test ./...` | **No test files** |
| Java | `cd route-service && mvn test` (PATH includes `/opt/homebrew/bin`) | **No test sources**; BUILD SUCCESS |
| Tracking | `npm test` | **Script absent** |
| Tracking | `npm run build` (`tsc`) | OK |
| Frontend | `npm run build` | OK |
| Frontend | `npm run lint` | **FAIL** (2 errors) |

---

## 10. Benchmarks & scripts (honest matrix)

| Artifact | What it does | Real gRPC/HTTP load? | Verified run (2026-04-10) |
|----------|----------------|----------------------|---------------------------|
| `benchmarks/run-all.sh` | 50 sequential `curl` per test, `bc` math, writes `docs/PERFORMANCE.md` | No concurrency | Yes — live/all ~167ms avg, ~5.57 RPS; tracking ~12ms avg, ~53.76 RPS; route UP |
| `benchmarks/ingestion-load.go` | Loops with `time.Sleep`; **does not invoke gRPC** | **No** — fake counter | Not run as meaningful load (file inspected) |
| `benchmarks/tracking-load.sh` | Wraps `hey` | Yes if hey installed | **`hey` not installed** on host — not run |
| `ingestion-service/cmd/bench` | Real gRPC client, p50/p99 | Yes | Yes — e.g. 30 workers, 5s: **22102** reqs, **0** fail, **4412.81 RPS**, p99 **~9.44ms** |
| `route-service/cmd/bench` | `kafka-go` async producer storm | Kafka produce only | Run earlier session; produces huge async RPS — not a latency benchmark |
| `tracking-service/cmd/bench` | HTTP GET random `/tracking/bench-veh-*` | Yes | Yes — 20 workers, 5s direct `:3000`: **1614** counted 5xx in bench’s “failed” counter, **7.05 RPS** successful samples, p99 **~1.9s** (likely DB/cache pressure + mostly 404 vehicle IDs) |
| `gateway-bench/` | 50 workers hammer gateway URL | Yes | Yes — **~3245 RPS** total attempts, **~31659** **429** rate limits, **~1032** HTTP 200 (Nginx `limit_req`) |
| `frontend-bench/` | Load Next + API via gateway | Yes | Yes — mostly **errors** in script’s success bucket (e.g. 7/5366 “success” on frontend URL; API storm 498/19705); interpret as **stress + many non-2xx/timeouts** — not a clean SLA test |

**`docs/PERFORMANCE.md` header** claims “hey / wrk” — **false** for `run-all.sh` (curl only).

---

## 11. HTTP/gRPC checklist (explicit)

| Call | Result (typical run) |
|------|----------------------|
| `GET /health` (gateway) | 200 |
| `GET /api/tracking/:id` | 200 if cached/DB; 404 if unknown |
| `GET /api/vehicles` | 200 (large body if many keys) |
| `GET /api/live/*` | 200; aircraft may 500 if OpenSky fails |
| `GET /api/metrics` | 200 |
| `OPTIONS` preflight tracking | **204** from Nginx for `OPTIONS /api/tracking/x` (preflight `if` block returns empty 204 with CORS headers) |
| `GET /api/routes/...` (gateway) | **404** (no location) |
| gRPC `SendPing` | OK via `go run ingestion-service/cmd/client` |
| `GET :8081/actuator/health` | 200 UP |
| `GET :3002/` | 200 |

---

## 12. Prometheus metric names (non-exhaustive)

- **Go:** `ingestion_pings_received_total`, `ingestion_pings_produced_total`, Go/process defaults.
- **Node (served):** `http_request_duration_seconds_*` (route label e.g. `/tracking/:vehicleId`), Node/process defaults.
- **Java:** Spring Boot Actuator Prometheus registry on `/actuator/prometheus`.

---

## 13. Claims vs code (high-signal)

| Claim | Actual |
|-------|--------|
| README throughput/latency tables (19.2k RPS, 13ms P99, monolith compare) | **Not reproduced** by repo scripts; values are aspirational |
| “A*” / Dijkstra route | **`Thread.sleep` + mock JSON** only |
| “Exactly-once” | **Not implemented** |
| Next.js 15 badge | **Next 16.1.1** |
| Global 10 req/s API limit | **100 r/s** on most API paths; **10 r/s** on `/api/metrics` |
| `benchmarks/ingestion-load.go` as gRPC load | **Does not call gRPC** |

---

## 14. Scaffold / TODO (code smells)

- Unused imports in `server.ts` (`validateParams`, `VehicleIdParamSchema`).
- Unused `upstream ingestion_service` in `nginx.conf` (no `grpc_pass`).
- `route-service` `RouteOptimizer` imports `TimeUnit` unused (minor).
- No tests for core business logic.
- `route-updates` topic has no consumer in-tree.

---

## 15. How to reproduce verification

```bash
# From repo root (adjust for your path)
docker compose up -d

# Kafka → Redis + Postgres + HTTP (replace VID)
docker exec redis redis-cli DEL "vehicle:${VID}:latest"
echo '{"vehicle_id":"'"$VID"'","latitude":1,"longitude":2,"timestamp":'$(date +%s)'}' | \
  docker exec -i kafka kafka-console-producer --bootstrap-server kafka:29092 --topic vehicle-locations
curl -s "http://127.0.0.1:3000/tracking/$VID"

# Kustomize (no local binary)
docker run --rm -v "$PWD:/work" -w /work registry.k8s.io/kustomize/kustomize:v5.4.3 build k8s > /tmp/nexus-k8s.yaml

# gRPC reflection
docker run --rm --add-host=host.docker.internal:host-gateway fullstorydev/grpcurl:latest \
  -plaintext host.docker.internal:50051 list
```

**Toolchain PATH notes:** On the verification host, `go` required `/usr/local/go/bin`, `mvn` required `/opt/homebrew/bin` in `PATH` for non-interactive shells.

---

*This document supersedes informal notes for Phase 1 completeness. For a shorter operational snapshot see `STATUS.md`; for agent conventions see `CLAUDE.md`.*
