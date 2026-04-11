import axios from 'axios';

/** Browser + server: gateway root (Compose default `NEXT_PUBLIC_API_URL=http://localhost:80`). */
export const GATEWAY_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

export const api = axios.create({
    baseURL: GATEWAY_BASE_URL,
});

export interface VehicleLocation {
    vehicle_id: string;
    latitude: number;
    longitude: number;
    timestamp: number;
    type?: 'truck' | 'bus' | 'aircraft';
    /** Present on Kafka / SSE payloads; normalized to `type` in the live map hook. */
    vehicle_type?: string;
    callsign?: string;
    altitude?: number;
    route?: string;
    city?: string;
}

/** Accept any HTTP status so we can branch on status without axios throwing. */
const alwaysResolveStatus = () => true;

/**
 * Loads combined live vehicles from the gateway. If GET /api/live/aircraft is not 200,
 * aircraft entries are stripped from the /live/all payload so the map stays honest
 * (trucks, buses, Redis-backed vehicles remain).
 */
export async function fetchDashboardLiveVehicles(): Promise<{
    vehicles: VehicleLocation[];
    aircraftFeedUnavailable: boolean;
}> {
    const [aircraftProbe, allResponse] = await Promise.all([
        api.get<unknown>('/api/live/aircraft', { validateStatus: alwaysResolveStatus }),
        api.get<VehicleLocation[]>('/api/live/all'),
    ]);

    const aircraftFeedUnavailable = aircraftProbe.status !== 200;
    let vehicles = allResponse.data;

    if (aircraftFeedUnavailable) {
        vehicles = vehicles.filter((v) => v.type !== 'aircraft');
    }

    return { vehicles, aircraftFeedUnavailable };
}

export const fetchVehicleLocation = async (vehicleId: string): Promise<VehicleLocation> => {
    const { data } = await api.get<VehicleLocation>(`/api/tracking/${vehicleId}`);
    return data;
};
