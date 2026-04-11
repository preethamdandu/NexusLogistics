'use client';

import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useCallback, useEffect, useRef } from 'react';
import type { FleetAiAction } from '@/lib/fleetAiTypes';
import { computeFleetVisual } from '@/lib/mapFleetVisual';
import type { LiveMapVehicle } from '@/lib/useLiveVehicleStream';
import {
    bearingDegrees,
    haversineMeters,
    markerColorCssVar,
    speedStatusCssVar,
    trailColorCssVar,
} from '@/lib/vehicleTypes';

const ANIM_MS = 1500;
const MIN_MOVE_M = 2;

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildMarkerHtml(
    vehicle: LiveMapVehicle,
    bearingDeg: number,
    fleetStyle: 'normal' | 'highlight' | 'dim'
): string {
    const colorVar = markerColorCssVar(vehicle.type);
    const speedVar = speedStatusCssVar(
        vehicle.previousLatitude,
        vehicle.previousLongitude,
        vehicle.previousTimestamp,
        vehicle.latitude,
        vehicle.longitude,
        vehicle.timestamp
    );
    const dimCls = fleetStyle === 'dim' ? ' vehicle-marker-root--dim' : '';
    const hlCls = fleetStyle === 'highlight' ? ' vehicle-marker-root--hl' : '';
    const ringHl = fleetStyle === 'highlight' ? ' vehicle-marker-ring--hl' : '';
    const glow =
        fleetStyle === 'highlight'
            ? `0 0 16px color-mix(in srgb, ${colorVar} 65%, transparent)`
            : `0 0 14px ${speedVar}`;
    return `
<div class="vehicle-marker-root${dimCls}${hlCls}" style="transform:rotate(${bearingDeg.toFixed(1)}deg);box-shadow:${glow}">
  <div class="vehicle-marker-ring-pulse ${ringHl}" style="--vm-color:${colorVar}"></div>
  <div class="vehicle-marker-dot" style="--vm-color:${colorVar}"></div>
</div>`.trim();
}

function createDivIcon(html: string): L.DivIcon {
    return L.divIcon({
        html,
        className: 'vehicle-marker-leaflet',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -14],
    });
}

function createSpeedLabelIcon(kmh: number): L.DivIcon {
    const text = `${Math.round(kmh)} km/h`;
    return L.divIcon({
        html: `<div class="cc-mono" style="font-size:10px;font-weight:600;color:#00ffc8;text-shadow:0 1px 3px #000">${escapeHtml(text)}</div>`,
        className: 'vehicle-marker-leaflet',
        iconSize: [56, 18],
        iconAnchor: [28, 22],
    });
}

