// Circuit of The Americas profile. Horizontal geometry comes from the FIA
// 2025 circuit map in track-data.js. Vertical stations are an approximation:
// FIA/COTA describe a ~41 m climb from the start to T1, while Formula 1
// describes an ~11% approach gradient. No public kerb-level elevation survey
// was available; do not treat these intermediate elevations as measurements.
// Sources:
// https://www.fia.com/news/f1-usa-gp-race-preview
// https://circuitoftheamericas.com/blog/2020/2/28/camping-at-cota/
// https://www.formula1.com/en/latest/article/why-cota-remains-a-favourite-for-drivers-and-fans-as-it-prepares-for-its.4eXiYC8g4HMppyG1epADlC

const LAP_LENGTH = 5513;
const BASE_Y = .36;

export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0, 1.5],
  [323, 1.5],             // standing start: race distance implies +323 m
  [670, 42.0],            // T1 crest, 40.5 m above the start straight
  [750, 36.0],
  [930, 22.0],
  [1197, 15.0],
  [1400, 10.0],
  [1750, 11.0],
  [2000, 15.0],
  [2620, 16.0],
  [3200, 13.0],
  [3815, 11.0],
  [4300, 10.0],
  [4800, 6.0],
  [5055, 3.5],
  [5376, 0.0],            // valley between T19 and T20
  [LAP_LENGTH, 1.5],
]);

// Monotone cubic Hermite slopes: no invented peaks or dips between anchors.
const derivatives = ELEVATION_PROFILE_METERS.map((entry, i, points) => {
  const [x] = entry;
  if (i === 0) {
    const before = (points.at(-1)[1] - points.at(-2)[1]) /
      (points.at(-1)[0] - points.at(-2)[0]);
    const after = (points[1][1] - points[0][1]) / (points[1][0] - x);
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  }
  if (i === points.length - 1) {
    const before = (points.at(-1)[1] - points.at(-2)[1]) /
      (points.at(-1)[0] - points.at(-2)[0]);
    const after = (points[1][1] - points[0][1]) /
      (points[1][0] - points[0][0]);
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  }
  const leftSpan = x - points[i - 1][0];
  const rightSpan = points[i + 1][0] - x;
  const left = (entry[1] - points[i - 1][1]) / leftSpan;
  const right = (points[i + 1][1] - entry[1]) / rightSpan;
  if (left * right <= 0) return 0;
  const leftWeight = 2 * rightSpan + leftSpan;
  const rightWeight = rightSpan + 2 * leftSpan;
  return (leftWeight + rightWeight) /
    (leftWeight / left + rightWeight / right);
});

/** World-space road height for an official-lap distance (metres). */
export function trackHeightAtStation(station) {
  const distance = ((station % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  if (distance >= 323 && distance <= 670) {
    // The signature hill is nearly a constant 12.6% grade with short smooth
    // ramps at each end. This is more believable than an interpolating spline
    // that creates a sharp 15% spike near the foot of the climb.
    const travelled = distance - 323;
    const span = 347, ramp = 25;
    const rise = 40.5;
    const grade = rise / (span - ramp);
    const rampArea = t => ramp * (t * t * t - .5 * t * t * t * t);
    let aboveStart;
    if (travelled < ramp) aboveStart = grade * rampArea(travelled / ramp);
    else if (travelled > span - ramp)
      aboveStart = rise - grade * rampArea((span - travelled) / ramp);
    else aboveStart = grade * (travelled - ramp / 2);
    return BASE_Y + 1.5 + aboveStart;
  }
  let lo = 0, hi = ELEVATION_PROFILE_METERS.length - 2;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ELEVATION_PROFILE_METERS[mid + 1][0] <= distance) lo = mid + 1;
    else hi = mid;
  }
  const [x0, y0] = ELEVATION_PROFILE_METERS[lo];
  const [x1, y1] = ELEVATION_PROFILE_METERS[lo + 1];
  const span = x1 - x0;
  const t = (distance - x0) / span;
  const t2 = t * t, t3 = t2 * t;
  return BASE_Y + (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * span * derivatives[lo]
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * span * derivatives[lo + 1];
}

/** World-space road height at a normalized lap fraction. */
export function trackHeightAtFraction(fraction) {
  return trackHeightAtStation(fraction * LAP_LENGTH);
}

/** Prepare one arc-length parameterized 3D curve for road and cars. */
export function prepareAustinCurve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {
  const points2D = trackPoints.slice(0, -1);
  const cumulative = [0];
  for (let i = 1; i < points2D.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(
      points2D[i][0] - points2D[i - 1][0],
      points2D[i][1] - points2D[i - 1][1],
    ));
  }
  const last = points2D.at(-1), first = points2D[0];
  const horizontalLength = cumulative.at(-1) +
    Math.hypot(first[0] - last[0], first[1] - last[1]);
  const sourcePoints = points2D.map(([x, z], i) =>
    new THREE.Vector3(x, trackHeightAtFraction(cumulative[i] / horizontalLength), z));
  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);
  curve.arcLengthDivisions = 12000;
  curve.updateArcLengths();
  const beforeCalibration = curve.getLength();
  let scale = 1;
  // Scale only x/z. Vertical relief remains tied to the real 41 m T1 climb.
  for (let pass = 0; pass < 3; pass++) {
    const correction = targetLengthMetres / curve.getLength();
    scale *= correction;
    for (const point of sourcePoints) {
      point.x *= correction;
      point.z *= correction;
    }
    curve.updateArcLengths();
  }
  return { curve, sourcePoints, scale, horizontalLength, beforeCalibration,
    renderedLength: curve.getLength() };
}
