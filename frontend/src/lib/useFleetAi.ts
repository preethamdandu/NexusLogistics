'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GATEWAY_BASE_URL } from '@/lib/api';
import { parseFleetAiFromModelContent } from '@/lib/fleetAiParse';
import { buildFleetAiSystemPrompt, buildFleetVehicleSummary } from '@/lib/fleetAiPrompt';
import type { FleetAiAction, FleetAiHistoryEntry } from '@/lib/fleetAiTypes';
import { FLEET_AI_MODEL } from '@/lib/fleetAiTypes';
import type { LiveMapVehicle } from '@/lib/useLiveVehicleStream';

const OLLAMA_TAGS_URL = `${GATEWAY_BASE_URL.replace(/\/$/, '')}/api/ai/tags`;
const OLLAMA_CHAT_URL = `${GATEWAY_BASE_URL.replace(/\/$/, '')}/api/ai/chat`;
const FETCH_TIMEOUT_MS = 15_000;
const ROUTE_POLL_MS = 2000;
const ROUTE_POLL_MAX = 10;

interface OllamaTagsResponse {
    models?: { name?: string }[];
}

interface OllamaChatResponse {
    message?: { content?: string };
}

function isAbortTimeout(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'TimeoutError';
}

function isNetworkError(err: unknown): boolean {
    return err instanceof TypeError;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function extractChatContent(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const msg = (data as OllamaChatResponse).message;
    if (!msg || typeof msg !== 'object') return null;
    const c = msg.content;
    return typeof c === 'string' ? c : null;
}

function extractRoutePath(raw: unknown): [number, number][] | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const p = o.path;
    if (!Array.isArray(p) || p.length < 2) return null;
    const out: [number, number][] = [];
    for (const pt of p) {
        if (!pt || typeof pt !== 'object') return null;
        const rec = pt as Record<string, unknown>;
        const lat = typeof rec.lat === 'number' ? rec.lat : Number(rec.lat);
        const lngRaw = rec.lng ?? rec.long;
        const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        out.push([lat, lng]);
    }
    return out;
}

const MALFORMED_HTTP: FleetAiAction = {
    type: 'answer_text',
    text: "Couldn't understand that. Try: 'show trucks', 'zoom to NYC', 'average speed?'",
};

export interface UseFleetAiResult {
    isAvailable: boolean;
    isChecking: boolean;
    lastAction: FleetAiAction | null;
    routeLoadingVehicleId: string | null;
    clearAction: () => void;
    dismissAutoMessage: () => void;
    submitQuery: (query: string) => Promise<void>;
    isLoading: boolean;
    history: FleetAiHistoryEntry[];
}

