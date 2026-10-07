// The FIA drawing is planimetric. No public kerb-level survey is available, so
// this street circuit is kept level instead of inventing slopes or banking.
const ROAD_Y = .38;

export const trackHeightAtStation = () => ROAD_Y;
export const trackHeightAtFraction = () => ROAD_Y;
export const trackBankAngleAtFraction = () => 0;

export function prepareVegasCurve(THREE, trackPoints, targetLengthMetres = 6201) {
  const sourcePoints = trackPoints.slice(0, -1).map(([x, z]) =>
    new THREE.Vector3(x, ROAD_Y, z));
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
  return { curve, sourcePoints };
}
