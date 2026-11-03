// Placeholder trips for the Transport skeleton — one row per vehicle with its
// latest GPS ping, the same shape the planned `/transport/live` endpoint returns.

export type TripStatus = "assigned" | "to_pickup" | "loaded" | "in_transit" | "delivered" | "offline";

export type Trip = {
  id: string;
  vehicle: string;
  driver: string;
  phone: string;
  shipment_ref: string;
  customer: string;
  container_no: string | null;
  from: string;
  to: string;
  status: TripStatus;
  lat: number;
  lng: number;
  speed_kmh: number;
  last_ping: string; // ISO
  eta: string | null;
};

// Rough Melbourne metro bounding box — the placeholder map projects pings into it.
export const MAP_BOUNDS = { north: -37.6, south: -38.0, west: 144.7, east: 145.2 };

export const TRIPS: Trip[] = [
  { id: "t1", vehicle: "1AB-2CD · Prime mover", driver: "Liam Chen", phone: "+61 400 111 222", shipment_ref: "SHP-20241", customer: "Pacific Rim Trading Co.", container_no: "MSKU 7342110", from: "Webb Dock, Port Melbourne", to: "Melbourne DC, Truganina", status: "in_transit", lat: -37.835, lng: 144.86, speed_kmh: 64, last_ping: "2026-11-03T14:06:40+11:00", eta: "14:42" },
  { id: "t2", vehicle: "XQ-71-PL · Side-loader", driver: "Aisha Patel", phone: "+61 400 333 444", shipment_ref: "SHP-20238", customer: "Golden Harbor Logistics", container_no: "OOLU 8821453", from: "Swanson Dock", to: "Bunnings Laverton", status: "loaded", lat: -37.812, lng: 144.915, speed_kmh: 0, last_ping: "2026-11-03T14:07:55+11:00", eta: "15:10" },
  { id: "t3", vehicle: "2EF-9GH · Rigid 12t", driver: "Marco Rossi", phone: "+61 400 555 666", shipment_ref: "SO-24-1179", customer: "Temu food delivery", container_no: null, from: "Melbourne DC, Truganina", to: "Woolworths DC Dandenong", status: "in_transit", lat: -37.93, lng: 145.12, speed_kmh: 82, last_ping: "2026-11-03T14:07:12+11:00", eta: "14:25" },
  { id: "t4", vehicle: "7JK-3LM · Van", driver: "Grace Nguyen", phone: "+61 400 777 888", shipment_ref: "SO-24-1176", customer: "Pacific Rim Trading Co.", container_no: null, from: "Melbourne DC, Truganina", to: "Harvey Norman Moorabbin", status: "to_pickup", lat: -37.77, lng: 144.76, speed_kmh: 38, last_ping: "2026-11-03T14:05:03+11:00", eta: "16:00" },
  { id: "t5", vehicle: "5NP-8QR · Prime mover", driver: "Tom Walker", phone: "+61 400 999 000", shipment_ref: "SHP-20230", customer: "Meridian Freight Partners", container_no: "CSNU 6120894", from: "Swanson Dock", to: "Bob Jane T-Marts Clayton", status: "offline", lat: -37.88, lng: 145.05, speed_kmh: 0, last_ping: "2026-11-03T13:41:18+11:00", eta: null },
  { id: "t6", vehicle: "4ST-6UV · Rigid 8t", driver: "Sofia Martins", phone: "+61 400 121 343", shipment_ref: "SO-24-1171", customer: "Meridian Freight Partners", container_no: null, from: "Melbourne DC, Truganina", to: "Bob Jane T-Marts Clayton", status: "delivered", lat: -37.917, lng: 145.122, speed_kmh: 0, last_ping: "2026-11-03T12:58:00+11:00", eta: null },
];
