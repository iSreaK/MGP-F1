import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, CONFIG } from '../../dist/spielberg/track-data.js';
import { createCircuitWorld } from '../../dist/circuits-2026/world.js';
import { addEnvironment } from '../../dist/spielberg/environment.js';

const noop = () => {};
const context = new Proxy({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
}, { get: (target, key) => target[key] ?? noop });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
console.time('Complete Spielberg world');
const world = createCircuitWorld(THREE, new THREE.Scene(), TRACK_POINTS,
  structuredClone(CONFIG), addEnvironment);
console.timeEnd('Complete Spielberg world');
world.scene.updateMatrixWorld(true);

// Query the rendered triangles, rather than another nearest-road height.
const position = world.terrain.geometry.attributes.position;
const resolution = Math.round(Math.sqrt(position.count)) - 1;
const minX = position.getX(0), minZ = position.getZ(0);
const dx = position.getX(1) - minX, dz = position.getZ(resolution + 1) - minZ;
function renderedGround(x, z) {
  const xx = (x - minX) / dx, zz = (z - minZ) / dz;
  const i = Math.floor(xx), j = Math.floor(zz);
  if (i < 0 || j < 0 || i >= resolution || j >= resolution) return -5;
  const fx = xx - i, fz = zz - j, a = j * (resolution + 1) + i;
  const b = a + 1, c = a + resolution + 1, d = c + 1;
  return fx + fz <= 1
    ? position.getY(a) + fx * (position.getY(b) - position.getY(a)) + fz * (position.getY(c) - position.getY(a))
    : position.getY(d) + (1 - fx) * (position.getY(c) - position.getY(d)) + (1 - fz) * (position.getY(b) - position.getY(d));
}

// Reserve the full track width plus four metres on each side, at car height.
const probes = [];
for (let i = 0; i < world.count; i++) {
  const frame = world.frameAt(i / world.count), reserve = world.halfWidthAt(i / world.count) + 4;
  for (const ratio of [-1, -.5, 0, .5, 1])
    probes.push(frame.point.clone().addScaledVector(frame.across, reserve * ratio).add(new THREE.Vector3(0, 1.2, 0)));
}
for (const frame of world.pitSamples)
  for (const ratio of [-1, 0, 1])
    probes.push(frame.point.clone().addScaledVector(frame.across, (frame.halfWidth + 4) * ratio).add(new THREE.Vector3(0, 1.2, 0)));

let draws = 0, triangles = 0, instances = 0;
const roots = [], foundations = [], collisions = [];
const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
const v = new THREE.Vector3(), bounds = new THREE.Box3();
let minimumHorizonDistance = Infinity;
world.environment.group.traverse(mesh => {
  if (mesh.userData.minimumRoadDistance !== undefined)
    assert.ok(mesh.userData.minimumRoadDistance >= 14, mesh.name + ' footprint clearance');
  if (!mesh.isMesh) return;
  draws++;
  triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.count ?? 1);
  instances += mesh.count ?? 1;
  mesh.geometry.computeBoundingBox();
  const localBox = mesh.geometry.boundingBox;
  const isRoots = mesh.name.includes('tree trunks');
  const isFoundation = mesh.name.includes('terrain-reaching foundations');
  if (mesh.userData.horizon) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      minimumHorizonDistance = Math.min(minimumHorizonDistance, world.roadDistance(positions.getX(i), positions.getZ(i)));
  }
  for (let i = 0; i < (mesh.count ?? 1); i++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); }
    else matrix.copy(mesh.matrixWorld);
    assert.ok(matrix.determinant() > 0, mesh.name + ' reflected transform');
    const sourceName = mesh.userData.sourceNames?.[i] ?? mesh.name;
    if (isRoots || isFoundation || sourceName.includes('terrain-reaching pier')) {
      v.set(0, localBox.min.y, 0).applyMatrix4(matrix);
      const diff = v.y - renderedGround(v.x, v.z);
      (isRoots ? roots : foundations).push({ name: sourceName, diff, x: v.x, z: v.z });
    }
    if (/tree trunks|canopy|stream visible/.test(mesh.name) || mesh.userData.horizon) continue;
    bounds.copy(localBox).applyMatrix4(matrix);
    inverse.copy(matrix).invert();
    for (const point of probes) {
      if (!bounds.containsPoint(point)) continue;
      v.copy(point).applyMatrix4(inverse);
      if (localBox.containsPoint(v)) { collisions.push(sourceName); break; }
    }
  }
});

const summarize = list => ({ count: list.length,
  min: Math.min(...list.map(p => p.diff)), max: Math.max(...list.map(p => p.diff)) });
const rootStats = summarize(roots), foundationStats = summarize(foundations);
assert.equal(world.environment.landmarks.length, 12);
assert.equal(roots.length, 2100);
assert.ok(draws < 220, draws + ' environment submissions');
assert.ok(triangles < 240000, triangles + ' environment triangles');
assert.deepEqual(collisions, [], 'Road/pit reserve intersects venue geometry');
assert.ok(rootStats.max <= .15 && rootStats.min >= -.15, JSON.stringify({ rootStats }));
assert.ok(foundationStats.max <= .15, JSON.stringify({ foundationStats }));
assert.ok(minimumHorizonDistance > 1000, 'Horizon must stay well outside the venue');
const bull = world.environment.landmarks.find(item => item.name.startsWith('Der Bulle'));
const sculpture = bull.getObjectByName('Leaping Corten bull and silver arch');
const sculptureBounds = new THREE.Box3().setFromObject(sculpture);
const heightAboveDeck = sculptureBounds.max.y - bull.position.y - bull.userData.floorY;
assert.ok(Math.abs(heightAboveDeck - 17.2) < .08, 'Bull and arch overall height ' + heightAboveDeck);
const footprintData = world.environment.stats.architecturalFootprints;
for (let i = 0; i < footprintData.length; i++) for (let j = i + 1; j < footprintData.length; j++) {
  const a = footprintData[i], b = footprintData[j], delta = new THREE.Vector3(...b.center).sub(new THREE.Vector3(...a.center));
  const axes = [...[a.xAxis, a.zAxis, b.xAxis, b.zAxis].map(axis => new THREE.Vector3(...axis))];
  const disjoint = axes.some(axis => {
    const radius = item => Math.abs(new THREE.Vector3(...item.xAxis).dot(axis)) * item.width / 2
      + Math.abs(new THREE.Vector3(...item.zAxis).dot(axis)) * item.depth / 2;
    return Math.abs(delta.dot(axis)) > radius(a) + radius(b);
  });
  assert.ok(disjoint, a.name + ' overlaps ' + b.name);
}
console.log({ landmarks: world.environment.landmarks.length, draws, triangles, instances,
  batching: world.batching, roots: rootStats, foundations: foundationStats,
  testedRoadAndPitProbes: probes.length, collisions: collisions.length,
  minimumHorizonDistance, bullHeightAboveFoundation: heightAboveDeck });
