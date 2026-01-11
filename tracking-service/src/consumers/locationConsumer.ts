import { Kafka } from 'kafkajs';
import { redis } from '../config/redis';
import { pool } from '../config/postgres';
import client from 'prom-client';

// Prometheus counter for messages consumed
const messagesConsumedCounter = new client.Counter({
    name: 'tracking_messages_consumed_total',
    help: 'Total number of messages consumed from Kafka',
});

// Register the counter
const register = client.register;
register.registerMetric(messagesConsumedCounter);

const kafka = new Kafka({
    clientId: 'tracking-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'tracking-group' });

interface LocationPing {
    vehicle_id: string;
    latitude: number;
    longitude: number;
    timestamp: number;
}

export const startConsumer = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'vehicle-locations', fromBeginning: true });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            if (!message.value) return;

            try {
                const ping: LocationPing = JSON.parse(message.value.toString());
                const { vehicle_id, latitude, longitude, timestamp } = ping;

                // Increment consumed counter
                messagesConsumedCounter.inc();

                // 1. Write-Through Cache (Redis) - O(1) Speed
                // Store the latest state as a JSON string
                await redis.set(
                    `vehicle:${vehicle_id}:latest`,
                    JSON.stringify(ping),
                    'EX', // Optional: Set expiry if vehicles go offline for long periods (e.g., 24 hours)
                    86400
                );

                // 2. Persist History (PostgreSQL) - Durability
                await pool.query(
                    'INSERT INTO vehicle_locations (vehicle_id, latitude, longitude, timestamp) VALUES ($1, $2, $3, $4)',
                    [vehicle_id, latitude, longitude, timestamp]
                );

                // console.log(`Processed ping for ${vehicle_id}`);

            } catch (error) {
                console.error('Error processing message:', error);
            }
        },
    });
};
