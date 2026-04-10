/**
 * k6: HTTP GET tracking — 404 lookup path (unique vehicle id every iteration).
 * Redis has no key and Postgres has no row → handler returns 404 quickly (not cache-miss-with-DB-hit).
 * Env: HTTP_BASE (default http://127.0.0.1:3000)
 */
import http from 'k6/http';
import { check } from 'k6';

const httpBase = (__ENV.HTTP_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

export const options = {
  scenarios: {
    http_404_lookup: {
      executor: 'constant-vus',
      vus: 40,
      duration: '60s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
  thresholds: {
    http_req_duration: ['p(99)<5000'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const id = `k6-miss-${__VU}-${__ITER}-${Date.now()}`;
  const res = http.get(`${httpBase}/tracking/${id}`, {
    tags: { name: 'tracking_404_lookup' },
    timeout: '30s',
    expectedStatuses: [404],
  });
  check(res, {
    '404': (r) => r.status === 404,
  });
}
