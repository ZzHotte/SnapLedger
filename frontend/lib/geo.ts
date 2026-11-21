// Great-circle (shortest-path-on-a-sphere) interpolation between two
// lng/lat points, for drawing freight routes on a world map — a straight
// Mercator line between, say, Shanghai and Los Angeles cuts across land that
// the actual sailing route never goes near.

type LngLat = [number, number];
type Vector3 = [number, number, number];

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function toVector([lng, lat]: LngLat): Vector3 {
  const lambda = toRad(lng);
  const phi = toRad(lat);
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

function toLngLat([x, y, z]: Vector3): LngLat {
  return [toDeg(Math.atan2(y, x)), toDeg(Math.asin(Math.max(-1, Math.min(1, z))))];
}

// Keeps longitude continuous across the antimeridian (e.g. 170° -> -170°
// becomes 170° -> 190°) so Mapbox draws the short way across the Pacific
// instead of a line spanning the whole map.
function unwrapLongitudes(coords: LngLat[]): LngLat[] {
  const out: LngLat[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [, lat] = coords[i];
    let lng = coords[i][0];
    const prevLng = out[i - 1][0];
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    out.push([lng, lat]);
  }
  return out;
}

export function greatCircleLine(start: LngLat, end: LngLat, steps = 64): LngLat[] {
  if (start[0] === end[0] && start[1] === end[1]) return [start, end];

  const a = toVector(start);
  const b = toVector(end);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const theta = Math.acos(dot);

  // Below this the interpolation's sin(theta) divisor is too close to zero
  // to be numerically stable, and the two points are close enough that a
  // straight line between them is indistinguishable from the great circle.
  if (theta < 1e-6) return [start, end];

  const coords: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const scaleA = Math.sin((1 - f) * theta) / Math.sin(theta);
    const scaleB = Math.sin(f * theta) / Math.sin(theta);
    coords.push(
      toLngLat([
        scaleA * a[0] + scaleB * b[0],
        scaleA * a[1] + scaleB * b[1],
        scaleA * a[2] + scaleB * b[2],
      ])
    );
  }
  return unwrapLongitudes(coords);
}
