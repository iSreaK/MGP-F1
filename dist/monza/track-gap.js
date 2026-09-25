// Three.js's default arc-length table has only 200 entries. On Monza's dense
// centreline, subtracting metres / curve.getLength() from getPointAt's u can
// shrink a nine-metre grid gap to less than three metres in some sectors.
// This denser table maps the rendered path to actual cumulative distance.
export function createTrackGapLookup(curve, divisions = 8192) {
  const distance = new Float64Array(divisions + 1);
  let previous = curve.getPointAt(0);
  for (let i = 1; i <= divisions; i++) {
    const point = curve.getPointAt(i / divisions);
    distance[i] = distance[i - 1] + point.distanceTo(previous);
    previous = point;
  }
  const lengthMeters = distance[divisions];
  if (!(lengthMeters > 0)) throw new RangeError('Le tracé doit avoir une longueur positive.');

  const wrap = (value, limit) => ((value % limit) + limit) % limit;
  function distanceAt(u) {
    const sample = wrap(u, 1) * divisions;
    const before = Math.floor(sample);
    const blend = sample - before;
    return distance[before] + (distance[before + 1] - distance[before]) * blend;
  }
  function uAt(metres) {
    const target = wrap(metres, lengthMeters);
    let low = 0, high = divisions;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (distance[middle] <= target) low = middle;
      else high = middle;
    }
    const segment = distance[high] - distance[low];
    return (low + (segment > 0 ? (target - distance[low]) / segment : 0)) / divisions;
  }

  return {
    lengthMeters,
    behind(u, metres) { return uAt(distanceAt(u) - metres); },
  };
}
