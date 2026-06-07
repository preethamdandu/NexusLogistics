# Deploy NexusLogistics backend on Render (secure)

Render runs the **API gateway** (HTTPS) and private microservices. Pair with **Vercel** for the Next.js dashboard.

## Security model

| Layer | What you get |
|-------|----------------|
| **TLS** | Render terminates HTTPS on `*.onrender.com` automatically |
| **Network** | Kafka, ingestion, tracking, route are **private services** (not on the public internet) |
| **Postgres / Redis** | **`ipAllowList: []`** — only Render services in your account can connect |
| **Secrets** | `DATABASE_URL`, `REDIS_PASSWORD`, broker addresses injected by Render (not in git) |
| **CORS** | Gateway allows **one origin** via `CORS_ALLOW_ORIGIN` (your Vercel URL) — not `*` |
| **Rate limits** | Nginx `limit_req` on API routes; `/api/metrics` returns **403** on the public gateway |
| **Headers** | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, etc. |
| **AI** | `/api/ai/*` disabled on Render (no Ollama) |

## Before you deploy

1. **Push** this repo to GitHub (Render reads `render.yaml` from `main`).
2. Know your **Vercel production URL**, e.g. `https://nexus-logistics.vercel.app` (no trailing slash).

## Step 1 — Blueprint deploy

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
2. Connect **`preethamdandu/NexusLogistics`**.
3. Render creates Postgres, Redis, Redpanda, ingestion, tracking, route, gateway, simulator.
4. Wait until all services show **Live** (~15–20 min first time).

## Step 2 — Set CORS (required)

The gateway **will not start** until `CORS_ALLOW_ORIGIN` is set.

1. Render → **nexus-gateway** → **Environment**.
2. Add:

   | Key | Value |
   |-----|--------|
   | `CORS_ALLOW_ORIGIN` | `https://YOUR-APP.vercel.app` |

3. **Save** → gateway redeploys.

Use your real Vercel URL. For preview deployments, add a second Render env value is not supported in one variable — use production URL for the public demo, or temporarily change `CORS_ALLOW_ORIGIN` when testing previews.

## Step 3 — Wire Vercel

Vercel project → **Settings** → **Environment Variables**:

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_API_URL` | `https://nexus-gateway-xxxx.onrender.com` |

Redeploy Vercel. Use **https** only (mixed content is blocked by browsers).

## Step 4 — Verify

```bash
GATEWAY=https://nexus-gateway-xxxx.onrender.com

curl -s "$GATEWAY/health"
curl -s "$GATEWAY/api/vehicles" | head
curl -N "$GATEWAY/api/live/stream"
curl -s -o /dev/null -w "%{http_code}\n" "$GATEWAY/api/metrics"   # expect 403
```

From the browser on your Vercel site, the map should load vehicles once **nexus-simulator** is running.

## Hardening checklist (recommended)

- [ ] `CORS_ALLOW_ORIGIN` set to Vercel production URL only
- [ ] Do **not** add Postgres/Redis external connection strings to public repos
- [ ] Rotate Render Postgres password from dashboard if credentials were ever shared
- [ ] Keep **Starter** (or higher) on gateway/tracking if you need faster cold starts
- [ ] Optional: add a **custom domain** on Render gateway and update `NEXT_PUBLIC_API_URL`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Gateway crash loop | Set `CORS_ALLOW_ORIGIN` on **nexus-gateway** |
| Browser CORS error | `CORS_ALLOW_ORIGIN` must **exactly** match the page origin (scheme + host) |
| Gateway **502** | Check **nexus-tracking** / **nexus-kafka** logs |
| Empty map | Check **nexus-simulator** and **nexus-ingestion** logs |
| **403** on `/api/metrics` | Expected — metrics are not public on Render |

## Local dev unchanged

`docker compose up -d` still runs the full stack (including AI). Render files are additive.
