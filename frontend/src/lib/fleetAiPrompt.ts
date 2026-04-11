import type { LiveMapVehicle } from '@/lib/useLiveVehicleStream';
import { speedKmhBetweenSamples } from '@/lib/vehicleTypes';

const MAX_VEHICLES_IN_PROMPT = 30;

function vehicleSpeedKmh(v: LiveMapVehicle): number | null {
    if (
        v.previousLatitude == null ||
        v.previousLongitude == null ||
        v.previousTimestamp == null
    ) {
        return null;
    }
    return speedKmhBetweenSamples(
        v.previousLatitude,
        v.previousLongitude,
        v.previousTimestamp,
        v.latitude,
        v.longitude,
        v.timestamp
    );
}

export function buildFleetVehicleSummary(vehicles: LiveMapVehicle[]): string {
    const sorted = [...vehicles].sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id));
    const slice = sorted.slice(0, MAX_VEHICLES_IN_PROMPT);
    const lines = slice.map((v) => {
        const spd = vehicleSpeedKmh(v);
        const spdPart =
            spd != null && Number.isFinite(spd) ? `${spd.toFixed(1)} km/h` : 'speed unknown';
        return `- id: ${v.vehicle_id}, type: ${v.type}, current_speed: ${spdPart}, lat: ${v.latitude.toFixed(5)}, lng: ${v.longitude.toFixed(5)}`;
    });
    const omitted = vehicles.length > MAX_VEHICLES_IN_PROMPT;
    const header = omitted
        ? `Live fleet (${vehicles.length} vehicles; showing first ${MAX_VEHICLES_IN_PROMPT} by id):`
        : `Live fleet (${vehicles.length} vehicles):`;
    return `${header}\n${lines.join('\n')}`;
}

export function buildFleetAiSystemPrompt(vehicleSummary: string): string {
    return `You are a fleet command assistant for Nexus Logistics. You MUST respond with a single JSON object only (no prose, no markdown).

Known vehicle types: truck, bus, aircraft.

Actions (exact "type" values):
- answer_text: { "type": "answer_text", "text": string } — general Q&A about the fleet using the data below.
- show_stat: { "type": "show_stat", "text": string } — a short numeric or factual stat (one line).
- highlight_vehicles: { "type": "highlight_vehicles", "vehicle_ids": string[] } — emphasize these ids on the map (must exist in the list below when possible).
- filter_by_type: { "type": "filter_by_type", "types": ("truck"|"bus"|"aircraft")[] } — show only these types.
- filter_by_speed: { "type": "filter_by_speed", "min_kmh": number, "max_kmh": number } — highlight vehicles whose current_speed falls in [min_kmh, max_kmh]; use 0 for stopped/slow thresholds as appropriate.
- zoom_to: { "type": "zoom_to", "lat": number, "lng": number, "zoom": number } — zoom optional; default zoom 11 if unsure. Use real coordinates for cities (e.g. Seattle ~47.606, -122.332; San Francisco ~37.7749, -122.4194; New York ~40.7128, -74.006; Chicago ~41.878, -87.630).
- route_vehicle: { "type": "route_vehicle", "vehicle_id": string } — request a route from vehicle position to hub (only when user asks for routing/directions for one vehicle).
- clear_filters: { "type": "clear_filters" } — reset map filters/highlight.

Rules:
- Prefer structured actions (highlight, filter, zoom) when the user intent matches.
- Use only vehicle ids that appear in the live list when highlighting or routing.
- For "fastest/slowest/stopped" queries, use filter_by_speed or highlight_vehicles with ids inferred from speeds in the data (stopped ≈ under 5 km/h if speed known).
- JSON must be valid and match one of the shapes above.

${vehicleSummary}`;
}
