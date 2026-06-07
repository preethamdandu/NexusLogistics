#!/bin/bash
set -euo pipefail

PORT="${PORT:-9092}"
SERVICE_NAME="${RENDER_SERVICE_NAME:-nexus-kafka}"

exec rpk redpanda start \
  --smp 1 \
  --memory 512M \
  --reserve-memory 0M \
  --overprovisioned \
  --node-id 0 \
  --check=false \
  --kafka-addr "PLAINTEXT://0.0.0.0:${PORT}" \
  --advertise-kafka-addr "PLAINTEXT://${SERVICE_NAME}:${PORT}"
