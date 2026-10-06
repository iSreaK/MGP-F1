import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS }
  from '../../dist/mexico/track-data.js';
import { prepareMexicoCurve, trackHeightAtStation }
  from '../../dist/mexico/geometry-smoothing.js';

const points = TRACK_POINTS.slice(0, -1);
const count = points.length;
const point = i => points[(i + count) % count];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) -
  (b[1] - a[1]) * (c[0] - a[0]);
const cumulative = [0];
for (let i = 1; i < count; i++)
  cumulative.push(cumulative.at(-1) + distance(point(i - 1), point(i)));
const perimeter = cumulative.at(-1) + distance(point(count - 1), point(0));
assert.deepEqual(TRACK_POINTS.at(-1), TRACK_POINTS[0], 'FIA centreline closes');
assert.ok(Math.abs(perimeter - TRACK_LENGTH_METERS) < .02,
  '2025 FIA centreline loop is calibrated to 4304 m');

let intersections = 0;
let minimumNonlocalGap = Infinity;
for (let i = 0; i < count; i++) for (let j = i + 10; j < count; j++) {
  if (count - (j - i) < 10) continue;
  const a = point(i), b = point(i + 1), c = point(j), d = point(j + 1);
  if (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) intersections++;
  minimumNonlocalGap = Math.min(minimumNonlocalGap, distance(a, c));
}
assert.equal(intersections, 0, 'no self-crossing road geometry');
assert.ok(minimumNonlocalGap > TRACK_WIDTH_METERS + 2,
  'separate racing-surface branches have enough clearance');

const straightSpans = [
  [860, 205, 'start/finish'],
  [290, 380, 'T3–T4'],
  [461, 495, 'T6–T7'],
  [660, 700, 'T11–T12'],
];
const straightMetrics = straightSpans.map(([from, to, name]) => {
  const indices = to < from
    ? [...Array.from({ length: count - from }, (_, i) => from + i),
      ...Array.from({ length: to + 1 }, (_, i) => i)]
    : Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const a = point(from), b = point(to);
  const length = distance(a, b);
  const wobble = Math.max(...indices.map(i => Math.abs(cross(a, b, point(i))) / length));
  const forward = Math.min(...indices.slice(1).map((i, j) =>
    ((point(i)[0] - point(indices[j])[0]) * (b[0] - a[0]) +
     (point(i)[1] - point(indices[j])[1]) * (b[1] - a[1])) / length));
  assert.ok(wobble < .001, `${name} stays linear`);
  assert.ok(forward > 2, `${name} stationing advances`);
  return { name, length: +length.toFixed(1), wobble: +wobble.toFixed(5) };
});

const render = prepareMexicoCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
assert.ok(Math.abs(render.renderedLength - TRACK_LENGTH_METERS) < .01,
  'rendered 3D curve retains FIA lap length');
const samples = Array.from({ length: TRACK_LENGTH_METERS }, (_, i) =>
  render.curve.getPointAt(i / TRACK_LENGTH_METERS));
let minimumBendRadius = Infinity;
let minimumEdgeForward = Infinity;
let maximumGrade = 0;
for (let i = 0; i < samples.length; i++) {
  const before = samples[(i - 1 + samples.length) % samples.length];
  const at = samples[i], after = samples[(i + 1) % samples.length];
  const incoming = at.clone().sub(before), outgoing = after.clone().sub(at);
  const horizontalA = Math.hypot(incoming.x, incoming.z);
  const horizontalB = Math.hypot(outgoing.x, outgoing.z);
  const angle = Math.atan2(incoming.x * outgoing.z - incoming.z * outgoing.x,
    incoming.x * outgoing.x + incoming.z * outgoing.z);
  if (Math.abs(angle) > 1e-9)
    minimumBendRadius = Math.min(minimumBendRadius,
      (horizontalA + horizontalB) / (2 * Math.abs(angle)));
  maximumGrade = Math.max(maximumGrade, Math.abs(incoming.y) / horizontalA);
  const ta = render.curve.getTangentAt(i / samples.length);
  const tb = render.curve.getTangentAt(((i + 1) % samples.length) / samples.length);
  const forward = outgoing.clone().setY(0).normalize();
  for (const side of [-1, 1]) {
    const edgeA = at.clone().add(new THREE.Vector3(ta.z, 0, -ta.x)
      .multiplyScalar(side * TRACK_WIDTH_METERS / 2));
    const edgeB = after.clone().add(new THREE.Vector3(tb.z, 0, -tb.x)
      .multiplyScalar(side * TRACK_WIDTH_METERS / 2));
    minimumEdgeForward = Math.min(minimumEdgeForward,
      edgeB.sub(edgeA).dot(forward));
  }
}
assert.ok(minimumBendRadius > TRACK_WIDTH_METERS / 2,
  'all corner apexes keep an inner road edge');
assert.ok(minimumEdgeForward > .05, 'both road edges advance through each turn');
assert.ok(maximumGrade < .01, 'Mexico City circuit remains essentially flat');
assert.ok(Math.abs(trackHeightAtStation(0) -
  trackHeightAtStation(TRACK_LENGTH_METERS - .001)) < .001,
  'elevation closes smoothly');

assert.equal(LANDMARKS.controlLineIndex, 0);
assert.ok(Math.abs(cumulative[LANDMARKS.gridIndex] - 230) < 2,
  'standing start is 230m past control per official race distance');
let previous = LANDMARKS.gridIndex;
for (let number = 1; number <= 17; number++) {
  const marker = LANDMARKS.turns[`T${number}`];
  assert.ok(marker?.index > previous, `T${number} follows the race direction`);
  assert.ok(Math.abs(cumulative[marker.index] - marker.distanceMeters) < .2,
    `T${number} metric marker matches the centreline`);
  previous = marker.index;
}
assert.ok(LANDMARKS.pitStraight.entryIndex > LANDMARKS.turns.T17.index,
  'pit entry follows T17');
assert.ok(LANDMARKS.pitStraight.exitIndex < LANDMARKS.turns.T1.index,
  'pit exit rejoins before T1');

console.log('Mexico City FIA track geometry OK:', {
  sourcePoints: count,
  sourceLength: +perimeter.toFixed(4),
  rendered3DLength: +render.renderedLength.toFixed(4),
  straightMetrics,
  minimumNonlocalGap: +minimumNonlocalGap.toFixed(2),
  minimumBendRadius: +minimumBendRadius.toFixed(2),
  minimumEdgeForward: +minimumEdgeForward.toFixed(3),
  maximumGrade: +maximumGrade.toFixed(5),
  gridOffsetMeters: +cumulative[LANDMARKS.gridIndex].toFixed(2),
  orderedTurns: 17,
});
