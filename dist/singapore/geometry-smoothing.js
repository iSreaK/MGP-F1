const STRAIGHT_CORES = [
  // The FIA drawing is a vector circuit map, not a kerb survey. Its traced
  // medial axis still drifts sideways by a few tenths of a metre on these
  // otherwise straight roads. Keep the bend and both approach tangents.
  { from: 220, coreFrom: 230, coreTo: 295, to: 305 }, // T5–T6
  { from: 315, coreFrom: 325, coreTo: 365, to: 374 }, // T6–T7
  { from: 460, coreFrom: 470, coreTo: 515, to: 525 }, // T9–T10
  { from: 775, coreFrom: 785, coreTo: 855, to: 865 }, // T15–T16
];

const smoothstep = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function rectifySingaporeStraights(trackPoints) {
  const points = trackPoints.slice(0, -1).map(([x, z]) => [x, z]);
  for (const { from, coreFrom, coreTo, to } of STRAIGHT_CORES) {
    const [ax, az] = points[coreFrom];
    const [bx, bz] = points[coreTo];
    const dx = bx - ax, dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    for (let i = from + 1; i < to; i++) {
      const blend = Math.min(
        smoothstep((i - from) / (coreFrom - from)),
        smoothstep((to - i) / (to - coreTo)),
      );
      const [x, z] = points[i];
      const along = ((x - ax) * dx + (z - az) * dz) / lengthSquared;
      const projectedX = ax + along * dx, projectedZ = az + along * dz;
      points[i] = [x + (projectedX - x) * blend, z + (projectedZ - z) * blend];
    }
  }
  return points;
}

/** Build the render spline from the already fair-fitted FIA centreline. */
export function prepareSingaporeCurve(THREE, trackPoints, targetLengthMetres = 4927) {
  const smoothed = rectifySingaporeStraights(trackPoints);
  const cumulative = [0];
  for (let i = 1; i < smoothed.length; i++) cumulative.push(cumulative[i - 1] +
    Math.hypot(smoothed[i][0] - smoothed[i - 1][0],
      smoothed[i][1] - smoothed[i - 1][1]));
  const last = smoothed.at(-1), first = smoothed[0];
  const horizontalLength = cumulative.at(-1) +
    Math.hypot(first[0] - last[0], first[1] - last[1]);
  const sourcePoints = smoothed.map(([x, z], i) =>
    new THREE.Vector3(x, trackHeightAtFraction(cumulative[i] / horizontalLength), z));
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);
  // Three.js defaults to 200 arc samples, which undercounts this 19-turn lap
  // by >30 m and distorts every getPointAt/getTangentAt call.
  curve.arcLengthDivisions = 12000;
  curve.updateArcLengths();
  const beforeCalibration = curve.getLength();
  const scale = targetLengthMetres / beforeCalibration;
  for (const point of sourcePoints) {
    point.x *= scale;
    point.z *= scale;
  }
  curve.updateArcLengths();
  return { curve, sourcePoints, smoothed, scale, horizontalLength,
    beforeCalibration, renderedLength: curve.getLength() };
}
import { createElevationSampler } from '../elevation-profile.js';

const LAP_LENGTH = 4927;
const BASE_Y = .36;
export const DOCUMENTED_RELIEF_METERS = 5.3;
export const RELIEF_PRESENTATION_SCALE = 1.8;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 1.8],
  [420, 1.8],
  [980, 3.8],
  [1540, 5.3],
  [2220, 3.0],
  [3100, 0],
  [4050, .9],
  [LAP_LENGTH, 1.8],
]);
const sampleElevation = createElevationSampler(ELEVATION_PROFILE_METERS, {
  lapLength: LAP_LENGTH,
  baseY: BASE_Y,
  presentationScale: RELIEF_PRESENTATION_SCALE,
});

export function trackHeightAtStation(station) { return sampleElevation(station); }
export function trackHeightAtFraction(fraction) {
  return trackHeightAtStation(fraction * LAP_LENGTH);
}
