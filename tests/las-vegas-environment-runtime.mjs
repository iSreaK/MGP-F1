import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS } from '../dist/las-vegas/track-data.js';
import { prepareVegasCurve } from '../dist/las-vegas/geometry-smoothing.js';
import { addVegasEnvironment } from '../dist/las-vegas/environment.js';

globalThis.document = { createElement: () => ({
  width: 0, height: 0,
  getContext: () => new Proxy({}, {
    get: (_, key) => key === 'createLinearGradient'
      ? () => ({ addColorStop() {} }) : () => {},
    set: () => true,
  }),
}) };

test('Vegas environment builds with bounded batches and every venue present', () => {
  const { curve } = prepareVegasCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
  const frames = Array.from({ length: 1860 }, (_, i) => {
    const u = i / 1860;
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x), u };
  });
  const scene = new THREE.Scene();
  const result = addVegasEnvironment(THREE, scene, curve, frames);
  assert.equal(result.venueDetails.grandstands.length, 6);
  assert.ok(result.venueDetails.highRoller);
  assert.ok(result.venueDetails.palmCount >= 80);
  let drawCalls = 0, instances = 0, displayedTriangles = 0;
  scene.traverse(object => {
    if (!object.isMesh && !object.isLineSegments) return;
    drawCalls++;
    const position = object.geometry.getAttribute('position');
    const tri = object.geometry.index ? object.geometry.index.count / 3
      : position?.count / 3 || 0;
    const count = object.isInstancedMesh ? object.count : 1;
    instances += count;
    displayedTriangles += tri * count;
  });
  assert.ok(drawCalls < 250, 'too many separate scenery draw calls: ' + drawCalls);
  assert.ok(displayedTriangles < 450000,
    'too much scenery geometry: ' + displayedTriangles);
  assert.ok(instances < 20000, 'too many scenery instances: ' + instances);
  console.log('Vegas static scenery: ' + drawCalls + ' draw calls, ' +
    instances + ' instances, ' + Math.round(displayedTriangles) +
    ' displayed triangles; ' + result.venueDetails.palmCount +
    ' palms and ' + result.venueDetails.storeCount + ' shops.');
});
