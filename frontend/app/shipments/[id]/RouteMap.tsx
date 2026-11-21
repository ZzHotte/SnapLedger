"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;

type Port = { name: string; lat: number; lng: number };

// A quadratic-bezier arc between the two points, bowed toward the north —
// a plain straight line reads as flat/lifeless for a shipping route, but a
// true great circle bulges all the way to the pole for a long, high-latitude
// pair (see the earlier fix) and isn't actually more accurate anyway, since
// this is a placeholder for the real sailing route. The bow is capped so it
// stays a gentle curve regardless of how long the route is.
function bowedArc(start: [number, number], end: [number, number], steps = 32): [number, number][] {
  const midLng = (start[0] + end[0]) / 2;
  const midLat = (start[1] + end[1]) / 2;
  const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const bow = Math.min(span * 0.12, 15);
  const controlLng = midLng;
  const controlLat = midLat + bow;

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const oneMinusT = 1 - t;
    points.push([
      oneMinusT * oneMinusT * start[0] + 2 * oneMinusT * t * controlLng + t * t * end[0],
      oneMinusT * oneMinusT * start[1] + 2 * oneMinusT * t * controlLat + t * t * end[1],
    ]);
  }
  return points;
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className="flex h-[360px] w-full items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function MapCanvas({ origin, destination }: { origin: Port; destination: Port }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      // Mercator rather than the default globe — the card is wide and short,
      // and a globe wastes most of that width showing ocean the route isn't on.
      projection: "mercator",
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // Go whichever way round the globe is shorter (e.g. Asia -> US East
      // Coast heads east across the Pacific, not west across Europe).
      let lngDelta = destination.lng - origin.lng;
      if (lngDelta > 180) lngDelta -= 360;
      if (lngDelta < -180) lngDelta += 360;
      const destLng = origin.lng + lngDelta;

      const line = bowedArc([origin.lng, origin.lat], [destLng, destination.lat]);

      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#111827", "line-width": 2, "line-dasharray": [0.1, 1.6] },
      });

      new mapboxgl.Marker({ color: "#16a34a" })
        .setLngLat([origin.lng, origin.lat])
        .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setText(origin.name))
        .addTo(map);
      new mapboxgl.Marker({ color: "#dc2626" })
        .setLngLat([destination.lng, destination.lat])
        .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setText(destination.name))
        .addTo(map);

      const bounds = line.reduce(
        (b, point) => b.extend(point),
        new mapboxgl.LngLatBounds(line[0], line[0])
      );
      map.fitBounds(bounds, { padding: 56, duration: 0 });
    });

    return () => map.remove();
  }, [origin, destination]);

  return <div ref={containerRef} className="h-[360px] w-full rounded-md" />;
}

export default function RouteMap({
  originName,
  destinationName,
  originLat,
  originLng,
  destinationLat,
  destinationLng,
}: {
  originName: string | null;
  destinationName: string | null;
  originLat: number | null;
  originLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
}) {
  if (!MAPBOX_TOKEN) {
    return <Placeholder message="Route map needs NEXT_PUBLIC_MAPBOX_TOKEN set in the frontend environment." />;
  }
  if (originLat == null || originLng == null || destinationLat == null || destinationLng == null) {
    return <Placeholder message="Route map unavailable — origin and/or destination port couldn't be located." />;
  }

  return (
    <MapCanvas
      origin={{ name: originName || "Origin", lat: originLat, lng: originLng }}
      destination={{ name: destinationName || "Destination", lat: destinationLat, lng: destinationLng }}
    />
  );
}
