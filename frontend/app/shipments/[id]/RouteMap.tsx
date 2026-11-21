"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;

type Port = { name: string; lat: number; lng: number };

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
      // A near-antipodal port pair can still zoom out close to a world view
      // — repeated world copies at that zoom look like a rendering glitch,
      // so turn them off.
      renderWorldCopies: false,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // A straight line toward the port, going whichever way round the
      // globe is shorter (e.g. Asia -> US East Coast heads east across the
      // Pacific, not west across Europe). This is a placeholder for an
      // actual sailing route — the real shipping lane with transshipment
      // ports is a separate, later feature — so a plain direct line reads
      // more honestly than a geometrically "correct" great circle, which
      // bulges dramatically toward the pole for routes like this one and
      // looks like a routing bug rather than the straight line it's meant
      // to convey.
      let lngDelta = destination.lng - origin.lng;
      if (lngDelta > 180) lngDelta -= 360;
      if (lngDelta < -180) lngDelta += 360;
      const destLng = origin.lng + lngDelta;

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [origin.lng, origin.lat],
              [destLng, destination.lat],
            ],
          },
        },
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

      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(origin.lng, destLng), Math.min(origin.lat, destination.lat)],
        [Math.max(origin.lng, destLng), Math.max(origin.lat, destination.lat)]
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
