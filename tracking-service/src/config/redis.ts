import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');

const redisPassword = process.env.REDIS_PASSWORD;

export const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword || undefined,
    maxRetriesPerRequest: null,
});

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis Client Error', err));
