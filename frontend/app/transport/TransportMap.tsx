"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAP_BOUNDS, type Trip, type TripStatus } from "./sample-data";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;

export const PIN_COLOR: Record<TripStatus, string> = {
  assigned: "#6b7280",
  to_pickup: "#2563eb",
  loaded: "#4f46e5",
  in_transit: "#d97706",
  delivered: "#16a34a",
  offline: "#dc2626",
};

function Placeholder({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function markerInnerHtml(trip: Trip, selected: boolean): string {
  return `
    ${
      trip.status === "in_transit"
        ? `<span class="absolute inset-0 -z-10 animate-ping rounded-full opacity-40" style="background:${PIN_COLOR[trip.status]}"></span>`
        : ""
    }
    <span class="block rounded-full border-2 border-white shadow transition-transform ${selected ? "h-5 w-5 scale-110" : "h-3.5 w-3.5 group-hover:scale-125"}" style="background:${PIN_COLOR[trip.status]}"></span>
    <span class="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-white px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}">${trip.driver}</span>
  `;
}

function markerElement(trip: Trip, selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "group relative";
  el.innerHTML = markerInnerHtml(trip, selected);
  return el;
}

// Only the selected vehicle's route is fetched and drawn — multiple
// Directions calls at once (one per visible vehicle) would be slower and
// busier on screen than the detail panel already showing one trip at a time
// calls for.
async function fetchDrivingRoute(
  from: [number, number],
  to: [number, number],
  signal: AbortSignal
): Promise<[number, number][] | null> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.routes?.[0]?.geometry?.coordinates ?? null;
  } catch {
    return null;
  }
}

export default function TransportMap({
  trips,
  selectedId,
  onSelect,
}: {
  trips: Trip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // Mutable so a marker's click handler (attached once, on creation) always
  // calls the latest onSelect without the map being torn down and rebuilt
  // whenever the parent passes a new function reference.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds: [
        [MAP_BOUNDS.west, MAP_BOUNDS.south],
        [MAP_BOUNDS.east, MAP_BOUNDS.north],
      ],
      maxBounds: [
        [MAP_BOUNDS.west - 0.3, MAP_BOUNDS.south - 0.3],
        [MAP_BOUNDS.east + 0.3, MAP_BOUNDS.north + 0.3],
      ],
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("trip-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "trip-route-line",
        type: "line",
        source: "trip-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#111827", "line-width": 4, "line-opacity": 0.8 },
      });
    });

    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Keep one marker per trip in sync with the trips/selection props, instead
  // of tearing every marker down and recreating it on each render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const trip of trips) {
      seen.add(trip.id);
      const selected = trip.id === selectedId;
      const existing = markersRef.current.get(trip.id);
      if (existing) {
        // Update the marker's existing element in place — replacing the
        // element itself would leave the Marker instance holding a detached
        // reference, since it never re-reads which DOM node to position.
        existing.getElement().innerHTML = markerInnerHtml(trip, selected);
        existing.setLngLat([trip.lng, trip.lat]);
      } else {
        const el = markerElement(trip, selected);
        el.onclick = () => onSelectRef.current(trip.id);
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([trip.lng, trip.lat]).addTo(map);
        markersRef.current.set(trip.id, marker);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [trips, selectedId]);

  // Fetch and draw the selected vehicle's route to its destination, zooming
  // to street level so the road it's actually driving is legible.
  useEffect(() => {
    const map = mapRef.current;
    const selected = trips.find((t) => t.id === selectedId);
    if (!map || !selected) return;

    const controller = new AbortController();
    const from: [number, number] = [selected.lng, selected.lat];
    const to: [number, number] = [selected.to_lng, selected.to_lat];

    function draw(coordinates: [number, number][]) {
      const source = map!.getSource("trip-route") as mapboxgl.GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
      });
      const bounds = coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      map!.fitBounds(bounds, { padding: 72, duration: 500 });
    }

    async function run() {
      const coords = await fetchDrivingRoute(from, to, controller.signal);
      // fetchDrivingRoute swallows its own AbortError into null, so this is
      // the only thing that tells a cancelled (selection changed/unmounted)
      // request not to draw a now-stale route over whatever ran after it.
      if (controller.signal.aborted) return;
      draw(coords ?? [from, to]);
    }

    if (map.isStyleLoaded()) {
      run();
    } else {
      map.once("load", run);
    }

    return () => controller.abort();
  }, [trips, selectedId]);

  if (!MAPBOX_TOKEN) {
    return <Placeholder message="Map needs NEXT_PUBLIC_MAPBOX_TOKEN set in the frontend environment." />;
  }

  return <div ref={containerRef} className="h-full min-h-[420px] w-full overflow-hidden rounded-lg border border-gray-200" />;
}
