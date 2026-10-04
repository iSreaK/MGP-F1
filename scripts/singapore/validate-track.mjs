import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, TRACK_POINTS, LANDMARKS } from '../../dist/singapore/track-data.js';
import { prepareSingaporeCurve } from '../../dist/singapore/geometry-smoothing.js';
import assert from 'node:assert/strict';

assert.deepEqual(TRACK_POINTS.at(-1), TRACK_POINTS[0], 'centreline closes on itself');
const points = TRACK_POINTS.slice(0, -1).map(([x, z]) => new THREE.Vector3(x, 0, z));
const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.27);
curve.arcLengthDivisions = 12000;
let polygon = 0;
for (let i = 0; i < points.length; i++) polygon += points[i].distanceTo(points[(i + 1) % points.length]);
let toGrid = 0;
for (let i = 0; i < LANDMARKS.gridIndex; i++) toGrid += points[i].distanceTo(points[i + 1]);
const spline = curve.getLength();
const render = prepareSingaporeCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const straight = LANDMARKS.pitStraight;
const straightIndices = [
  ...Array.from({ length: points.length - straight.fromIndex }, (_, i) => straight.fromIndex + i),
  ...Array.from({ length: straight.toIndex + 1 }, (_, i) => i),
];
const straightStart = points[straight.fromIndex];
const straightEnd = points[straight.toIndex];
const straightVector = straightEnd.clone().sub(straightStart);
const straightLength = straightVector.length();
const lateralOffset = (point, start, vector) =>
  Math.abs((point.x - start.x) * vector.z - (point.z - start.z) * vector.x) / Math.hypot(vector.x, vector.z);
const maxStraightWobble = Math.max(...straightIndices.map(i =>
  lateralOffset(points[i], straightStart, straightVector)));
const renderedStraight = straightIndices.slice(4, -4);
const renderedStart = render.sourcePoints[renderedStraight[0]];
const renderedVector = render.sourcePoints[renderedStraight.at(-1)].clone().sub(renderedStart);
const maxRenderedWobble = Math.max(...renderedStraight.map(i =>
  lateralOffset(render.sourcePoints[i], renderedStart, renderedVector)));
const otherStraightCores = [
  [230, 295], [325, 365], [470, 515], [785, 855],
];
const otherStraightWobbles = otherStraightCores.map(([from, to]) => {
  const start = render.sourcePoints[from];
  const end = render.sourcePoints[to];
  const vector = end.clone().sub(start);
  return Math.max(...render.sourcePoints.slice(from, to + 1).map(point =>
    lateralOffset(point, start, vector)));
});
const maxSourceDisplacement = Math.max(...render.smoothed.map(([x, z], i) =>
  Math.hypot(x - TRACK_POINTS[i][0], z - TRACK_POINTS[i][1])));
const metreSamples = Array.from({ length: TRACK_LENGTH_METERS }, (_, i) =>
  render.curve.getPointAt(i / TRACK_LENGTH_METERS));
