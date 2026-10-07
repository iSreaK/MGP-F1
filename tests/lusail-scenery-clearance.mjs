import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createLusailWorld } from '../dist/lusail/world.js';

// LUSAIL scenery is procedural and the different loops lie close together.
// Test finished world-space triangles, including stand roofs and mast feet,
// against both drivable surfaces rather than only checking object centres.
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
const { samples, environment, trackside } = createLusailWorld(THREE, scene);
scene.updateMatrixWorld(true);
const road = scene.getObjectByName('Lusail International Circuit racing surface');
const pit = scene.getObjectByName('Lusail pit entry, fast lane, working lane and exit');
const garages = scene.getObjectByName('Lusail pit garage concrete bays');
assert.ok(road?.isMesh, 'the LUSAIL racing surface exists');
assert.ok(pit?.isMesh, 'the LUSAIL pit lane exists');
assert.ok(garages?.isInstancedMesh, 'the pit complex exists');
assert.ok(environment?.group?.isGroup && trackside?.group?.isGroup);

const cellSize = 24;
const cells = new Map();
const segments = [];
const key = (x, z) => `${x},${z}`;
function addSegment(a, b, halfWidth, name) {
  const forward = b.clone().sub(a).setY(0).normalize();
  const across = new THREE.Vector3(forward.z, 0, -forward.x);
  const centre = a.clone().add(b).multiplyScalar(.5);
  const halfLength = Math.hypot(a.x - b.x, a.z - b.z) / 2 + .08;
  const id = segments.length;
  segments.push({ centre, forward, across, halfWidth, halfLength, name });
  const minX = Math.floor((Math.min(a.x, b.x) - halfWidth) / cellSize);
  const maxX = Math.floor((Math.max(a.x, b.x) + halfWidth) / cellSize);
  const minZ = Math.floor((Math.min(a.z, b.z) - halfWidth) / cellSize);
  const maxZ = Math.floor((Math.max(a.z, b.z) + halfWidth) / cellSize);
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
    const cell = key(x, z);
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(id);
  }
}
const roadVertices = road.geometry.getAttribute('position');
for (let i = 0; i < samples.length; i++) {
  const left = new THREE.Vector3().fromBufferAttribute(roadVertices, i * 4);
  const right = new THREE.Vector3().fromBufferAttribute(roadVertices, i * 4 + 1);
  addSegment(samples[i], samples[(i + 1) % samples.length],
    left.distanceTo(right) / 2 + 3, 'race road');
}
const pitVertices = pit.geometry.getAttribute('position');
for (let i = 0; i < pitVertices.count; i += 4) {
  const nearA = new THREE.Vector3().fromBufferAttribute(pitVertices, i)
    .applyMatrix4(pit.matrixWorld);
  const farA = new THREE.Vector3().fromBufferAttribute(pitVertices, i + 1)
    .applyMatrix4(pit.matrixWorld);
  const nearB = new THREE.Vector3().fromBufferAttribute(pitVertices, i + 2)
    .applyMatrix4(pit.matrixWorld);
  const farB = new THREE.Vector3().fromBufferAttribute(pitVertices, i + 3)
    .applyMatrix4(pit.matrixWorld);
  addSegment(nearA.clone().add(farA).multiplyScalar(.5),
    nearB.clone().add(farB).multiplyScalar(.5),
    Math.max(nearA.distanceTo(farA), nearB.distanceTo(farB)) / 2 + 3,
    'pit lane');
}
function nearbySegments(a, b, c) {
  const minX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
  const maxX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
  const minZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
  const maxZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
  const matches = new Set();
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
    for (const id of cells.get(key(x, z)) ?? []) matches.add(id);
  }
  return matches;
}

