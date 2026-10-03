import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { carCatalog } from '../dist/car-catalog.js';
import { createRaceController, racingLineOffset } from '../dist/monza/race-motion.js';
import { PIT_START_LANE_CENTER } from '../dist/monza/grid-details.js';

const points = Array.from({ length: 32 }, (_, i) => new THREE.Vector3(
  150 * Math.cos(i * Math.PI / 16), 0, 150 * Math.sin(i * Math.PI / 16),
));
const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
const startU = .3;

function offsetAt(car, u) {
  const centre = curve.getPointAt(u);
  const forward = curve.getTangentAt(u).setY(0).normalize();
  return car.position.clone().sub(centre)
    .dot(new THREE.Vector3(forward.z, 0, -forward.x));
}

const pitStarters = carCatalog.filter(car => car.pitLaneStart);
assert.deepEqual(pitStarters.map(car => car.number).sort((a, b) => a - b), [14, 30]);
for (const entry of pitStarters) {
  const car = { position: new THREE.Vector3(), rotation: new THREE.Euler() };
  const controller = createRaceController(THREE, curve, car, {
    startU, laneOffset: PIT_START_LANE_CENTER, pitLaneStart: true,
    trackHeightAt: () => 0,
  });
  assert.ok(Math.abs(offsetAt(car, startU) - PIT_START_LANE_CENTER) < 1e-6,
    `${entry.driverName} doit apparaître dans la voie des stands`);
  controller.start();
  for (let i = 0; i < 100; i++) controller.update(.05);
  assert.ok(controller.stats.distanceMeters < 130);
  assert.ok(Math.abs(offsetAt(car, controller.stats.progress) - PIT_START_LANE_CENTER) < 1e-6,
    `${entry.driverName} doit rester dans la voie des stands au départ`);
  controller.placeAt(startU, 310);
  assert.ok(Math.abs(offsetAt(car, startU) - racingLineOffset(startU)) < 1e-6,
    `${entry.driverName} doit rejoindre la piste après la sortie des stands`);
  controller.reset();
  assert.ok(Math.abs(offsetAt(car, startU) - PIT_START_LANE_CENTER) < 1e-6,
    `${entry.driverName} doit revenir aux stands après reset`);
}

console.log('Départs des stands : pose initiale, sortie et remise en grille vérifiées.');
