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

// API Endpoint: Get All Active Vehicles
app.get('/vehicles', async (req, res) => {
    try {
        // Scan Redis for all vehicle keys
        const keys = await redis.keys('vehicle:*:latest');

        if (keys.length === 0) {
            res.json([]);
            return;
        }

        // Fetch all vehicle data
        const vehicles = await Promise.all(
            keys.map(async (key: string) => {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            })
        );

        // Filter out nulls and return
        res.json(vehicles.filter(v => v !== null));
    } catch (error) {
        console.error('Error fetching all vehicles:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'UP' });
});

// ============ LIVE DATA APIS ============

// OpenSky Network API - Real Aircraft Data
app.get('/live/aircraft', async (req, res) => {
    try {
        // SF Bay Area bounding box
        const bbox = 'lamin=37.3&lomin=-122.6&lamax=37.95&lomax=-121.8';
        const response = await fetch(`https://opensky-network.org/api/states/all?${bbox}`);

        if (!response.ok) {
            throw new Error(`OpenSky API error: ${response.status}`);
        }

        const data = await response.json() as { time: number; states: any[][] };

        if (!data.states) {
            res.json([]);
            return;
        }

        // Transform OpenSky response to our format
        // OpenSky state vector: [icao24, callsign, origin_country, time_position, last_contact, 
        //                        longitude, latitude, baro_altitude, on_ground, velocity, ...]
        const aircraft = data.states
            .filter((state: any[]) => state[5] && state[6]) // Must have lon/lat
            .slice(0, 30) // Limit to 30 aircraft
            .map((state: any[]) => ({
                vehicle_id: `aircraft-${state[1]?.trim() || state[0]}`,
                latitude: state[6],
                longitude: state[5],
                type: 'aircraft',
                callsign: state[1]?.trim() || 'N/A',
                altitude: state[7] || 0,
                velocity: state[9] || 0,
                on_ground: state[8],
                timestamp: state[4] || Date.now() / 1000
            }));

        res.json(aircraft);
    } catch (error) {
        console.error('Error fetching aircraft data:', error);
        res.status(500).json({ error: 'Failed to fetch aircraft data' });
    }
});

// Simulated Real Bus Routes (based on actual MUNI/AC Transit routes)
app.get('/live/buses', async (req, res) => {
    try {
        // Real bus routes with actual street coordinates
        const busRoutes = [
            { id: 'muni-14-001', route: '14-Mission', lat: 37.7599, lng: -122.4194 },
            { id: 'muni-14-002', route: '14-Mission', lat: 37.7521, lng: -122.4182 },
            { id: 'muni-38-001', route: '38-Geary', lat: 37.7854, lng: -122.4195 },
            { id: 'muni-38-002', route: '38-Geary', lat: 37.7814, lng: -122.4589 },
            { id: 'muni-49-001', route: '49-Van Ness', lat: 37.7749, lng: -122.4194 },
            { id: 'act-51a-001', route: '51A-Broadway', lat: 37.8044, lng: -122.2712 },
            { id: 'act-51a-002', route: '51A-Broadway', lat: 37.8256, lng: -122.2621 },
            { id: 'act-72-001', route: '72-MLK', lat: 37.8716, lng: -122.2727 },
            { id: 'bart-bus-001', route: 'BART-Shuttle', lat: 37.8044, lng: -122.2711 },
            { id: 'samtrans-001', route: 'SamTrans-292', lat: 37.5548, lng: -122.2717 },
        ];

        // Add slight random movement to simulate real-time updates
        const buses = busRoutes.map(bus => ({
            vehicle_id: bus.id,
            latitude: bus.lat + (Math.random() - 0.5) * 0.002,
            longitude: bus.lng + (Math.random() - 0.5) * 0.002,
            type: 'bus',
            route: bus.route,
            timestamp: Date.now() / 1000
        }));

        res.json(buses);
    } catch (error) {
        console.error('Error generating bus data:', error);
        res.status(500).json({ error: 'Failed to fetch bus data' });
    }
});

// Combined endpoint - All live vehicles (trucks + aircraft + buses)
app.get('/live/all', async (req, res) => {
    try {
        // 1. Get trucks from Redis
        const keys = await redis.keys('vehicle:*:latest');
        const trucks = await Promise.all(
            keys.map(async (key: string) => {
                const data = await redis.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    return { ...parsed, type: 'truck' };
                }
                return null;
            })
        );

        // 2. Fetch real aircraft from OpenSky
        let aircraft: any[] = [];
        try {
            const bbox = 'lamin=37.3&lomin=-122.6&lamax=37.95&lomax=-121.8';
            const response = await fetch(`https://opensky-network.org/api/states/all?${bbox}`);
            if (response.ok) {
                const data = await response.json() as { time: number; states: any[][] };
                if (data.states) {
                    aircraft = data.states
                        .filter((state: any[]) => state[5] && state[6])
                        .slice(0, 20)
                        .map((state: any[]) => ({
                            vehicle_id: `aircraft-${state[1]?.trim() || state[0]}`,
                            latitude: state[6],
                            longitude: state[5],
                            type: 'aircraft',
                            callsign: state[1]?.trim() || 'N/A',
                            altitude: state[7] || 0,
                            timestamp: state[4] || Date.now() / 1000
                        }));
                }
            }
        } catch (e) {
            console.warn('Aircraft fetch failed, continuing without:', e);
        }

        // 3. Get simulated buses
        const busRoutes = [
            { id: 'muni-14-001', route: '14-Mission', lat: 37.7599, lng: -122.4194 },
            { id: 'muni-38-001', route: '38-Geary', lat: 37.7854, lng: -122.4195 },
            { id: 'act-51a-001', route: '51A-Broadway', lat: 37.8044, lng: -122.2712 },
            { id: 'act-72-001', route: '72-MLK', lat: 37.8716, lng: -122.2727 },
        ];
        const buses = busRoutes.map(bus => ({
            vehicle_id: bus.id,
            latitude: bus.lat + (Math.random() - 0.5) * 0.001,
            longitude: bus.lng + (Math.random() - 0.5) * 0.001,
            type: 'bus',
            route: bus.route,
            timestamp: Date.now() / 1000
        }));

        // Combine all
        const allVehicles = [
            ...trucks.filter(t => t !== null),
            ...aircraft,
            ...buses
        ];

        res.json(allVehicles);
    } catch (error) {
        console.error('Error fetching all live vehicles:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
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
