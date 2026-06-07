import { Pool, type PoolConfig } from 'pg';

function buildPoolConfig(): PoolConfig {
    if (process.env.DATABASE_URL) {
        const config: PoolConfig = { connectionString: process.env.DATABASE_URL };
        if (process.env.POSTGRES_SSL === 'true') {
            config.ssl = { rejectUnauthorized: false };
        }
        return config;
    }

    return {
        user: process.env.POSTGRES_USER || 'nexus',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'nexus_logistics',
        password: process.env.POSTGRES_PASSWORD || 'password',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    };
}

export const pool = new Pool(buildPoolConfig());

pool.on('connect', () => {
    // console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});
