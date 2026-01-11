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
        <div className={`${bgColor} text-white p-1.5 rounded-full shadow-lg border-2 border-white`}>
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
    // Center on SF Bay Area
    const center: [number, number] = [37.7749, -122.3194];

    return (
        <div className="h-[600px] w-full rounded-xl overflow-hidden border border-border shadow-sm relative">
            {/* Legend */}
            <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs">
                <div className="font-bold mb-2 text-gray-900">Vehicle Types</div>
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full bg-blue-600"></div>
                    <span className="text-gray-700">Trucks ({vehicles.filter(v => v.type === 'truck' || !v.type).length})</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full bg-green-600"></div>
                    <span className="text-gray-700">Buses ({vehicles.filter(v => v.type === 'bus').length})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-purple-600"></div>
                    <span className="text-gray-700">Aircraft ({vehicles.filter(v => v.type === 'aircraft').length})</span>
                </div>
            </div>

            <MapContainer
                center={center}
                zoom={11}
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
                                <p className="text-xs text-gray-600">
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
