/** Build the render spline from the already fair-fitted FIA centreline. */
export function prepareSingaporeCurve(THREE, trackPoints, targetLengthMetres = 4927) {
  const smoothed = trackPoints.slice(0, -1);
  const sourcePoints = smoothed.map(([x, z]) => new THREE.Vector3(x, .36, z));
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
  return { curve, sourcePoints, smoothed, scale,
    beforeCalibration, renderedLength: curve.getLength() };
}