const relative = new THREE.Vector3();
const localA = new THREE.Vector3();
const localB = new THREE.Vector3();
const localC = new THREE.Vector3();
const vertexA = new THREE.Vector3();
const vertexB = new THREE.Vector3();
const vertexC = new THREE.Vector3();
const triangle = new THREE.Triangle();
const roadBox = new THREE.Box3();
const instanceMatrix = new THREE.Matrix4();
const transform = new THREE.Matrix4();
const categories = new Set();
const collisions = [];
let checkedTriangles = 0;
let segmentChecks = 0;
function localize(vertex, segment, target) {
  relative.subVectors(vertex, segment.centre);
  return target.set(relative.dot(segment.across),
    vertex.y - segment.centre.y, relative.dot(segment.forward));
}
function inspect(mesh, category) {
  categories.add(category);
  const positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getIndex();
  const triangles = (indices?.count ?? positions.count) / 3;
  const instances = mesh.isInstancedMesh ? mesh.count : 1;
  for (let item = 0; item < instances; item++) {
    transform.copy(mesh.matrixWorld);
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(item, instanceMatrix);
      transform.multiply(instanceMatrix);
    }
    for (let t = 0; t < triangles; t++) {
      const a = indices ? indices.getX(t * 3) : t * 3;
      const b = indices ? indices.getX(t * 3 + 1) : t * 3 + 1;
      const c = indices ? indices.getX(t * 3 + 2) : t * 3 + 2;
      vertexA.fromBufferAttribute(positions, a).applyMatrix4(transform);
      vertexB.fromBufferAttribute(positions, b).applyMatrix4(transform);
      vertexC.fromBufferAttribute(positions, c).applyMatrix4(transform);
      checkedTriangles++;
      for (const id of nearbySegments(vertexA, vertexB, vertexC)) {
        const segment = segments[id];
        localize(vertexA, segment, localA);
        localize(vertexB, segment, localB);
        localize(vertexC, segment, localC);
        roadBox.min.set(-segment.halfWidth, -1.1, -segment.halfLength);
        roadBox.max.set(segment.halfWidth, 200,
          segment.halfLength);
        triangle.set(localA, localB, localC);
        segmentChecks++;
        if (!roadBox.intersectsTriangle(triangle)) continue;
        collisions.push({ category, mesh: mesh.name || mesh.geometry.type,
          instance: mesh.isInstancedMesh ? item : undefined,
          surface: segment.name, segment: id,
          x: +segment.centre.x.toFixed(1), z: +segment.centre.z.toFixed(1),
          y: +segment.centre.y.toFixed(1) });
        return;
      }
    }
  }
}
for (const object of [environment.group, trackside.group]) {
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    // Armco itself is meant to approach the edge of run-off. Keep it in this
    // audit; only normal non-solid line wires are excluded by mesh filtering.
    let ancestor = mesh.parent;
    while (ancestor && ancestor !== object && !ancestor.name) ancestor = ancestor.parent;
    inspect(mesh, ancestor && ancestor !== object ? ancestor.name : mesh.name);
  });
}
for (const name of [
  'Lusail pit garage concrete bays',
  'Pit garage roller shutters',
  'Pit garage upper glazing',
  'Pit building roof modules',
  'Pit building canopy light strips',
  'Pit building dark fascia',
]) {
  const mesh = scene.getObjectByName(name);
  assert.ok(mesh?.isMesh, `${name} exists`);
  inspect(mesh, name);
}

for (const name of [
  'Lusail Main Grandstand',
  'Lusail North Grandstand',
  'Lusail T2 Grandstand',
  'Lusail T3 Grandstand',
  'Lusail T16 Grandstand',
  'Lusail paddock hospitality and media centre',
  'Lusail spectator fanzone',
  'Lusail perimeter floodlight masts',
]) {
  assert.ok(categories.has(name), `${name} is present and was checked`);
}
assert.ok(checkedTriangles > 18000 && segmentChecks > 1000,
  'the full LUSAIL scenery collision audit ran');
assert.equal(collisions.length, 0,
  `LUSAIL scenery intrudes into the road or pit lane: ${JSON.stringify(collisions.slice(0, 20), null, 2)}`);
console.log('LUSAIL scenery clearance OK:', {
  landmarkGroups: categories.size, checkedTriangles, segmentChecks,
  grandstands: environment.grandstandCount,
  barriers: trackside.barrierCount, fencePosts: trackside.fencePostCount,
});
