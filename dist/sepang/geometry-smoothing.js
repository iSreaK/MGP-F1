// Relief issu du canal z OpenF1 du même tour que le plan du circuit.
// OpenF1 exprime z en décimètres ; la présentation verticale est amplifiée
// modérément pour rester lisible dans la vue du circuit entier.
const LAP_LENGTH = 5543;
const BASE_Y = .36;
export const RELIEF_PRESENTATION_SCALE = 1.42;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 12.819],
  [75, 12.812],
  [150, 12.822],
  [225, 12.844],
  [300, 12.972],
  [375, 13.389],
  [450, 14.158],
  [525, 14.746],
  [600, 14.5],
  [675, 13.178],
  [750, 10.101],
  [825, 5.871],
  [900, 2.561],
  [975, 0.628],
  [1050, 0.042],
  [1125, 0.572],
  [1200, 2.564],
  [1275, 5.409],
  [1350, 8.505],
  [1425, 11.15],
  [1500, 13.635],
  [1575, 16.281],
  [1650, 17.491],
  [1725, 16.945],
  [1800, 14.924],
  [1875, 13.804],
  [1950, 13.659],
  [2025, 14.836],
  [2100, 15.468],
  [2175, 15.941],
  [2250, 16.244],
  [2325, 16.401],
  [2400, 16.333],
  [2475, 16.002],
  [2550, 15.541],
  [2625, 15.096],
  [2700, 14.68],
  [2775, 14.08],
  [2850, 13.31],
  [2925, 12.198],
  [3000, 11.183],
  [3075, 12.35],
  [3150, 15.998],
  [3225, 19.023],
  [3300, 20.704],
  [3375, 21.114],
  [3450, 20.636],
  [3525, 18.898],
  [3600, 16.958],
  [3675, 14.712],
  [3750, 12.768],
  [3825, 10.859],
  [3900, 9.813],
  [3975, 10.358],
  [4050, 12.043],
  [4125, 13.664],
  [4200, 13.695],
  [4275, 13.138],
  [4350, 12.961],
  [4425, 12.942],
  [4500, 12.935],
  [4575, 12.912],
  [4650, 12.903],
  [4725, 12.905],
  [4800, 12.896],
  [4875, 12.98],
  [4950, 13.723],
  [5025, 14.897],
  [5100, 13.712],
  [5175, 13.034],
  [5250, 12.933],
  [5325, 12.86],
  [5400, 12.797],
  [5475, 12.786],
  [5543, 12.819],
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

export function prepareSepangCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
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
