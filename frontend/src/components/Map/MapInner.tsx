'use client';

import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Maximize2, Terminal } from 'lucide-react';
import type { FleetAiAction } from '@/lib/fleetAiTypes';
import { computeLegendCounts } from '@/lib/mapFleetVisual';
import type { LiveMapVehicle } from '@/lib/useLiveVehicleStream';
import { markerColorCssVar } from '@/lib/vehicleTypes';
import { cn } from '@/lib/utils';
import VehicleLayer from '@/components/Map/VehicleLayer';

const US_CENTER: [number, number] = [39.8283, -98.5795];

const CARTO_TILES =
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function MapFitAllButton({
    vehicles,
    disabled,
}: {
    vehicles: LiveMapVehicle[];
    disabled: boolean;
}): ReactElement {
    const map = useMap();
    return (
        <button
            type="button"
            disabled={disabled}
            title="Fit all vehicles in view"
            aria-label="Fit all vehicles in view"
            onClick={() => {
                if (vehicles.length === 0) return;
                const bounds = L.latLngBounds(
                    vehicles.map((v) => [v.latitude, v.longitude] as L.LatLngTuple)
                );
                map.fitBounds(bounds, { padding: [40, 40] });
            }}
            className={cn(
                'absolute bottom-4 left-4 z-[1000] flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-secondary)] text-[color:var(--cc-text-primary)] transition-opacity hover:bg-[color:var(--cc-bg-panel-hover)]',
                disabled && 'cursor-not-allowed opacity-35'
            )}
        >
            <Maximize2 className="h-4 w-4" aria-hidden />
        </button>
    );
}

