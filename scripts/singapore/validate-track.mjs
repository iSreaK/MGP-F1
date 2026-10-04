import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_LENGTH_METERS, TRACK_POINTS, LANDMARKS } from '../../dist/singapore/track-data.js';
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
const apexMovement = Math.max(...Array.from({ length: 19 }, (_, i) => {
  const index = LANDMARKS.turns[`T${i + 1}`].index;
  return Math.hypot(render.smoothed[index][0] - TRACK_POINTS[index][0],
    render.smoothed[index][1] - TRACK_POINTS[index][1]);
}));
assert.ok(Math.abs(polygon - TRACK_LENGTH_METERS) < 0.01, 'FIA polyline measures 4,927 m');
assert.ok(Math.abs(spline - TRACK_LENGTH_METERS) < 5, 'rendered spline within 5 m of FIA lap');
assert.ok(Math.abs(render.renderedLength - TRACK_LENGTH_METERS) < .01,
  'rendered circuit is calibrated to the FIA lap');
assert.ok(apexMovement < .4, 'straight-only smoothing preserves all 19 apexes');
assert.ok(straightLength > 400 && straightLength < 425, 'start/finish anchor spacing is plausible');
assert.ok(maxStraightWobble < .005, 'FIA start/finish straight has no raster wobble');
assert.ok(maxRenderedWobble < .025, 'rendered start/finish straight remains straight');
assert.equal(LANDMARKS.controlLineIndex, 0);
assert.ok(Math.abs(toGrid - LANDMARKS.startLineOffsetMeters) < .02, 'start line is 137 m after control');
assert.ok(points[1].x < points[0].x && points[1].z > points[0].z, 'race direction heads northwest toward T1');
let previousIndex = LANDMARKS.gridIndex;
for (let number = 1; number <= 19; number++) {
  const turn = LANDMARKS.turns[`T${number}`];
  assert.ok(turn && turn.index > previousIndex, `T${number} advances in race order`);
  previousIndex = turn.index;
}
assert.ok(LANDMARKS.pitStraight.fromIndex > LANDMARKS.turns.T19.index);
assert.ok(LANDMARKS.pitStraight.toIndex < LANDMARKS.turns.T1.index);
console.log('Singapore track geometry OK:', {
  FIA: TRACK_LENGTH_METERS,
  polyline: Number(polygon.toFixed(3)),
  renderedSpline: Number(spline.toFixed(3)),
  finalRender: Number(render.renderedLength.toFixed(3)),
  maxApexMovement: Number(apexMovement.toFixed(3)),
  maxStraightWobble: Number(maxStraightWobble.toFixed(4)),
  maxRenderedWobble: Number(maxRenderedWobble.toFixed(4)),
  gridOffset: Number(toGrid.toFixed(3)),
  orderedTurns: 19,
  raceHeading: 'northwest toward T1',
});
