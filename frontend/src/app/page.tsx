'use client';

import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Activity, AlertTriangle, Radio, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { HealthPanel } from '@/components/HealthPanel';
import MapComponent from '@/components/Map';
import { ThemeToggle } from '@/components/ThemeToggle';
import { fetchDashboardLiveVehicles } from '@/lib/api';
import {
    allProbesOk,
    fetchServiceHealth,
    type HealthSnapshot,
} from '@/lib/health';
import { cn } from '@/lib/utils';

const METRICS_RATE_TITLE =
    'Live rate needs Prometheus query or two samples of a counter; not wired in this dashboard yet.';

interface StatCardProps {
    title: string;
    value: ReactNode;
    icon: LucideIcon;
    className?: string;
    valueTitle?: string;
}

function StatCard({ title, value, icon: Icon, className, valueTitle }: StatCardProps) {
    return (
        <div
            className={cn(
                'rounded-xl border border-border bg-card text-card-foreground',
                className
            )}
        >
            <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
                <h3 className="text-sm font-medium tracking-tight">{title}</h3>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="p-6 pt-0">
                <div className="text-2xl font-bold" title={valueTitle}>
                    {value}
                </div>
            </div>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="space-y-8" aria-busy="true" aria-label="Loading dashboard">
            <div className="space-y-2">
                <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
                <div className="h-5 w-72 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-28 animate-pulse rounded-xl border border-border bg-card"
                    />
                ))}
            </div>
            <div className="h-[600px] animate-pulse rounded-xl border border-border bg-muted/40" />
        </div>
    );
}

function systemStatusLabel(
    isLoading: boolean,
    isError: boolean,
    snapshot: HealthSnapshot | undefined
): ReactNode {
    if (isLoading) {
        return <span className="text-muted-foreground">Checking…</span>;
    }
    if (isError || !snapshot) {
        return <span className="text-destructive">Unknown</span>;
    }
    if (snapshot.probes.length === 0) {
        return '—';
    }
    return allProbesOk(snapshot) ? 'Operational' : 'Degraded';
}

export default function Dashboard() {
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['dashboardLiveVehicles'],
        queryFn: fetchDashboardLiveVehicles,
        refetchInterval: 5000,
    });

    const healthQuery = useQuery({
        queryKey: ['serviceHealth'],
        queryFn: fetchServiceHealth,
        refetchInterval: 15_000,
    });

    const vehicles = data?.vehicles ?? [];
    const aircraftFeedUnavailable = data?.aircraftFeedUnavailable ?? false;

    const errorMessage =
        error instanceof Error ? error.message : 'Could not load live fleet data.';

    return (
        <div className="flex min-h-screen flex-col space-y-8 bg-muted/10 p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground">Real-time fleet overview</p>
                </div>
                <ThemeToggle />
            </div>

            <HealthPanel />

            {aircraftFeedUnavailable && !isLoading && !isError && (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
                >
                    <AlertTriangle
                        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500"
                        aria-hidden
                    />
                    <p>
                        Live aircraft feed temporarily unavailable. Trucks, buses, and cached vehicles
                        still show on the map.
                    </p>
                </div>
            )}

            {isLoading && <DashboardSkeleton />}

            {!isLoading && isError && (
                <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
                >
                    <p className="font-medium text-destructive">Failed to load live data</p>
                    <p className="mt-1 text-muted-foreground">{errorMessage}</p>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
                    >
                        Retry
                    </button>
                </div>
            )}

            {!isLoading && !isError && (
                <>
                    <div className="grid gap-4 md:grid-cols-3">
                        <StatCard title="Active vehicles" value={vehicles.length} icon={Truck} />
                        <StatCard
                            title="System status"
                            value={systemStatusLabel(
                                healthQuery.isLoading,
                                healthQuery.isError,
                                healthQuery.data
                            )}
                            icon={Activity}
                            valueTitle="Gateway + tracking + route + ingestion probes via /api/health/* and /health."
                        />
                        <StatCard
                            title="Updates / sec"
                            value="—"
                            icon={Radio}
                            valueTitle={METRICS_RATE_TITLE}
                        />
                    </div>

                    <div className="rounded-xl border border-border bg-card text-card-foreground">
                        <div className="flex flex-col space-y-1.5 p-6">
                            <h3 className="font-semibold leading-none tracking-tight">Live map</h3>
                            <p className="text-sm text-muted-foreground">
                                Positions from the gateway{' '}
                                <code className="text-xs">/api/live/all</code>
                                {isFetching ? ' (refreshing…)' : ''}.
                            </p>
                        </div>
                        <div className="p-6 pt-0">
                            {vehicles.length === 0 ? (
                                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
                                    <p className="font-medium">No vehicles to show</p>
                                    <p className="mt-2 max-w-md text-sm text-muted-foreground">
                                        When the stack is up, ingest location pings (gRPC → Kafka) or
                                        wait for simulated trucks and buses. Cached Redis vehicles appear
                                        here too.
                                    </p>
                                </div>
                            ) : (
                                <MapComponent vehicles={vehicles} />
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
