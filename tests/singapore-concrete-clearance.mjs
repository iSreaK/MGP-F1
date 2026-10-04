import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createSingaporeWorld } from '../dist/singapore/world.js';
import { PIT_START_LANE_CENTER } from '../dist/singapore/grid-details.js';

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
const pit = scene.getObjectByName('Singapore pit entry, fast lane, working lane and exit');
const dividers = scene.getObjectByName('Pit-lane separation concrete blocks');
assert.ok(road?.isMesh && pit?.isMesh && dividers?.isInstancedMesh);

const cellSize = 12;
const buckets = new Map();
const cell = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
for (let i = 0; i < samples.length; i++) {
  const point = samples[i];
  const key = cell(point.x, point.z);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(i);
}
function nearestCentreline(point) {
  const cx = Math.floor(point.x / cellSize);
  const cz = Math.floor(point.z / cellSize);
  let best = { distance: Infinity, index: -1 };
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      for (const index of buckets.get(`${x},${z}`) ?? []) {
        const sample = samples[index];
        const distance = Math.hypot(point.x - sample.x, point.z - sample.z);
        if (distance < best.distance) best = { distance, index };
      }
    }
  }
  assert.ok(best.index >= 0, 'concrete lies near the circuit');
  return best;
}

const roadVertices = road.geometry.getAttribute('position');
const roadHalfWidthAt = index => {
  const left = new THREE.Vector3().fromBufferAttribute(roadVertices, index * 4);
  return left.distanceTo(samples[index]);
};
const pitVertices = pit.geometry.getAttribute('position');
const pitQuads = [];
for (let i = 0; i < pitVertices.count; i += 4) {
  pitQuads.push([0, 1, 2, 3].map(offset => ({
    x: pitVertices.getX(i + offset), z: pitVertices.getZ(i + offset),
  })));
}
const signedArea = (a, b, c) => (b.x - a.x) * (c.z - a.z)
  - (b.z - a.z) * (c.x - a.x);
function insideTriangle(point, a, b, c) {
  const areas = [signedArea(a, b, point), signedArea(b, c, point),
    signedArea(c, a, point)];
  return areas.every(value => value >= -1e-3)
    || areas.every(value => value <= 1e-3);
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx
    + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

const matrix = new THREE.Matrix4();
let minRaceClearance = Infinity;
let minPitPathClearance = Infinity;
let minPitWidth = Infinity;
for (let i = 0; i < dividers.count; i++) {
  dividers.getMatrixAt(i, matrix);
  matrix.premultiply(dividers.matrixWorld);
  const corners = [];
  for (const x of [-.36, .36]) for (const z of [-1.79, 1.79]) {
    corners.push(new THREE.Vector3(x, 0, z).applyMatrix4(matrix));
  }
  for (const corner of corners) {
    const { distance, index } = nearestCentreline(corner);
    minRaceClearance = Math.min(minRaceClearance,
      distance - roadHalfWidthAt(index));
  }

  const centre = new THREE.Vector3().setFromMatrixPosition(matrix);
  const { index } = nearestCentreline(centre);
  const forward = samples[(index + 1) % samples.length].clone()
    .sub(samples[(index - 1 + samples.length) % samples.length]).normalize();
  const across = new THREE.Vector3(forward.z, 0, -forward.x);
  const path = samples[index].clone().addScaledVector(across, PIT_START_LANE_CENTER);
  const point = { x: path.x, z: path.z };
  const quad = pitQuads.find(([a, b, c, d]) =>
    insideTriangle(point, a, b, c) || insideTriangle(point, b, c, d));
  assert.ok(quad, `pit path must stay on asphalt beside divider ${i}`);
  const [nearA, farA, nearB, farB] = quad;
  minPitWidth = Math.min(minPitWidth,
    Math.hypot(nearA.x - farA.x, nearA.z - farA.z));
  minPitPathClearance = Math.min(minPitPathClearance,
    segmentDistance(point, nearA, nearB),
    segmentDistance(point, farA, farB));
}

assert.ok(minRaceClearance > 1.0,
  `pit concrete protrudes into the race-road wall corridor (${minRaceClearance.toFixed(2)} m)`);
assert.ok(minPitWidth > 12.0,
  `pit lane narrows beside the concrete (${minPitWidth.toFixed(2)} m)`);
assert.ok(minPitPathClearance > 4.0,
  `pit-driving line collides with the divider (${minPitPathClearance.toFixed(2)} m)`);
console.log('Singapore pit concrete clearance OK:', {
  dividerCount: dividers.count,
  minRaceClearanceMetres: +minRaceClearance.toFixed(2),
  minPitLaneWidthMetres: +minPitWidth.toFixed(2),
  minPitPathClearanceMetres: +minPitPathClearance.toFixed(2),
});
