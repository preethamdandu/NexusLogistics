#!/bin/sh
set -eu
: "${GRPC_ADDR:?GRPC_ADDR must point at nexus-ingestion host:port}"
exec /simulator -addr "${GRPC_ADDR}"
