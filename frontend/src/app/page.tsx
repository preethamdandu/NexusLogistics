'use client';

import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Activity, AlertTriangle, Radio, Truck } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import CommandBar from '@/components/CommandBar';
import { CountUpNumber } from '@/components/CountUpNumber';
import { HeaderClock } from '@/components/HeaderClock';
import { LinksPanel } from '@/components/LinksPanel';
import { LiveFeedPanel } from '@/components/LiveFeedPanel';
import MapComponent from '@/components/Map';
import { ServicesPanel } from '@/components/ServicesPanel';
import { StandardUiToggle } from '@/components/StandardUiToggle';
import {
    allProbesOk,
    fetchServiceHealth,
    type HealthSnapshot,
} from '@/lib/health';
import { useFleetAi } from '@/lib/useFleetAi';
import { useLiveVehicleStream } from '@/lib/useLiveVehicleStream';
import { cn } from '@/lib/utils';

const METRICS_RATE_TITLE =
    'Live rate needs Prometheus query or two samples of a counter; not wired in this dashboard yet.';

interface StatCardProps {
    title: string;
    value: ReactNode;
    valueMono?: boolean;
    valueClassName?: string;
    subtitle?: string;
    icon: LucideIcon;
    valueTitle?: string;
}

function StatCard({
    title,
    value,
    valueMono,
    valueClassName,
    subtitle,
    icon: Icon,
    valueTitle,
}: StatCardProps): ReactElement {
    return (
        <div className="rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-panel)] px-4 py-4">
            <div className="flex items-start justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--cc-text-muted)]">
                    {title}
                </h3>
                <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--cc-text-muted)]" aria-hidden />
            </div>
            <div
                className={cn(
                    'mt-2 text-[28px] font-bold leading-none',
                    valueMono && 'cc-mono tabular-nums',
                    valueClassName
                )}
                title={valueTitle}
            >
                {value}
            </div>
            {subtitle ? (
                <p className="cc-mono mt-2 text-[10px] text-[color:var(--cc-text-muted)]">{subtitle}</p>
            ) : null}
        </div>
    );
}

function DashboardSkeleton(): ReactElement {
    return (
        <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
            <div className="h-12 animate-pulse rounded-md border border-[color:var(--cc-border-subtle)] bg-[color:var(--cc-bg-secondary)]" />
            <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-28 animate-pulse rounded-md border border-[color:var(--cc-border-subtle)] bg-[color:var(--cc-bg-secondary)]"
                    />
                ))}
            </div>
            <div className="h-[50vh] min-h-[300px] animate-pulse rounded-md border border-[color:var(--cc-border-subtle)] bg-[color:var(--cc-bg-secondary)]" />
        </div>
    );
}

function systemStatusLabel(
    isLoading: boolean,
    isError: boolean,
    snapshot: HealthSnapshot | undefined
): ReactNode {
    if (isLoading) {
        return <span className="text-[color:var(--cc-accent-warning)]">CHECKING</span>;
    }
    if (isError || !snapshot) {
        return <span className="text-[color:var(--cc-accent-danger)]">UNKNOWN</span>;
    }
    if (snapshot.probes.length === 0) {
        return <span className="text-[color:var(--cc-text-muted)]">—</span>;
    }
    return allProbesOk(snapshot) ? (
        <span className="text-[color:var(--cc-accent-primary)]">OPERATIONAL</span>
    ) : (
        <span className="text-[color:var(--cc-accent-warning)]">DEGRADED</span>
    );
}

