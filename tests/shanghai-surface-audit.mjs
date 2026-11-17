import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createShanghaiWorld } from '../dist/shanghai/world.js';
import { pitLaneOffset } from '../dist/shanghai/track-surface.js';
import { replayPitOffset } from '../dist/shanghai/replay-lanes.js';

const context = new Proxy({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
}, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const scene = new THREE.Scene(), world = createShanghaiWorld(THREE, scene);
scene.updateMatrixWorld(true);
const at = (geometry, index) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);

test('Shanghai preserves its geographic east/south landmarks and fair curves', () => {
  const t1 = world.curve.getPointAt(574.5 / 5451);
  const t13 = world.curve.getPointAt(3436.3 / 5451);
  const t14 = world.curve.getPointAt(4803.3 / 5451);
  assert.ok(t1.x < -400 && t1.z > 380, 'T1 must remain southwest of the reference');
  assert.ok(t13.x < 0 && t13.z < -480, 'T13 must remain in the northern loop');
  assert.ok(t14.x > 560 && t14.z > 480, 'T14 must remain at the southeast hairpin');
  let minimumRadius = Infinity;
  for (let s = 0; s < 5451; s += 2) {
    const angle = world.curve.getTangentAt(s / 5451)
      .angleTo(world.curve.getTangentAt(((s + 2) % 5451) / 5451));
    minimumRadius = Math.min(minimumRadius, 2 / Math.max(1e-9, angle));
  }
  assert.ok(minimumRadius > 10, `polygon kink gives radius ${minimumRadius}m`);
  assert.ok(Math.abs(world.curve.getLength() - 5451) < .02);
  for (const [start, end, tolerance] of [[0, 380, 1], [3700, 4650, 2]]) {
    const line = new THREE.Line3(world.curve.getPointAt(start / 5451), world.curve.getPointAt(end / 5451));
    for (let s = start; s < end; s += 10) {
      const point = world.curve.getPointAt(s / 5451);
      assert.ok(point.distanceTo(line.closestPointToPoint(point, true, new THREE.Vector3())) < tolerance,
        'a long straight was bowed by smoothing');
    }
  }
});

test('Shanghai road and kerb strips have no inverted quads or artificial return spans', () => {
  const strips = [];
  scene.traverse(object => { if (object.userData.strip) strips.push(object); });
  for (const mesh of strips) {
    const { strip } = mesh.userData;
    assert.equal(strip.spans, strip.closed ? strip.frames : strip.frames - 1, mesh.name);
    let sign = 0;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i += 4) {
      const a = at(mesh.geometry, i), b = at(mesh.geometry, i + 1);
      const c = at(mesh.geometry, i + 2), d = at(mesh.geometry, i + 3);
      const cross = c.clone().sub(a).cross(b.clone().sub(a)).y;
      const cross2 = c.clone().sub(b).cross(d.clone().sub(b)).y;
      if (Math.abs(cross) > .001) {
        sign ||= Math.sign(cross);
        assert.equal(Math.sign(cross), sign, `${mesh.name}: folded first triangle`);
        if (Math.abs(cross2) > .001) assert.equal(Math.sign(cross2), sign, `${mesh.name}: folded second triangle`);
      }
      if (!strip.closed) assert.ok(a.distanceTo(c) < 12 && b.distanceTo(d) < 12,
        `${mesh.name}: closing triangle across an open strip`);
    }
  }
  assert.ok(strips.length >= 25);
});

