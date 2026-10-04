import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from '../../dist/singapore/track-data.js';
import { prepareSingaporeCurve } from '../../dist/singapore/geometry-smoothing.js';
import { createRaceController } from '../../dist/singapore/race-motion.js';

const { curve } = prepareSingaporeCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const car = new THREE.Group();
const controller = createRaceController(THREE, curve, car,
  { trackHeightAt: () => .36 });
// The real asset's wheel splitter is attached after controller construction.
const left = new THREE.Group();
left.name = 'Animated wheel front-left';
const right = new THREE.Group();
right.name = 'Animated wheel front-right';
car.add(left, right);
left.rotation.z = .72;
right.rotation.z = -.48;

const gridU = LANDMARKS.startLineOffsetMeters / TRACK_LENGTH_METERS;
controller.placeAt(gridU);
const gridAngle = left.rotation.y;
assert.ok(Math.abs(left.rotation.y) < .01, 'front wheels face forward on the grid');
assert.equal(left.rotation.z, .72, 'steering preserves tyre spin');
assert.equal(right.rotation.z, -.48, 'steering preserves tyre spin on both sides');

const samples = [];
for (let i = 0; i < 500; i++) {
  controller.placeAt(i / 500);
  const angle = left.rotation.y;
  assert.ok(Number.isFinite(angle) && Math.abs(angle) <= .321,
    'steering stays finite and within the visual rack limit');
  assert.ok(Math.abs(angle - right.rotation.y) < 1e-8,
    'left and right front wheels steer together');
  assert.ok(Number.isFinite(car.position.y), 'wheel contact remains finite');
  samples.push(angle);
}
const min = Math.min(...samples), max = Math.max(...samples);
assert.ok(min < -.10 && max > .10,
  'both left and right street-circuit turns animate the wheel pivots');
console.log('Singapore steering OK:', {
  minDegrees: Number((min * 180 / Math.PI).toFixed(1)),
  maxDegrees: Number((max * 180 / Math.PI).toFixed(1)),
  gridDegrees: Number((gridAngle * 180 / Math.PI).toFixed(1)),
});
