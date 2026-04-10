# NexusLogistics — ground truth (verification log)

**When:** 2026-04-10 (extended Phase 1 pass)  
**Host:** macOS, Docker Desktop (daemon available)  
**Repo root:** path contains quotes/spaces; commands below assume successful `cd` into the clone.

**Full Phase 1 (exhaustive):** see **`PHASE1_INVESTIGATION.md`** — topics, Redis keys, K8s probe mismatches, benchmark truth table, prom-client registry bug, and reproduction commands. This file is the shorter snapshot.

### Phase 1 completion (2026-04-10, this pass)

| Item | Change | Verified |
|------|--------|----------|
| 1 Prom registry | `tracking-service`: consumer registers `tracking_messages_consumed_total` on the same `Registry` Express exposes | `curl :3000/metrics` lists `tracking_messages_consumed_total` |
| 2 Benchmarks | Removed fake `benchmarks/ingestion-load.go`; `benchmarks/README.md` points to `ingestion-service/cmd/bench` | n/a |
| 3 Route probes | `application.properties`: health probe + liveness/readiness groups | `:8081/actuator/health/readiness` & `/liveness` → **200** |
| 4 Postgres DNS | **`CLAUDE.md`**: Compose/K8s use hostname **`postgres`**; `nexus_postgres` is `container_name` only | doc |
| 5 Gateway + route API | Nginx `route_service`; **`if` + `proxy_pass` split** (exact `location = /api/routes/calculate` + `^~ /api/routes/`) so POST/GET proxy correctly; `ApiRoutesController`; `RouteUpdateConsumer` logs & skips bad JSON | Observed: POST `:80/api/routes/calculate` → **202** JSON; GET `:80/api/routes/status/{id}` → **404** JSON when Redis empty; → **200** JSON once `route:status:{id}` exists; large `route-requests` backlog delays new ids |
| 6 Dead code | Unused Nginx ingestion upstream removed earlier; tracking server has no dead zod imports | `npm run build` OK |
| 7 Redis SCAN | `scanVehicleLatestKeys()` for `/vehicles` and `/live/all` | Observed: `GET :80/api/vehicles` → **200** on live stack; implementation uses **SCAN** (not `KEYS`) |
| 8 Idempotent DB | `post-init-002-vehicle-locations-unique.sql`: dedupe then `UNIQUE`; consumer `ON CONFLICT DO NOTHING`; Compose mounts second init script | **Fresh volume:** `docker compose down -v && docker compose up -d` → `\d vehicle_locations` shows **`vehicle_locations_vehicle_id_timestamp_uq`** with **no** manual `psql`. **Old volume:** one-time `psql -f` still required if DB predates the file |

**Existing Postgres data directory (no volume wipe):** `docker-entrypoint-initdb.d` does **not** re-run. Apply once if needed:  
`docker exec -i nexus_postgres psql -U nexus -d nexus_logistics < tracking-service/migrations/post-init-002-vehicle-locations-unique.sql`

### Slice C baseline (before new tests, 2026-04-10)

Recorded so CI “green” is comparable and `npm test` can’t silently no-op.

| Command | Working dir | Exit | Notes |
|---------|-------------|------|--------|
| `go test ./...` | `ingestion-service` | **0** | All packages `[no test files]` |
| `mvn test -B` | `route-service` | **0** | No `src/test` sources (Surefire vacuous) |
| `npm test --if-present` | `tracking-service` | **0** | **No `test` script** — npm exits 0 without running tests |

### Slice C verification (after tests, 2026-04-10)

| Command | Working dir | Exit | Notes |
|---------|-------------|------|--------|
| `go test ./...` | `ingestion-service` | **0** | `internal/kafka` runs `MarshalProducePayload` table tests |
| `mvn test -B` | `route-service` | **0** | `RouteOptimizerTest`, `RouteUpdateConsumerIntegrationTest` (EmbeddedKafka + `@MockBean` Redis); **requires JDK ≤ 21 for local Maven** — if `mvn -version` reports **Java 25**, set `JAVA_HOME` to Temurin **17** or **21** (CI uses **17**) |
| `npm test` | `tracking-service` | **0** | Jest: `tracking.read-path.test.ts` (Supertest + `createApp` mocks) |

`npm run build` in `tracking-service` after refactor: **0** (`tsc`; `*.test.ts` excluded from compile).

### Slice B — A* routing (2026-04-10)

