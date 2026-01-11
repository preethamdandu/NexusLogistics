import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:80';

export const api = axios.create({
    baseURL: API_URL,
});

export interface VehicleLocation {
    vehicle_id: string;
    latitude: number;
    longitude: number;
    timestamp: number;
    type?: 'truck' | 'bus' | 'aircraft';
    callsign?: string;
    altitude?: number;
    route?: string;
}

export const fetchVehicleLocation = async (vehicleId: string): Promise<VehicleLocation> => {
    const { data } = await api.get<VehicleLocation>(`/api/tracking/${vehicleId}`);
    return data;
};

export const fetchAllLiveVehicles = async (): Promise<VehicleLocation[]> => {
    const { data } = await api.get<VehicleLocation[]>('/api/live/all');
    return data;
};