function MapCenterReadout(): ReactElement {
    const map = useMap();
    const [center, setCenter] = useState(() => map.getCenter());

    const sync = useCallback(() => {
        setCenter(map.getCenter());
    }, [map]);

    useMapEvents({
        moveend: sync,
        zoomend: sync,
    });

    return (
        <div className="pointer-events-none absolute bottom-14 left-4 z-[1000] rounded border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-secondary)]/95 px-2 py-1">
            <span className="cc-mono text-[10px] text-[color:var(--cc-text-secondary)]">
                {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </span>
        </div>
    );
}

function FleetZoomController({ action }: { action: FleetAiAction | null }): null {
    const map = useMap();
    useEffect(() => {
        if (action?.type !== 'zoom_to') return;
        map.flyTo([action.lat, action.lng], action.zoom ?? 11, { duration: 1.5 });
    }, [action, map]);
    return null;
}

function FleetRoutePolyline({ path }: { path: [number, number][] | null }): null {
    const map = useMap();
    useEffect(() => {
        if (!path || path.length < 2) return;
        const poly = L.polyline(path, {
            color: '#00ffc8',
            weight: 2,
            dashArray: '8, 4',
            opacity: 0.95,
            interactive: false,
            className: 'fleet-route-glow',
        });
        poly.addTo(map);
        return () => {
            map.removeLayer(poly);
        };
    }, [path, map]);
    return null;
}

export interface MapInnerProps {
    vehicles: LiveMapVehicle[];
    showSimulatorEmptyHint?: boolean;
    streamConnected: boolean;
    fleetAction?: FleetAiAction | null;
    routeLoadingVehicleId?: string | null;
    fleetRoutePath?: [number, number][] | null;
}

export default function MapInner({
    vehicles,
    showSimulatorEmptyHint = false,
    streamConnected,
    fleetAction = null,
    routeLoadingVehicleId = null,
    fleetRoutePath = null,
}: MapInnerProps): ReactElement {
    const leg = computeLegendCounts(vehicles, fleetAction);
    const filterTypes = fleetAction?.type === 'filter_by_type' ? fleetAction.types : null;
    const showTruck = filterTypes ? filterTypes.includes('truck') : true;
    const showBus = filterTypes ? filterTypes.includes('bus') : true;
    const showAircraft = filterTypes ? filterTypes.includes('aircraft') : true;

    return (
        <div className="relative h-[70vh] min-h-[320px] w-full max-h-[760px] flex-1 overflow-hidden rounded-md border border-[color:var(--cc-border)] md:min-h-[360px]">
            <div
                className="pointer-events-none absolute inset-0 z-[5] opacity-[0.045]"
                style={{
                    backgroundImage: `linear-gradient(0deg, rgba(0,255,200,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,200,0.5) 1px, transparent 1px)`,
                    backgroundSize: '28px 28px',
                }}
                aria-hidden
            />

            <div
                className={cn(
                    'absolute left-3 top-3 z-[1000] rounded border px-2 py-1',
                    streamConnected
                        ? 'border-[color:var(--cc-accent-primary)] bg-[color:var(--cc-bg-secondary)]'
                        : 'border-[color:var(--cc-accent-warning)] bg-[color:var(--cc-bg-secondary)]'
                )}
            >
                <span
                    className={cn(
                        'cc-mono text-[9px] font-bold uppercase tracking-[0.15em]',
                        streamConnected
                            ? 'text-[color:var(--cc-accent-primary)]'
                            : 'text-[color:var(--cc-accent-warning)]'
                    )}
                >
                    {streamConnected ? 'Live' : 'Reconnecting'}
                </span>
            </div>

            <div className="absolute right-3 top-3 z-[1000] rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-panel)] px-2.5 py-2 text-[10px] backdrop-blur-sm">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--cc-text-muted)]">
                    Legend
                </div>
                {showTruck ? (
                    <div className="mb-1 flex items-center gap-2">
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                                background: markerColorCssVar('truck'),
                                boxShadow: 'var(--cc-glow-blue)',
                            }}
                        />
                        <span className="cc-mono text-[color:var(--cc-text-secondary)]">
                            TRK{' '}
                            <span className="text-[color:var(--cc-text-primary)]">({leg.truck})</span>
                        </span>
                    </div>
                ) : null}
                {showBus ? (
                    <div className="mb-1 flex items-center gap-2">
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                                background: markerColorCssVar('bus'),
                                boxShadow: 'var(--cc-glow-cyan)',
                            }}
                        />
                        <span className="cc-mono text-[color:var(--cc-text-secondary)]">
                            BUS{' '}
                            <span className="text-[color:var(--cc-text-primary)]">({leg.bus})</span>
                        </span>
                    </div>
                ) : null}
                {showAircraft ? (
                    <div className="flex items-center gap-2">
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                                background: markerColorCssVar('aircraft'),
                                boxShadow: 'var(--cc-glow-purple)',
                            }}
                        />
                        <span className="cc-mono text-[color:var(--cc-text-secondary)]">
                            AIR{' '}
                            <span className="text-[color:var(--cc-text-primary)]">({leg.aircraft})</span>
                        </span>
                    </div>
                ) : null}
                {fleetAction?.type === 'highlight_vehicles' && leg.highlightTotal != null ? (
                    <div className="cc-mono mt-1.5 border-t border-[color:var(--cc-border-subtle)] pt-1.5 text-[9px] text-[color:var(--cc-text-muted)]">
                        Highlighted:{' '}
                        <span className="text-[color:var(--cc-accent-primary)]">{leg.highlightTotal}</span>
                    </div>
                ) : null}
            </div>

            {showSimulatorEmptyHint && vehicles.length === 0 && (
                <div
                    role="status"
                    className="absolute inset-0 z-[1100] flex items-center justify-center rounded-md border-2 border-dashed border-[color:var(--cc-border)] bg-[color:var(--cc-bg-secondary)]/95 p-6 backdrop-blur-sm"
                >
                    <div className="flex max-w-md flex-col items-center gap-3 text-center">
                        <Terminal
                            className="h-10 w-10 text-[color:var(--cc-accent-primary)]"
                            strokeWidth={1.5}
                            aria-hidden
                        />
                        <p className="text-base font-semibold text-[color:var(--cc-text-primary)]">
                            No vehicles detected
                        </p>
                        <p className="cc-mono text-[11px] text-[color:var(--cc-text-secondary)]">
                            Start the simulator:
                        </p>
                        <code className="cc-mono rounded border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-primary)] px-3 py-2 text-[10px] text-[color:var(--cc-accent-primary)]">
                            cd ingestion-service && go run ./cmd/simulator
                        </code>
                    </div>
                </div>
            )}

            <MapContainer
                center={US_CENTER}
                zoom={4}
                style={{ height: '100%', width: '100%', minHeight: '300px' }}
                className="z-0"
            >
                <TileLayer attribution={CARTO_ATTRIBUTION} url={CARTO_TILES} />
                <VehicleLayer
                    vehicles={vehicles}
                    fleetAction={fleetAction}
                    routeLoadingVehicleId={routeLoadingVehicleId}
                />
                <FleetZoomController action={fleetAction} />
                <FleetRoutePolyline path={fleetRoutePath} />
                <MapCenterReadout />
                <MapFitAllButton vehicles={vehicles} disabled={vehicles.length === 0} />
            </MapContainer>
        </div>
    );
}
