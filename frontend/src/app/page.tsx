'use client';

import { useQuery } from '@tanstack/react-query';
import { api, VehicleLocation } from '@/lib/api';
import MapComponent from '@/components/Map';
import { Activity, Radio, Truck, Plane, Bus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper component for Stat Cards (since we didn't init full shadcn components)
function StatCard({ title, value, icon: Icon, className }: any) {
  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium">{title}</h3>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="p-6 pt-0">
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['liveVehicles'],
    queryFn: async () => {
      try {
        // Use the live endpoint that includes real aircraft, buses, and trucks
        const { data } = await api.get<VehicleLocation[]>('/api/live/all');
        return data;
      } catch (e) {
        // Fallback to basic vehicles endpoint if live fails
        try {
          const { data } = await api.get<VehicleLocation[]>('/api/vehicles');
          return data;
        } catch {
          return [];
        }
      }
    },
    refetchInterval: 5000, // Refresh every 5 seconds for live data
  });

  return (
    <div className="flex min-h-screen flex-col bg-muted/10 p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Real-time fleet overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Active Vehicles" value={vehicles.length} icon={Truck} />
        <StatCard title="System Status" value="Healthy" icon={Activity} />
        <StatCard title="Updates / Sec" value="~1" icon={Radio} />
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 flex flex-col space-y-1.5">
            <h3 className="font-semibold leading-none tracking-tight">Live Map</h3>
            <p className="text-sm text-muted-foreground">Real-time position of fleet assets.</p>
          </div>
          <div className="p-6 pt-0">
            <MapComponent vehicles={vehicles} />
          </div>
        </div>
      </div>
    </div>
  );
}
