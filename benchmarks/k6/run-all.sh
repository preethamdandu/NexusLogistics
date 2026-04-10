#!/usr/bin/env bash
# Run all k6 scenarios via Docker (no local k6 install required).
# Prereq: docker compose up -d; ingestion :50051, tracking :3000 published to host.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p results

K6_IMG=${K6_IMAGE:-grafana/k6:0.56.0}
DOCKER_RUN=(docker run --rm -i -v "$SCRIPT_DIR:/scripts" -w /scripts --add-host=host.docker.internal:host-gateway)

echo "=== gRPC ingestion (25 VUs, 60s) ==="
"${DOCKER_RUN[@]}" "$K6_IMG" run \
  --summary-export /scripts/results/grpc_summary.json \
  -e GRPC_ADDR=host.docker.internal:50051 \
  grpc_ingestion.js

echo "=== HTTP tracking cache hit (40 VUs, 60s) ==="
"${DOCKER_RUN[@]}" "$K6_IMG" run \
  --summary-export /scripts/results/http_hit_summary.json \
  -e GRPC_ADDR=host.docker.internal:50051 \
  -e HTTP_BASE=http://host.docker.internal:3000 \
  http_tracking_hit.js

echo "=== HTTP tracking 404 lookup path (40 VUs, 60s) ==="
"${DOCKER_RUN[@]}" "$K6_IMG" run \
  --summary-export /scripts/results/http_miss_summary.json \
  -e HTTP_BASE=http://host.docker.internal:3000 \
  http_tracking_miss.js

echo "Done. JSON summaries under benchmarks/k6/results/"
