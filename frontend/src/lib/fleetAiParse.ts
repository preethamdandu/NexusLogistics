import type { FleetAiAction } from '@/lib/fleetAiTypes';
import { FLEET_AI_PARSE_FALLBACK } from '@/lib/fleetAiTypes';
import type { VehicleKind } from '@/lib/vehicleTypes';

export function stripMarkdownJsonFences(raw: string): string {
    let s = raw.trim();
    const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;
    const m = s.match(fence);
    if (m?.[1]) {
        s = m[1].trim();
    }
    return s;
}

function isVehicleKind(x: string): x is VehicleKind {
    return x === 'truck' || x === 'bus' || x === 'aircraft';
}

function asFiniteNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function normalizeTypes(raw: unknown): VehicleKind[] | null {
    if (!Array.isArray(raw)) return null;
    const out: VehicleKind[] = [];
    for (const item of raw) {
        if (typeof item !== 'string') return null;
        const t = item.toLowerCase();
        if (!isVehicleKind(t)) return null;
        if (!out.includes(t)) out.push(t);
    }
    return out.length > 0 ? out : null;
}

function normalizeVehicleIds(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== 'string' || item.trim() === '') return null;
        if (!out.includes(item)) out.push(item);
    }
    return out.length > 0 ? out : null;
}

/**
 * Parses model JSON into a FleetAiAction. Returns fallback on invalid shape.
 */
export function parseFleetAiAction(raw: unknown): FleetAiAction {
    if (!raw || typeof raw !== 'object') return FLEET_AI_PARSE_FALLBACK;
    const o = raw as Record<string, unknown>;
    const type = o.type;
    if (typeof type !== 'string') return FLEET_AI_PARSE_FALLBACK;

    switch (type) {
        case 'answer_text': {
            const text = typeof o.text === 'string' ? o.text.trim() : '';
            if (!text) return FLEET_AI_PARSE_FALLBACK;
            return { type: 'answer_text', text };
        }
        case 'show_stat': {
            const text = typeof o.text === 'string' ? o.text.trim() : '';
            if (!text) return FLEET_AI_PARSE_FALLBACK;
            return { type: 'show_stat', text };
        }
        case 'highlight_vehicles': {
            const ids = normalizeVehicleIds(o.vehicle_ids);
            if (!ids) return FLEET_AI_PARSE_FALLBACK;
            return { type: 'highlight_vehicles', vehicle_ids: ids };
        }
        case 'filter_by_type': {
            const types = normalizeTypes(o.types);
            if (!types) return FLEET_AI_PARSE_FALLBACK;
            return { type: 'filter_by_type', types };
        }
        case 'filter_by_speed': {
            const minK = asFiniteNumber(o.min_kmh);
            const maxK = asFiniteNumber(o.max_kmh);
            if (minK == null || maxK == null || minK > maxK) return FLEET_AI_PARSE_FALLBACK;
            return { type: 'filter_by_speed', min_kmh: minK, max_kmh: maxK };
        }
        case 'zoom_to': {
            const lat = asFiniteNumber(o.lat);
            const lng = asFiniteNumber(o.lng);
            if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return FLEET_AI_PARSE_FALLBACK;
            }
            const zoom = asFiniteNumber(o.zoom);
            const z =
                zoom != null && zoom >= 1 && zoom <= 18
                    ? Math.round(zoom)
                    : undefined;
            return { type: 'zoom_to', lat, lng, zoom: z };
        }
        case 'route_vehicle': {
            const vehicle_id = typeof o.vehicle_id === 'string' ? o.vehicle_id.trim() : '';
            if (!vehicle_id) return FLEET_AI_PARSE_FALLBACK;
            return { type: 'route_vehicle', vehicle_id };
        }
        case 'clear_filters':
            return { type: 'clear_filters' };
        default:
            return FLEET_AI_PARSE_FALLBACK;
    }
}

export function parseFleetAiFromModelContent(content: string): FleetAiAction {
    const stripped = stripMarkdownJsonFences(content);
    try {
        const parsed: unknown = JSON.parse(stripped);
        return parseFleetAiAction(parsed);
    } catch {
        return FLEET_AI_PARSE_FALLBACK;
    }
}
