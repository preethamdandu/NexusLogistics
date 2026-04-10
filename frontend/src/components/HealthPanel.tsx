'use client';

import { useQuery } from '@tanstack/react-query';
import {
    Activity,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    Info,
    XCircle,
} from 'lucide-react';
import { fetchServiceHealth, type ServiceProbe } from '@/lib/health';

function ProbeRow({ probe }: { probe: ServiceProbe }) {
    return (
        <li className="flex flex-col gap-1 border-b border-border py-3 last:border-0">
            <div className="flex items-center gap-2">
                {probe.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
                ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                )}
                <span className="font-medium">{probe.label}</span>
                <span className="text-xs text-muted-foreground">
                    {probe.statusCode !== null ? `HTTP ${probe.statusCode}` : probe.error ?? 'failed'}
                </span>
            </div>
            {!probe.ok && (
                <p className="pl-6 text-xs text-muted-foreground">
                    Check logs: <code className="rounded bg-muted px-1 py-0.5">{probe.logsHint}</code>
                </p>
            )}
        </li>
    );
}

function PanelSkeleton() {
    return (
        <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading health checks">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-md border border-border bg-muted/40" />
        </div>
    );
}

export function HealthPanel() {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['serviceHealth'],
        queryFn: fetchServiceHealth,
        refetchInterval: 15_000,
    });

    const errMsg = error instanceof Error ? error.message : 'Health checks failed.';

    return (
        <details className="group rounded-xl border border-border bg-card text-card-foreground">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 font-semibold">
                <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
                    System health
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>

            <div className="border-t border-border px-4 pb-4">
                {isLoading && <PanelSkeleton />}

                {isError && (
                    <div
                        role="alert"
                        className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                    >
                        <p className="font-medium text-destructive">Could not run health checks</p>
                        <p className="mt-1 text-muted-foreground">{errMsg}</p>
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !isError && data && (
                    <>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Probes use the gateway at <code className="text-[11px]">/health</code>,{' '}
                            <code className="text-[11px]">/api/live/trucks</code>,{' '}
                            <code className="text-[11px]">/api/health/route</code>,{' '}
                            <code className="text-[11px]">/api/health/ingestion</code>. Refreshes every 15s.
                        </p>
                        <ul className="mt-2">
                            {data.probes.map((p) => (
                                <ProbeRow key={p.id} probe={p} />
                            ))}
                        </ul>
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <div>
                                <p className="font-medium text-foreground">Observability (host ports)</p>
                                <p className="mt-1">
                                    These open in a new tab; the app does not call them (different origin).
                                </p>
                                <ul className="mt-2 space-y-1">
                                    <li>
                                        <a
                                            href="http://localhost:9090"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                        >
                                            Prometheus <ExternalLink className="h-3 w-3" aria-hidden />
                                        </a>
                                    </li>
                                    <li>
                                        <a
                                            href="http://localhost:3001"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                        >
                                            Grafana <ExternalLink className="h-3 w-3" aria-hidden />
                                        </a>
                                    </li>
                                    <li>
                                        <a
                                            href="http://localhost:8080"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                                        >
                                            Kafka UI <ExternalLink className="h-3 w-3" aria-hidden />
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </>
                )}

                {!isLoading && !isError && data && data.probes.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">No probes configured.</p>
                )}
            </div>
        </details>
    );
}
