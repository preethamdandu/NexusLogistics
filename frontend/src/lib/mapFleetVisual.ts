import type { FleetAiAction } from '@/lib/fleetAiTypes';
import type { LiveMapVehicle } from '@/lib/useLiveVehicleStream';
import { speedKmhBetweenSamples } from '@/lib/vehicleTypes';

export type MarkerFleetStyle = 'normal' | 'highlight' | 'dim' | 'hidden';

export interface PerVehicleFleetVisual {
    style: MarkerFleetStyle;
    showTrail: boolean;
    /** Shown next to marker for filter_by_speed when in range. */
    speedLabelKmh: number | null;
}

export function vehicleSpeedKmh(v: LiveMapVehicle): number | null {
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

export function computeFleetVisual(
    action: FleetAiAction | null,
    vehicle: LiveMapVehicle
): PerVehicleFleetVisual {
    const speed = vehicleSpeedKmh(vehicle);

    if (
        action == null ||
        action.type === 'clear_filters' ||
        action.type === 'answer_text' ||
        action.type === 'show_stat' ||
        action.type === 'zoom_to' ||
        action.type === 'route_vehicle'
    ) {
        return { style: 'normal', showTrail: true, speedLabelKmh: null };
    }

    if (action.type === 'filter_by_type') {
        if (!action.types.includes(vehicle.type)) {
            return { style: 'hidden', showTrail: false, speedLabelKmh: null };
        }
        return { style: 'normal', showTrail: true, speedLabelKmh: null };
    }

    if (action.type === 'highlight_vehicles') {
        const set = new Set(action.vehicle_ids);
        const match = set.has(vehicle.vehicle_id);
        return {
            style: match ? 'highlight' : 'dim',
            showTrail: match,
            speedLabelKmh: null,
        };
    }

    if (action.type === 'filter_by_speed') {
        if (speed == null) {
            return { style: 'dim', showTrail: false, speedLabelKmh: null };
        }
        const inRange = speed >= action.min_kmh && speed <= action.max_kmh;
        return {
            style: inRange ? 'highlight' : 'dim',
            showTrail: inRange,
            speedLabelKmh: inRange ? speed : null,
        };
    }

    return { style: 'normal', showTrail: true, speedLabelKmh: null };
}

export interface LegendCounts {
    truck: number;
    bus: number;
    aircraft: number;
    highlightTotal?: number;
}

export function computeLegendCounts(
    vehicles: LiveMapVehicle[],
    action: FleetAiAction | null
): LegendCounts {
    const countTypes = (list: LiveMapVehicle[]): LegendCounts => ({
        truck: list.filter((v) => v.type === 'truck').length,
        bus: list.filter((v) => v.type === 'bus').length,
        aircraft: list.filter((v) => v.type === 'aircraft').length,
    });

    if (
        action == null ||
        action.type === 'clear_filters' ||
        action.type === 'answer_text' ||
        action.type === 'show_stat' ||
        action.type === 'zoom_to' ||
        action.type === 'route_vehicle'
    ) {
        return countTypes(vehicles);
    }

    if (action.type === 'filter_by_type') {
        const filtered = vehicles.filter((v) => action.types.includes(v.type));
        return countTypes(filtered);
    }

    if (action.type === 'highlight_vehicles') {
        const set = new Set(action.vehicle_ids);
        const highlighted = vehicles.filter((v) => set.has(v.vehicle_id));
        return { ...countTypes(vehicles), highlightTotal: highlighted.length };
    }

    if (action.type === 'filter_by_speed') {
        return countTypes(vehicles);
    }

    return countTypes(vehicles);
}
