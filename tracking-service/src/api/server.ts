import { startConsumer } from '../consumers/locationConsumer';
import { redis } from '../config/redis';
import { pool } from '../config/postgres';
import client from 'prom-client';
import { createApp } from './createApp';

const port = process.env.PORT || 3000;

async function startServer(): Promise<void> {
    const register = new client.Registry();
    client.collectDefaultMetrics({ register });

    const httpRequestDurationMicroseconds = new client.Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'code'],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
    register.registerMetric(httpRequestDurationMicroseconds);

    const app = createApp(redis, pool, {
        register,
        httpDuration: httpRequestDurationMicroseconds,
    });

    try {
        await startConsumer(register);
        console.log('Kafka Consumer started');

        app.listen(port, () => {
            console.log(`Tracking Service listening on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start service:', error);
    }
}

void startServer();