| Area | Implementation |
|------|------------------|
| Graph | `com.nexus.route.graph`: `Haversine` (edge weights + heuristic; documented), `RoadGraph` + builder, `SanFranciscoRoadNetwork` (**19** SF-style nodes, **sf-hub** depot), undirected edges weighted by Haversine meters |
| Search | `AStar.shortestPath(RoadGraph, start, goal)` — priority queue + stale-entry guard; heuristic = great-circle distance to goal |
| `RouteOptimizer` | Snap `currentLat`/`currentLong` to nearest graph node; A* to **sf-hub**; payload: `path` (ordered `{lat,lng}`), `total_distance_meters`, `eta_seconds` from **30 km/h**; **removed** `Thread.sleep`; lock + `kafkaTemplate.send("route-updates", …)` unchanged |
| Tests | `AStarTest`: 5-node chain, not the SF graph; `RouteOptimizerTest` updated (coords near **mission-24th**, asserts Kafka JSON includes `path` + `total_distance_meters`) |
| Build | `pom.xml`: `lombok.version` **1.18.34** (fixes Lombok vs newer `javac` API when not on CI’s JDK 17) |

**Verification**

- `mvn test -B` (with `JAVA_HOME` = Temurin **21** locally): **BUILD SUCCESS** (Surefire includes `AStarTest`, `RouteOptimizerTest`, `RouteUpdateConsumerIntegrationTest`).
- **Gateway E2E** (after `docker compose build route-service && docker compose up -d route-service`): `POST http://127.0.0.1/api/routes/calculate` with body `vehicleId`, `currentLat` **37.7522**, `currentLong` **-122.4184** → `GET /api/routes/status/{vehicleId}` returned JSON with **`path`** array of real coordinates, **`total_distance_meters`**, **`eta_seconds`** (no legacy `next_stop` / fixed **1200** ETA).

### CORS — route API (2026-04-10)

| Item | Detail |
|------|--------|
| Problem | Nginx `location = /api/routes/calculate` intentionally avoids `if ($request_method = OPTIONS)` with `proxy_pass` (documented “if is evil” risk), so browsers need the **origin app** to answer preflight via the proxied service |
| Change | `@CrossOrigin(origins = "*", maxAge = 3600)` on `ApiRoutesController` so Spring handles **OPTIONS** and CORS headers for `/calculate` and `/status/{id}` |
| Check | `curl -i -X OPTIONS http://127.0.0.1/api/routes/calculate` with `Origin` + `Access-Control-Request-Method: POST` → **200** with `Access-Control-Allow-Origin: *` and allowed methods/headers (Nginx still adds its own `add_header` CORS lines on top) |

### Frontend — Phase 1 (2026-04-10)

| Item | Change |
|------|--------|
| Lint / types | `page.tsx`: `StatCard` uses `LucideIcon` + `ReactNode` (no `any`); `tailwind.config.ts`: ESM `import tailwindcssAnimate` (no `require`) |
| Live data | `fetchDashboardLiveVehicles()` in `src/lib/api.ts`: parallel probe `GET /api/live/aircraft` with `validateStatus`; if status ≠ **200**, strip `type === 'aircraft'` from `GET /api/live/all` and dashboard shows amber banner: *Live aircraft feed temporarily unavailable* |
| Honest errors | Removed silent fallback to `/api/vehicles` on `/live/all` failure; React Query **error** state + **Retry**; **loading** skeleton; **empty** map copy when count is 0 |
| Fake KPIs | Removed hardcoded “Healthy” / “~1”; **System status** and **Updates / sec** show **—** with native tooltip *Requires a metrics-backed endpoint…* until Phase 2 health panel |
| Verify | `npm run lint` → **0**; `npm run build` → **0** (Next **16.1.1**) |

### Frontend — Phase 2 (2026-04-10)

| Item | Detail |
|------|--------|
| **Gateway** | `upstream ingestion_metrics` → `ingestion-service:9090`; `location ^~ /api/health/route` → `route_service/actuator/health`; `location ^~ /api/health/ingestion` → `ingestion_metrics/metrics`; CORS `*` on `/health` and both probe paths (**after editing `nginx.conf`, run `docker exec gateway nginx -s reload` or recreate the container**) |
| **Health panel** | Collapsible `<details>`; probes every **15s**: `/health`, `/api/live/trucks`, `/api/health/route`, `/api/health/ingestion`; red/green per probe; `docker logs …` hints on failure; links to Prometheus **:9090**, Grafana **:3001**, Kafka UI **:8080** (host tabs only, not fetched) |
| **KPI strip** | **System status** = Operational / Degraded / Checking… / Unknown from live probes; **Updates / sec** still **—** (needs Prom rate math) |
| **Polish** | `ThemeToggle` (`html.dark` + `useSyncExternalStore`); map legend uses `border` / `bg-background` (no heavy shadows); Inter unchanged |
| **Verify** | `npm run lint` → **0**; `npm run build` → **0** |

