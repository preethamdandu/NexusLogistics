# Getting Started — NexusLogistics

End-to-end setup from a fresh machine to the live dashboard (moving vehicles + optional AI command bar). Commands use `http://localhost` and paths from this repo’s `docker-compose.yml`, `gateway/nginx.conf`, and `ingestion-service/cmd/simulator/main.go`.

---

## Section 1: What you'll have running

When everything below is done, you will open a **dark “command center” dashboard** in your browser at **http://localhost:3002**. You’ll see a **map** (CARTO dark tiles) with **glowing markers** for **trucks**, **buses**, and (when data is present) **aircraft**; markers **move** as new positions arrive. A **live feed** panel shows recent updates, and a **services** panel polls health endpoints. With **Ollama** running and the **`gemma4:e2b`** model pulled, the **AI command bar** accepts natural-language queries (filter, zoom, highlight, stats). Behind the scenes, **Docker Compose** runs **Kafka**, **Redis**, **Postgres**, **ingestion** (Go gRPC), **tracking** (Node), **route** (Java), **Nginx** (gateway on port **80**), **frontend** (Next.js), **Prometheus**, **Grafana**, and **Kafka UI**.

---

## Section 2: Prerequisites

### Docker Desktop (macOS) or Docker Engine + Compose (Linux)

**What it’s for:** Runs all backend services, databases, and the dashboard container with one command.

**Check:** `docker --version` and `docker compose version` — you should see a client version (e.g. 24.x) and Compose v2 (e.g. `Docker Compose version v2.x`).

**macOS:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/). Start the app; ensure it’s allowed to use enough resources (**Settings → Resources**): **at least 8 GB RAM** recommended (Kafka + Java + Node + Postgres together are heavy).

