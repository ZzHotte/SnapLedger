import { describe, expect, it } from "vitest";
import { scheduleHint } from "./schedule";

const today = new Date(2026, 10, 3); // 3 Nov 2026

describe("scheduleHint", () => {
  it("flags an ETA that has passed while the shipment is still on the water", () => {
    expect(scheduleHint("eta", "2026-11-01", "in_transit", today)).toEqual({ label: "2d late", tone: "late" });
  });

  it("drops the hint once the shipment has reached the milestone", () => {
    expect(scheduleHint("eta", "2026-11-01", "arrived", today)).toBeNull();
    expect(scheduleHint("etd", "2026-11-01", "in_transit", today)).toBeNull();
    expect(scheduleHint("eta", "2026-11-01", "cancelled", today)).toBeNull();
  });

  it("counts down within a week and stays quiet beyond it", () => {
    expect(scheduleHint("etd", "2026-11-03", "booked", today)).toEqual({ label: "today", tone: "soon" });
    expect(scheduleHint("etd", "2026-11-08", "booked", today)).toEqual({ label: "in 5d", tone: "soon" });
    expect(scheduleHint("etd", "2026-11-20", "booked", today)).toBeNull();
  });

  it("returns nothing for a missing date", () => {
    expect(scheduleHint("eta", null, "booked", today)).toBeNull();
  });
});