**Compose:** restart **gateway** after editing `nginx.conf` (`docker compose up -d gateway`).

---

## How to bring the system up

**Command that worked:**

```bash
docker compose up -d
```

**Result:** All defined services reported `Running` / `Up` (see table below). No hang observed. Compose printed a warning that top-level `version:` in `docker-compose.yml` is obsolete (Compose v2).

**Not run here:** `kubectl apply`, minikube, or cloud deploy — only Compose.

**Kustomize:** Local `kustomize` binary was missing; build **succeeded** via container:

`docker run --rm -v "$REPO:/work" -w /work registry.k8s.io/kustomize/kustomize:v5.4.3 build k8s` → **389** lines of rendered YAML (platform warning: amd64 image on arm64 host).

---

## Service status

| Service | Starts? | Health / probe | Notes |
|---------|---------|----------------|-------|
| zookeeper | Yes | n/a (no HTTP) | Supports Kafka |
| kafka | Yes | n/a | Ports `9092`, `29092` published |
| redis | Yes | `redis-cli PING` usable via `docker exec` | |
| nexus_postgres | Yes | `psql` via `docker exec` | DB `nexus_logistics`, user `nexus` |
| ingestion-service | Yes | `http://127.0.0.1:9091/metrics` → 200 | Host maps container metrics `:9090` → `:9091` |
| tracking-service | Yes | `http://127.0.0.1:3000/health` → 200 | |
| route-service | Yes | `http://127.0.0.1:8081/actuator/health` → `{"status":"UP"}` | Requires `application.properties` with `REDIS_HOST` / `KAFKA_BROKERS` env expansion |
| gateway | Yes | `http://127.0.0.1/health` → 200 | Static JSON from Nginx |
| frontend | Yes | `http://127.0.0.1:3002/` → 200 | |
| prometheus | Yes | `http://127.0.0.1:9090/api/v1/query?query=up` → success | Scrapes show `up==1` for ingestion, tracking, route jobs |
| grafana | Yes | `GET /api/health` → JSON `database: ok` | Root `/` → **302**; admin password `admin` per compose |
| kafka-ui | Yes | `GET /` → **200** | Browser UI not exercised |

---

## Endpoint verification

Latencies are single `curl` samples (`time_total`); not a load test unless noted.

