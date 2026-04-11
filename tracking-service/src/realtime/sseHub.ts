import type { Express, Response } from 'express';

const sseClients = new Set<Response>();

/**
 * Broadcast one Kafka-ingested location to all open SSE connections.
 */
export function broadcastLocationUpdate(payload: unknown): void {
    const body = JSON.stringify(payload);
    const chunk = `event: location-update\ndata: ${body}\n\n`;
    for (const res of sseClients) {
        if (res.writableEnded) {
            sseClients.delete(res);
            continue;
        }
        try {
            res.write(chunk);
        } catch {
            sseClients.delete(res);
        }
    }
}

/**
 * Registers GET /live/stream (SSE). Call from createApp only.
 */
export function registerLiveSseRoute(app: Express): void {
    app.get('/live/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const connected = JSON.stringify({ timestamp: Date.now() });
        res.write(`event: connected\ndata: ${connected}\n\n`);

        if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
            (res as Response & { flushHeaders: () => void }).flushHeaders();
        }

        sseClients.add(res);

        const pingIv = setInterval(() => {
            if (res.writableEnded) {
                clearInterval(pingIv);
                sseClients.delete(res);
                return;
            }
            try {
                res.write(':ping\n\n');
            } catch {
                clearInterval(pingIv);
                sseClients.delete(res);
            }
        }, 15_000);

        const onClose = (): void => {
            clearInterval(pingIv);
            sseClients.delete(res);
        };
        req.on('close', onClose);
        res.on('close', onClose);
    });
}
