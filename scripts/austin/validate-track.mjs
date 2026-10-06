import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, TRACK_POINTS, LANDMARKS }
  from '../../dist/austin/track-data.js';
import { prepareAustinCurve, trackHeightAtStation }
  from '../../dist/austin/geometry-smoothing.js';

const source = TRACK_POINTS.slice(0, -1);
const count = source.length;
const point = i => source[(i + count) % count];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) -
  (b[1] - a[1]) * (c[0] - a[0]);
const cumulative = [0];
for (let i = 1; i < count; i++) cumulative.push(cumulative[i - 1] + dist(point(i - 1), point(i)));
const perimeter = cumulative.at(-1) + dist(point(count - 1), point(0));
assert.deepEqual(TRACK_POINTS.at(-1), TRACK_POINTS[0], 'FIA centreline closes');
assert.ok(Math.abs(perimeter - TRACK_LENGTH_METERS) < .02, 'source loop is calibrated to FIA 5513m');

let signedArea = 0;
for (let i = 0; i < count; i++) {
  const a = point(i), b = point(i + 1);
  signedArea += a[0] * b[1] - b[0] * a[1];
}
assert.ok(signedArea > 0, 'COTA is traversed counter-clockwise');

let intersections = 0;
let minimumNonlocalGap = Infinity;
for (let i = 0; i < count; i++) {
  const a = point(i), b = point(i + 1);
  for (let j = i + 10; j < count; j++) {
    if (count - (j - i) < 10) continue;
    const c = point(j), d = point(j + 1);
    if (cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0) intersections++;
    const gap = dist(a, c);
    if (gap < minimumNonlocalGap) minimumNonlocalGap = gap;
  }
}
assert.equal(intersections, 0, 'centreline cannot cross itself');
assert.ok(minimumNonlocalGap > TRACK_WIDTH_METERS + 4,
  'nonlocal road sections keep more than the road width apart');

const straightSpans = [
  [1092, 102, 'start/finish'],
  [448, 486, 'T10–T11'],
  [525, 735, 'T11–T12'],
];
const straightMetrics = straightSpans.map(([from, to, name]) => {
  const indices = to < from
    ? [...Array.from({ length: count - from }, (_, i) => from + i),
      ...Array.from({ length: to + 1 }, (_, i) => i)]
    : Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const a = point(from), b = point(to);
  const span = dist(a, b);
  const wobble = Math.max(...indices.map(i => Math.abs(cross(a, b, point(i))) / span));
  // An accidental source-point reversal produces a folded road edge even if
  // every vertex remains on the same infinite line.
  const forward = Math.min(...indices.slice(1).map((i, j) =>
    ((point(i)[0] - point(indices[j])[0]) * (b[0] - a[0]) +
     (point(i)[1] - point(indices[j])[1]) * (b[1] - a[1])) / span));
  assert.ok(wobble < .001, `${name} has no raster waves`);
  assert.ok(forward > 2, `${name} advances monotonically`);
  return { name, span: Number(span.toFixed(1)), maxLateralWobble: Number(wobble.toFixed(5)) };
});

const render = prepareAustinCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
assert.ok(Math.abs(render.renderedLength - TRACK_LENGTH_METERS) < .01,
  '3D spline calibrated to FIA length');
const samples = Array.from({ length: TRACK_LENGTH_METERS }, (_, i) =>
  render.curve.getPointAt(i / TRACK_LENGTH_METERS));
let minimumBendRadius = Infinity, bendStation = 0;
let maximumGrade = 0, minEdgeForward = Infinity;
for (let i = 0; i < samples.length; i++) {
  const before = samples[(i - 1 + samples.length) % samples.length];
  const at = samples[i];
  const after = samples[(i + 1) % samples.length];
  const incoming = at.clone().sub(before);
  const outgoing = after.clone().sub(at);
  const horizontalA = Math.hypot(incoming.x, incoming.z);
  const horizontalB = Math.hypot(outgoing.x, outgoing.z);
  const angle = Math.atan2(incoming.x * outgoing.z - incoming.z * outgoing.x,
    incoming.x * outgoing.x + incoming.z * outgoing.z);
  if (Math.abs(angle) > 1e-9) {
    const radius = (horizontalA + horizontalB) / (2 * Math.abs(angle));
    if (radius < minimumBendRadius) { minimumBendRadius = radius; bendStation = i; }
  }
  maximumGrade = Math.max(maximumGrade, Math.abs(incoming.y) / horizontalA);
  const tangentA = render.curve.getTangentAt(i / samples.length);
  const tangentB = render.curve.getTangentAt(((i + 1) % samples.length) / samples.length);
  const centreForward = outgoing.clone().setY(0).normalize();
  for (const side of [-1, 1]) {
    const edgeAt = at.clone().add(new THREE.Vector3(tangentA.z, 0, -tangentA.x)
      .multiplyScalar(side * TRACK_WIDTH_METERS / 2));
    const edgeAfter = after.clone().add(new THREE.Vector3(tangentB.z, 0, -tangentB.x)
      .multiplyScalar(side * TRACK_WIDTH_METERS / 2));
    minEdgeForward = Math.min(minEdgeForward,
      edgeAfter.sub(edgeAt).dot(centreForward));
  }
}
assert.ok(minimumBendRadius > TRACK_WIDTH_METERS / 2 + .8,
  'inner road edge retains curvature radius');
assert.ok(minEdgeForward > .06, 'road edges advance through every corner');
assert.ok(maximumGrade < .14, 'uphill/downhill grade is bounded');
assert.ok(Math.abs(trackHeightAtStation(0) -
  trackHeightAtStation(TRACK_LENGTH_METERS - .001)) < .001,
  'elevation closes without a road seam');
assert.ok(Math.abs(trackHeightAtStation(670) - trackHeightAtStation(323) - 40.5) < .02,
  'T1 gains 40.5m from the standing start');

assert.equal(LANDMARKS.controlLineIndex, 0);
assert.ok(Math.abs(cumulative[LANDMARKS.gridIndex] - 323) < .02,
  'start line is 323m after control per FIA race distance');
let previousIndex = LANDMARKS.gridIndex;
for (let number = 1; number <= 20; number++) {
  const turn = LANDMARKS.turns[`T${number}`];
  assert.ok(turn && turn.index > previousIndex, `T${number} follows race order`);
  assert.ok(Math.abs(cumulative[turn.index] - turn.distanceMeters) < .2,
    `T${number} metric marker matches source station`);
  previousIndex = turn.index;
}
assert.ok(LANDMARKS.pitStraight.entryIndex > LANDMARKS.turns.T19.index &&
  LANDMARKS.pitStraight.entryIndex < LANDMARKS.turns.T20.index,
  'pit entrance lies between T19 and T20');
assert.ok(LANDMARKS.pitStraight.exitIndex < LANDMARKS.turns.T1.index,
  'pit exit lies on T1 approach');

console.log('Austin FIA track geometry OK:', {
  sourcePoints: count,
  sourceLength: Number(perimeter.toFixed(5)),
  rendered3DLength: Number(render.renderedLength.toFixed(5)),
  straightMetrics,
  minimumNonlocalGap: Number(minimumNonlocalGap.toFixed(2)),
  selfIntersections: intersections,
  minimumBendRadius: Number(minimumBendRadius.toFixed(2)),
  bendStation,
  minimumEdgeForward: Number(minEdgeForward.toFixed(3)),
  maximumGrade: Number(maximumGrade.toFixed(3)),
  gridOffsetMeters: Number(cumulative[LANDMARKS.gridIndex].toFixed(2)),
  orderedTurns: 20,
});