| Endpoint | Method | Result | Latency (sample) | Notes |
|----------|--------|--------|------------------|-------|
| `http://127.0.0.1/health` | GET | 200 | ~0.002s | Nginx static JSON; CORS `*` for dashboard |
| `http://127.0.0.1/api/health/route` | GET | 200 | — | Proxies **route-service** `GET /actuator/health` |
| `http://127.0.0.1/api/health/ingestion` | GET | 200 | — | Proxies **ingestion** Prometheus `:9090/metrics` text |
| `http://127.0.0.1/api/tracking/vehicle-123` | GET | 200 | ~0.004s | JSON from cache/DB |
| `http://127.0.0.1/api/tracking/nonexistent-vehicle-xyz-999` | GET | 404 | — | Confirms miss path |
| `http://127.0.0.1/api/vehicles` | GET | 200 | ~0.024s | Large JSON — Redis **`SCAN`** for `vehicle:*:latest` |
| `http://127.0.0.1/api/live/aircraft` | GET | **500** | ~0.11s | OpenSky fetch failed this run (`Failed to fetch aircraft data`) |
| `http://127.0.0.1/api/live/trucks` | GET | 200 | ~0.003s | In-memory simulation |
| `http://127.0.0.1/api/live/buses` | GET | 200 | ~0.003s | In-memory simulation |
| `http://127.0.0.1/api/live/all` | GET | 200 | ~0.17s | Redis + OpenSky/simulated aircraft + simulated trucks/buses |
| `http://127.0.0.1/api/metrics` | GET | 200 | ~0.003s | Proxied tracking Prometheus text |
| `http://127.0.0.1:3000/health` | GET | 200 | ~0.001s | Direct tracking |
| `http://127.0.0.1:3000/metrics` | GET | 200 | ~0.002s | Direct tracking metrics |
| `http://127.0.0.1:8081/actuator/health` | GET | 200 | ~0.005s | `{"status":"UP"}` |
| `http://127.0.0.1:8081/actuator/prometheus` | GET | 200 | ~0.004s | Spring Prometheus scrape format |
| `http://127.0.0.1:9091/metrics` | GET | 200 | ~0.001s | Go Prometheus |
| gRPC `tracker.TrackerService/SendPing` | RPC | OK | — | `go run ./ingestion-service/cmd/client` → `Success: true` |
| Next.js UI | GET `/` | 200 | ~0.003s | `:3002` |
| `http://127.0.0.1/api/routes/calculate` | POST | **202** | — | JSON body `vehicleId`, `currentLat`, `currentLong`; Nginx → route-service |
| `http://127.0.0.1/api/routes/status/{vehicleId}` | GET | **200** / **404** | — | **404** JSON `{"error":"not_found",...}` on Redis miss; **200** when `route-updates` consumer filled `route:status:{id}` |
| `http://127.0.0.1/api/tracking/x` | OPTIONS | **204** | — | CORS preflight from Nginx `if` block |
| `http://127.0.0.1:8081/actuator/health/readiness` | GET | **200** | — | Probe groups enabled in `application.properties` |
| `http://127.0.0.1:8081/actuator/health/liveness` | GET | **200** | — | Same |
| **Ingestion HTTP REST API** | — | **not tested** | — | No REST router in `ingestion-service` |
| **Route business REST** | — | **tested** | — | `ApiRoutesController`: `/calculate`, `/status/{vehicleId}` |

---

## Integration verification

| Integration | Verified? | How |
|-------------|-----------|-----|
| gRPC → Kafka produce | **Yes** | `SendPing` success + `ingestion_pings_produced_total` counter present on `:9091/metrics` |
| Kafka → tracking consume → Redis | **Yes** | After gRPC client, `redis-cli GET vehicle:vehicle-123:latest` returned JSON; ~1000 `vehicle:*:latest` keys present (prior load) |
| Kafka → tracking consume → Postgres | **Yes** | Large historical `COUNT(*)` plus **single-message** proof: produced JSON for `phase1provekafka` to `vehicle-locations`; `psql` showed row; HTTP 200 matched payload |
| Kafka → route consume | **Yes** | `docker logs route-service` shows `Acquired lock for vehicle ...` / `Route calculation complete` when `route-requests` has traffic (including `kafka-console-producer` test and bench backlog) |
| Kafka `route-updates` consumed | **Yes** | `RouteUpdateConsumer` → Redis `route:status:{vehicleId}` (TTL 300s); malformed JSON → log warn, skip |
| Redis read cache on `GET /tracking/:id` | **Yes** | **End-to-end:** `DEL vehicle:{id}:latest` → HTTP 404 → produce to Kafka → Redis key + HTTP 200 (see `PHASE1_INVESTIGATION.md` §3) |
| `tracking_messages_consumed_total` on `/metrics` | **Fixed** | Consumer uses the same `Registry` instance passed to `startConsumer(register)` |
| gRPC reflection | **Yes** | `grpcurl` (Docker `fullstorydev/grpcurl`) `list` on `host.docker.internal:50051` → `tracker.TrackerService` |
| Prometheus scrape | **Yes** | `up` query returned `1` for all three configured jobs |
| Nginx → gRPC | **No** | No `grpc_pass` location; only TCP upstream definition unused by HTTP locations |

---

## Test suite results

**ingestion-service**

```text
go vet ./...   → exit 0
go test ./...  → ok internal/kafka (MarshalProducePayload); other packages [no test files]
```

**route-service**

```text
mvn test -B    → BUILD SUCCESS, Surefire: 4 tests (AStarTest, RouteOptimizerTest, RouteUpdateConsumerIntegrationTest; see Slice B / Slice C)
```

**PATH:** Non-login shells may need `export PATH=/opt/homebrew/bin:/usr/local/go/bin:$PATH` for `mvn` / `go` on macOS.

**tracking-service**

```text
npm test       → Jest (1 test, read path + Redis set EX 86400)
npm run build  → tsc OK
```

**frontend**

```text
npm run build  → Next.js 16.1.1 build OK
npm run lint   → exit 0 (Phase 1: page.tsx + tailwind.config.ts clean)
```

