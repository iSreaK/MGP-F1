import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createSingaporeWorld } from '../dist/singapore/world.js';

// The scenery is procedural, so test its finished world-space triangles. A
// landmark's centre can be clear while a roof, dome, bridge or stand crosses
// the road several dozen metres away from that centre.
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
const { samples, environment } = createSingaporeWorld(THREE, scene);
scene.updateMatrixWorld(true);
const road = scene.getObjectByName('Marina Bay Street Circuit racing surface');
const pit = scene.getObjectByName('Singapore pit entry, fast lane, working lane and exit');
assert.ok(road?.isMesh && pit?.isMesh && environment?.group?.isGroup);

// Cars and their camera have room to pass beneath legitimate overhead
// structures. The rendered racing ribbon itself is 10 m wide; the scenery
// must also clear the roughly 3 m barrier/fence corridor outside its edge.
const roadY = samples[0].y;
const minimumClearHeight = 5.2;
const roadEdgeMargin = 3;
const cellSize = 24;
const cellKey = (x, z) => `${x},${z}`;
const roadCells = new Map();
const roadVertices = road.geometry.getAttribute('position');
const segments = [];
function addDrivingSegment(a, b, halfWidth, name) {
  const forward = b.clone().sub(a).setY(0).normalize();
  const across = new THREE.Vector3(forward.z, 0, -forward.x);
  const centre = a.clone().add(b).multiplyScalar(.5);
  const halfLength = a.distanceTo(b) / 2 + .04;
  const index = segments.length;
  segments.push({ centre, forward, across, halfWidth, halfLength, name });
  const minX = Math.floor((Math.min(a.x, b.x) - halfWidth) / cellSize);
  const maxX = Math.floor((Math.max(a.x, b.x) + halfWidth) / cellSize);
  const minZ = Math.floor((Math.min(a.z, b.z) - halfWidth) / cellSize);
  const maxZ = Math.floor((Math.max(a.z, b.z) + halfWidth) / cellSize);
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
    const key = cellKey(x, z);
    if (!roadCells.has(key)) roadCells.set(key, []);
    roadCells.get(key).push(index);
  }
}
for (let i = 0; i < samples.length; i++) {
  const next = (i + 1) % samples.length;
  const a = samples[i], b = samples[next];
  const left = new THREE.Vector3().fromBufferAttribute(roadVertices, i * 4);
  const right = new THREE.Vector3().fromBufferAttribute(roadVertices, i * 4 + 1);
  const halfWidth = left.distanceTo(right) / 2 + roadEdgeMargin;
  addDrivingSegment(a, b, halfWidth, 'race road');
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
  const a = nearA.clone().add(farA).multiplyScalar(.5);
  const b = nearB.clone().add(farB).multiplyScalar(.5);
  addDrivingSegment(a, b, Math.max(nearA.distanceTo(farA),
    nearB.distanceTo(farB)) / 2 + roadEdgeMargin, 'pit lane');
}

const roadBox = new THREE.Box3();
const localTriangle = new THREE.Triangle();
const relative = new THREE.Vector3();
const transform = new THREE.Matrix4();
const instance = new THREE.Matrix4();
const vertexA = new THREE.Vector3();
const vertexB = new THREE.Vector3();
const vertexC = new THREE.Vector3();
const localA = new THREE.Vector3();
const localB = new THREE.Vector3();
const localC = new THREE.Vector3();
const checked = { meshCount: 0, triangleCount: 0, segmentTests: 0 };
const collisions = [];
const categories = new Set();

function candidateSegments(a, b, c) {
  const minX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
  const maxX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
  const minZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
  const maxZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
  const matches = new Set();
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
    for (const index of roadCells.get(cellKey(x, z)) ?? []) matches.add(index);
  }
  return matches;
}

function roadLocal(point, segment, result) {
  relative.subVectors(point, segment.centre);
  return result.set(relative.dot(segment.across), point.y - roadY,
    relative.dot(segment.forward));
}

function inspectMesh(mesh, category) {
  categories.add(category);
  // These objects are beside the road in Singapore. Even a high roof
  // overhanging the circuit is a misplaced landmark, rather than a useful
  // overhead bridge or gantry. Other city objects may legitimately clear a
  // driving vehicle vertically, hence the 5.2 m rule above.
  const mustStayBesideRoad = /grandstand|ArtScience|Esplanade|Helix Bridge|Singapore Flyer|Marina Bay Sands/i
    .test(category);
  const positions = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const triangleCount = (index?.count ?? positions.count) / 3;
  const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;
  checked.meshCount++;
  for (let item = 0; item < instanceCount; item++) {
    transform.copy(mesh.matrixWorld);
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(item, instance);
      transform.multiply(instance);
    }
    for (let t = 0; t < triangleCount; t++) {
      const a = index ? index.getX(3 * t) : 3 * t;
      const b = index ? index.getX(3 * t + 1) : 3 * t + 1;
      const c = index ? index.getX(3 * t + 2) : 3 * t + 2;
      vertexA.fromBufferAttribute(positions, a).applyMatrix4(transform);
      vertexB.fromBufferAttribute(positions, b).applyMatrix4(transform);
      vertexC.fromBufferAttribute(positions, c).applyMatrix4(transform);
      checked.triangleCount++;
      if ((!mustStayBesideRoad
        && Math.min(vertexA.y, vertexB.y, vertexC.y) > roadY + minimumClearHeight)
        || Math.max(vertexA.y, vertexB.y, vertexC.y) < roadY) continue;
      for (const index of candidateSegments(vertexA, vertexB, vertexC)) {
        const segment = segments[index];
        roadLocal(vertexA, segment, localA);
        roadLocal(vertexB, segment, localB);
        roadLocal(vertexC, segment, localC);
        roadBox.min.set(-segment.halfWidth, 0, -segment.halfLength);
        roadBox.max.set(segment.halfWidth,
          mustStayBesideRoad ? 300 : minimumClearHeight, segment.halfLength);
        localTriangle.set(localA, localB, localC);
        checked.segmentTests++;
        if (!roadBox.intersectsTriangle(localTriangle)) continue;
        collisions.push({ category, mesh: mesh.name || mesh.geometry.type,
          child: mesh.parent?.children.indexOf(mesh),
          instance: mesh.isInstancedMesh ? item : undefined,
          surface: segment.name, segment: index,
          x: +segment.centre.x.toFixed(1), z: +segment.centre.z.toFixed(1),
          triangleHeight: [vertexA.y, vertexB.y, vertexC.y].map(y => +y.toFixed(1)),
          forbiddenOverhang: mustStayBesideRoad });
        return;
      }
    }
  }
}

