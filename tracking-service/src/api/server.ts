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
        // Continental US bounding box
        const bbox = 'lamin=24.5&lomin=-125.0&lamax=49.5&lomax=-66.5';
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
            .filter((state: any[]) => state[5] && state[6] && !state[8]) // Must have lon/lat and be airborne
            .slice(0, 100) // Limit to 100 aircraft across US
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

// Simulated Delivery Trucks across major US cities
app.get('/live/trucks', async (req, res) => {
    try {
        // Major distribution hubs across the US
        const truckHubs = [
            // West Coast
            { id: 'truck-la-01', city: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
            { id: 'truck-la-02', city: 'Los Angeles', lat: 33.9425, lng: -118.4081 },
            { id: 'truck-sf-01', city: 'San Francisco', lat: 37.7749, lng: -122.4194 },
            { id: 'truck-sea-01', city: 'Seattle', lat: 47.6062, lng: -122.3321 },
            { id: 'truck-phx-01', city: 'Phoenix', lat: 33.4484, lng: -112.0740 },
            // Mountain
            { id: 'truck-den-01', city: 'Denver', lat: 39.7392, lng: -104.9903 },
            { id: 'truck-slc-01', city: 'Salt Lake City', lat: 40.7608, lng: -111.8910 },
            // Central
            { id: 'truck-dal-01', city: 'Dallas', lat: 32.7767, lng: -96.7970 },
            { id: 'truck-hou-01', city: 'Houston', lat: 29.7604, lng: -95.3698 },
            { id: 'truck-chi-01', city: 'Chicago', lat: 41.8781, lng: -87.6298 },
            { id: 'truck-chi-02', city: 'Chicago', lat: 41.8527, lng: -87.6180 },
            { id: 'truck-kc-01', city: 'Kansas City', lat: 39.0997, lng: -94.5786 },
            { id: 'truck-mem-01', city: 'Memphis', lat: 35.1495, lng: -90.0490 },
            // East Coast
            { id: 'truck-nyc-01', city: 'New York', lat: 40.7128, lng: -74.0060 },
            { id: 'truck-nyc-02', city: 'New York', lat: 40.7589, lng: -73.9851 },
            { id: 'truck-bos-01', city: 'Boston', lat: 42.3601, lng: -71.0589 },
            { id: 'truck-phi-01', city: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
            { id: 'truck-atl-01', city: 'Atlanta', lat: 33.7490, lng: -84.3880 },
            { id: 'truck-atl-02', city: 'Atlanta', lat: 33.6407, lng: -84.4277 },
            { id: 'truck-mia-01', city: 'Miami', lat: 25.7617, lng: -80.1918 },
            { id: 'truck-dc-01', city: 'Washington DC', lat: 38.9072, lng: -77.0369 },
        ];

        // Add slight random movement to simulate real-time updates
        const trucks = truckHubs.map(hub => ({
            vehicle_id: hub.id,
            latitude: hub.lat + (Math.random() - 0.5) * 0.002,
            longitude: hub.lng + (Math.random() - 0.5) * 0.002,
            type: 'truck',
            city: hub.city,
            timestamp: Date.now() / 1000
        }));

        res.json(trucks);
    } catch (error) {
        console.error('Error generating truck data:', error);
        res.status(500).json({ error: 'Failed to fetch truck data' });
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
        console.error('Error generating truck data:', error);
        res.status(500).json({ error: 'Failed to fetch truck data' });
    }
});

// Keep buses endpoint for backward compatibility
app.get('/live/buses', async (req, res) => {
    res.json([]);
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

        let aircraft: any[] = [];
        try {
            const bbox = 'lamin=24.5&lomin=-125.0&lamax=49.5&lomax=-66.5';
            const response = await fetch(`https://opensky-network.org/api/states/all?${bbox}`);
            if (response.ok) {
                const data = await response.json() as { time: number; states: any[][] };
                if (data.states) {
                    aircraft = data.states
                        .filter((state: any[]) => state[5] && state[6] && !state[8]) // airborne only
                        .slice(0, 50) // Limit for performance
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
            console.warn('Aircraft fetch failed, continuing with simulated:', e);
        }

        // Fallback: If no real aircraft data, use simulated flights across US
        if (aircraft.length === 0) {
            const simulatedFlights = [
                { callsign: 'UAL123', lat: 40.7128, lng: -74.006 },  // NYC
                { callsign: 'AAL456', lat: 33.9425, lng: -118.408 }, // LAX
                { callsign: 'DAL789', lat: 41.8781, lng: -87.6298 }, // ORD
                { callsign: 'SWA101', lat: 32.8998, lng: -97.0403 }, // DFW
                { callsign: 'JBU202', lat: 42.3656, lng: -71.0096 }, // BOS
                { callsign: 'FFT303', lat: 33.6407, lng: -84.4277 }, // ATL
                { callsign: 'UAL404', lat: 37.6213, lng: -122.379 }, // SFO
                { callsign: 'AAL505', lat: 47.4502, lng: -122.309 }, // SEA
                { callsign: 'DAL606', lat: 39.8561, lng: -104.674 }, // DEN
                { callsign: 'SWA707', lat: 25.7959, lng: -80.287 },  // MIA
                { callsign: 'ASA808', lat: 33.4373, lng: -112.008 }, // PHX
                { callsign: 'UAL909', lat: 38.8512, lng: -77.0402 }, // DCA
                { callsign: 'FDX001', lat: 35.0421, lng: -89.9792 }, // MEM (FedEx)
                { callsign: 'UPS002', lat: 38.1740, lng: -85.7364 }, // SDF (UPS)
            ];
            aircraft = simulatedFlights.map((f, i) => ({
                vehicle_id: `aircraft-${f.callsign}`,
                latitude: f.lat + (Math.random() - 0.5) * 0.1,
                longitude: f.lng + (Math.random() - 0.5) * 0.1,
                type: 'aircraft',
                callsign: f.callsign,
                altitude: 30000 + Math.random() * 10000,
                timestamp: Date.now() / 1000
            }));
        }

        // 3. Get simulated trucks from major US cities
        const truckHubs = [
            { id: 'truck-la', city: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
            { id: 'truck-sf', city: 'San Francisco', lat: 37.7749, lng: -122.4194 },
            { id: 'truck-sea', city: 'Seattle', lat: 47.6062, lng: -122.3321 },
            { id: 'truck-den', city: 'Denver', lat: 39.7392, lng: -104.9903 },
            { id: 'truck-dal', city: 'Dallas', lat: 32.7767, lng: -96.7970 },
            { id: 'truck-chi', city: 'Chicago', lat: 41.8781, lng: -87.6298 },
            { id: 'truck-nyc', city: 'New York', lat: 40.7128, lng: -74.0060 },
            { id: 'truck-atl', city: 'Atlanta', lat: 33.7490, lng: -84.3880 },
            { id: 'truck-mia', city: 'Miami', lat: 25.7617, lng: -80.1918 },
            { id: 'truck-bos', city: 'Boston', lat: 42.3601, lng: -71.0589 },
        ];
        const simulatedTrucks = truckHubs.map(hub => ({
            vehicle_id: hub.id,
            latitude: hub.lat + (Math.random() - 0.5) * 0.02,
            longitude: hub.lng + (Math.random() - 0.5) * 0.02,
            type: 'truck',
            city: hub.city,
            timestamp: Date.now() / 1000
        }));

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
            ...simulatedTrucks
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
