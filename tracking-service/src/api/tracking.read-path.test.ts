import request from 'supertest';
import { createApp, type TrackingPool, type TrackingRedis } from './createApp';

describe('GET /tracking/:vehicleId', () => {
    it('on Redis miss uses Postgres row, responds with that row, caches with EX 86400', async () => {
        const row = {
            vehicle_id: 'fix-veh',
            latitude: 10,
            longitude: 20,
            timestamp: '2024-01-01T00:00:00.000Z',
        };

        const redis: TrackingRedis = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            scan: jest.fn(),
        };

        const pool: TrackingPool = {
            query: jest.fn().mockResolvedValue({ rows: [row] }),
        };

        const app = createApp(redis, pool);
        const res = await request(app).get('/tracking/fix-veh').expect(200);

        expect(res.body).toEqual(row);
        expect(redis.set).toHaveBeenCalledWith(
            'vehicle:fix-veh:latest',
            JSON.stringify(row),
            'EX',
            86400
        );
    });
});
