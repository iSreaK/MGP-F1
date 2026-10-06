import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createMexicoWorld } from '../dist/mexico/world.js';

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
createMexicoWorld(THREE, scene);
const terrain = scene.getObjectByName('Mexico City park terrain').geometry;
const points = terrain.getAttribute('position');
let columns = 1;
while (Math.abs(points.getZ(columns) - points.getZ(0)) < .001) columns++;
const rows = points.count / columns;
const x0 = points.getX(0), z0 = points.getZ(0);
const dx = points.getX(1) - x0;
const dz = points.getZ(columns) - z0;
function terrainHeight(x, z) {
  const ux = (x - x0) / dx, uz = (z - z0) / dz;
  const ix = Math.min(columns - 2, Math.max(0, Math.floor(ux)));
  const iz = Math.min(rows - 2, Math.max(0, Math.floor(uz)));
  const tx = ux - ix, tz = uz - iz;
  const a = iz * columns + ix;
  const y00 = points.getY(a), y10 = points.getY(a + 1);
  const y01 = points.getY(a + columns);
  const y11 = points.getY(a + columns + 1);
  return tx + tz <= 1
    ? y00 * (1 - tx - tz) + y10 * tx + y01 * tz
    : y10 * (1 - tz) + y01 * (1 - tx) + y11 * (tx + tz - 1);
}

const checks = [
  ['Autódromo Hermanos Rodríguez racing surface', .035],
  ['Mexico paved shoulder', .015],
  ['Mexico left mown safety verge 1', .025],
  ['Mexico right mown safety verge 1', .025],
];
for (const [name, minimum] of checks) {
  const mesh = scene.getObjectByName(name);
  assert.ok(mesh?.isMesh, `missing ${name}`);
  const vertices = mesh.geometry.getAttribute('position');
  let least = { clearance: Infinity, triangle: -1 };
  for (let i = 0; i < vertices.count; i += 4) {
    const corners = Array.from({ length: 4 }, (_, j) => new THREE.Vector3()
      .fromBufferAttribute(vertices, i + j));
    for (const p of [
      ...corners,
      corners[0].clone().add(corners[1]).add(corners[2]).add(corners[3])
        .multiplyScalar(.25),
    ]) {
      const clearance = p.y - terrainHeight(p.x, p.z);
      if (clearance < least.clearance) least = { clearance, triangle: i / 4,
        position: [p.x, p.z] };
    }
  }
  console.log(name, least);
  assert.ok(least.clearance > minimum,
    `${name} intersects park terrain: ${JSON.stringify(least)}`);
}