const renderCurvature = metreSamples.map((at, i) => {
  const before = metreSamples[(i - 1 + metreSamples.length) % metreSamples.length];
  const after = metreSamples[(i + 1) % metreSamples.length];
  const incoming = at.clone().sub(before);
  const outgoing = after.clone().sub(at);
  const bend = Math.atan2(
    incoming.x * outgoing.z - incoming.z * outgoing.x,
    incoming.x * outgoing.x + incoming.z * outgoing.z);
  return bend / ((incoming.length() + outgoing.length()) / 2);
});
const maxCurvature = Math.max(...renderCurvature.map(Math.abs));
const abruptBendSamples = renderCurvature.filter(value => Math.abs(value) > .06).length;
const curvatureSignFlips = renderCurvature.filter((value, i) => {
  const next = renderCurvature[(i + 1) % renderCurvature.length];
  return Math.sign(value) !== Math.sign(next)
    && Math.max(Math.abs(value), Math.abs(next)) > .01;
}).length;
const edgeNormals = metreSamples.map((_, i) => {
  const tangent = render.curve.getTangentAt(i / TRACK_LENGTH_METERS);
  return new THREE.Vector3(-tangent.z, 0, tangent.x);
});
const roadHalfWidth = TRACK_WIDTH_METERS / 2;
const minEdgeForward = Math.min(...metreSamples.map((at, i) => {
  const nextIndex = (i + 1) % metreSamples.length;
  const centreStep = metreSamples[nextIndex].clone().sub(at).normalize();
  return Math.min(...[-1, 1].map(side => {
    const edgeAt = at.clone().addScaledVector(edgeNormals[i], side * roadHalfWidth);
    const edgeNext = metreSamples[nextIndex].clone()
      .addScaledVector(edgeNormals[nextIndex], side * roadHalfWidth);
    return edgeNext.sub(edgeAt).dot(centreStep);
  }));
}));
assert.ok(Math.abs(polygon - TRACK_LENGTH_METERS) < 0.01, 'FIA polyline measures 4,927 m');
assert.ok(Math.abs(spline - TRACK_LENGTH_METERS) < 5, 'rendered spline within 5 m of FIA lap');
assert.ok(Math.abs(render.renderedLength - TRACK_LENGTH_METERS) < .01,
  'rendered circuit is calibrated to the FIA lap');
assert.ok(straightLength > 400 && straightLength < 425, 'start/finish anchor spacing is plausible');
assert.ok(maxStraightWobble < .005, 'FIA start/finish straight has no raster wobble');
assert.ok(maxRenderedWobble < .025, 'rendered start/finish straight remains straight');
assert.ok(otherStraightWobbles.every(wobble => wobble < .025),
  'the other long render straights remain collinear');
assert.ok(maxSourceDisplacement < .9,
  'straight fairing stays inside the existing one-metre map tolerance');
assert.ok(maxCurvature < .11, 'rendered bends stay wider than the road edge');
assert.ok(minEdgeForward > .2, 'both road edges advance without folding back');
assert.ok(abruptBendSamples < 100, 'raster stair steps do not dominate the rendered bends');
assert.ok(curvatureSignFlips <= 5, 'rendered bends have no alternating raster waves');
assert.equal(LANDMARKS.controlLineIndex, 0);
assert.ok(Math.abs(toGrid - LANDMARKS.startLineOffsetMeters) < .02, 'start line is 137 m after control');
assert.ok(points[1].x < points[0].x && points[1].z > points[0].z, 'race direction heads northwest toward T1');
let previousIndex = LANDMARKS.gridIndex;
for (let number = 1; number <= 19; number++) {
  const turn = LANDMARKS.turns[`T${number}`];
  assert.ok(turn && turn.index > previousIndex, `T${number} advances in race order`);
  assert.deepEqual(render.smoothed[turn.index], TRACK_POINTS[turn.index],
    `T${number} anchor is unchanged by the straight fairing`);
  previousIndex = turn.index;
}
assert.ok(LANDMARKS.pitStraight.fromIndex > LANDMARKS.turns.T19.index);
assert.ok(LANDMARKS.pitStraight.toIndex < LANDMARKS.turns.T1.index);
console.log('Singapore track geometry OK:', {
  FIA: TRACK_LENGTH_METERS,
  polyline: Number(polygon.toFixed(3)),
  renderedSpline: Number(spline.toFixed(3)),
  finalRender: Number(render.renderedLength.toFixed(3)),
  maxStraightWobble: Number(maxStraightWobble.toFixed(4)),
  maxRenderedWobble: Number(maxRenderedWobble.toFixed(4)),
  otherStraightWobbles: otherStraightWobbles.map(value => Number(value.toFixed(4))),
  maxSourceDisplacement: Number(maxSourceDisplacement.toFixed(3)),
  minRenderedBendRadius: Number((1 / maxCurvature).toFixed(2)),
  minRoadEdgeForward: Number(minEdgeForward.toFixed(3)),
  abruptBendSamples,
  curvatureSignFlips,
  gridOffset: Number(toGrid.toFixed(3)),
  orderedTurns: 19,
  raceHeading: 'northwest toward T1',
});
