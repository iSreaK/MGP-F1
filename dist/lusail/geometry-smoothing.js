import { createElevationSampler } from '../elevation-profile.js';

// Lusail is officially described as very flat. These long, restrained waves
// make that small change readable without turning the desert circuit hilly.
const LAP_LENGTH = 5419;
const TRACK_Y = .36;
export const ILLUSTRATIVE_RELIEF_METERS = 4;
export const RELIEF_PRESENTATION_SCALE = 1.8;

export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 1.4], [640, 2.1], [1320, 4], [2140, 2.8], [3020, 0],
  [3920, 1.1], [4740, 2.2], [LAP_LENGTH, 1.4],
]);
const sampleElevation = createElevationSampler(ELEVATION_PROFILE_METERS, {
  lapLength: LAP_LENGTH, baseY: TRACK_Y,
  presentationScale: RELIEF_PRESENTATION_SCALE,
});
export function trackHeightAtStation(station) { return sampleElevation(station); }
export function trackHeightAtFraction(fraction) {
  return trackHeightAtStation(fraction * LAP_LENGTH);
}

export function prepareLusailCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
  const points2D = trackPoints.slice(0, -1);
  const cumulative = [0];
  for (let i = 1; i < points2D.length; i++) cumulative.push(cumulative.at(-1) +
    Math.hypot(points2D[i][0] - points2D[i - 1][0],
      points2D[i][1] - points2D[i - 1][1]));
  const last = points2D.at(-1), first = points2D[0];
  const horizontalLength = cumulative.at(-1) +
    Math.hypot(first[0] - last[0], first[1] - last[1]);
  const sourcePoints = points2D.map(([x, z], i) =>
    new THREE.Vector3(x, trackHeightAtFraction(cumulative[i] / horizontalLength), z));
  // Dense source points have already been low-pass smoothed by build-track.
  // An arc-length Catmull-Rom curve retains smooth tangents for road, fences
  // and vehicle heading without introducing visible waves on long straights.
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .02);
  curve.arcLengthDivisions = 12000;
  curve.updateArcLengths();
  const beforeCalibration = curve.getLength();
  const scale = targetLengthMetres / beforeCalibration;
  for (const point of sourcePoints) { point.x *= scale; point.z *= scale; }
  curve.updateArcLengths();
  return { curve, sourcePoints, scale, horizontalLength,
    beforeCalibration, renderedLength: curve.getLength() };
}
