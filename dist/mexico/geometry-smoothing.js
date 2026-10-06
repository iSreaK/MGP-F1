import { LANDMARKS } from './track-data.js';

// Mexico City is a nearly level park circuit. Horizontal stationing follows
// the FIA 2025 circuit map in track-data.js. The broad rises and falls below
// give the road a little visible depth without turning it into a hilly track;
// they are a smooth visual approximation, not surveyed elevation anchors.
// The city's ~2,285 m altitude is not the scene's relative world-space y.

const LAP_LENGTH = 4304;
const BASE_Y = .36;
const T17_APEX_METERS = LANDMARKS.turns.T17.distanceMeters;
// The historic Peraltada was 8.5 degrees after its 1986 reconstruction;
// only a portion survives in the post-2015 F1 lap. An 8-degree visual peak
// retains its character without claiming a survey of the present-day asphalt.
const T17_BANK_RADIANS = 8 * Math.PI / 180;
const smoothstep01 = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Positive roll tilts the driver's right side down through right-hand T17. */
export function trackBankAngleAtStation(station) {
  const distance = ((station % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  let delta = distance - T17_APEX_METERS;
  if (delta > LAP_LENGTH / 2) delta -= LAP_LENGTH;
  if (delta < -LAP_LENGTH / 2) delta += LAP_LENGTH;
  const entry = smoothstep01((delta + 105) / 75);
  const exit = 1 - smoothstep01((delta - 16) / 65);
  return T17_BANK_RADIANS * entry * exit;
}

export function trackBankAngleAtFraction(fraction) {
  return trackBankAngleAtStation(fraction * LAP_LENGTH);
}

export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 1.5],
  [230, 1.5],
  [610, 2.23],
  [1250, 1.2],
  [2050, 2.4],
  [2940, .72],
  [3620, 1.63],
  [LAP_LENGTH, 1.5],
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
  return BASE_Y + (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * span * derivatives[lo]
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * span * derivatives[lo + 1];
}

/** World-space road height at a normalized lap fraction. */
export function trackHeightAtFraction(fraction) {
  return trackHeightAtStation(fraction * LAP_LENGTH);
}

/** Prepare one arc-length parameterized 3D curve for road and cars. */
export function prepareMexicoCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
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
  // Scale only x/z; the shallow visual height profile stays unchanged.
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