---

## Benchmark results (measured this session)

### A) `bash benchmarks/run-all.sh`

- **Tool:** sequential `curl` loops (50 requests each), `bc` for averages — **not** hey/wr despite header in `docs/PERFORMANCE.md`.
- **Concurrency:** 1 (implicit sequential loop).
- **Results (latest stdout):**
  - `GET http://localhost/api/live/all` — 50/50 success, **avg ~167ms**, **~5.57 RPS**.
  - `GET http://localhost/api/tracking/vehicle-123` — 50/50 success, **avg ~12ms**, **~53.76 RPS**.
  - Route health via `jq` on `:8081/actuator/health` → **UP**.

### B) `go run ./ingestion-service/cmd/bench -addr localhost:50051 -c 30 -d 5s`

- **Tool:** Go, per-worker gRPC connection, records latencies.
- **Concurrency:** 30 workers.
- **Duration:** ~5.01s wall clock.
- **Requests:** 22102 successful, 0 failed.
- **RPS:** **4412.81**
- **Latency:** avg **~6.78ms**, p50 **~6.70ms**, p99 **~9.44ms**

**P95:** not printed by this bench binary.

### C) `go run .` in `gateway-bench/` (added `go.mod`)

- **Target:** `http://localhost/api/tracking/vehicle-123` through Nginx.
- **Concurrency:** 50 workers × 10s.
- **Observed:** total attempts **~32845**, **~1032** HTTP 200, **~31659** HTTP **429** (rate limit), **~154** other errors — proves `limit_req` dominates under burst.

### D) `go run .` in `frontend-bench/` (added `go.mod`)

- **Targets:** `http://localhost:3002/` (50 workers, 10s) and gateway API (100 workers, 15s).
- **Observed:** very low “success” ratio per script’s 2xx–3xx bucket (e.g. **7**/5366 on frontend URL; **498**/19705 on API) — treat as **stress noise / connection saturation**, not SLO validation.

### E) `go run .` in `tracking-service/cmd/bench/` (added `go.mod`)

- **Target:** direct `http://127.0.0.1:3000/tracking/bench-veh-*`, 20 workers, 5s.
- **Observed:** **42** “successful” samples in bench logic, **1614** 5xx failures counted, **~7.05 RPS**, p99 **~1.9s** — mostly **404**/overload artifact from random IDs + load (see `cmd/bench/main.go` accounting).

### F) `benchmarks/ingestion-load.go`

- **Removed** — was a fake loop (no gRPC). Use `ingestion-service/cmd/bench` (see `benchmarks/README.md`).

### G) `benchmarks/tracking-load.sh`

- **`hey` not installed** on verification host — script not executed.

### H) k6 — `benchmarks/k6/` (Phase 2 slice A, **2026-04-10**)

- **Runner:** `grafana/k6:0.56.0` in Docker; targets via `host.docker.internal` → host **`:50051`** (gRPC) and **`:3000`** (tracking HTTP, **not** Nginx).
- **Duration / executor:** **60s** each, **`constant-vus`**.

| Script | VUs | Primary metric | Throughput (observed) | P50 (`med`) | P95 | P99 |
|--------|-----|----------------|------------------------|-------------|-----|-----|
| `grpc_ingestion.js` | 25 | `grpc_req_duration` | **~3402/s** | **7.12ms** | **8.62ms** | **10.37ms** |
| `http_tracking_hit.js` | 40 | `http_req_duration` | **~12471/s** | **2.63ms** | **5.57ms** | **7.66ms** |
| `http_tracking_miss.js` | 40 | `http_req_duration` | **~7850/s** | **4.63ms** | **7.34ms** | **9.42ms** |

- **Label:** `http_tracking_miss.js` is the **404 lookup path** (unique ids → no Redis key, no DB row). It does **not** measure cache-miss with successful DB fallback + cache refill.
- **Checks:** all three scenarios **100%** on scripted status checks (`grpc ok`, HTTP **200** hit, HTTP **404**). The 404 scenario may still show k6’s `http_req_failed` high — see `benchmarks/k6/README.md`.
- **Detail / reproduction:** `benchmarks/k6/README.md`, `./benchmarks/k6/run-all.sh`.

### Discrepancies vs repo text