export default function Dashboard(): ReactElement {
    const live = useLiveVehicleStream();
    const fleetAi = useFleetAi(live.vehicles);
    const [showSimulatorHint, setShowSimulatorHint] = useState(false);

    const healthQuery = useQuery({
        queryKey: ['serviceHealth'],
        queryFn: fetchServiceHealth,
        refetchInterval: 15_000,
    });

    useEffect(() => {
        const eligible =
            live.isConnected &&
            live.vehicles.length === 0 &&
            !live.isLoading &&
            !live.isError;

        if (!eligible) {
            return () => {
                /* noop */
            };
        }

        const t = window.setTimeout(() => {
            setShowSimulatorHint(true);
        }, 10_000);

        return () => {
            window.clearTimeout(t);
            setShowSimulatorHint(false);
        };
    }, [live.isConnected, live.vehicles.length, live.isLoading, live.isError]);

    const vehicles = live.vehicles;
    const fleetRoutePath =
        fleetAi.lastAction?.type === 'route_vehicle' &&
        fleetAi.lastAction.path != null &&
        fleetAi.lastAction.path.length >= 2
            ? fleetAi.lastAction.path
            : null;
    const mapFleetAction =
        fleetAi.lastAction?.type === 'clear_filters' ? null : fleetAi.lastAction;
    const aircraftFeedUnavailable = live.aircraftFeedUnavailable;

    const clearFleetAction = fleetAi.clearAction;
    useEffect(() => {
        const onDocKey = (e: globalThis.KeyboardEvent): void => {
            if (e.key !== 'Escape') return;
            const t = e.target;
            if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
            clearFleetAction();
        };
        document.addEventListener('keydown', onDocKey);
        return () => document.removeEventListener('keydown', onDocKey);
    }, [clearFleetAction]);

    const errorMessage =
        live.error instanceof Error ? live.error.message : 'Could not load live fleet data.';

    return (
        <div className="cc-app-shell relative z-10 flex min-h-screen flex-col p-4 md:p-6">
            <header className="mb-6 flex flex-col gap-4 border-b border-[color:var(--cc-border-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <span
                        className="cc-header-live-dot h-2 w-2 shrink-0 rounded-full bg-[color:var(--cc-accent-primary)]"
                        aria-hidden
                    />
                    <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--cc-accent-primary)]">
                        Nexus Logistics
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <HeaderClock />
                    <div
                        className={cn(
                            'cc-mono flex items-center gap-2 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                            live.isConnected
                                ? 'border-[color:var(--cc-accent-primary)] text-[color:var(--cc-accent-primary)]'
                                : 'border-[color:var(--cc-accent-warning)] text-[color:var(--cc-accent-warning)]'
                        )}
                    >
                        <span
                            className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                live.isConnected
                                    ? 'bg-[color:var(--cc-accent-primary)]'
                                    : 'bg-[color:var(--cc-accent-warning)]'
                            )}
                            aria-hidden
                        />
                        {live.isConnected ? 'Live' : 'Reconnecting'}
                    </div>
                    <StandardUiToggle />
                </div>
            </header>

            {aircraftFeedUnavailable && !live.isLoading && !live.isError && (
                <div
                    role="status"
                    className="cc-mono mb-4 flex items-start gap-3 rounded-md border border-[color:var(--cc-accent-warning)] bg-[color:var(--cc-bg-panel)] px-3 py-2 text-[11px] text-[color:var(--cc-text-secondary)]"
                >
                    <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--cc-accent-warning)]"
                        aria-hidden
                    />
                    <p>
                        Live aircraft feed temporarily unavailable. Trucks, buses, and cached vehicles
                        still show on the map.
                    </p>
                </div>
            )}

            {live.isLoading && <DashboardSkeleton />}

            {!live.isLoading && live.isError && (
                <div
                    role="alert"
                    className="cc-mono rounded-md border border-[color:var(--cc-accent-danger)] bg-[color:var(--cc-bg-panel)] px-4 py-3 text-[12px]"
                >
                    <p className="font-semibold uppercase tracking-wide text-[color:var(--cc-accent-danger)]">
                        Failed to load live data
                    </p>
                    <p className="mt-2 text-[color:var(--cc-text-secondary)]">{errorMessage}</p>
                    <button
                        type="button"
                        onClick={() => void live.reloadSeed()}
                        className="mt-3 rounded border border-[color:var(--cc-accent-danger)] bg-[color:var(--cc-bg-primary)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[color:var(--cc-text-primary)] hover:bg-[color:var(--cc-bg-panel-hover)]"
                    >
                        Retry
                    </button>
                </div>
            )}

            {!live.isLoading && !live.isError && (
                <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
                    <div className="flex min-h-0 flex-col gap-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <StatCard
                                title="Fleet"
                                value={<CountUpNumber value={vehicles.length} />}
                                valueMono
                                valueClassName="text-[color:var(--cc-accent-primary)]"
                                icon={Truck}
                            />
                            <StatCard
                                title="System"
                                value={systemStatusLabel(
                                    healthQuery.isLoading,
                                    healthQuery.isError,
                                    healthQuery.data
                                )}
                                valueMono
                                valueClassName="text-[color:var(--cc-accent-secondary)]"
                                subtitle="Gateway + probes"
                                icon={Activity}
                                valueTitle="Gateway + tracking + route + ingestion probes via /api/health/* and /health."
                            />
                            <StatCard
                                title="Throughput"
                                value="—"
                                valueMono
                                valueClassName="text-[color:var(--cc-accent-warning)]"
                                subtitle="Awaiting metrics wiring"
                                icon={Radio}
                                valueTitle={METRICS_RATE_TITLE}
                            />
                        </div>

                        <CommandBar
                            isAvailable={fleetAi.isAvailable}
                            isChecking={fleetAi.isChecking}
                            isLoading={fleetAi.isLoading}
                            lastAction={fleetAi.lastAction}
                            history={fleetAi.history}
                            clearAction={fleetAi.clearAction}
                            dismissAutoMessage={fleetAi.dismissAutoMessage}
                            submitQuery={fleetAi.submitQuery}
                        />

                        <MapComponent
                            vehicles={vehicles}
                            showSimulatorEmptyHint={showSimulatorHint}
                            streamConnected={live.isConnected}
                            fleetAction={mapFleetAction}
                            routeLoadingVehicleId={fleetAi.routeLoadingVehicleId}
                            fleetRoutePath={fleetRoutePath}
                        />
                    </div>

                    <aside className="flex min-h-0 w-full flex-col gap-0 md:max-w-[260px] md:justify-self-end">
                        <ServicesPanel query={healthQuery} />
                        <LiveFeedPanel entries={live.liveFeed} />
                        <LinksPanel />
                    </aside>
                </div>
            )}
        </div>
    );
}