environment.group.traverse(object => {
  if (!object.isMesh) return;
  if ([
    'Paved city streets behind the barriers',
    'Marina Bay dark water, approximate shoreline',
  ].includes(object.name)) return;
  let ancestor = object.parent;
  while (ancestor && ancestor !== environment.group && !ancestor.name) {
    ancestor = ancestor.parent;
  }
  inspectMesh(object, ancestor && ancestor !== environment.group
    ? ancestor.name : object.name);
});

assert.equal([...categories].filter(name => name.startsWith('Singapore spectator grandstand')).length, 6);
for (const name of ['ArtScience Museum illuminated lotus',
  'Esplanade theatres, twin domes', 'Helix Bridge over Marina Bay',
  'Marina Bay Sands hotel and skypark, stylised',
  'Singapore Flyer observation wheel, stylised']) {
  assert.ok(categories.has(name), `${name} must be included in the geometry audit`);
}
assert.ok(checked.meshCount > 75 && checked.triangleCount > 10000
  && checked.segmentTests > 1000, 'scenery triangle audit did not inspect the whole environment');

// A relocated landmark must not be pushed into a generated hotel or office.
// Broad-phase world boxes keep this cheap; the final check intersects the
// landmark's actual triangles with the oriented box of each instanced block.
const landmarkGroups = environment.group.children.filter(object => object.isGroup
  && /grandstand|ArtScience|Esplanade|Helix Bridge|Singapore Flyer|Marina Bay Sands/i
    .test(object.name));
const pieces = [];
for (const group of landmarkGroups) {
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    for (let item = 0; item < (mesh.isInstancedMesh ? mesh.count : 1); item++) {
      const matrix = mesh.matrixWorld.clone();
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(item, instance);
        matrix.multiply(instance);
      }
      pieces.push({ group: group.name, mesh: mesh.name || mesh.geometry.type,
        child: mesh.parent?.children.indexOf(mesh), item,
        geometry: mesh.geometry, matrix,
        box: mesh.geometry.boundingBox.clone().applyMatrix4(matrix) });
    }
  });
}
const unitBox = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5),
  new THREE.Vector3(.5, .5, .5));
const buildingClashes = [];
for (const building of environment.group.children) {
  if (!building.isInstancedMesh
    || !/^Marina Bay (glass|hotels|civic)/.test(building.name)) continue;
  building.geometry.computeBoundingBox();
  for (let item = 0; item < building.count; item++) {
    building.getMatrixAt(item, instance);
    const buildingMatrix = building.matrixWorld.clone().multiply(instance);
    const buildingBox = building.geometry.boundingBox.clone().applyMatrix4(buildingMatrix);
    const inverse = buildingMatrix.clone().invert();
    for (const piece of pieces) {
      if (!buildingBox.intersectsBox(piece.box)) continue;
      const inBuilding = inverse.clone().multiply(piece.matrix);
      const positions = piece.geometry.getAttribute('position');
      const indices = piece.geometry.getIndex();
      const triangles = (indices?.count ?? positions.count) / 3;
      let intersects = false;
      for (let t = 0; t < triangles; t++) {
        const a = indices ? indices.getX(t * 3) : t * 3;
        const b = indices ? indices.getX(t * 3 + 1) : t * 3 + 1;
        const c = indices ? indices.getX(t * 3 + 2) : t * 3 + 2;
        vertexA.fromBufferAttribute(positions, a).applyMatrix4(inBuilding);
        vertexB.fromBufferAttribute(positions, b).applyMatrix4(inBuilding);
        vertexC.fromBufferAttribute(positions, c).applyMatrix4(inBuilding);
        localTriangle.set(vertexA, vertexB, vertexC);
        if (unitBox.intersectsTriangle(localTriangle)) {
          intersects = true;
          break;
        }
      }
      if (intersects) buildingClashes.push({ building: building.name,
        instance: item, landmark: piece.group, mesh: piece.mesh,
        child: piece.child, landmarkInstance: piece.item });
    }
  }
}

assert.equal(collisions.length + buildingClashes.length, 0,
  `Singapore scenery collisions: ${JSON.stringify({ drivingSurfaces: collisions,
    buildings: buildingClashes.slice(0, 25), buildingClashCount: buildingClashes.length }, null, 2)}`);
console.log('Singapore scenery clearance OK:', { ...checked,
  landmarkPieces: pieces.length });
