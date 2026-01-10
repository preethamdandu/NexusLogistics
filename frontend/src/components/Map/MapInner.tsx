'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { VehicleLocation } from '@/lib/api';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { Truck } from 'lucide-react';

// Custom Icon for Vehicle
const createVehicleIcon = () => {
    const iconMarkup = renderToStaticMarkup(
        <div className="bg-primary text-primary-foreground p-1.5 rounded-full shadow-lg border-2 border-white">
            <Truck size={20} />
        </div>
    );

    return L.divIcon({
        html: iconMarkup,
        className: '', // Clear default class
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
    });
};

interface MapInnerProps {
    vehicles: VehicleLocation[];
}

export default function MapInner({ vehicles }: MapInnerProps) {
    const center: [number, number] = vehicles.length > 0
        ? [vehicles[0].latitude, vehicles[0].longitude]
        : [37.7749, -122.4194]; // Default SF

    return (
        <div className="h-[600px] w-full rounded-xl overflow-hidden border border-border shadow-sm">
            <MapContainer
                center={center}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {vehicles.map((v) => (
                    <Marker
                        key={v.vehicle_id}
                        position={[v.latitude, v.longitude]}
                        icon={createVehicleIcon()}
                    >
                        <Popup>
                            <div className="font-sans">
                                <h3 className="font-bold text-sm">Vehicle: {v.vehicle_id}</h3>
                                <p className="text-xs text-muted-foreground">
                                    Lat: {v.latitude.toFixed(4)}<br />
                                    Lng: {v.longitude.toFixed(4)}
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
