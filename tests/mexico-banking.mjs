import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_LENGTH_METERS } from '../dist/mexico/track-data.js';
import { trackBankAngleAtFraction, trackBankAngleAtStation }
  from '../dist/mexico/geometry-smoothing.js';
import { createMexicoWorld } from '../dist/mexico/world.js';
import { createRaceController } from '../dist/mexico/race-motion.js';
import { WHEEL_GEOMETRY } from '../dist/monza/wheel-spin.js';

globalThis.document = {
  createElement() {
    return {
      width: 1, height: 1,
      getContext() {
        return {
          createImageData: (width, height) =>
            ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData() {}, fillRect() {}, fillText() {},
        };
      },
    };
  },
};

const scene = new THREE.Scene();
const world = createMexicoWorld(THREE, scene);
const at = metres => trackBankAngleAtStation(metres);
assert.equal(at(4024), 0, 'T16 approach remains level');
assert.equal(at(4210), 0, 'pit-straight entry remains level');
assert.ok(at(4129) > 7.9 * Math.PI / 180, 'T17 retains visible banking');
for (let station = 4000; station < 4220; station++) {
  assert.ok(Math.abs(at(station + 1) - at(station)) < .004,
    `T17 crossfall changes smoothly at ${station} m`);
}

const road = scene.getObjectByName('Autódromo Hermanos Rodríguez racing surface');
assert.ok(road?.isMesh);
const vertices = road.geometry.getAttribute('position');
const index = Math.round(4129 / TRACK_LENGTH_METERS * world.samples.length);
const stationU = index / world.samples.length;
const expectedCrossfall = Math.tan(trackBankAngleAtFraction(stationU)) * 14;
const outsideY = vertices.getY(index * 4);
const insideY = vertices.getY(index * 4 + 1);
assert.ok(Math.abs(outsideY - insideY - expectedCrossfall) < .005,
  'outside of the right-hand corner rises above the inside');

const wheelSpecs = [
  [WHEEL_GEOMETRY.frontX, -WHEEL_GEOMETRY.frontZ],
  [WHEEL_GEOMETRY.frontX, WHEEL_GEOMETRY.frontZ],
  [WHEEL_GEOMETRY.rearX, -WHEEL_GEOMETRY.rearZ],
  [WHEEL_GEOMETRY.rearX, WHEEL_GEOMETRY.rearZ],
];
for (const station of [4024, 4085, 4129, 4170, 4205, 4210]) {
  const u = station / TRACK_LENGTH_METERS;
  const car = new THREE.Group();
  createRaceController(THREE, world.curve, car,
    { startU: u, trackHeightAt: world.trackHeightAt });
  car.updateMatrixWorld(true);
  const tyreAxis = new THREE.Vector3(0, 0, 1).transformDirection(car.matrixWorld);
  const verticalRadius = WHEEL_GEOMETRY.radius
    * Math.sqrt(1 - tyreAxis.y * tyreAxis.y);
  for (const [x, z] of wheelSpecs) {
    const hub = car.localToWorld(new THREE.Vector3(x, WHEEL_GEOMETRY.centerY, z));
    const ground = world.trackHeightAt(u, hub.x, hub.z);
    const gap = hub.y - verticalRadius - ground;
    assert.ok(Math.abs(gap) < .025,
      `wheel contact at ${station} m: ${gap.toFixed(3)} m`);
  }
}

console.log('Mexico T17 banking OK: smooth 8° peak, banked road and four-wheel contact.');
