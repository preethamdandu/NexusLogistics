'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, GATEWAY_BASE_URL, type VehicleLocation } from '@/lib/api';
import { normalizeVehicleKind, type VehicleKind } from '@/lib/vehicleTypes';

const AIRCRAFT_PROBE_PATH = '/api/live/aircraft';
const LIVE_ALL_PATH = '/api/live/all';
const SSE_PATH = '/api/live/stream';

const alwaysResolveStatus = (): boolean => true;

export interface LiveMapVehicle {
    vehicle_id: string;
    latitude: number;
    longitude: number;
    timestamp: number;
    type: VehicleKind;
    callsign?: string;
    altitude?: number;
    route?: string;
    city?: string;
    /** Position before the latest merge (for map animation). */
    previousLatitude?: number;
    previousLongitude?: number;
    previousTimestamp?: number;
    /** Recent SSE positions (newest last), max 20. */
    trail: [number, number][];
    /** Count of SSE merges for this vehicle in this session. */
    sseUpdateCount: number;
}

export interface LiveFeedEntry {
    id: string;
    receivedAt: number;
    vehicleId: string;
    lat: number;
    lng: number;
    timestamp: number;
}

function seedVehicleToLive(v: VehicleLocation): LiveMapVehicle {
    return {
        vehicle_id: v.vehicle_id,
        latitude: v.latitude,
        longitude: v.longitude,
        timestamp: v.timestamp,
        type: normalizeVehicleKind(v),
        callsign: v.callsign,
        altitude: v.altitude,
        route: v.route,
        city: v.city,
        trail: [],
        sseUpdateCount: 0,
    };
}

function parseLocationUpdatePayload(raw: unknown): Partial<VehicleLocation> | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.vehicle_id !== 'string') return null;
    if (typeof o.latitude !== 'number' || typeof o.longitude !== 'number') return null;
    const ts =
        typeof o.timestamp === 'number'
            ? o.timestamp
            : typeof o.timestamp === 'string'
              ? Number(o.timestamp)
              : NaN;
    if (!Number.isFinite(ts)) return null;
    const out: Partial<VehicleLocation> = {
        vehicle_id: o.vehicle_id,
        latitude: o.latitude,
        longitude: o.longitude,
        timestamp: ts,
    };
    if (typeof o.vehicle_type === 'string') {
        out.vehicle_type = o.vehicle_type;
    }
    if (typeof o.type === 'string') {
        out.type = o.type as VehicleLocation['type'];
    }
    return out;
}

function mergePingIntoLive(prev: LiveMapVehicle, ping: Partial<VehicleLocation>): LiveMapVehicle {
    const nextType = normalizeVehicleKind(ping);
    const nextLat = ping.latitude ?? prev.latitude;
    const nextLng = ping.longitude ?? prev.longitude;
    const nextTs = ping.timestamp ?? prev.timestamp;

    const trail = [...prev.trail];
    trail.push([nextLat, nextLng]);
    while (trail.length > 20) trail.shift();

    return {
        ...prev,
        vehicle_id: ping.vehicle_id ?? prev.vehicle_id,
        latitude: nextLat,
        longitude: nextLng,
        timestamp: nextTs,
        type: nextType,
        previousLatitude: prev.latitude,
        previousLongitude: prev.longitude,
        previousTimestamp: prev.timestamp,
        trail,
        sseUpdateCount: prev.sseUpdateCount + 1,
    };
}

function newVehicleFromPing(ping: Partial<VehicleLocation>): LiveMapVehicle | null {
    if (
        typeof ping.vehicle_id !== 'string' ||
        typeof ping.latitude !== 'number' ||
        typeof ping.longitude !== 'number' ||
        typeof ping.timestamp !== 'number'
    ) {
        return null;
    }
    const v: VehicleLocation = {
        vehicle_id: ping.vehicle_id,
        latitude: ping.latitude,
        longitude: ping.longitude,
        timestamp: ping.timestamp,
        type: normalizeVehicleKind(ping),
    };
    return { ...seedVehicleToLive(v), trail: [[v.latitude, v.longitude]], sseUpdateCount: 1 };
}

