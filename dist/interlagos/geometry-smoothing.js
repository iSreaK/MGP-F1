// Interlagos rises to its highest point on the approach to T1, then falls
// roughly 43 m to T5. The 2D path follows the official 2025 plan. Intermediate
// vertical stations are visual estimates, not surveyed heights.
// https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc.7I9JEcBw3R2AqXbnJ6hyvc

import { LANDMARKS } from './track-data.js';

const LAP_LENGTH = 4309;
const BASE_Y = .36;
export const DOCUMENTED_RELIEF_METERS = 43;
export const RELIEF_PRESENTATION_SCALE = 1.18;

export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 41],
  [LANDMARKS.turns.T1.distanceMeters, 43],
  [LANDMARKS.turns.T2.distanceMeters, 35],
  [LANDMARKS.turns.T3.distanceMeters, 24],
  [LANDMARKS.turns.T4.distanceMeters, 4],
  [LANDMARKS.turns.T5.distanceMeters, 0],
  [LANDMARKS.turns.T6.distanceMeters, 8],
  [LANDMARKS.turns.T7.distanceMeters, 14],
  [LANDMARKS.turns.T8.distanceMeters, 20],
  [LANDMARKS.turns.T9.distanceMeters, 18],
  [LANDMARKS.turns.T10.distanceMeters, 24],
  [LANDMARKS.turns.T11.distanceMeters, 15],
  [LANDMARKS.turns.T12.distanceMeters, 10],
  [LANDMARKS.turns.T13.distanceMeters, 18],
  [LANDMARKS.turns.T14.distanceMeters, 28],
  [LANDMARKS.turns.T15.distanceMeters, 37],
  [LAP_LENGTH, 41],
]);

// Monotone cubic Hermite slopes: no invented peaks or dips between anchors.
const derivatives = ELEVATION_PROFILE_METERS.map((entry, i, points) => {
  const [x] = entry;
  if (i === 0) {
    const before = (points.at(-1)[1] - points.at(-2)[1]) /
      (points.at(-1)[0] - points.at(-2)[0]);
    const after = (points[1][1] - points[0][1]) / (points[1][0] - x);
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  }
  if (i === points.length - 1) {
    const before = (points.at(-1)[1] - points.at(-2)[1]) /
      (points.at(-1)[0] - points.at(-2)[0]);
    const after = (points[1][1] - points[0][1]) /
      (points[1][0] - points[0][0]);
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  }
  const leftSpan = x - points[i - 1][0];
  const rightSpan = points[i + 1][0] - x;
  const left = (entry[1] - points[i - 1][1]) / leftSpan;
  const right = (points[i + 1][1] - entry[1]) / rightSpan;
  if (left * right <= 0) return 0;
  const leftWeight = 2 * rightSpan + leftSpan;
  const rightWeight = rightSpan + 2 * leftSpan;
  return (leftWeight + rightWeight) /
    (leftWeight / left + rightWeight / right);
});

/** World-space road height for an official-lap distance (metres). */
export function trackHeightAtStation(station) {
  const distance = ((station % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  let lo = 0, hi = ELEVATION_PROFILE_METERS.length - 2;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ELEVATION_PROFILE_METERS[mid + 1][0] <= distance) lo = mid + 1;
    else hi = mid;
  }
  const [x0, y0] = ELEVATION_PROFILE_METERS[lo];
  const [x1, y1] = ELEVATION_PROFILE_METERS[lo + 1];
  const span = x1 - x0;
  const t = (distance - x0) / span;
  const t2 = t * t, t3 = t2 * t;
  const physicalHeight = (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * span * derivatives[lo]
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * span * derivatives[lo + 1];
  return BASE_Y + physicalHeight * RELIEF_PRESENTATION_SCALE;
}

/** World-space road height at a normalized lap fraction. */
export function trackHeightAtFraction(fraction) {
  return trackHeightAtStation(fraction * LAP_LENGTH);
}

/** Prepare one arc-length parameterized 3D curve for road and cars. */
export function prepareInterlagosCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
  const points2D = trackPoints.slice(0, -1);
  const cumulative = [0];
  for (let i = 1; i < points2D.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(
      points2D[i][0] - points2D[i - 1][0],
      points2D[i][1] - points2D[i - 1][1],
    ));
  }
  const last = points2D.at(-1), first = points2D[0];
  const horizontalLength = cumulative.at(-1) +
    Math.hypot(first[0] - last[0], first[1] - last[1]);
  const sourcePoints = points2D.map(([x, z], i) =>
    new THREE.Vector3(x, trackHeightAtFraction(cumulative[i] / horizontalLength), z));
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);
  curve.arcLengthDivisions = 12000;
  curve.updateArcLengths();
  const beforeCalibration = curve.getLength();
  let scale = 1;
  // Scale only x/z. The relief remains independent of plan calibration.
  for (let pass = 0; pass < 3; pass++) {
    const correction = targetLengthMetres / curve.getLength();
    scale *= correction;
    for (const point of sourcePoints) {
      point.x *= correction;
      point.z *= correction;
    }
    curve.updateArcLengths();
  }
  return { curve, sourcePoints, scale, horizontalLength, beforeCalibration,
    renderedLength: curve.getLength() };
}
