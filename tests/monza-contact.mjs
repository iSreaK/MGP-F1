// Run: node --experimental-default-type=module tests/monza-contact.mjs
// Verify every tyre against the *rendered asphalt triangles*, rather than
// comparing the car origin with the centreline spline's approximate height.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, LANDMARKS } from '../dist/monza/track-data.js';
import { trackElevationAt } from '../dist/monza/terrain-profile.js';
import { createRaceController } from '../dist/monza/race-motion.js';
import { WHEEL_GEOMETRY } from '../dist/monza/wheel-spin.js';
import { createTrackHeightSampler } from '../dist/monza/world.js';

const SAMPLE_COUNT = 1500;
const TRACK_Y = .30;
const TOLERANCE_METERS = .005;

// Reproduce the asphalt ribbon's centreline sampling and triangle positions.
// This stands alone from the placement code under test and exposes the actual
// polygon height at each wheel's X/Z, including between spline samples.
const centerline = TRACK_POINTS.slice(0, -1);
const cumulative = [0];
for (let i = 1; i < centerline.length; i++) {
  const [ax, az] = centerline[i - 1];
  const [bx, bz] = centerline[i];
  cumulative.push(cumulative.at(-1) + Math.hypot(bx - ax, bz - az));
}
const [firstX, firstZ] = centerline[0];
const [lastX, lastZ] = centerline.at(-1);
const perimeter = cumulative.at(-1) + Math.hypot(firstX - lastX, firstZ - lastZ);
const controlPoints = centerline.map(([x, z], i) =>
  new THREE.Vector3(x, TRACK_Y + trackElevationAt(cumulative[i] / perimeter), z));
const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'centripetal', .27);
const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => curve.getPointAt(i / SAMPLE_COUNT));

const vertices = [];
const indices = [];
for (let i = 0; i < SAMPLE_COUNT; i++) {
  const j = (i + 1) % SAMPLE_COUNT;
  const p = samples[i], q = samples[j];
  const before = samples[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];
  const after = samples[(j + 1) % SAMPLE_COUNT];
  const t0 = q.clone().sub(before).setY(0).normalize();
  const t1 = after.clone().sub(p).setY(0).normalize();
  const n0 = new THREE.Vector3(t0.z, 0, -t0.x);
  const n1 = new THREE.Vector3(t1.z, 0, -t1.x);
  const a = p.clone().addScaledVector(n0, -6);
  const b = p.clone().addScaledVector(n0, 6);
  const c = q.clone().addScaledVector(n1, -6);
  const d = q.clone().addScaledVector(n1, 6);
  const k = vertices.length / 3;
  vertices.push(...a, ...b, ...c, ...d);
  indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
geometry.setIndex(indices);
const asphalt = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
asphalt.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
const vertical = new THREE.Vector3(0, -1, 0);
function asphaltY(x, z) {
  raycaster.set(new THREE.Vector3(x, 100, z), vertical);
  const hit = raycaster.intersectObject(asphalt, false)[0];
  assert.ok(hit, `Missing asphalt beneath (${x.toFixed(3)}, ${z.toFixed(3)})`);
  return hit.point.y;
}
const trackHeightAt = createTrackHeightSampler(asphalt, samples);

let travelled = 0;
let total = 0;
for (let i = 0; i < controlPoints.length; i++) {
  const segment = controlPoints[i].distanceTo(controlPoints[(i + 1) % controlPoints.length]);
  if (i < (LANDMARKS.gridIndex ?? 0)) travelled += segment;
  total += segment;
}
const gridU = total ? travelled / total : 0;
const carU = (gridU - .0025 + 1) % 1;
const car = new THREE.Group();
const controller = createRaceController(THREE, curve, car, {
  startU: carU,
  laneOffset: -2.35,
  trackHeightAt,
});
const wheels = [
  ['front-left', WHEEL_GEOMETRY.frontX, -WHEEL_GEOMETRY.frontZ],
  ['front-right', WHEEL_GEOMETRY.frontX, WHEEL_GEOMETRY.frontZ],
  ['rear-left', WHEEL_GEOMETRY.rearX, -WHEEL_GEOMETRY.rearZ],
  ['rear-right', WHEEL_GEOMETRY.rearX, WHEEL_GEOMETRY.rearZ],
];
const wheelLocal = new THREE.Vector3();
const cases = [];
function measure(label, u) {
  car.updateMatrixWorld(true);
  for (const [wheel, x, z] of wheels) {
    const center = wheelLocal.set(x, WHEEL_GEOMETRY.centerY, z)
      .clone().applyMatrix4(car.matrixWorld);
    const gap = center.y - WHEEL_GEOMETRY.radius - asphaltY(center.x, center.z);
    cases.push({ label, u, wheel, gap });
  }
}

controller.reset(carU);
measure('grid', carU);
// The first 120 m of a lap intentionally blend the racing line into the grid.
// Exercise placeCar's race placement at all other points by passing this zone.
const lapPositions = new Set(Array.from({ length: 300 }, (_, i) => i / 300));
for (let u = .54; u <= .72; u += .001) lapPositions.add(Number(u.toFixed(4)));
for (const u of [...lapPositions].sort((a, b) => a - b)) {
  controller.reset(u);
  controller.stats.distanceMeters = 200;
  controller.start();
  controller.update(.000001);
  controller.stop();
  measure('lap', u);
}

// Also drive one continuous lap through the public start/update path so the
// integration of grid departure, movement and wraparound remains covered.
controller.reset(carU);
controller.start();
let frames = 0;
while (controller.stats.laps < 1 && frames < 2500) {
  controller.update(.1);
  frames++;
  if (frames % 10 === 0) measure('race-live', controller.stats.progress);
}
assert.equal(controller.stats.laps, 1, 'The simulated car did not complete a lap');
measure('finish', controller.stats.progress);
controller.stop();

const floating = [...cases].sort((a, b) => b.gap - a.gap)[0];
const buried = [...cases].sort((a, b) => a.gap - b.gap)[0];
const meanAbsolute = cases.reduce((sum, c) => sum + Math.abs(c.gap), 0) / cases.length;
const describe = item => `${item.wheel} @ u=${item.u.toFixed(4)} (${item.label})`;
console.log(`Checked ${cases.length} tyre contacts against ${SAMPLE_COUNT * 2} asphalt triangles.`);
console.log(`Continuous race: ${frames} frames, ${(frames / 10).toFixed(1)} simulated seconds, one full lap.`);
console.log(`Maximum hover: ${(floating.gap * 1000).toFixed(2)} mm, ${describe(floating)}`);
console.log(`Maximum penetration: ${(-buried.gap * 1000).toFixed(2)} mm, ${describe(buried)}`);
console.log(`Mean absolute gap: ${(meanAbsolute * 1000).toFixed(2)} mm`);
assert.ok(floating.gap <= TOLERANCE_METERS,
  `A tyre hovers ${(floating.gap * 1000).toFixed(2)} mm above asphalt at ${describe(floating)}`);
assert.ok(buried.gap >= -TOLERANCE_METERS,
  `A tyre penetrates ${(-buried.gap * 1000).toFixed(2)} mm into asphalt at ${describe(buried)}`);
