import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { createSingaporeWorld } from '../../dist/singapore/world.js';

// CanvasTexture only needs a paintable canvas here; no WebGL context is used.
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
const world = createSingaporeWorld(THREE, scene);
const road = scene.getObjectByName('Marina Bay Street Circuit racing surface');
const overview = scene.getObjectByName('Overview circuit silhouette');
const edgeLine = scene.getObjectByName('Right street-circuit edge line');
const pit = scene.getObjectByName('Singapore pit entry, fast lane, working lane and exit');
const pitPaint = scene.getObjectByName('Pit lane edge paint');
assert.ok(road?.isMesh && overview?.isMesh && edgeLine?.isMesh
  && pit?.isMesh && pitPaint?.isMesh);
assert.equal(overview.material, world.overviewAccent);
assert.equal(overview.material.opacity, 0,
  'overview tint is invisible in the normal trackside view');
assert.ok(overview.geometry.getAttribute('position').getY(0)
  > road.geometry.getAttribute('position').getY(0),
  'overview tint is above the road and visible from high camera positions');
assert.ok(overview.geometry.getAttribute('position').getY(0)
  < edgeLine.geometry.getAttribute('position').getY(0),
  'overview tint does not hide the painted road edge');

const roadVertices = road.geometry.getAttribute('position');
const samples = roadVertices.count / 4;
const widths = [];
for (let i = 0; i < samples; i++) {
  const u = i / samples;
  const point = world.curve.getPointAt(u);
  const tangent = world.curve.getTangentAt(u).setY(0).normalize();
  const across = new THREE.Vector3(tangent.z, 0, -tangent.x);
  const left = new THREE.Vector3().fromBufferAttribute(roadVertices, i * 4);
  const right = new THREE.Vector3().fromBufferAttribute(roadVertices, i * 4 + 1);
  const leftOffset = left.sub(point).dot(across);
  const rightOffset = right.sub(point).dot(across);
  assert.ok(Math.abs(leftOffset + rightOffset) < .002,
    'road edges remain symmetric about the FIA centreline');
  widths.push(rightOffset);
}
const narrowest = Math.min(...widths);
const widest = Math.max(...widths);
assert.ok(Math.abs(narrowest - 5) < .005 && Math.abs(widest - 5) < .005,
  'road stays at the estimated 10 m width until surveyed widths are available');
assert.ok(widest - narrowest < .005,
  'artificial width waves do not bend the painted lines on long straights');
assert.ok(6.49 - widest > 1.1, 'widest road retains wall clearance');
for (let i = 0; i < samples; i++) {
  const next = (i + 1) % samples;
  assert.ok(Math.abs(widths[i] - widths[next]) < .02,
    'road width changes smoothly between rendered samples');
}

const pitVertices = pit.geometry.getAttribute('position');
const paintVertices = pitPaint.geometry.getAttribute('position');
const cross = (a, b, p) => (b.x - a.x) * (p.z - a.z)
  - (b.z - a.z) * (p.x - a.x);
const segmentDistance = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1,
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};
const triangleContains = (p, a, b, c) => {
  const ab = cross(a, b, p), bc = cross(b, c, p), ca = cross(c, a, p);
  return (ab >= -1e-4 && bc >= -1e-4 && ca >= -1e-4)
    || (ab <= 1e-4 && bc <= 1e-4 && ca <= 1e-4);
};
const pitQuads = [];
for (let i = 0; i < pitVertices.count; i += 4) {
  pitQuads.push([0, 1, 2, 3].map(k => ({
    x: pitVertices.getX(i + k), z: pitVertices.getZ(i + k),
  })));
}
let maxPaintOutside = 0;
for (let i = 0; i < paintVertices.count; i++) {
  const p = { x: paintVertices.getX(i), z: paintVertices.getZ(i) };
  let nearest = Infinity;
  for (const [a, b, c, d] of pitQuads) {
    if (triangleContains(p, a, b, c) || triangleContains(p, b, c, d)) {
      nearest = 0;
      break;
    }
    nearest = Math.min(nearest,
      segmentDistance(p, a, b), segmentDistance(p, b, d),
      segmentDistance(p, d, c), segmentDistance(p, c, a));
  }
  maxPaintOutside = Math.max(maxPaintOutside, nearest);
}
assert.ok(maxPaintOutside < .16,
  'pit edge paint stays on the generated pit asphalt');

console.log('Singapore road and pit geometry OK:', {
  widthMetres: [Number((narrowest * 2).toFixed(2)),
    Number((widest * 2).toFixed(2))],
  minWallClearanceMetres: Number((6.49 - widest).toFixed(2)),
  maxPitPaintOutsideMetres: Number(maxPaintOutside.toFixed(3)),
});
