#!/bin/sh
set -eu

: "${PORT:=10000}"
: "${TRACKING_HOSTPORT:?TRACKING_HOSTPORT is required}"
: "${ROUTE_HOSTPORT:?ROUTE_HOSTPORT is required}"
: "${CORS_ALLOW_ORIGIN:?Set CORS_ALLOW_ORIGIN to your frontend origin (e.g. https://your-app.vercel.app)}"

export PORT TRACKING_HOSTPORT ROUTE_HOSTPORT CORS_ALLOW_ORIGIN

envsubst '${PORT} ${TRACKING_HOSTPORT} ${ROUTE_HOSTPORT} ${CORS_ALLOW_ORIGIN}' \
  < /etc/nginx/templates/nginx.render.conf.template \
  > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
