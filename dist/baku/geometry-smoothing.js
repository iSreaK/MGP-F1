// Relief issu du canal z OpenF1 du même tour que le plan du circuit.
// OpenF1 exprime z en décimètres ; la présentation verticale est amplifiée
// modérément pour rester lisible dans la vue du circuit entier.
const LAP_LENGTH = 6003;
const BASE_Y = .36;
export const RELIEF_PRESENTATION_SCALE = 1.3;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 0.258],
  [75, 0.239],
  [150, 0.096],
  [225, 0.093],
  [300, 0.382],
  [375, 0.662],
  [450, 0.918],
  [525, 1.29],
  [600, 1.543],
  [675, 1.661],
  [750, 1.773],
  [825, 1.688],
  [900, 1.525],
  [975, 1.408],
  [1050, 1.461],
  [1125, 1.622],
  [1200, 1.865],
  [1275, 2.139],
  [1350, 2.183],
  [1425, 2.056],
  [1500, 1.829],
  [1575, 1.474],
  [1650, 1.196],
  [1725, 0.892],
  [1800, 0.686],
  [1875, 0.624],
  [1950, 0.613],
  [2025, 0.456],
  [2100, 0.738],
  [2175, 0.912],
  [2250, 1.004],
  [2325, 1.099],
  [2400, 1.044],
  [2475, 1.548],
  [2550, 2.057],
  [2625, 3.269],
  [2700, 8.659],
  [2775, 9.243],
  [2850, 12.985],
  [2925, 17.563],
  [3000, 21.241],
  [3075, 23.448],
  [3150, 25.329],
  [3225, 26.506],
  [3300, 26.251],
  [3375, 25.768],
  [3450, 25.129],
  [3525, 24.16],
  [3600, 22.557],
  [3675, 17.132],
  [3750, 10.744],
  [3825, 5.058],
  [3900, 2.97],
  [3975, 1.197],
  [4050, 0.595],
  [4125, 0.466],
  [4200, 0.62],
  [4275, 0.686],
  [4350, 0.743],
  [4425, 0.89],
  [4500, 0.935],
  [4575, 0.969],
  [4650, 1.029],
  [4725, 1.001],
  [4800, 0.888],
  [4875, 0.753],
  [4950, 0.613],
  [5025, 0.524],
  [5100, 0.567],
  [5175, 0.742],
  [5250, 0.864],
  [5325, 1.029],
  [5400, 1.159],
  [5475, 1.152],
  [5550, 0.896],
  [5625, 0.569],
  [5700, 0.302],
  [5775, 0.066],
  [5850, 0.062],
  [5925, 0.218],
  [6000, 0.259],
  [6003, 0.258],
]);

export function trackHeightAtStation(station) {
  const distance = ((station % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  let low = 0, high = ELEVATION_PROFILE_METERS.length - 2;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (ELEVATION_PROFILE_METERS[middle + 1][0] <= distance) low = middle + 1;
    else high = middle;
  }
  const [x0, y0] = ELEVATION_PROFILE_METERS[low];
  const [x1, y1] = ELEVATION_PROFILE_METERS[low + 1];
  const t = (distance - x0) / Math.max(1e-9, x1 - x0);
  const eased = t * t * (3 - 2 * t);
  return BASE_Y + (y0 + (y1 - y0) * eased) * RELIEF_PRESENTATION_SCALE;
}

export const trackHeightAtFraction = fraction => trackHeightAtStation(fraction * LAP_LENGTH);

export function prepareBakuCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
  const points2D = trackPoints.slice(0, -1);
  const cumulative = [0];
  for (let i = 1; i < points2D.length; i++) cumulative.push(cumulative.at(-1) +
    Math.hypot(points2D[i][0] - points2D[i - 1][0], points2D[i][1] - points2D[i - 1][1]));
  const last = points2D.at(-1), first = points2D[0];
  const horizontalLength = cumulative.at(-1) + Math.hypot(first[0] - last[0], first[1] - last[1]);
  const sourcePoints = points2D.map(([x, z], i) =>
    new THREE.Vector3(x, trackHeightAtFraction(cumulative[i] / horizontalLength), z));
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);
  curve.arcLengthDivisions = 12000;
  curve.updateArcLengths();
  for (let pass = 0; pass < 3; pass++) {
    const correction = targetLengthMetres / curve.getLength();
    for (const point of sourcePoints) { point.x *= correction; point.z *= correction; }
    curve.updateArcLengths();
  }
  return { curve, sourcePoints, horizontalLength, renderedLength: curve.getLength() };
}