export interface UseLiveVehicleStreamResult {
    vehicles: LiveMapVehicle[];
    liveFeed: LiveFeedEntry[];
    isConnected: boolean;
    aircraftFeedUnavailable: boolean;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    reloadSeed: () => Promise<void>;
}

export function useLiveVehicleStream(): UseLiveVehicleStreamResult {
    const [vehicleMap, setVehicleMap] = useState(() => new Map<string, LiveMapVehicle>());
    const [liveFeed, setLiveFeed] = useState<LiveFeedEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [aircraftFeedUnavailable, setAircraftFeedUnavailable] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const esRef = useRef<EventSource | null>(null);
    const feedSeq = useRef(0);

    const loadSeed = useCallback(async () => {
        setIsLoading(true);
        setIsError(false);
        setError(null);
        try {
            const [aircraftProbe, allResponse] = await Promise.all([
                api.get<unknown>(AIRCRAFT_PROBE_PATH, { validateStatus: alwaysResolveStatus }),
                api.get<VehicleLocation[]>(LIVE_ALL_PATH),
            ]);
            const aircraftDown = aircraftProbe.status !== 200;
            setAircraftFeedUnavailable(aircraftDown);
            let list = allResponse.data;
            if (aircraftDown) {
                list = list.filter((v) => v.type !== 'aircraft');
            }
            const next = new Map<string, LiveMapVehicle>();
            for (const v of list) {
                next.set(v.vehicle_id, seedVehicleToLive(v));
            }
            setVehicleMap(next);
        } catch (e) {
            setIsError(true);
            setError(e instanceof Error ? e : new Error('Failed to load live fleet data.'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSeed();
    }, [loadSeed]);

    useEffect(() => {
        const base = GATEWAY_BASE_URL.replace(/\/$/, '');
        const sseUrl = `${base}${SSE_PATH}`;
        const es = new EventSource(sseUrl);
        esRef.current = es;

        const onOpen = (): void => {
            setIsConnected(true);
        };
        const onError = (): void => {
            setIsConnected(false);
        };

        const onLocationUpdate = (ev: MessageEvent): void => {
            setIsConnected(true);
            let parsed: unknown;
            try {
                parsed = JSON.parse(String(ev.data)) as unknown;
            } catch {
                return;
            }
            const ping = parseLocationUpdatePayload(parsed);
            const id = ping?.vehicle_id;
            if (!ping || typeof id !== 'string') return;
            if (
                typeof ping.latitude !== 'number' ||
                typeof ping.longitude !== 'number' ||
                typeof ping.timestamp !== 'number'
            ) {
                return;
            }

            const lat = ping.latitude;
            const lng = ping.longitude;
            const ts = ping.timestamp;

            feedSeq.current += 1;
            const feedId = `${Date.now()}-${feedSeq.current}`;
            const row: LiveFeedEntry = {
                id: feedId,
                receivedAt: Date.now(),
                vehicleId: id,
                lat,
                lng,
                timestamp: ts,
            };
            setLiveFeed((prev) => [row, ...prev].slice(0, 10));

            setVehicleMap((prev) => {
                const next = new Map(prev);
                const existing = next.get(id);
                if (existing) {
                    next.set(id, mergePingIntoLive(existing, ping));
                } else {
                    const created = newVehicleFromPing(ping);
                    if (created) next.set(id, created);
                }
                return next;
            });
        };

        es.addEventListener('open', onOpen);
        es.addEventListener('error', onError);
        es.addEventListener('location-update', onLocationUpdate as EventListener);

        return () => {
            es.removeEventListener('open', onOpen);
            es.removeEventListener('error', onError);
            es.removeEventListener('location-update', onLocationUpdate as EventListener);
            es.close();
            esRef.current = null;
        };
    }, []);

    const vehicles = useMemo(
        () => [...vehicleMap.values()].sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id)),
        [vehicleMap]
    );

    return {
        vehicles,
        liveFeed,
        isConnected,
        aircraftFeedUnavailable,
        isLoading,
        isError,
        error,
        reloadSeed: loadSeed,
    };
}
