/**
 * Remove sub-metre raster-skeleton wobble on the straights of the FIA map.
 * The corner apexes remain anchored: their wider-neighbour bend angle is too
 * high for the straight-only filter to activate. The final Three.js spline is
 * then calibrated to the FIA's 4,927 m centreline length.
 */
export function prepareSingaporeCurve(THREE, trackPoints, targetLengthMetres = 4927) {
  const original = trackPoints.slice(0, -1);
  const count = original.length;
  const smoothed = original.map(([x, z], i) => {
    const before = original[(i - 3 + count) % count];
    const after = original[(i + 3) % count];
    const bx = x - before[0], bz = z - before[1];
    const ax = after[0] - x, az = after[1] - z;
    const denominator = Math.hypot(bx, bz) * Math.hypot(ax, az);
    const cosine = denominator > 0
      ? Math.max(-1, Math.min(1, (bx * ax + bz * az) / denominator)) : 1;
    const macroBend = Math.acos(cosine);
    const weight = Math.max(0, Math.min(1, (.10 - macroBend) / .08));
    const previous = original[(i - 1 + count) % count];
    const next = original[(i + 1) % count];
    return [
      x + weight * ((previous[0] + 2 * x + next[0]) / 4 - x),
      z + weight * ((previous[1] + 2 * z + next[1]) / 4 - z),
    ];
  });

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