function createRouteLoadingIcon(): L.DivIcon {
    return L.divIcon({
        html: '<div class="fleet-route-loading-dot" style="--cc-accent-primary:#00ffc8"></div>',
        className: 'vehicle-marker-leaflet',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

function animateMarkerLatLng(
    marker: L.Marker,
    from: L.LatLngTuple,
    to: L.LatLngTuple,
    durationMs: number,
    onDone?: () => void
): () => void {
    const start = performance.now();
    let raf = 0;
    const step = (now: number): void => {
        const t = Math.min((now - start) / durationMs, 1);
        const lat = from[0] + (to[0] - from[0]) * t;
        const lng = from[1] + (to[1] - from[1]) * t;
        marker.setLatLng([lat, lng]);
        if (t < 1) {
            raf = requestAnimationFrame(step);
        } else {
            onDone?.();
        }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
}

function bindPopup(marker: L.Marker, vehicle: LiveMapVehicle): void {
    const lines: string[] = [
        `<h3 class="cc-mono text-xs font-bold capitalize" style="color:var(--cc-text-primary)">${escapeHtml(vehicle.type)}: ${escapeHtml(vehicle.vehicle_id)}</h3>`,
        `<p class="cc-mono text-[11px]" style="color:var(--cc-text-secondary)">Lat: ${vehicle.latitude.toFixed(4)}<br/>Lng: ${vehicle.longitude.toFixed(4)}</p>`,
    ];
    if (vehicle.callsign) {
        lines.push(
            `<p class="cc-mono text-[11px]" style="color:var(--cc-text-secondary)">Callsign: ${escapeHtml(vehicle.callsign)}</p>`
        );
    }
    if (vehicle.altitude != null) {
        lines.push(
            `<p class="cc-mono text-[11px]" style="color:var(--cc-text-secondary)">Altitude: ${Math.round(vehicle.altitude)}m</p>`
        );
    }
    if (vehicle.route) {
        lines.push(
            `<p class="cc-mono text-[11px]" style="color:var(--cc-text-secondary)">Route: ${escapeHtml(vehicle.route)}</p>`
        );
    }
    marker.bindPopup(`<div>${lines.join('')}</div>`);
}

function rebuildTrailLayer(
    group: L.LayerGroup,
    trail: [number, number][],
    colorCss: string,
    minSseUpdates: number
): void {
    group.clearLayers();
    if (trail.length < 2 || minSseUpdates < 2) return;
    const maxI = trail.length - 2;
    for (let i = 0; i <= maxI; i++) {
        const headT = maxI <= 0 ? 1 : i / maxI;
        const opacity = 0.1 + headT * 0.7;
        L.polyline([trail[i], trail[i + 1]], {
            color: colorCss,
            opacity,
            weight: 2,
            interactive: false,
        }).addTo(group);
    }
}

function triggerPulse(marker: L.Marker): void {
    const el = marker.getElement()?.querySelector('.vehicle-marker-dot');
    if (!el || !(el instanceof HTMLElement)) return;
    el.classList.remove('vehicle-marker-pulse');
    void el.offsetWidth;
    el.classList.add('vehicle-marker-pulse');
    window.setTimeout(() => {
        el.classList.remove('vehicle-marker-pulse');
    }, 340);
}

interface VehicleLayerProps {
    vehicles: LiveMapVehicle[];
    fleetAction: FleetAiAction | null;
    routeLoadingVehicleId: string | null;
}

type MarkerEntry = {
    marker: L.Marker;
    trailGroup: L.LayerGroup;
    cancelAnim: (() => void) | null;
    lastRenderedKey: string;
};

function makeVehicleRenderKey(v: LiveMapVehicle): string {
    return `${v.latitude.toFixed(6)}|${v.longitude.toFixed(6)}|${v.timestamp}|${v.type}|${v.sseUpdateCount}`;
}

function fleetStyleKey(f: FleetAiAction | null): string {
    if (f == null) return 'x';
    if (f.type === 'clear_filters') return 'x';
    if (f.type === 'route_vehicle') {
        return `route:${f.vehicle_id}:${f.path?.length ?? 0}`;
    }
    return JSON.stringify(f);
}

export default function VehicleLayer({
    vehicles,
    fleetAction,
    routeLoadingVehicleId,
}: VehicleLayerProps) {
    const map = useMap();
    const entriesRef = useRef(new Map<string, MarkerEntry>());
    const labelMarkersRef = useRef(new Map<string, L.Marker>());
    const routeLoadMarkerRef = useRef<L.Marker | null>(null);
    const vehiclesRef = useRef(vehicles);

    useEffect(() => {
        vehiclesRef.current = vehicles;
    }, [vehicles]);

    useEffect(() => {
        const mapInst = map;
        const entriesMapRef = entriesRef;
        const labelSnapshot = labelMarkersRef;
        return () => {
            const entriesSnapshot = entriesMapRef.current;
            for (const [, entry] of entriesSnapshot) {
                if (entry.cancelAnim) entry.cancelAnim();
                if (mapInst.hasLayer(entry.trailGroup)) mapInst.removeLayer(entry.trailGroup);
                if (mapInst.hasLayer(entry.marker)) mapInst.removeLayer(entry.marker);
            }
            entriesSnapshot.clear();
            const labels = labelSnapshot.current;
            for (const [, m] of labels) {
                if (mapInst.hasLayer(m)) mapInst.removeLayer(m);
            }
            labels.clear();
            if (routeLoadMarkerRef.current && mapInst.hasLayer(routeLoadMarkerRef.current)) {
                mapInst.removeLayer(routeLoadMarkerRef.current);
            }
            routeLoadMarkerRef.current = null;
        };
    }, [map]);

    const applyMarkerUpdate = useCallback((vehicle: LiveMapVehicle, entry: MarkerEntry, style: 'normal' | 'highlight' | 'dim'): void => {
        let bearing = 0;
        if (
            vehicle.previousLatitude != null &&
            vehicle.previousLongitude != null &&
            haversineMeters(
                vehicle.previousLatitude,
                vehicle.previousLongitude,
                vehicle.latitude,
                vehicle.longitude
            ) >= MIN_MOVE_M
        ) {
            bearing = bearingDegrees(
                vehicle.previousLatitude,
                vehicle.previousLongitude,
                vehicle.latitude,
                vehicle.longitude
            );
        }
        const html = buildMarkerHtml(vehicle, bearing, style);
        entry.marker.setIcon(createDivIcon(html));
        bindPopup(entry.marker, vehicle);

        const from: L.LatLngTuple | null =
            vehicle.previousLatitude != null &&
            vehicle.previousLongitude != null &&
            haversineMeters(
                vehicle.previousLatitude,
                vehicle.previousLongitude,
                vehicle.latitude,
                vehicle.longitude
            ) >= MIN_MOVE_M
                ? [vehicle.previousLatitude, vehicle.previousLongitude]
                : null;
        const to: L.LatLngTuple = [vehicle.latitude, vehicle.longitude];

        if (entry.cancelAnim) {
            entry.cancelAnim();
            entry.cancelAnim = null;
        }

        if (from != null) {
            entry.marker.setLatLng(from);
            entry.cancelAnim = animateMarkerLatLng(entry.marker, from, to, ANIM_MS, () => {
                entry.cancelAnim = null;
            });
        } else {
            entry.marker.setLatLng(to);
        }

    }, []);

    useEffect(() => {
        const mapInst = map;
        const entries = entriesRef.current;
        const labelMarkers = labelMarkersRef.current;
        const seen = new Set<string>();

        const effectiveAction: FleetAiAction | null =
            fleetAction?.type === 'clear_filters' ? null : fleetAction;

        for (const vehicle of vehicles) {
            const vis = computeFleetVisual(effectiveAction, vehicle);
            if (vis.style === 'hidden') {
                const existing = entries.get(vehicle.vehicle_id);
                if (existing) {
                    if (existing.cancelAnim) existing.cancelAnim();
                    if (mapInst.hasLayer(existing.trailGroup)) mapInst.removeLayer(existing.trailGroup);
                    if (mapInst.hasLayer(existing.marker)) mapInst.removeLayer(existing.marker);
                    entries.delete(vehicle.vehicle_id);
                }
                const lm = labelMarkers.get(vehicle.vehicle_id);
                if (lm) {
                    if (mapInst.hasLayer(lm)) mapInst.removeLayer(lm);
                    labelMarkers.delete(vehicle.vehicle_id);
                }
                continue;
            }

            const markerStyle: 'normal' | 'highlight' | 'dim' =
                vis.style === 'highlight' ? 'highlight' : vis.style === 'dim' ? 'dim' : 'normal';

            seen.add(vehicle.vehicle_id);
            const key = `${makeVehicleRenderKey(vehicle)}|${markerStyle}|${fleetStyleKey(effectiveAction)}`;
            let entry = entries.get(vehicle.vehicle_id);

            if (!entry) {
                const trailGroup = L.layerGroup().addTo(mapInst);
                const marker = L.marker([vehicle.latitude, vehicle.longitude], {
                    icon: createDivIcon(buildMarkerHtml(vehicle, 0, markerStyle)),
                }).addTo(mapInst);

                const vid = vehicle.vehicle_id;
                marker.on('click', () => {
                    const v = vehiclesRef.current.find((x) => x.vehicle_id === vid);
                    if (!v) return;
                    const center = mapInst.getCenter();
                    const zoom = mapInst.getZoom();
                    const dist = mapInst.distance(center, [v.latitude, v.longitude]);
                    if (zoom >= 12 && dist < 5000) {
                        const list = vehiclesRef.current;
                        if (list.length === 0) return;
                        const bounds = L.latLngBounds(
                            list.map((x) => [x.latitude, x.longitude] as L.LatLngTuple)
                        );
                        mapInst.fitBounds(bounds, { padding: [40, 40] });
                    } else {
                        mapInst.flyTo([v.latitude, v.longitude], 12, { duration: 1.5 });
                    }
                });

                entry = { marker, trailGroup, cancelAnim: null, lastRenderedKey: key };
                entries.set(vid, entry);
                bindPopup(marker, vehicle);
                rebuildTrailLayer(
                    trailGroup,
                    vis.showTrail ? vehicle.trail : [],
                    trailColorCssVar(vehicle.type),
                    vis.showTrail ? vehicle.sseUpdateCount : 0
                );
                if (vehicle.sseUpdateCount > 0) {
                    triggerPulse(marker);
                }
                continue;
            }

            if (entry.lastRenderedKey !== key) {
                applyMarkerUpdate(vehicle, entry, markerStyle);
                rebuildTrailLayer(
                    entry.trailGroup,
                    vis.showTrail ? vehicle.trail : [],
                    trailColorCssVar(vehicle.type),
                    vis.showTrail ? vehicle.sseUpdateCount : 0
                );
                entry.lastRenderedKey = key;
                if (vehicle.sseUpdateCount > 0) {
                    triggerPulse(entry.marker);
                }
            }

            if (vis.speedLabelKmh != null) {
                let lm = labelMarkers.get(vehicle.vehicle_id);
                if (!lm) {
                    lm = L.marker([vehicle.latitude, vehicle.longitude], {
                        icon: createSpeedLabelIcon(vis.speedLabelKmh),
                        interactive: false,
                    }).addTo(mapInst);
                    labelMarkers.set(vehicle.vehicle_id, lm);
                } else {
                    lm.setLatLng([vehicle.latitude, vehicle.longitude]);
                    lm.setIcon(createSpeedLabelIcon(vis.speedLabelKmh));
                }
            } else {
                const lm = labelMarkers.get(vehicle.vehicle_id);
                if (lm) {
                    if (mapInst.hasLayer(lm)) mapInst.removeLayer(lm);
                    labelMarkers.delete(vehicle.vehicle_id);
                }
            }
        }

        for (const [id, entry] of entries) {
            if (!seen.has(id)) {
                if (entry.cancelAnim) entry.cancelAnim();
                if (mapInst.hasLayer(entry.trailGroup)) mapInst.removeLayer(entry.trailGroup);
                if (mapInst.hasLayer(entry.marker)) mapInst.removeLayer(entry.marker);
                entries.delete(id);
            }
        }

        for (const [id, lm] of labelMarkers) {
            if (!seen.has(id)) {
                if (mapInst.hasLayer(lm)) mapInst.removeLayer(lm);
                labelMarkers.delete(id);
            }
        }

        if (routeLoadMarkerRef.current && routeLoadingVehicleId) {
            const rv = vehicles.find((x) => x.vehicle_id === routeLoadingVehicleId);
            if (rv) {
                routeLoadMarkerRef.current.setLatLng([rv.latitude, rv.longitude]);
            }
        }
    }, [map, vehicles, fleetAction, applyMarkerUpdate, routeLoadingVehicleId]);

    useEffect(() => {
        const mapInst = map;
        const rid = routeLoadingVehicleId;
        if (routeLoadMarkerRef.current) {
            if (mapInst.hasLayer(routeLoadMarkerRef.current)) mapInst.removeLayer(routeLoadMarkerRef.current);
            routeLoadMarkerRef.current = null;
        }
        if (rid == null) return;
        const v = vehicles.find((x) => x.vehicle_id === rid);
        if (!v) return;
        const m = L.marker([v.latitude, v.longitude], {
            icon: createRouteLoadingIcon(),
            interactive: false,
            zIndexOffset: 500,
        }).addTo(mapInst);
        routeLoadMarkerRef.current = m;
        return () => {
            if (routeLoadMarkerRef.current && mapInst.hasLayer(routeLoadMarkerRef.current)) {
                mapInst.removeLayer(routeLoadMarkerRef.current);
            }
            routeLoadMarkerRef.current = null;
        };
    }, [map, routeLoadingVehicleId, vehicles]);

    return null;
}

