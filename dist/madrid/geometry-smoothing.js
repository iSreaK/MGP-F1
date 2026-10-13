// Relief issu du canal z OpenF1 du même tour que le plan du circuit.
// OpenF1 exprime z en décimètres ; la présentation verticale est amplifiée
// modérément pour rester lisible dans la vue du circuit entier.
const LAP_LENGTH = 5414;
const BASE_Y = .36;
export const RELIEF_PRESENTATION_SCALE = 1.38;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 1.332],
  [75, 1.332],
  [150, 1.333],
  [225, 1.356],
  [300, 1.404],
  [375, 1.355],
  [450, 0.758],
  [525, 0.013],
  [600, 1.029],
  [675, 2.214],
  [750, 3.415],
  [825, 4.427],
  [900, 5.609],
  [975, 6.569],
  [1050, 7.733],
  [1125, 8.711],
  [1200, 9.68],
  [1275, 11.144],
  [1350, 12.423],
  [1425, 13.042],
  [1500, 13.671],
  [1575, 13.899],
  [1650, 14.062],
  [1725, 16.734],
  [1800, 21.528],
  [1875, 23.997],
  [1950, 20.344],
  [2025, 17.178],
  [2100, 14.594],
  [2175, 12.323],
  [2250, 10.985],
  [2325, 10.592],
  [2400, 11.445],
  [2475, 12.022],
  [2550, 10.023],
  [2625, 7.512],
  [2700, 7.666],
  [2775, 10.6],
  [2850, 12.504],
  [2925, 11.922],
  [3000, 10.092],
  [3075, 9.457],
  [3150, 9.713],
  [3225, 10.063],
  [3300, 9.004],
  [3375, 8.253],
  [3450, 7.896],
  [3525, 7.42],
  [3600, 6.95],
  [3675, 6.713],
  [3750, 6.498],
  [3825, 6.151],
  [3900, 4.771],
  [3975, 2.855],
  [4050, 1.858],
  [4125, 1.319],
  [4200, 1.5],
  [4275, 2.026],
  [4350, 1.904],
  [4425, 1.547],
  [4500, 1.44],
  [4575, 1.488],
  [4650, 1.553],
  [4725, 1.419],
  [4800, 1.432],
  [4875, 1.432],
  [4950, 1.391],
  [5025, 1.358],
  [5100, 1.397],
  [5175, 1.396],
  [5250, 1.332],
  [5325, 1.332],
  [5400, 1.332],
  [5414, 1.332],
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

export function prepareMadridCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
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
