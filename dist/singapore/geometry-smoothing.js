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
