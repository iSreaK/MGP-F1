import { createElevationSampler } from '../elevation-profile.js';

// Formula 1's published elevation guide: 7.4m total, high point at T2,
// low point on the back straight. Intermediate stations are a smooth visual
// reconstruction, not a surveyed altitude trace. OpenF1 z is not used.
// https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc
export const DOCUMENTED_RELIEF_METERS = 7.4;
export const RELIEF_PRESENTATION_SCALE = 1.2;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 3.1], [190, 3.2], [400, 4.3], [575, 6.3], [759, 7.4],
  [912, 6.1], [1047, 4.8], [1349, 3.4], [1603, 2.8],
  [1870, 3.5], [2065, 4.1], [2363, 3.3], [2554, 2.4],
  [2670, 2.0], [3148, 1.5], [3233, 1.2], [3436, .7],
  [3850, .15], [4200, 0], [4510, .1], [4803, .8],
  [4885, 1.5], [5181, 2.5], [5451, 3.1],
]);
export const trackHeightAtStation = createElevationSampler(ELEVATION_PROFILE_METERS,
  { lapLength: 5451, baseY: .36, presentationScale: RELIEF_PRESENTATION_SCALE });
export const trackHeightAtFraction = u => trackHeightAtStation(u * 5451);

export function prepareShanghaiCurve(THREE, trackPoints, targetLengthMetres = 5451) {
  const sourcePoints = trackPoints.slice(0, -1).map(([x, z], i, points) =>
    new THREE.Vector3(x, trackHeightAtFraction(i / points.length), z));
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);
  curve.arcLengthDivisions = 16000;
  curve.updateArcLengths();
  for (let pass = 0; pass < 3; pass++) {
    const correction = targetLengthMetres / curve.getLength();
    for (const point of sourcePoints) { point.x *= correction; point.z *= correction; }
    curve.updateArcLengths();
  }
  return { curve, sourcePoints, renderedLength: curve.getLength() };
}
