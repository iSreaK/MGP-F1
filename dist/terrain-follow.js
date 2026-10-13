const smoothstep = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Shape a rotated PlaneGeometry so it supports an elevated circuit nearby. */
export function sculptPlaneToTrack(geometry, samples, {
  baseHeight = -.24,
  roadClearance = .55,
  innerRadius = 70,
  outerRadius = 760,
  sampleStep = 10,
} = {}) {
  const positions = geometry.getAttribute('position');
  const measured = samples.filter((_, index) => index % sampleStep === 0);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    // PlaneGeometry is later rotated -90 degrees around x.
    const z = -positions.getY(i);
    let nearest = measured[0];
    let nearestDistanceSquared = Infinity;
    for (const point of measured) {
      const distanceSquared = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearest = point;
      }
    }
    const distance = Math.sqrt(nearestDistanceSquared);
    const blend = 1 - smoothstep((distance - innerRadius) /
      Math.max(1, outerRadius - innerRadius));
    const nearTrackHeight = nearest.y - roadClearance;
    positions.setZ(i, baseHeight + (nearTrackHeight - baseHeight) * blend);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

