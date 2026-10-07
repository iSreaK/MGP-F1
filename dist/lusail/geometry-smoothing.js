// Lusail is represented at a level datum. No public corner-by-corner FIA
// elevation survey was available, so we avoid invented hills and crests.
const LAP_LENGTH = 5419;
const TRACK_Y = .36;

export const ELEVATION_PROFILE_METERS = Object.freeze([[0, 0], [LAP_LENGTH, 0]]);
export function trackHeightAtStation() { return TRACK_Y; }
export function trackHeightAtFraction() { return TRACK_Y; }

export function prepareLusailCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
  const sourcePoints = trackPoints.slice(0, -1).map(([x, z]) =>
    new THREE.Vector3(x, TRACK_Y, z));
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
  return { curve, sourcePoints, scale, horizontalLength: beforeCalibration,
    beforeCalibration, renderedLength: curve.getLength() };
}
