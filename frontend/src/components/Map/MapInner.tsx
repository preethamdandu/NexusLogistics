'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { VehicleLocation } from '@/lib/api';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { Truck, Bus, Plane } from 'lucide-react';

// Create icon based on vehicle type
const createVehicleIcon = (type: string) => {
    let IconComponent = Truck;
    let bgColor = 'bg-blue-600';  // truck

    if (type === 'bus') {
        IconComponent = Bus;
        bgColor = 'bg-green-600';
    } else if (type === 'aircraft') {
        IconComponent = Plane;
        bgColor = 'bg-purple-600';
    }

    const iconMarkup = renderToStaticMarkup(
        <div className={`${bgColor} text-white p-1.5 rounded-full border-2 border-white`}>
            <IconComponent size={18} />
        </div>
    );

    return L.divIcon({
        html: iconMarkup,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
    });
};

interface MapInnerProps {
    vehicles: VehicleLocation[];
}

export default function MapInner({ vehicles }: MapInnerProps) {
    // Center on Continental US
    const center: [number, number] = [39.8283, -98.5795];

    return (
        <div className="relative h-[600px] w-full overflow-hidden rounded-xl border border-border">
            {/* Legend */}
            <div className="absolute right-4 top-4 z-[1000] rounded-lg border border-border bg-background/95 p-3 text-xs backdrop-blur-sm dark:bg-card/95">
                <div className="mb-2 font-bold text-foreground">Vehicle types</div>
                <div className="mb-1 flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-blue-600" />
                    <span className="text-muted-foreground">
                        Trucks ({vehicles.filter((v) => v.type === 'truck' || !v.type).length})
                    </span>
                </div>
                <div className="mb-1 flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-green-600" />
                    <span className="text-muted-foreground">
                        Buses ({vehicles.filter((v) => v.type === 'bus').length})
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-purple-600" />
                    <span className="text-muted-foreground">
                        Aircraft ({vehicles.filter((v) => v.type === 'aircraft').length})
                    </span>
                </div>
            </div>

            <MapContainer
                center={center}
                zoom={4}
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
                        icon={createVehicleIcon(v.type || 'truck')}
                    >
                        <Popup>
                            <div className="font-sans">
                                <h3 className="font-bold text-sm capitalize">
                                    {v.type || 'Truck'}: {v.vehicle_id}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Lat: {v.latitude.toFixed(4)}<br />
                                    Lng: {v.longitude.toFixed(4)}
                                    {v.callsign && <><br />Callsign: {v.callsign}</>}
                                    {v.altitude && <><br />Altitude: {Math.round(v.altitude)}m</>}
                                    {v.route && <><br />Route: {v.route}</>}
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
