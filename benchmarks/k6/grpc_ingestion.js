/**
 * k6: sustained gRPC load to ingestion TrackerService.SendPing
 * One plaintext connection per VU for the scenario (avoids connect storms).
 * Env: GRPC_ADDR (default 127.0.0.1:50051)
 */
import grpc from 'k6/net/grpc';
import { check } from 'k6';

const grpcAddr = __ENV.GRPC_ADDR || '127.0.0.1:50051';

export const options = {
  scenarios: {
    grpc_load: {
      executor: 'constant-vus',
      vus: 25,
      duration: '60s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
  thresholds: {
    grpc_req_duration: ['p(99)<5000'],
    checks: ['rate>0.99'],
  },
};

const client = new grpc.Client();
client.load(['./proto'], 'tracker.proto');

export default function () {
  if (__ITER === 0) {
    client.connect(grpcAddr, { plaintext: true });
  }

  const ts = Math.floor(Date.now() / 1000);
  const res = client.invoke('tracker.TrackerService/SendPing', {
    vehicle_id: `k6-grpc-${__VU}-${__ITER}-${ts}`,
    latitude: 37.7749 + (__VU % 10) * 0.001,
    longitude: -122.4194,
    timestamp: ts,
  });

  check(res, {
    'grpc ok': (r) => r && r.status === grpc.StatusOK,
  });
}
