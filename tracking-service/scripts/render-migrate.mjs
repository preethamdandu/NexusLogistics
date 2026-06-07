#!/usr/bin/env node
/**
 * One-shot schema bootstrap for Render Postgres (idempotent).
 * Runs before the tracking service starts when RUN_MIGRATIONS=true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

const files = [
    'init.sql',
    'post-init-002-vehicle-locations-unique.sql',
];

function poolConfig() {
    if (process.env.DATABASE_URL) {
        const config = { connectionString: process.env.DATABASE_URL };
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

const pool = new pg.Pool(poolConfig());

try {
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`[migrate] applying ${file}`);
        await pool.query(sql);
    }
    console.log('[migrate] done');
} catch (err) {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
} finally {
    await pool.end();
}
