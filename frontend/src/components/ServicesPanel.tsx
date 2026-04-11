'use client';

import type { ReactElement } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Activity, AlertTriangle } from 'lucide-react';
import type { HealthSnapshot, ServiceProbe } from '@/lib/health';

function probeStatusLabel(probe: ServiceProbe, loading: boolean): { text: string; tone: 'ok' | 'bad' | 'wait' } {
    if (loading) return { text: 'CHECKING', tone: 'wait' };
    if (probe.ok) return { text: 'ONLINE', tone: 'ok' };
    return { text: 'OFFLINE', tone: 'bad' };
}

function ServiceRow({
    probe,
    loading,
}: {
    probe: ServiceProbe;
    loading: boolean;
}): ReactElement {
    const { text, tone } = probeStatusLabel(probe, loading);
    const statusColor =
        tone === 'ok'
            ? 'text-[color:var(--cc-accent-primary)]'
            : tone === 'wait'
              ? 'text-[color:var(--cc-accent-warning)]'
              : 'text-[color:var(--cc-accent-danger)]';

    return (
        <li className="border-b border-[color:var(--cc-border-subtle)] py-2.5 last:border-b-0">
            <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] leading-tight text-[color:var(--cc-text-secondary)]">
                    {probe.label}
                </span>
                <span className={`cc-mono shrink-0 text-[10px] font-semibold tracking-wide ${statusColor}`}>
                    {text}
                </span>
            </div>
            {!loading && !probe.ok && (
                <p className="cc-mono mt-1 text-[9px] text-[color:var(--cc-text-muted)]">
                    {probe.statusCode !== null ? `HTTP ${probe.statusCode}` : probe.error ?? 'failed'}
                </p>
            )}
        </li>
    );
}

export interface ServicesPanelProps {
    query: UseQueryResult<HealthSnapshot, Error>;
}

export function ServicesPanel({ query }: ServicesPanelProps): ReactElement {
    const { data, isLoading, isError, error, refetch } = query;
    const errMsg = error instanceof Error ? error.message : 'Health checks failed.';

    return (
        <section
            className="rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-panel)] px-3 py-3"
            aria-label="Service health"
        >
            <div className="mb-2 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-[color:var(--cc-accent-primary)]" aria-hidden />
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--cc-text-muted)]">
                    Services
                </h2>
            </div>

            {isLoading && (
                <ul className="space-y-1" aria-busy="true">
                    {['Gateway', 'Tracking', 'Route', 'Ingestion'].map((label) => (
                        <li
                            key={label}
                            className="h-8 animate-pulse rounded border border-[color:var(--cc-border-subtle)] bg-[color:var(--cc-bg-secondary)]"
                        />
                    ))}
                </ul>
            )}

            {isError && (
                <div
                    role="alert"
                    className="rounded border border-[color:var(--cc-accent-danger)] bg-[color:var(--cc-bg-secondary)] px-2 py-2"
                >
                    <div className="flex items-start gap-2">
                        <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--cc-accent-danger)]"
                            aria-hidden
                        />
                        <div>
                            <p className="cc-mono text-[10px] font-medium text-[color:var(--cc-accent-danger)]">
                                PROBE ERROR
                            </p>
                            <p className="cc-mono mt-1 text-[9px] text-[color:var(--cc-text-secondary)]">{errMsg}</p>
                            <button
                                type="button"
                                onClick={() => void refetch()}
                                className="cc-mono mt-2 w-full rounded border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-primary)] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--cc-text-primary)] hover:bg-[color:var(--cc-bg-panel-hover)]"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isLoading && !isError && data && (
                <ul>
                    {data.probes.map((p) => (
                        <ServiceRow key={p.id} probe={p} loading={false} />
                    ))}
                </ul>
            )}

            {!isLoading && !isError && data && data.probes.length === 0 && (
                <p className="cc-mono text-[10px] text-[color:var(--cc-text-muted)]">No probes configured.</p>
            )}

            {!isLoading && !isError && data && (
                <p className="cc-mono mt-2 text-[9px] leading-snug text-[color:var(--cc-text-muted)]">
                    Refreshes every 15s via gateway probes.
                </p>
            )}
        </section>
    );
}
