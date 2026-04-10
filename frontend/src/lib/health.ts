import { GATEWAY_BASE_URL } from '@/lib/api';

export interface ServiceProbe {
    id: string;
    label: string;
    ok: boolean;
    statusCode: number | null;
    /** When fetch threw (network / CORS). */
    error: string | null;
    /** Suggested debug command when the probe fails. */
    logsHint: string;
}

export interface HealthSnapshot {
    probes: ServiceProbe[];
    checkedAt: number;
}

const probe = async (
    id: string,
    label: string,
    url: string,
    logsHint: string
): Promise<ServiceProbe> => {
    try {
        const res = await fetch(url, { cache: 'no-store', method: 'GET' });
        return {
            id,
            label,
            ok: res.ok,
            statusCode: res.status,
            error: null,
            logsHint,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed';
        return {
            id,
            label,
            ok: false,
            statusCode: null,
            error: message,
            logsHint,
        };
    }
};

/**
 * Live checks through the gateway only (Phase 2 nginx: `/api/health/route`, `/api/health/ingestion`).
 * Tracking is inferred from a lightweight existing JSON route.
 */
export async function fetchServiceHealth(): Promise<HealthSnapshot> {
    const base = GATEWAY_BASE_URL.replace(/\/$/, '');

    const probes = await Promise.all([
        probe('gateway', 'Gateway (nginx)', `${base}/health`, 'docker logs gateway'),
        probe(
            'tracking',
            'Tracking API',
            `${base}/api/live/trucks`,
            'docker logs tracking-service'
        ),
        probe(
            'route',
            'Route service',
            `${base}/api/health/route`,
            'docker logs route-service'
        ),
        probe(
            'ingestion',
            'Ingestion metrics',
            `${base}/api/health/ingestion`,
            'docker logs ingestion-service'
        ),
    ]);

    return { probes, checkedAt: Date.now() };
}

export function allProbesOk(snapshot: HealthSnapshot): boolean {
    return snapshot.probes.length > 0 && snapshot.probes.every((p) => p.ok);
}
