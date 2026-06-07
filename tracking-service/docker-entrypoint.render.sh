#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node scripts/render-migrate.mjs
fi

exec npm start