export function useFleetAi(vehicles: LiveMapVehicle[]): UseFleetAiResult {
    const [isAvailable, setIsAvailable] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [lastAction, setLastAction] = useState<FleetAiAction | null>(null);
    const [routeLoadingVehicleId, setRouteLoadingVehicleId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState<FleetAiHistoryEntry[]>([]);

    const routePollRef = useRef<number | null>(null);
    const autoMessageTimerRef = useRef<number | null>(null);
    const vehiclesRef = useRef(vehicles);
    vehiclesRef.current = vehicles;

    const clearAutoMessageTimer = useCallback((): void => {
        if (autoMessageTimerRef.current != null) {
            window.clearTimeout(autoMessageTimerRef.current);
            autoMessageTimerRef.current = null;
        }
    }, []);

    const scheduleAutoMessageClear = useCallback((): void => {
        clearAutoMessageTimer();
        autoMessageTimerRef.current = window.setTimeout(() => {
            autoMessageTimerRef.current = null;
            setLastAction((prev) =>
                prev?.type === 'answer_text' || prev?.type === 'show_stat' ? null : prev
            );
        }, 6000);
    }, [clearAutoMessageTimer]);

    const clearRoutePoll = useCallback((): void => {
        if (routePollRef.current != null) {
            window.clearInterval(routePollRef.current);
            routePollRef.current = null;
        }
    }, []);

    const clearAction = useCallback((): void => {
        clearAutoMessageTimer();
        clearRoutePoll();
        setRouteLoadingVehicleId(null);
        setLastAction(null);
    }, [clearAutoMessageTimer, clearRoutePoll]);

    const dismissAutoMessage = useCallback((): void => {
        clearAutoMessageTimer();
        setLastAction((prev) =>
            prev?.type === 'answer_text' || prev?.type === 'show_stat' ? null : prev
        );
    }, [clearAutoMessageTimer]);

    useEffect(() => {
        let cancelled = false;
        (async (): Promise<void> => {
            setIsChecking(true);
            try {
                const res = await fetchWithTimeout(
                    OLLAMA_TAGS_URL,
                    { method: 'GET', cache: 'no-store' },
                    4000
                );
                if (cancelled) return;
                if (!res.ok) {
                    setIsAvailable(false);
                    return;
                }
                const data = (await res.json()) as OllamaTagsResponse;
                const names = (data.models ?? []).map((m) => String(m.name ?? ''));
                setIsAvailable(names.some((n) => n === FLEET_AI_MODEL || n.startsWith(`${FLEET_AI_MODEL}:`)));
            } catch {
                if (!cancelled) setIsAvailable(false);
            } finally {
                if (!cancelled) setIsChecking(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const pushHistory = useCallback((query: string, action: FleetAiAction): void => {
        setHistory((prev) => {
            const next: FleetAiHistoryEntry[] = [
                { query, action },
                ...prev.filter((h) => h.query !== query),
            ];
            return next.slice(0, 5);
        });
    }, []);

    const startRoutePolling = useCallback(
        (vehicleId: string): void => {
            clearRoutePoll();
            let attempts = 0;
            const tick = async (): Promise<void> => {
                attempts += 1;
                const base = GATEWAY_BASE_URL.replace(/\/$/, '');
                try {
                    const res = await fetch(`${base}/api/routes/status/${encodeURIComponent(vehicleId)}`, {
                        method: 'GET',
                        cache: 'no-store',
                    });
                    if (res.ok) {
                        const raw: unknown = await res.json();
                        const path = extractRoutePath(raw);
                        if (path && path.length >= 2) {
                            setLastAction({ type: 'route_vehicle', vehicle_id: vehicleId, path });
                            setRouteLoadingVehicleId(null);
                            clearRoutePoll();
                            return;
                        }
                    }
                } catch {
                    /* ignore until max attempts */
                }
                if (attempts >= ROUTE_POLL_MAX) {
                    clearRoutePoll();
                    setRouteLoadingVehicleId(null);
                    setLastAction({
                        type: 'answer_text',
                        text: 'Route calculation timed out — try again in a moment.',
                    });
                    scheduleAutoMessageClear();
                }
            };
            void tick();
            routePollRef.current = window.setInterval(() => {
                void tick();
            }, ROUTE_POLL_MS);
        },
        [clearRoutePoll, scheduleAutoMessageClear]
    );

    useEffect(() => {
        return () => {
            clearAutoMessageTimer();
            clearRoutePoll();
        };
    }, [clearAutoMessageTimer, clearRoutePoll]);

    const submitQuery = useCallback(
        async (query: string): Promise<void> => {
            const trimmed = query.trim();
            const lower = trimmed.toLowerCase();
            if (trimmed.length === 0) return;
            if (trimmed.length < 3) return;

            if (
                lower === 'reset' ||
                lower === 'clear' ||
                lower === 'show all' ||
                lower === 'show everything'
            ) {
                clearAutoMessageTimer();
                clearRoutePoll();
                setRouteLoadingVehicleId(null);
                setLastAction({ type: 'clear_filters' });
                pushHistory(trimmed, { type: 'clear_filters' });
                return;
            }

            if (!isAvailable) return;

            const vehicleSummary = buildFleetVehicleSummary(vehiclesRef.current);
            const system = buildFleetAiSystemPrompt(vehicleSummary);

            setIsLoading(true);
            clearAutoMessageTimer();
            clearRoutePoll();
            setRouteLoadingVehicleId(null);

            try {
                const res = await fetchWithTimeout(
                    OLLAMA_CHAT_URL,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: FLEET_AI_MODEL,
                            messages: [
                                { role: 'system', content: system },
                                { role: 'user', content: trimmed },
                            ],
                            format: 'json',
                            stream: false,
                        }),
                    },
                    FETCH_TIMEOUT_MS
                );

                if (!res.ok) {
                    setLastAction(MALFORMED_HTTP);
                    scheduleAutoMessageClear();
                    pushHistory(trimmed, MALFORMED_HTTP);
                    return;
                }

                const data: unknown = await res.json();
                const content = extractChatContent(data);
                if (content == null) {
                    setLastAction(MALFORMED_HTTP);
                    scheduleAutoMessageClear();
                    pushHistory(trimmed, MALFORMED_HTTP);
                    return;
                }

                const action = parseFleetAiFromModelContent(content);
                if (action.type === 'route_vehicle') {
                    const v = vehiclesRef.current.find((x) => x.vehicle_id === action.vehicle_id);
                    if (!v) {
                        const unknown: FleetAiAction = {
                            type: 'answer_text',
                            text: `Unknown vehicle id: ${action.vehicle_id}`,
                        };
                        setLastAction(unknown);
                        scheduleAutoMessageClear();
                        pushHistory(trimmed, unknown);
                        return;
                    }
                    setLastAction({ type: 'route_vehicle', vehicle_id: action.vehicle_id });
                    setRouteLoadingVehicleId(action.vehicle_id);
                    pushHistory(trimmed, { type: 'route_vehicle', vehicle_id: action.vehicle_id });
                    try {
                        const base = GATEWAY_BASE_URL.replace(/\/$/, '');
                        const post = await fetch(`${base}/api/routes/calculate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                vehicleId: action.vehicle_id,
                                currentLat: v.latitude,
                                currentLong: v.longitude,
                            }),
                        });
                        if (!post.ok) {
                            setRouteLoadingVehicleId(null);
                            setLastAction({
                                type: 'answer_text',
                                text: 'Could not request route for that vehicle.',
                            });
                            scheduleAutoMessageClear();
                            return;
                        }
                    } catch {
                        setRouteLoadingVehicleId(null);
                        setLastAction({
                            type: 'answer_text',
                            text: 'Connection error — check that the gateway is running.',
                        });
                        scheduleAutoMessageClear();
                        return;
                    }
                    startRoutePolling(action.vehicle_id);
                    return;
                }

                if (action.type === 'clear_filters') {
                    clearAutoMessageTimer();
                    clearRoutePoll();
                    setRouteLoadingVehicleId(null);
                    setLastAction(action);
                    pushHistory(trimmed, action);
                    return;
                }

                clearRoutePoll();
                setRouteLoadingVehicleId(null);
                setLastAction(action);
                pushHistory(trimmed, action);
                if (action.type === 'answer_text' || action.type === 'show_stat') {
                    scheduleAutoMessageClear();
                }
            } catch (e) {
                let errAct: FleetAiAction = MALFORMED_HTTP;
                if (isAbortTimeout(e)) {
                    errAct = {
                        type: 'answer_text',
                        text: 'Query timed out — the model may still be loading. Try again in a moment.',
                    };
                } else if (isNetworkError(e)) {
                    errAct = {
                        type: 'answer_text',
                        text: 'Connection error — check that the gateway is running.',
                    };
                }
                setLastAction(errAct);
                scheduleAutoMessageClear();
                pushHistory(trimmed, errAct);
            } finally {
                setIsLoading(false);
            }
        },
        [
            isAvailable,
            pushHistory,
            clearRoutePoll,
            clearAutoMessageTimer,
            scheduleAutoMessageClear,
            startRoutePolling,
        ]
    );

    return {
        isAvailable,
        isChecking,
        lastAction,
        routeLoadingVehicleId,
        clearAction,
        dismissAutoMessage,
        submitQuery,
        isLoading,
        history,
    };
}
