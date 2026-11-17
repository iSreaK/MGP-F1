// A car occupies a block on the driven ribbon, not a point on the spline.
// Longitudinal corrections affect the rendered pose only: timing, ranking,
// speed and wheel rotation continue to use the underlying race data.
export const CAR_BLOCK = Object.freeze({ length: 6.4, width: 2.3, roadLimit: 3.6 });

const wrap = (metres, length) => ((metres % length) + length) % length;
const signedGap = (ahead, behind, length) =>
  wrap(ahead - behind + length / 2, length) - length / 2;

function trackClearanceShift(station, offset, placed, lapLength, block, initialShift = 0) {
  let shift = initialShift;
  // Move behind a conflicting entity. A later entity may occupy that spot,
  // so revisit the full set until this block is clear of every predecessor.
  for (let attempt = 0; attempt <= placed.length; attempt++) {
    let required = shift;
    for (const other of placed) {
      if (Math.abs(offset - other.offset) >= block.width) continue;
      const gap = signedGap(other.station, station - shift, lapLength);
      if (Math.abs(gap) < block.length) {
        required = Math.max(required, shift + block.length - gap + .01);
      }
    }
    if (required === shift) return shift;
    shift = required;
  }
  return shift;
}

// Arc distance alone is not a collision test on a street circuit. Two car
// rectangles at different headings can intersect even when their stations
// are 6.4 m apart, or their spline offsets differ by more than 2.3 m.
function footprint(curve, u, offset) {
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u);
  const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
  const tx = tangent.x / tangentLength;
  const tz = tangent.z / tangentLength;
  return {
    x: point.x + tz * offset,
    z: point.z - tx * offset,
    tx, tz,
    sx: tz, sz: -tx,
  };
}

function footprintsOverlap(a, b, block) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // The circumscribed circle is a cheap broad-phase check. SAT is only needed
  // for cars whose rendered rectangles can actually meet.
  const radius = Math.hypot(block.length, block.width) + .08;
  if (dx * dx + dz * dz >= radius * radius) return false;
  const halfLength = block.length / 2 + .035;
  const halfWidth = block.width / 2 + .035;
  for (const [ax, az] of [[a.tx, a.tz], [a.sx, a.sz], [b.tx, b.tz], [b.sx, b.sz]]) {
    const centreGap = Math.abs(dx * ax + dz * az);
    const aRadius = halfLength * Math.abs(a.tx * ax + a.tz * az)
      + halfWidth * Math.abs(a.sx * ax + a.sz * az);
    const bRadius = halfLength * Math.abs(b.tx * ax + b.tz * az)
      + halfWidth * Math.abs(b.sx * ax + b.sz * az);
    if (centreGap >= aRadius + bRadius) return false;
  }
  return true;
}

function clearanceShift(sourceU, station, offset, placed, trackGap, block,
  initialShift = 0, curve = null) {
  const lapLength = trackGap.lengthMeters;
  let shift = trackClearanceShift(station, offset, placed, lapLength, block, initialShift);
  if (!curve) return shift;

  // Recheck in world X/Z after the fast spline-distance pass. Each correction
  // is monotone backwards; binary search keeps the extra holdback small while
  // the outer loop catches a different car after that correction.
  for (let attempt = 0; attempt < placed.length * 2 + 4; attempt++) {
    const u = trackGap.behind(sourceU, shift);
    const stationNow = trackGap.metresAt(u);
    const candidate = footprint(curve, u, offset);
    const conflicting = placed.find(other =>
      Math.abs(signedGap(other.station, stationNow, lapLength)) < 19
      && footprintsOverlap(candidate, other.footprint, block));
    if (!conflicting) return shift;

    let lower = shift;
    let step = .25;
    let upper = shift + step;
    // A long train may require moving behind several cars. We only seek the
    // first clear position relative to this one block, then revisit all cars.
    for (let i = 0; i < 8; i++) {
      const candidateU = trackGap.behind(sourceU, upper);
      if (!footprintsOverlap(footprint(curve, candidateU, offset), conflicting.footprint, block)) break;
      lower = upper;
      step *= 2;
      upper += step;
    }
    for (let i = 0; i < 5; i++) {
      const middle = (lower + upper) / 2;
      const candidateU = trackGap.behind(sourceU, middle);
      if (footprintsOverlap(footprint(curve, candidateU, offset), conflicting.footprint, block)) lower = middle;
      else upper = middle;
    }
    shift = trackClearanceShift(station, offset, placed, lapLength, block, upper + .02);
  }
  return shift;
}

/**
 * Keep the displayed car blocks apart while retaining each car's source
 * progress. Cars with a higher source progress are placed first. The optional
 * previous map limits lateral movement and the release of an earlier visual
 * holdback, so the fix does not flicker when two cars trade places.
 */
export function resolveEntitySpacing(cars, trackGap, previous = new Map(), options = {}) {
  if (!trackGap?.metresAt || !trackGap?.behind || !(trackGap.lengthMeters > 0)) {
    throw new TypeError('A track distance lookup is required for entity spacing.');
  }
  const block = { ...CAR_BLOCK, ...options.block };
  const curve = options.curve || null;
  const lateralStep = Math.max(0, options.lateralStep ?? Infinity);
  const releaseStep = Math.max(0, options.releaseStep ?? Infinity);
  const placed = [];
  const result = new Map();
  const ordered = [...cars].sort((a, b) =>
    (b.priority ?? b.progressMeters ?? 0) - (a.priority ?? a.progressMeters ?? 0)
    || (a.gridPosition ?? 99) - (b.gridPosition ?? 99)
    || a.number - b.number);

  for (const car of ordered) {
    const station = trackGap.metresAt(car.u);
    const base = car.offset;
    const earlier = previous.get(car.number);
    const releaseFloor = Math.max(0, (earlier?.shiftMeters ?? 0) - releaseStep);
    // The pit lane is separate from the racing surface. Preserve its
    // path while it is outside the paved track, including the blend on exit.
    const choices = Math.abs(base) > block.roadLimit
      ? [base]
      : [base, -3.55, -1.18, 1.18, 3.55, 0]
        .filter((value, index, values) => values.findIndex(other => Math.abs(other - value) < .01) === index);
    let target = base;
    let best = Infinity;
    for (const offset of choices) {
      const shift = clearanceShift(car.u, station, offset, placed, trackGap, block,
        releaseFloor, curve);
      const cost = shift + .8 * Math.abs(offset - base)
        + (earlier ? .35 * Math.abs(offset - earlier.offset) : 0);
      if (cost < best - 1e-6) {
        best = cost;
        target = offset;
      }
    }
    const offset = earlier
      ? earlier.offset + Math.max(-lateralStep, Math.min(lateralStep, target - earlier.offset))
      : target;
    const shiftMeters = clearanceShift(car.u, station, offset, placed, trackGap, block,
      releaseFloor, curve);
    const u = trackGap.behind(car.u, shiftMeters);
    const pose = { u, offset, shiftMeters };
    result.set(car.number, pose);
    placed.push({ station: trackGap.metresAt(u), offset,
      footprint: curve ? footprint(curve, u, offset) : null });
  }
  return result;
}
