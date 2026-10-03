// A car occupies a block on the driven ribbon, not a point on the spline.
// Longitudinal corrections affect the rendered pose only: timing, ranking,
// speed and wheel rotation continue to use the underlying race data.
export const CAR_BLOCK = Object.freeze({ length: 6.4, width: 2.3, roadLimit: 4.7 });

const wrap = (metres, length) => ((metres % length) + length) % length;
const signedGap = (ahead, behind, length) =>
  wrap(ahead - behind + length / 2, length) - length / 2;

function clearanceShift(station, offset, placed, lapLength, block, initialShift = 0) {
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
  const lateralStep = Math.max(0, options.lateralStep ?? Infinity);
  const releaseStep = Math.max(0, options.releaseStep ?? Infinity);
  const lapLength = trackGap.lengthMeters;
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
    // The pit lane is separate from the 12-metre racing surface. Preserve its
    // path while it is outside the paved track, including the blend on exit.
    const choices = Math.abs(base) > block.roadLimit
      ? [base]
      : [base, -4.3, -1.43, 1.43, 4.3, 0]
        .filter((value, index, values) => values.findIndex(other => Math.abs(other - value) < .01) === index);
    let target = base;
    let best = Infinity;
    for (const offset of choices) {
      const shift = clearanceShift(station, offset, placed, lapLength, block, releaseFloor);
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
    const shiftMeters = clearanceShift(station, offset, placed, lapLength, block, releaseFloor);
    const u = trackGap.behind(car.u, shiftMeters);
    const pose = { u, offset, shiftMeters };
    result.set(car.number, pose);
    placed.push({ station: trackGap.metresAt(u), offset });
  }
  return result;
}
