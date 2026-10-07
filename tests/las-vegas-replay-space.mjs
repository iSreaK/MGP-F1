import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS } from '../dist/las-vegas/track-data.js';
import { prepareVegasCurve } from '../dist/las-vegas/geometry-smoothing.js';
import { addVegasEnvironment } from '../dist/las-vegas/environment.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { computeReplayPlacements, replayPitOffset, replayVisualDistance } from '../dist/las-vegas/replay-lanes.js';
import { resolveEntitySpacing } from '../dist/las-vegas/entity-spacing.js';
import { VEGAS_2025_DISPLAYED } from '../dist/las-vegas/replay-roster.js';

const { curve } = prepareVegasCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const gap = createTrackGapLookup(curve);
const frames = Array.from({ length: 1860 }, (_, index) => {
  const point = curve.getPointAt(index / 1860);
  const forward = curve.getTangentAt(index / 1860).setY(0).normalize();
  return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
});
const distanceToRoad = point => Math.min(...frames.map(frame =>
  Math.hypot(point.x - frame.point.x, point.z - frame.point.z)));
const clearanceOfBox = box => {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return distanceToRoad(center) - Math.hypot(size.x, size.z) / 2;
};

test('named scenery and instanced skyline clear the concrete barrier corridor', () => {
  // Canvas textures are not uploaded by this geometry-only test.
  globalThis.document = { createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {},
      arc() {}, fill() {}, createLinearGradient: () => ({ addColorStop() {} }),
    }),
  }) };
  const scene = new THREE.Scene();
  const environment = addVegasEnvironment(THREE, scene, curve, frames);
  environment.group.updateMatrixWorld(true);
  const landmarks = environment.group.children.filter(object =>
    /hotel massing|roadside sign|LED dome|Grand Prix Plaza main grandstand/.test(object.name));
  assert.ok(landmarks.length >= 12, 'Missing casino, Sphere or grandstand landmark');
  for (const object of landmarks) {
    const clearance = clearanceOfBox(new THREE.Box3().setFromObject(object));
    // Race-road half width 6.5 m + concrete barrier centre 5.8 m + 0.37 m half depth.
    assert.ok(clearance > 13,
      `${object.name} reaches the track/barrier corridor (${clearance.toFixed(2)} m)`);
  }
  const skyline = environment.group.children.find(object =>
    object.name === 'Instanced Las Vegas background hotel blocks');
  assert.ok(skyline?.count > 30);
  skyline.geometry.computeBoundingBox();
  const instance = new THREE.Matrix4();
  for (let i = 0; i < skyline.count; i++) {
    skyline.getMatrixAt(i, instance);
    const worldMatrix = skyline.matrixWorld.clone().multiply(instance);
    const clearance = clearanceOfBox(skyline.geometry.boundingBox.clone().applyMatrix4(worldMatrix));
    assert.ok(clearance > 13, `Background building ${i} reaches the road`);
  }
});

function footprint(u, offset) {
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).setY(0).normalize();
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
  const center = point.addScaledVector(side, offset);
  return [
    center.clone().addScaledVector(tangent, 3.2).addScaledVector(side, 1.15),
    center.clone().addScaledVector(tangent, 3.2).addScaledVector(side, -1.15),
    center.clone().addScaledVector(tangent, -3.2).addScaledVector(side, -1.15),
    center.clone().addScaledVector(tangent, -3.2).addScaledVector(side, 1.15),
  ];
}

function intersect(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < 4; i++) {
    const edge = polygon[(i + 1) % 4].clone().sub(polygon[i]);
    const axis = { x: -edge.z, z: edge.x };
    const projection = corners => corners.map(point => point.x * axis.x + point.z * axis.z);
    const pa = projection(a), pb = projection(b);
    if (Math.max(...pa) <= Math.min(...pb) + .01
      || Math.max(...pb) <= Math.min(...pa) + .01) return false;
  }
  return true;
}

test('visible replay cars do not overlap at representative race moments', async () => {
  const replayData = JSON.parse(await readFile(new URL('../dist/las-vegas/data/las-vegas-2025-replay.json', import.meta.url)));
  const replay = createHistoricalReplay(replayData);
  const visibleNumbers = new Set(VEGAS_2025_DISPLAYED.map(driver => driver.replayNumber));
  const gridU = gap.behind(0, -92);
  for (const timeSec of [0, 5, 35, 75, 300, 1200, 2400, 3580, 4800, 4940]) {
    const frame = replay.frame(timeSec);
    const visual = frame.cars.map(car => ({ ...car,
      progressMeters: replayVisualDistance(car.progressMeters, replayData.session, 50) }));
    const placements = computeReplayPlacements(visual, gridU, gap, 6201);
    for (const car of visual) {
      const placement = placements.get(car.number);
      placement.offset = replayPitOffset(car, timeSec, replayData.session,
        replayData.drivers[car.number]?.pit, placement.offset);
    }
    const active = visual.filter(car => visibleNumbers.has(car.number)
      && !(car.ended && timeSec > replayData.drivers[car.number].finishSec + 1));
    const separated = resolveEntitySpacing(active.map(car => ({
      number: car.number, gridPosition: car.gridPosition,
      priority: car.progressMeters, ...placements.get(car.number),
    })), gap, new Map(), { curve });
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = separated.get(active[i].number), b = separated.get(active[j].number);
      assert.ok(!intersect(footprint(a.u, a.offset), footprint(b.u, b.offset)),
        `Cars #${active[i].number}/#${active[j].number} overlap at ${timeSec}s`);
    }
  }
});
