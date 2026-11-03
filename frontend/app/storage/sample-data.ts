// Placeholder rows for the Storage skeleton. Shapes mirror the planned API
// (see the implementation plan) so swapping these for `lib/api.ts` calls is a
// one-line change per section.

export type Warehouse = { id: string; name: string; city: string };

export type InventoryItem = {
  sku: string;
  description: string;
  customer: string;
  location: string;
  on_hand: number;
  allocated: number;
  unit: "CTN" | "PLT" | "PCS";
  cbm: number;
  last_movement: string;
};

export type InboundOrder = {
  ref: string;
  customer: string;
  container_no: string | null;
  eta: string;
  lines: number;
  expected_qty: number;
  received_qty: number;
  status: "expected" | "arrived" | "receiving" | "put_away" | "closed";
};

export type OutboundOrder = {
  ref: string;
  customer: string;
  consignee: string;
  ship_by: string;
  lines: number;
  qty: number;
  status: "pending" | "picking" | "packed" | "dispatched" | "cancelled";
};

export type PackingList = {
  ref: string;
  direction: "inbound" | "outbound";
  customer: string;
  linked_order: string;
  cartons: number;
  gross_kg: number;
  cbm: number;
  source: "upload" | "manual" | "generated";
  created: string;
};

export const WAREHOUSES: Warehouse[] = [
  { id: "mel-1", name: "Melbourne DC", city: "Truganina, VIC" },
  { id: "syd-1", name: "Sydney Bonded", city: "Botany, NSW" },
  { id: "bne-1", name: "Brisbane Cross-dock", city: "Pinkenba, QLD" },
];

export const INVENTORY: InventoryItem[] = [
  { sku: "PRT-SOFA-3S-GRY", description: "3-seat sofa, grey fabric", customer: "Pacific Rim Trading Co.", location: "A-01-03", on_hand: 84, allocated: 12, unit: "CTN", cbm: 1.42, last_movement: "2026-11-02" },
  { sku: "GHL-LED-PNL-60", description: "LED panel 600x600, 40W", customer: "Golden Harbor Logistics", location: "B-04-01", on_hand: 1260, allocated: 300, unit: "PCS", cbm: 0.02, last_movement: "2026-11-03" },
  { sku: "MFP-TIRE-205-55", description: "Tyre 205/55 R16", customer: "Meridian Freight Partners", location: "C-02-07", on_hand: 412, allocated: 0, unit: "PCS", cbm: 0.07, last_movement: "2026-10-29" },
  { sku: "TFD-NOODLE-24", description: "Instant noodle, 24-pack", customer: "Temu food delivery", location: "D-01-02", on_hand: 36, allocated: 36, unit: "PLT", cbm: 1.6, last_movement: "2026-11-03" },
  { sku: "PRT-DESK-1400", description: "Office desk 1400mm, flat-pack", customer: "Pacific Rim Trading Co.", location: "A-03-05", on_hand: 7, allocated: 0, unit: "CTN", cbm: 0.31, last_movement: "2026-10-12" },
  { sku: "GHL-SOLAR-450W", description: "Solar module 450W mono", customer: "Golden Harbor Logistics", location: "E-01-01", on_hand: 22, allocated: 4, unit: "PLT", cbm: 1.95, last_movement: "2026-11-01" },
];

export const INBOUND: InboundOrder[] = [
  { ref: "ASN-24-0381", customer: "Pacific Rim Trading Co.", container_no: "MSKU 7342110", eta: "2026-11-05", lines: 6, expected_qty: 420, received_qty: 0, status: "expected" },
  { ref: "ASN-24-0379", customer: "Golden Harbor Logistics", container_no: "OOLU 8821453", eta: "2026-11-03", lines: 3, expected_qty: 1500, received_qty: 960, status: "receiving" },
  { ref: "ASN-24-0377", customer: "Temu food delivery", container_no: null, eta: "2026-11-03", lines: 1, expected_qty: 36, received_qty: 0, status: "arrived" },
  { ref: "ASN-24-0372", customer: "Meridian Freight Partners", container_no: "CSNU 6120894", eta: "2026-10-30", lines: 4, expected_qty: 412, received_qty: 412, status: "put_away" },
  { ref: "ASN-24-0366", customer: "Pacific Rim Trading Co.", container_no: "HLXU 4410287", eta: "2026-10-24", lines: 8, expected_qty: 233, received_qty: 231, status: "closed" },
];

export const OUTBOUND: OutboundOrder[] = [
  { ref: "SO-24-1180", customer: "Golden Harbor Logistics", consignee: "Bunnings Laverton", ship_by: "2026-11-04", lines: 2, qty: 300, status: "picking" },
  { ref: "SO-24-1179", customer: "Temu food delivery", consignee: "Woolworths DC Dandenong", ship_by: "2026-11-03", lines: 1, qty: 36, status: "packed" },
  { ref: "SO-24-1176", customer: "Pacific Rim Trading Co.", consignee: "Harvey Norman Moorabbin", ship_by: "2026-11-06", lines: 3, qty: 12, status: "pending" },
  { ref: "SO-24-1171", customer: "Meridian Freight Partners", consignee: "Bob Jane T-Marts Clayton", ship_by: "2026-11-01", lines: 1, qty: 64, status: "dispatched" },
];

export const PACKING_LISTS: PackingList[] = [
  { ref: "PL-MSKU7342110", direction: "inbound", customer: "Pacific Rim Trading Co.", linked_order: "ASN-24-0381", cartons: 420, gross_kg: 9_840, cbm: 58.2, source: "upload", created: "2026-10-28" },
  { ref: "PL-OOLU8821453", direction: "inbound", customer: "Golden Harbor Logistics", linked_order: "ASN-24-0379", cartons: 150, gross_kg: 4_210, cbm: 31.0, source: "upload", created: "2026-10-26" },
  { ref: "PL-SO-24-1179", direction: "outbound", customer: "Temu food delivery", linked_order: "SO-24-1179", cartons: 864, gross_kg: 7_420, cbm: 57.6, source: "generated", created: "2026-11-03" },
  { ref: "PL-SO-24-1171", direction: "outbound", customer: "Meridian Freight Partners", linked_order: "SO-24-1171", cartons: 64, gross_kg: 576, cbm: 4.5, source: "generated", created: "2026-11-01" },
];
