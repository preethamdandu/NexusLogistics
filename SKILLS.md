# Skills demonstrated in NexusLogistics

Depth: **touched** = wired but shallow or not E2E; **working** = happy-path E2E verified; **solid** = edge/failure handling evidenced.

---

## Languages

| Skill | Where | What | Depth |
|-------|--------|------|--------|
| Go (services, gRPC) | `ingestion-service/main.go`, `proto/tracker.proto`, `pb/*`, `internal/*` | gRPC server, Kafka produce, Prometheus HTTP on `:9090` | **working** |
| TypeScript / Node (Express) | `tracking-service/src/api/server.ts`, `src/consumers/locationConsumer.ts` | REST API, Kafka consumer, Redis + Postgres I/O | **working** |
| Java / Spring Boot | `route-service/src/main/java/...` | Kafka listener, Redis template, KafkaTemplate send, Actuator | **working** (consumer path; optimization is stub) |
| TypeScript / React (Next.js) | `frontend/src/**` | Dashboard, map, axios client to gateway | **working** (build + ESLint clean, 2026-04-10 Phase 1) |

---

## Service communication

| Skill | Where | What | Depth |
|-------|--------|------|--------|
| gRPC + protobuf | `ingestion-service/proto/tracker.proto`, reflection in `main.go` | Unary `SendPing` | **working** |
| Kafka produce (Go) | `ingestion-service/internal/kafka/producer.go` | JSON payload to `vehicle-locations` | **working** |
| Kafka consume (Node) | `tracking-service/src/consumers/locationConsumer.ts` | `eachMessage` → Redis + SQL | **working** |
| Kafka consume (Java) | `RouteRequestConsumer.java` | `route-requests` → `RouteOptimizer` | **working** when topic fed (e.g. `route-service/cmd/bench`) |
| Kafka produce (Java) | `RouteOptimizer.java` | `route-updates` topic | **touched** — no consumer in repo |
| HTTP reverse proxy | `gateway/nginx.conf` | Path-based proxy, rate limits, CORS snippets | **working** |
| Nginx → gRPC | `gateway/nginx.conf` (`upstream ingestion_service`) | Upstream declared; **no grpc location** | **touched** / incomplete |

---

## Data & caching

| Skill | Where | What | Depth |
|-------|--------|------|--------|
| Redis cache-aside reads | `server.ts` `GET /tracking/:id` | GET key; miss → DB; populate with `EX 86400` | **working** |
| Redis write on ingest | `locationConsumer.ts` | SET latest + EX 86400 | **working** |
| Redis distributed lock | `RouteOptimizer.java` | `setIfAbsent` + delete in `finally` | **working** for single-flight style skip |
| Postgres schema | `tracking-service/migrations/init.sql` | `vehicle_locations` + index | **working** |
| Postgres queries | `server.ts`, `locationConsumer.ts` | `SELECT ... ORDER BY timestamp DESC LIMIT 1`; `INSERT` | **working** |

---

## Infrastructure & deployment

| Skill | Where | What | Depth |
|-------|--------|------|--------|
| Docker Compose | `docker-compose.yml`, per-service `Dockerfile`s | Multi-service stack, env wiring | **working** (verified `docker compose up -d`) |
| Kubernetes (manifests) | `k8s/*`, `kustomization.yaml` | Deployments, services, ingress, HPA, secrets placeholder | **touched** — `kustomize` not installed on verification host; CI runs `kustomize build k8s/` |
| CI build images | `.github/workflows/ci.yaml` | docker build-push per service | **working** in CI definition (not re-run locally here) |

---

## Observability

| Skill | Where | What | Depth |
|-------|--------|------|--------|
| Prometheus scrape config | `monitoring/prometheus/prometheus.yml` | Jobs for ingestion `:9090`, tracking `:3000`, route `/actuator/prometheus` | **working** — `up==1` observed via Prometheus API on live stack |
| Go metrics | `ingestion-service` `/metrics`, counters in `tracker.go` | `ingestion_pings_*` counters | **working** |
| Node metrics | `tracking-service` `/metrics` | Histogram `http_request_duration_seconds` + defaults | **working** |
| Kafka consumed counter (Node) | `tracking-service/src/consumers/locationConsumer.ts` | Declares `tracking_messages_consumed_total` | **touched** — registered on **global** `client.register` while `server.ts` serves a **different** Registry; metric **missing** from `/metrics` scrape (see `PHASE1_INVESTIGATION.md`) |
| Spring Actuator | `route-service` | health + prometheus endpoint | **working** when Redis/Kafka hosts correct |
| Grafana provisioning | `monitoring/grafana/provisioning/*` | Datasource + dashboard JSON | **touched** — UI not exercised in verification pass |

---

## Testing & benchmarking

| Skill | Where | What | Depth |
|-------|--------|------|--------|
| Automated unit/integration tests | Go/Java/tracking | **No substantive test sources** in repo | **touched** (CI invokes `go test` / `mvn test` / `npm test --if-present`) |
| Shell benchmark driver | `benchmarks/run-all.sh` | 50× `curl` per endpoint, writes `docs/PERFORMANCE.md` | **working** — methodology is weak (sequential, not load tool) |
| gRPC load tool | `ingestion-service/cmd/bench/main.go` | Concurrent workers, p50/p99 from samples | **working** |
| Kafka stress producer | `route-service/cmd/bench/main.go` | Async `kafka-go` writer to `route-requests` | **working** (producer side); absurd RPS with async — not a latency benchmark |

---

## Not demonstrated in this repo

- **Exactly-once** Kafka processing (standard consumer; no idempotent DB upsert on `(vehicle_id,timestamp)` etc.).
- **Real routing algorithms** (A\*, Dijkstra, OR-Tools): route path is sleep + mock JSON only.
- **Subscribers** to `route-updates` (messages are produced nowhere in the main app flow except optimizer).
- **gRPC through Nginx on port 80** (only direct `:50051`).
- **Production-grade auth** (no JWT/OAuth; CORS `*` on API locations).
- **Schema registry / Avro** for Kafka (JSON payloads in Go and Node).
- **Chaos, failover, multi-broker Kafka tuning**, HPA behavior under load (manifests exist; not validated).
- **Frontend ESLint clean** — current `eslint` run fails.
- **Horizontal scaling correctness** for Redis `KEYS` in `/vehicles` and `/live/all` (O(N) pattern).
