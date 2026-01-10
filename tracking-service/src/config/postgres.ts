import { Pool } from 'pg';

export const pool = new Pool({
    user: process.env.POSTGRES_USER || 'nexus',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: process.env.POSTGRES_DB || 'nexus_logistics',
    password: process.env.POSTGRES_PASSWORD || 'password',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

pool.on('connect', () => {
    // console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});