| Source | Claim | This session |
|--------|--------|--------------|
| `README.md` (before 2026-04-10 README pass) | Fabricated RPS / monolith table | **Replaced** — see **README reconciliation** below |
| `docs/PERFORMANCE.md` (after script) | Says tools "hey / wrk" | **False for generator** — `run-all.sh` uses `curl` only |
| `docs/PERFORMANCE.md` conclusion | "All microservices operational" | Depends on run; historically route was DOWN without `application.properties` fix |
| `README.md` badges | Next.js 15 / fake coverage | **Fixed** — Next **16.1** badge; coverage shield removed |
| `README.md` | Rate limit "10 req/s/IP" globally | **Partially wrong** — `nginx.conf` uses **100 r/s** on most API paths; **10 r/s** only on `/api/metrics` |

---

## Known broken / missing

- **OpenSky-dependent** live endpoints (e.g. `GET /api/live/aircraft`) can return **500** when OpenSky fails.
- **`gateway-bench/`, `frontend-bench/`, `tracking-service/cmd/bench/`:** each has `go.mod` — `PATH` must include Go.
- **Automated tests:** Slice C adds minimal Go / Node / Java tests (see Slice C verification); not full coverage.
- **Frontend ESLint:** **Phase 1** — `npm run lint` passes; see **Frontend — Phase 1** above.

---

## Discrepancies: claimed vs actual

| Claimed (README / comments / badges) | Actual (code + this run) |
|----------------------------------------|----------------------------|
| "Battle-tested A* with distributed locks" (`README` table) | **Slice B:** A* on a Haversine-weighted SF demo graph + Redis lock + Kafka; still not production traffic engineering |
| "19,200 RPS" / "13ms P99" (legacy README Performance / Demo copy) | Root **Performance** section now cites **k6** numbers only; Demo / other sections may still mention old figures |
| "Exactly-once" / enterprise messaging semantics | **Not implemented** — at-least-once Kafka consumer pattern |
| Next.js **15** badge (removed from README) | **Next 16.1** badge + `frontend/package.json` **16.1.1** |
| Performance report tool hey/wr | **`run-all.sh` uses `curl`**, not hey/wr |
| Full strict rate limit 10 req/s on API | **100 r/s** on main API locations in `gateway/nginx.conf` |

---

## README reconciliation (2026-04-10)

Edits were limited to the root **`README.md`** sections below; architecture, Quick Start structure, API, troubleshooting, deployment, contributing, and license were otherwise left as-is.

| Area | Change |
|------|--------|
| **Badges** | Removed fabricated **87% coverage** shield. **CI** badge wrapped with link to `https://github.com/preethamdandu/NexusLogistics/actions/workflows/ci.yaml`. **Next.js** for-badge updated to **16.1**. |
| **Why NexusLogistics?** | Replaced problem/solution + throughput table with honest learning-project copy and a **Stack choices** table (Go / Node+TS / Java / Next 16). |
| **vs. Traditional Solutions** | **Removed** entire fabricated monolith comparison table. |
| **Performance** | Replaced fabricated throughput table and fake `go run` benchmark output with **k6** sustained **60s** results (same numbers as `benchmarks/k6/README.md`), **404 lookup path** label for `http_tracking_miss.js`, and methodology notes (connection-per-VU, bypass Nginx, laptop Docker caveat). |
| **Quick Start** | `cd NexusLogistics` (matches GitHub clone dirname), `docker compose up -d`, expanded `docker ps` example to match Compose **container_name**s on a typical run. Prerequisites use **`docker compose version`** (v2 plugin); legacy `docker-compose` noted as optional. |
| **Demo → Key Capabilities** | **Performance** cell links to the **Performance** heading (`#-performance`) with k6 pointer; removed fake RPS/P99/zero-downtime. **Operational hardening** cell: **~100 r/s** on most `/api/*`, **10 r/s** on `/api/metrics`; no “enterprise security” / wrong 10 r/s claim. |

**Quick Start E2E (2026-04-10):** From workspace, `docker compose down -v`. Then, in `/tmp`: `git clone` + `cd NexusLogistics` + `docker compose up -d` per README — all listed containers appeared in `docker ps`; `http://localhost:3002/` and `http://localhost:80/health` returned **200**. Prerequisites run: `docker --version`, `docker compose version`. Test stack torn down with `docker compose down -v`; workspace stack brought back with `docker compose up -d`.

---

*Regenerating benchmarks overwrites `docs/PERFORMANCE.md`. Treat this file as the snapshot for 2026-04-10 unless you re-run verification.*