test('Shanghai pit joins the road at both ends and replay uses the same pit geometry', () => {
  for (const s of [-420, 550]) assert.equal(pitLaneOffset(s), 0);
  for (const s of [-260, 0, 235, 360]) assert.equal(pitLaneOffset(s), 17);
  assert.equal(pitLaneOffset(5451 * 17), 17, 'pit phase must repeat each lap');
  const pit = world.surfaces.pit.geometry, count = pit.attributes.position.count;
  const begin = at(pit, 0).add(at(pit, 1)).multiplyScalar(.5);
  const end = at(pit, count - 2).add(at(pit, count - 1)).multiplyScalar(.5);
  assert.ok(begin.distanceTo(world.curve.getPointAt(1 - 420 / 5451)) < .04);
  assert.ok(end.distanceTo(world.curve.getPointAt(550 / 5451)) < .04);
  const session = { trackLengthMeters: 5451 };
  const stop = [{ tSec: 100, laneDurationSec: 24 }];
  const car = { progressMeters: 2 * 5451 - 190, speedKph: 80 };
  assert.equal(replayPitOffset(car, 100, session, stop, 1), 17);
  assert.equal(replayPitOffset({ ...car, speedKph: 0 }, 100, session, stop, 1), 20);
  assert.equal(replayPitOffset(car, 200, session, stop, 1), 1);
});

test('Shanghai rails form continuous runs and stay clear of every road branch', () => {
  assert.ok(world.safety.parts.length > 1000, 'continuous safety envelope missing');
  for (const side of [-1, 1]) {
    const parts = world.safety.parts.filter(p => p.side === side);
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].station - parts[i - 1].station !== world.safety.stepMeters) continue;
      assert.ok(parts[i].ends[0].distanceTo(parts[i - 1].ends[1]) < .9,
        'a regular gap remains between guardrail sections');
    }
  }
  // Verify the actual instanced rail corners, independently of the placement
  // filter. Compare them with all road samples, including nearby folded loops.
  const rail = scene.getObjectByName('Shanghai continuous lower safety rail');
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < rail.count; i++) {
    rail.getMatrixAt(i, matrix);
    for (const z of [-.5, .5]) {
      const point = new THREE.Vector3(0, 0, z).applyMatrix4(matrix);
      let nearest = Infinity;
      for (let j = 0; j < world.samples.length; j += 2) nearest = Math.min(nearest,
        Math.hypot(point.x - world.samples[j].x, point.z - world.samples[j].z));
      assert.ok(nearest > 11, `rail instance ${i} enters an adjacent road branch`);
    }
  }
});

test('Shanghai trees touch the shaped terrain and grid paint matches the car lanes', () => {
  const trunks = scene.getObjectByName('Shanghai park tree trunks'), matrix = new THREE.Matrix4();
  world.environment.trees.forEach((tree, i) => {
    trunks.getMatrixAt(i, matrix);
    const base = new THREE.Vector3(0, -1.75, 0).applyMatrix4(matrix);
    assert.ok(Math.abs(base.y - world.groundHeightAt(tree.x, tree.z)) < .001);
  });
  for (const slot of [1, 2, 21, 22]) {
    const marker = scene.getObjectByName(`Grid box ${slot}`);
    const u = ((world.gridU - (14.1 + (slot - 1) * 8) / 5451) % 1 + 1) % 1;
    const point = world.curve.getPointAt(u), f = world.curve.getTangentAt(u).setY(0).normalize();
    const across = new THREE.Vector3(f.z, 0, -f.x);
    const offset = marker.position.clone().sub(point).dot(across);
    assert.ok(Math.abs(offset - (slot % 2 ? 2.4 : -2.4)) < .001);
  }
  assert.ok(scene.getObjectByName('Shanghai wing roof diagonal structural struts'));
  assert.ok(scene.getObjectByName('Shanghai eleven team garage fascias'));
});

test('Shanghai terrain clears every road sample and every shoulder/pit vertex', () => {
  for (const point of world.samples) assert.ok(point.y - world.groundHeightAt(point.x, point.z) > .5,
    'terrain intersects an unsampled part of the racing line');
  scene.traverse(mesh => {
    if (!mesh.userData.strip) return;
    const vertices = mesh.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      assert.ok(y - world.groundHeightAt(x, z) > .3, `${mesh.name} is buried in terrain`);
    }
  });
});
