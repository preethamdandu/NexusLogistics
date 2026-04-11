import type { VehicleKind } from '@/lib/vehicleTypes';

export const FLEET_AI_MODEL = 'gemma4:e2b' as const;

export type FleetAiAction =
    | { type: 'answer_text'; text: string }
    | { type: 'show_stat'; text: string }
    | { type: 'highlight_vehicles'; vehicle_ids: string[] }
    | { type: 'filter_by_type'; types: VehicleKind[] }
    | { type: 'filter_by_speed'; min_kmh: number; max_kmh: number }
    | { type: 'zoom_to'; lat: number; lng: number; zoom?: number }
    /** `path` is filled client-side after route status polling succeeds. */
    | { type: 'route_vehicle'; vehicle_id: string; path?: [number, number][] }
    | { type: 'clear_filters' };

export interface FleetAiHistoryEntry {
    query: string;
    action: FleetAiAction;
}

export const FLEET_AI_PARSE_FALLBACK: FleetAiAction = {
    type: 'answer_text',
    text: "I couldn't process that query. Try something like 'show me all trucks' or 'zoom to Chicago'.",
};
