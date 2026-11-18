import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, CONFIG } from '../../dist/barcelona/track-data.js';
import { createCircuitWorld } from '../../dist/circuits-2026/world.js';
import { addEnvironment } from '../../dist/barcelona/environment.js';

const noop = () => {};
const context = new Proxy({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
}, { get: (target, key) => target[key] ?? noop });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
console.time('Complete Barcelona world');
const world = createCircuitWorld(THREE, new THREE.Scene(), TRACK_POINTS,
  structuredClone(CONFIG), addEnvironment);
console.timeEnd('Complete Barcelona world');
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

let draws = 0, triangles = 0, instances = 0, maximumFloatingFoot = -Infinity;
const roots = [], foundations = [], collisions = [];
const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
const v = new THREE.Vector3(), bounds = new THREE.Box3();
world.environment.group.traverse(mesh => {
  if (!mesh.isMesh) return;
  draws++;
  triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.count ?? 1);
  instances += mesh.count ?? 1;
  mesh.geometry.computeBoundingBox();
  const localBox = mesh.geometry.boundingBox;
  const isRoots = /tree trunks/.test(mesh.name);
  const isFoundation = mesh.name.includes('terrain-reaching foundations');
  for (let i = 0; i < (mesh.count ?? 1); i++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); }
    else matrix.copy(mesh.matrixWorld);
    assert.ok(matrix.determinant() > 0, mesh.name + ' reflected transform');
    const sourceName = mesh.userData.sourceNames?.[i] ?? mesh.name;
    if (isRoots || isFoundation || sourceName === 'Terrain-reaching foundation') {
      v.set(0, localBox.min.y, 0).applyMatrix4(matrix);
      const diff = v.y - renderedGround(v.x, v.z);
      (isRoots ? roots : foundations).push({ name: sourceName, diff, x: v.x, z: v.z });
      if (!isRoots) for (let ix=0;ix<=4;ix++) for(let iz=0;iz<=4;iz++) {
        v.set(localBox.min.x+(localBox.max.x-localBox.min.x)*ix/4,localBox.min.y,
          localBox.min.z+(localBox.max.z-localBox.min.z)*iz/4).applyMatrix4(matrix);
        maximumFloatingFoot=Math.max(maximumFloatingFoot,v.y-renderedGround(v.x,v.z));
      }
    }
    if (/tree trunks|canopy|stream visible/.test(mesh.name)) continue;
    bounds.copy(localBox).applyMatrix4(matrix);
    inverse.copy(matrix).invert();
    for (const point of probes) {
      if (!bounds.containsPoint(point)) continue;
      v.copy(point).applyMatrix4(inverse);
      if (localBox.containsPoint(v)) { collisions.push(mesh.parent.name+" : "+sourceName+" at "+point.toArray().map(p=>p.toFixed(1)).join(",")); break; }
    }
  }
});

const summarize = list => ({ count: list.length,
  min: Math.min(...list.map(p => p.diff)), max: Math.max(...list.map(p => p.diff)) });
const rootStats = summarize(roots), foundationStats = summarize(foundations);


assert.ok(draws < 200, draws + ' environment submissions');
assert.ok(triangles < 240000, triangles + ' environment triangles');
assert.deepEqual(collisions, [], 'Venue intersects road/pit with four-metre reserve');
assert.ok(rootStats.max <= .15 && rootStats.min >= -.15, JSON.stringify({ rootStats }));
assert.ok(foundationStats.max <= .02, JSON.stringify({foundationStats}));
assert.ok(maximumFloatingFoot <= .04, 'Foundation foot floats '+maximumFloatingFoot+' m');
const rooftop=world.environment.landmarks.find(item=>item.name.startsWith('Circuit Rooftop'));
let roofClearance=Infinity, roofProbes=0;
for(const probe of probes){const local=rooftop.worldToLocal(probe.clone());
 if(Math.abs(local.x)<=38.5&&Math.abs(local.z)<=7){roofClearance=Math.min(roofClearance,14.6-local.y+1.2);roofProbes++;}}
assert.ok(roofProbes>0);assert.ok(roofClearance>=12,'Rooftop vertical clearance '+roofClearance);
const supports=[];
rooftop.traverse(mesh=>{if(!mesh.isMesh)return;for(let i=0;i<(mesh.count??1);i++){
 const name=mesh.userData.sourceNames?.[i]??mesh.name;if(name!=='Terrain-reaching foundation')continue;
 if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
 const center=rooftop.worldToLocal(new THREE.Vector3().setFromMatrixPosition(matrix));supports.push(center.x);
}});
assert.equal(supports.length,3);for(const x of supports)assert.ok(Math.abs(Math.abs(x)-33)<.001,'Rooftop support moved '+x);
console.log({maximumFloatingFoot,roofClearance,roofProbes,rooftopSupportOffsets:supports});
console.log({ landmarks: world.environment.landmarks.length, draws, triangles, instances,
  batching: world.batching, roots: rootStats, foundations: foundationStats,
  testedRoadAndPitProbes: probes.length, collisions: collisions.length });
