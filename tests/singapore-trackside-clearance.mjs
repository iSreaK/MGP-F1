import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createSingaporeWorld } from '../dist/singapore/world.js';

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
const { samples } = createSingaporeWorld(THREE, scene);
scene.updateMatrixWorld(true);
const road = scene.getObjectByName('Marina Bay Street Circuit racing surface');
const wall = scene.getObjectByName('Close concrete street-circuit walls');
assert.ok(road?.isMesh && wall?.isMesh);

const roadPositions = road.geometry.getAttribute('position');
const wallPositions = wall.geometry.getAttribute('position');
const roadHalfWidth = 5;
const cellSize = 12;
const cells = new Map();
const key = (ix, iz) => `${ix},${iz}`;
for (let i = 0; i < samples.length; i++) {
  const a = samples[i], b = samples[(i + 1) % samples.length];
  const x0 = Math.floor((Math.min(a.x, b.x) - 15) / cellSize);
  const x1 = Math.floor((Math.max(a.x, b.x) + 15) / cellSize);
  const z0 = Math.floor((Math.min(a.z, b.z) - 15) / cellSize);
  const z1 = Math.floor((Math.max(a.z, b.z) + 15) / cellSize);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const k = key(ix, iz);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  }
}
function roadClearance(x, z) {
  const ix = Math.floor(x / cellSize), iz = Math.floor(z / cellSize);
  let nearest = Infinity, nearestIndex = -1;
  for (const i of cells.get(key(ix, iz)) ?? []) {
    const a = samples[i], b = samples[(i + 1) % samples.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1,
      ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (distance < nearest) { nearest = distance; nearestIndex = i; }
  }
  return { clearance: nearest - roadHalfWidth, nearestIndex };
}

let minimum = { clearance: Infinity, wallVertex: -1, nearestIndex: -1 };
let intrusions = 0;
for (let i = 0; i < wallPositions.count; i += 12) {
  // Each 12-vertex panel has the road-facing wall surface in its first four.
  const ax = wallPositions.getX(i), az = wallPositions.getZ(i);
  const bx = wallPositions.getX(i + 2), bz = wallPositions.getZ(i + 2);
  for (let sample = 0; sample <= 4; sample++) {
    const t = sample / 4;
    const result = roadClearance(ax + t * (bx - ax), az + t * (bz - az));
    assert.ok(Number.isFinite(result.clearance), 'a wall point has no nearby road segment');
    if (result.clearance < minimum.clearance) {
      minimum = { ...result, wallVertex: i, sample };
    }
    if (result.clearance < .25) intrusions++;
  }
}

for (let i = 0; i < samples.length; i++) {
  const centre = samples[i];
  const edge = new THREE.Vector3().fromBufferAttribute(roadPositions, i * 4);
  assert.ok(Math.abs(edge.distanceTo(centre) - roadHalfWidth) < .01);
}
assert.ok(minimum.clearance > 1,
  `street wall enters road corridor at sample ${minimum.nearestIndex}: ${minimum.clearance.toFixed(2)} m`);
assert.equal(intrusions, 0, 'street wall intrudes into racing surface');
const groundFixtures = [
  ['Catch-fence uprights', .09],
  ['Singapore night-race floodlight masts', .16],
];
const fixtureClearances = {};
const instanceMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
for (const [name, halfFootprint] of groundFixtures) {
  const mesh = scene.getObjectByName(name);
  assert.ok(mesh?.isInstancedMesh, `${name} exists`);
  let clearance = Infinity;
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, instanceMatrix);
    position.setFromMatrixPosition(instanceMatrix).applyMatrix4(mesh.matrixWorld);
    const distance = roadClearance(position.x, position.z).clearance - halfFootprint;
    assert.ok(Number.isFinite(distance), `${name} ${i} has no nearby road segment`);
    clearance = Math.min(clearance, distance);
  }
  assert.ok(clearance > 1,
    `${name} enters the racing surface corridor: ${clearance.toFixed(2)} m`);
  fixtureClearances[name] = +clearance.toFixed(2);
}
console.log('Singapore trackside walls clear the road:', {
  wallPanels: wallPositions.count / 12,
  minimumClearanceMetres: +minimum.clearance.toFixed(2),
  nearestRoadSample: minimum.nearestIndex,
  fixtureClearances,
});
