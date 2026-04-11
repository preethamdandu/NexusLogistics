export type VehicleKind = 'truck' | 'bus' | 'aircraft';

export function normalizeVehicleKind(
    v: Partial<{ type?: string; vehicle_type?: string }> | null | undefined
): VehicleKind {
    const raw = String(v?.vehicle_type ?? v?.type ?? 'truck').toLowerCase();
    if (raw === 'bus') return 'bus';
    if (raw === 'aircraft') return 'aircraft';
    return 'truck';
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
}

/** Ground speed in km/h from two samples; null if delta time is unusable. */
export function speedKmhBetweenSamples(
    lat1: number,
    lon1: number,
    t1Sec: number,
    lat2: number,
    lon2: number,
    t2Sec: number
): number | null {
    const dt = Math.abs(t2Sec - t1Sec);
    if (dt < 1e-3) return null;
    const m = haversineMeters(lat1, lon1, lat2, lon2);
    const km = m / 1000;
    const hours = dt / 3600;
    return km / hours;
}

/** Initial bearing from point 1 to point 2 in degrees (0 = north, clockwise). */
export function markerColorCssVar(kind: VehicleKind): string {
    switch (kind) {
        case 'bus':
            return 'var(--cc-bus-color)';
        case 'aircraft':
            return 'var(--cc-aircraft-color)';
        default:
            return 'var(--cc-truck-color)';
    }
}

export function trailColorCssVar(kind: VehicleKind): string {
    switch (kind) {
        case 'bus':
            return 'var(--cc-bus-trail)';
        case 'aircraft':
            return 'var(--cc-aircraft-trail)';
        default:
            return 'var(--cc-truck-trail)';
    }
}

/** CSS variable for speed ring / glow (command center tokens). */
export function speedStatusCssVar(
    previousLatitude: number | null | undefined,
    previousLongitude: number | null | undefined,
    previousTimestamp: number | null | undefined,
    latitude: number,
    longitude: number,
    timestamp: number
): string {
    if (
        previousLatitude == null ||
        previousLongitude == null ||
        previousTimestamp == null
    ) {
        return 'var(--cc-speed-unknown)';
    }
    const spd = speedKmhBetweenSamples(
        previousLatitude,
        previousLongitude,
        previousTimestamp,
        latitude,
        longitude,
        timestamp
    );
    if (spd == null) return 'var(--cc-speed-unknown)';
    if (spd > 30) return 'var(--cc-speed-ok)';
    if (spd >= 5) return 'var(--cc-speed-slow)';
    return 'var(--cc-speed-stop)';
}

export function bearingDegrees(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
        Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return ((θ * 180) / Math.PI + 360) % 360;
}
