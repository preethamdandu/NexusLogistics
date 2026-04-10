/**
 * k6: HTTP GET tracking cache hit (Redis hot key)
 * Primes Redis via one gRPC ping in setup(), then hammers GET /tracking/{id} on tracking-service.
 * Env: GRPC_ADDR, HTTP_BASE (default http://127.0.0.1:3000)
 */
import grpc from 'k6/net/grpc';
import http from 'k6/http';
import { check, sleep } from 'k6';

const grpcAddr = __ENV.GRPC_ADDR || '127.0.0.1:50051';
const httpBase = (__ENV.HTTP_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

const client = new grpc.Client();
client.load(['./proto'], 'tracker.proto');

export const options = {
  scenarios: {
    http_hit: {
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

export function setup() {
  client.connect(grpcAddr, { plaintext: true });
  try {
    const res = client.invoke('tracker.TrackerService/SendPing', {
      vehicle_id: 'k6-cache-hit',
      latitude: 37.7749,
      longitude: -122.4194,
      timestamp: Math.floor(Date.now() / 1000),
    });
    if (!res || res.status !== grpc.StatusOK) {
      throw new Error(`setup SendPing failed: ${JSON.stringify(res)}`);
    }
  } finally {
    client.close();
  }

  for (let i = 0; i < 60; i++) {
    const probe = http.get(`${httpBase}/tracking/k6-cache-hit`, { timeout: '10s' });
    if (probe.status === 200) {
      return { vid: 'k6-cache-hit' };
    }
    sleep(0.5);
  }
  throw new Error('setup: Redis still cold for k6-cache-hit after gRPC ping (tracking consumer lag?)');
}

export default function (data) {
  const res = http.get(`${httpBase}/tracking/${data.vid}`, {
    tags: { name: 'tracking_cache_hit' },
    timeout: '30s',
  });
  check(res, {
    '200': (r) => r.status === 200,
  });
}
