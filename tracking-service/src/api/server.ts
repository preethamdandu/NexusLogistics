import express from 'express';
import { startConsumer } from '../consumers/locationConsumer';
import { redis } from '../config/redis';
import { pool } from '../config/postgres';
import client from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;

// Prometheus Registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom Metrics
const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
register.registerMetric(httpRequestDurationMicroseconds);

// Middleware to measure duration
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        httpRequestDurationMicroseconds
            .labels(req.method, req.route ? req.route.path : req.path, res.statusCode.toString())
            .observe(duration / 1000);
    });
    next();
});

app.use(express.json());

// Metrics Endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// API Endpoint: Get Latest Location
app.get('/tracking/:vehicleId', async (req, res) => {
    const { vehicleId } = req.params;

    try {
        // 1. Try Redis (Cache Hit)
        const cachedData = await redis.get(`vehicle:${vehicleId}:latest`);

        if (cachedData) {
            res.json(JSON.parse(cachedData));
            return;
        }

        // 2. Fallback to DB (Cache Miss)
        // Get the most recent location from history
        const result = await pool.query(
            'SELECT vehicle_id, latitude, longitude, timestamp FROM vehicle_locations WHERE vehicle_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [vehicleId]
        );

        if (result.rows.length > 0) {
            const location = result.rows[0];
            // Populate Cache for next time
            await redis.set(`vehicle:${vehicleId}:latest`, JSON.stringify(location), 'EX', 86400);
            res.json(location);
        } else {
            res.status(404).json({ error: 'Vehicle not found' });
        }

    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'UP' });
});

// Start Server and Kafka Consumer
const startServer = async () => {
    try {
        await startConsumer();
        console.log('Kafka Consumer started');

        app.listen(port, () => {
            console.log(`Tracking Service listening on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start service:', error);
    }
}

startServer();
