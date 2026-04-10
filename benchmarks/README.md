# Benchmarks

## HTTP / gateway smoke (`run-all.sh`)

Sequential `curl` loops (50 requests per endpoint) with `bc` for averages. Regenerates `docs/PERFORMANCE.md`.

```bash
bash benchmarks/run-all.sh
```

Requires: `curl`, `bc`, `jq`, stack up at `http://localhost/`.

## k6 (gRPC + HTTP tracking)

See **[`benchmarks/k6/README.md`](k6/README.md)** — sustained 60s load, P50/P95/P99, Dockerized `grafana/k6`.

## gRPC ingestion load (real)

Use the Go tool in the ingestion service module:

```bash
cd ingestion-service && go run ./cmd/bench -addr localhost:50051 -c 30 -d 10s
```

## Other

- `tracking-load.sh` — expects [`hey`](https://github.com/rakyll/hey) installed (`brew install hey`).

There is **no** standalone fake gRPC script in this folder; historical `ingestion-load.go` was removed as non-functional.
