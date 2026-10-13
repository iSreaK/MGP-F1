import { createElevationSampler } from '../elevation-profile.js';

// The FIA publishes maximum grades of +2% and -3.5%, but no kerb-level survey.
// These broad anchors are therefore illustrative and remain inside that shape.
const ROAD_Y = .38;
const LAP_LENGTH = 6201;
export const ILLUSTRATIVE_RELIEF_METERS = 12;
export const RELIEF_PRESENTATION_SCALE = 1.35;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 6],
  [620, 8],
  [1220, 12],
  [1540, 4],
  [1800, 0],
  [2620, 3],
  [3600, 6.5],
  [4620, 9],
  [5450, 7],
  [LAP_LENGTH, 6],
]);
const sampleElevation = createElevationSampler(ELEVATION_PROFILE_METERS, {
  lapLength: LAP_LENGTH,
  baseY: ROAD_Y,
  presentationScale: RELIEF_PRESENTATION_SCALE,
});

export const trackHeightAtStation = station => sampleElevation(station);
export const trackHeightAtFraction = fraction => sampleElevation(fraction * LAP_LENGTH);
export const trackBankAngleAtFraction = () => 0;

export function prepareVegasCurve(THREE, trackPoints, targetLengthMetres = 6201) {
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
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);
  curve.arcLengthDivisions = 14000;
  curve.updateArcLengths();
  for (let pass = 0; pass < 3; pass++) {
    const correction = targetLengthMetres / curve.getLength();
    for (const point of sourcePoints) {
      point.x *= correction;
      point.z *= correction;
    }
    curve.updateArcLengths();
  }
  if (Math.abs(curve.getLength() - targetLengthMetres) > .05)
    throw new Error('Le circuit de Las Vegas ne correspond pas aux 6 201 m FIA.');
  return { curve, sourcePoints, horizontalLength, renderedLength: curve.getLength() };
}
