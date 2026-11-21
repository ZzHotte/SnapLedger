import { describe, expect, it } from "vitest";
import { greatCircleLine } from "./geo";

describe("greatCircleLine", () => {
  it("starts and ends exactly on the two given points", () => {
    const line = greatCircleLine([121.4737, 31.2304], [-118.2668, 33.7405]);
    expect(line[0][0]).toBeCloseTo(121.4737, 9);
    expect(line[0][1]).toBeCloseTo(31.2304, 9);
    const [lastLng, lastLat] = line[line.length - 1];
    // The far end may have been unwrapped past ±180°, so compare mod 360.
    expect(((lastLng % 360) + 360) % 360).toBeCloseTo(((-118.2668 % 360) + 360) % 360, 4);
    expect(lastLat).toBeCloseTo(33.7405, 4);
  });

  it("returns just the two points when they coincide", () => {
    const line = greatCircleLine([144.9631, -37.8136], [144.9631, -37.8136]);
    expect(line).toEqual([
      [144.9631, -37.8136],
      [144.9631, -37.8136],
    ]);
  });

  it("keeps longitude continuous across the antimeridian", () => {
    // Shanghai -> Los Angeles crosses the Pacific/antimeridian — the short
    // way round should push longitude past 180° rather than jumping back
    // down near -180° mid-line.
    const line = greatCircleLine([121.4737, 31.2304], [-118.2668, 33.7405]);
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i][0] - line[i - 1][0])).toBeLessThan(10);
    }
  });

  it("stays on a great circle (midpoint north of the straight-line average for a trans-Pacific route)", () => {
    const line = greatCircleLine([121.4737, 31.2304], [-118.2668, 33.7405]);
    const mid = line[Math.floor(line.length / 2)];
    expect(mid[1]).toBeGreaterThan(33);
  });
});
