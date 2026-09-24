// Smoothed, illustrative elevation profile for Monza. The real circuit has
// roughly 12.8 m of relief; no surveyed point-by-point height data is used.
// u is the fraction of the lap measured from the start/finish reference.
const HEIGHT_KEYS = [
  [0, 0], [.08, 1.2], [.151, 2.4], [.235, 3.5],
  [.361, 4.8], [.432, 5.4], [.484, 5.6],
  [.55, -.5], [.61, -6.4], [.67, -.5], [.706, 6.4],
  [.78, 4.7], [.888, 1.2], [.95, -.7], [1, 0],
];

export function trackElevationAt(u) {
  const wrapped = ((u % 1) + 1) % 1;
  for (let i = 1; i < HEIGHT_KEYS.length; i++) {
    const [endU, endY] = HEIGHT_KEYS[i];
    if (wrapped > endU) continue;
    const [startU, startY] = HEIGHT_KEYS[i - 1];
    const t = (wrapped - startU) / (endU - startU);
    const blend = t * t * (3 - 2 * t);
    return startY + (endY - startY) * blend;
  }
  return 0;
}

export function createTerrainHeightAt(samples) {
  const cellSize = 64;
  const buckets = new Map();
  const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  for (const point of samples) {
    const id = key(point.x, point.z);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(point);
  }
  const transition = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  return (x, z) => {
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    let nearest = null;
    let nearestSquared = Infinity;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const bucket = buckets.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const point of bucket) {
          const d2 = (point.x - x) ** 2 + (point.z - z) ** 2;
          if (d2 < nearestSquared) {
            nearestSquared = d2;
            nearest = point;
          }
        }
      }
    }
    // The embankments meet the asphalt gently. Distant parkland has a subtle
    // broad contour so the course no longer floats on a featureless plane.
    const background = -1.65
      + 1.15 * Math.sin(x * .0015 + z * .00065)
      + 1.05 * Math.cos(z * .00185 - x * .00054);
    if (!nearest) return background;
    const distance = Math.sqrt(nearestSquared);
    const nearGround = nearest.y - .33;
    const parkRipple = (Math.sin(x * .011 + z * .005) + Math.cos(z * .013 - x * .003)) * .28;
    const blend = transition((distance - 18) / 150);
    return nearGround * (1 - blend) + (background + parkRipple) * blend;
  };
}