**Linux:** Install Docker Engine and the Compose plugin (example on Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in so `docker` works without `sudo`. Same **8 GB RAM** guidance applies.

### Git

**What it’s for:** Cloning this repository.

**Check:** `git --version` → prints `git version 2.x`.

**macOS:** `xcode-select --install` (includes Git) or `brew install git`.

**Linux:** `sudo apt-get install -y git`

### Go (for the vehicle simulator only)

**What it’s for:** The simulator is a small Go program that sends gRPC pings to ingestion on your machine (`go run ./cmd/simulator`).

**Check:** `go version` → should show **1.21 or newer** (repo `ingestion-service/go.mod` uses **Go 1.23**; install a current stable Go from [go.dev/dl](https://go.dev/dl/) if needed).

**macOS:** `brew install go`

**Linux (Ubuntu):** `sudo apt-get install -y golang-go` (if too old, use the tarball from go.dev/dl).

### Ollama (optional, for the AI command bar)

**What it’s for:** A local LLM server on your computer; the dashboard calls it through the gateway at **`/api/ai/*`** (see `gateway/nginx.conf` → `upstream ollama` → `host.docker.internal:11434`). The app expects the model **`gemma4:e2b`** (`frontend/src/lib/fleetAiTypes.ts`).

**Check:** `ollama --version`

**macOS:** `brew install ollama` or follow [ollama.com](https://ollama.com/download).

**Linux:** `curl -fsSL https://ollama.com/install.sh | sh`

---

## Section 3: Clone and start the backend

```bash
git clone https://github.com/preethamdandu/NexusLogistics.git
cd NexusLogistics
docker compose up -d
```

The first run **downloads images** and **builds** `ingestion-service`, `tracking-service`, `route-service`, and `frontend`; expect **several minutes**.

**Verify containers:**

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

You want every Nexus-related container **Up** (not `Restarting`). Names from `docker-compose.yml` include: `frontend`, `gateway`, `tracking-service`, `ingestion-service`, `route-service`, `kafka`, `zookeeper`, `redis`, `nexus_postgres`, `prometheus`, `grafana`, `kafka-ui`.

**Verify HTTP endpoints:**

```bash
curl -s http://localhost/health
curl -s http://localhost:3000/health
curl -s http://localhost:8081/actuator/health
```

- Gateway: first command should return JSON with `"status": "healthy"`.
- Tracking: second should be a small JSON health payload (**200**).
- Route: third should include **`"status":"UP"`** when Redis/Kafka env is set (Compose sets `REDIS_HOST` and `KAFKA_BROKERS` for `route-service`).

**If something is unhealthy:** wait **30–60 seconds** after `up -d` (**Kafka** and **Zookeeper** start slowly). Check Docker RAM. Inspect logs: `docker logs kafka`, `docker logs tracking-service`, `docker logs route-service`. If you changed `gateway/nginx.conf`, reload Nginx: `docker exec gateway nginx -s reload`.

---

## Section 4: Start the vehicle simulator

The **simulator** (`ingestion-service/cmd/simulator`) repeatedly calls **`SendPing`** over **gRPC** to **localhost:50051** (the ingestion port published by Compose). Each tick advances demo vehicles along loop routes and sends pings into **Kafka**; **tracking-service** consumes them and updates **Redis** / **Postgres**, which powers the **REST API** and **SSE** stream the dashboard uses.

**Run it (foreground — leave this terminal open):**

From the repository root (the `NexusLogistics` folder created by `git clone`):

```bash
cd ingestion-service
go run ./cmd/simulator
```

Defaults (from `main.go`): **`-addr localhost:50051`**, **`-tick 1500ms`**, **`-speed 60`** (km/h for trucks/buses), **`-aircraft-speed 800`** for aircraft routes. Example override: `go run ./cmd/simulator -tick 2s`.

You should see lines like: `ping vehicle_id=sim-truck-01 lat=... lng=... timestamp=... type=truck`.

**Verify data reached tracking (through the gateway):**

```bash
curl -s http://localhost/api/tracking/sim-truck-01
```

You should get JSON with **`latitude`**, **`longitude`**, and **`vehicle_id`** (may take a second or two after the first pings).

---

## Section 5: Open the dashboard

Open **http://localhost:3002** in your browser (Compose maps host **3002** → frontend container **3000**; `NEXT_PUBLIC_API_URL=http://localhost:80` points the UI at the gateway).

**Working state:** Dark UI, **map** with colored markers, **Fleet** count increasing, **Live** / reconnecting badge, **live feed** rows appearing as SSE events arrive, **Services** panel with green probes when backends respond. Markers should **animate** between positions as updates stream in.

**If vehicles don’t move:** confirm the simulator terminal is still printing pings; confirm `curl -s http://localhost/api/tracking/sim-truck-01` returns coordinates. Test the live stream:

```bash
curl -N http://localhost/api/live/stream
```

You should see `event: connected`, then **`event: location-update`** lines once the simulator has been running for a few seconds.

**Visual check:** You’re looking for a full-width layout with **stat cards** above the map, a **command bar** under them (may say AI unavailable until Section 6), a **tactical** dark map, and a **sidebar** with service health and feed — similar to the screenshot in `README.md` under **Demo**.

---

## Section 6: Enable the AI command bar (optional)

1. **Start Ollama** (if not already running):

```bash
ollama serve
```

Run it in a separate terminal, or in the background on Unix: `ollama serve &`. If you see **address already in use**, Ollama is already running.

2. **Pull the model** (large download, on the order of **~7 GB**):

```bash
ollama pull gemma4:e2b
```

3. **Gateway → Ollama:** Nginx proxies **`/api/ai/`** to **`host.docker.internal:11434`** (Docker Desktop). **Reload** after any `nginx.conf` change:

```bash
docker exec gateway nginx -s reload
```

4. **Verify from the host:**

```bash
curl -s http://localhost/api/ai/tags | grep gemma
```

You should see **`gemma4:e2b`** in the JSON. The dashboard calls the **gateway on port 80** (`NEXT_PUBLIC_API_URL` in `docker-compose.yml`), not port 3002. In the browser devtools console (while on **http://localhost:3002**), use the full gateway URL:

```javascript
fetch('http://localhost/api/ai/tags')
  .then((r) => r.json())
  .then(console.log)
  .catch(console.error)
```

If the bar still says **AI unavailable**, reload Nginx as above, then **hard refresh** the dashboard (Ctrl+Shift+R / Cmd+Shift+R).

**Try queries:** “show me all trucks”, “zoom to Seattle”, “how many buses are active”, “find stopped vehicles”, “show everything” (phrases like *show everything* / *show all* / *reset* / *clear* are also handled **without** calling Ollama — see `frontend/src/lib/useFleetAi.ts`).

**Linux note:** If the gateway cannot reach Ollama, add **`extra_hosts: ["host.docker.internal:host-gateway"]`** under the **`gateway`** service in `docker-compose.yml`, then `docker compose up -d gateway`. See **`STATUS.md`** / **`CLAUDE.md`** for context.

---

## Section 7: Access observability tools

| Tool | URL | Credentials |
|------|-----|----------------|
| Dashboard | http://localhost:3002 | None |
| Grafana | http://localhost:3001 | **admin** / **admin** (`GF_SECURITY_ADMIN_PASSWORD` in `docker-compose.yml`) |
| Prometheus | http://localhost:9090 | None |
| Kafka UI | http://localhost:8080 | None (no login in default Compose) |

---

## Section 8: Run the benchmarks

Load tests use **k6** inside Docker (no host install required). See **`benchmarks/k6/README.md`** for scenario details and how to read k6 output.

From the repository root:

```bash
cd benchmarks/k6
bash run-all.sh
```

**What the three scenarios measure (high level):** **gRPC** — sustained unary pings to **ingestion** `SendPing`; **cache hit** — HTTP GETs against **tracking** on a warmed Redis key; **404 path** — HTTP GETs for keys that do not exist (exercises the miss path). For recorded numbers and caveats, read **`benchmarks/k6/README.md`** and the **Performance** section in **`README.md`**.

---

## Section 9: Run the tests

Run these from the **repository root** (`NexusLogistics`). After each `cd` into a service folder, `cd ..` returns to the root.

```bash
cd ingestion-service
go test ./...
cd ..
cd tracking-service
npm test
cd ..
cd route-service
mvn test -B
cd ..
cd frontend
npm run lint && npm run build
```

Maven needs a **JDK between 17 and 21** (inclusive). If `mvn -version` shows **Java 25**, set **`JAVA_HOME`** to a Temurin **17** or **21** install (`STATUS.md` / `CLAUDE.md`).

---

## Section 10: Stop everything

- **Simulator:** In the terminal where `go run ./cmd/simulator` is running, press **Ctrl+C**.
- **Stack (keep data):** from the repo root: `docker compose down`
- **Stack + wipe volumes (Postgres data, etc.):** `docker compose down -v`
- **Ollama:** stop the `ollama serve` process (**Ctrl+C**) or `pkill ollama` if you started it in the background.

---

## Section 11: Troubleshooting

| Symptom | What to try |
|---------|-------------|
| **Port already in use** (e.g. **3002** or **80**) | `docker compose down` then `docker compose up -d`, or find the process: `lsof -i :3002` / `lsof -i :80` and stop it. |
| **Kafka / connection errors** right after `up` | Wait **30–60 seconds**; Kafka is slow on first boot. |
| **Frontend shows old UI** | `docker compose build frontend && docker compose up -d frontend`, then hard refresh the browser. |
| **AI unavailable** | `curl -s http://localhost/api/ai/tags`; if **502** or timeout, ensure Ollama is listening on **11434**, then `docker exec gateway nginx -s reload`. |
| **Duplicate CORS** on `/api/ai/*` | Fixed in repo: **`/api/ai/`** must not duplicate Ollama’s `Access-Control-Allow-Origin`; pull latest and **`nginx -s reload`**. |
| **Java / Maven tests fail** | Set **`JAVA_HOME`** to JDK **17** or **21**, not **25**. |
| **No vehicles on map** | Start the **simulator** (Section 4); without pings, the map stays empty after seed data is shown. |
| **`host.docker.internal` on Linux** | Add **`extra_hosts`** to **`gateway`** in `docker-compose.yml` (Section 6). |
| **Route actuator DOWN** | Usually missing env inside the container; Compose already sets **Redis** and **Kafka** hosts — rebuild/restart `route-service` after `application.properties` changes. |

For more operational detail, read **`STATUS.md`**, **`CLAUDE.md`**, and the **Quick Start** / **Troubleshooting** sections in **`README.md`**.
