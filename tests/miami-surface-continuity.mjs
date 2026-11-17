import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createMiamiWorld } from '../dist/miami/world.js';

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
const { samples } = createMiamiWorld(THREE, scene);
const mesh = name => {
  const value = scene.getObjectByName(name);
  assert.ok(value?.isMesh, `missing surface: ${name}`);
  return value;
};
const ground = mesh('Miami Gardens low coastal terrain').geometry.getAttribute('position');
const shoulder = mesh('MIAMI paved shoulder').geometry.getAttribute('position');
const leftNear = mesh('MIAMI left mown safety verge 1').geometry.getAttribute('position');
const leftFar = mesh('MIAMI left mown safety verge 2').geometry.getAttribute('position');
const rightNear = mesh('MIAMI right mown safety verge 1').geometry.getAttribute('position');
const rightFar = mesh('MIAMI right mown safety verge 2').geometry.getAttribute('position');
const at = (attribute, index) => new THREE.Vector3().fromBufferAttribute(attribute, index);

let columns = 1;
while (Math.abs(ground.getZ(columns) - ground.getZ(0)) < .001) columns++;
const rows = ground.count / columns;
const x0 = ground.getX(0), z0 = ground.getZ(0);
const stepX = ground.getX(1) - x0;
const stepZ = ground.getZ(columns) - z0;
function groundHeight(x, z) {
  const ux = (x - x0) / stepX, uz = (z - z0) / stepZ;
  assert.ok(ux >= 0 && ux <= columns - 1 && uz >= 0 && uz <= rows - 1,
    'safety verge stays within the terrain mesh');
  const ix = Math.min(columns - 2, Math.floor(ux));
  const iz = Math.min(rows - 2, Math.floor(uz));
  const tx = ux - ix, tz = uz - iz;
  const a = iz * columns + ix;
  const y00 = ground.getY(a), y10 = ground.getY(a + 1);
  const y01 = ground.getY(a + columns), y11 = ground.getY(a + columns + 1);
  return tx + tz <= 1
    ? y00 * (1 - tx - tz) + y10 * tx + y01 * tz
    : y10 * (1 - tz) + y01 * (1 - tx) + y11 * (tx + tz - 1);
}

for (let i = 0; i < samples.length; i++) {
  const j = i * 4;
  for (const [edge, verge, vertex] of [
    [shoulder, leftNear, 1], [shoulder, rightNear, 0],
  ]) {
    const pavement = at(edge, j + (verge === leftNear ? 0 : 1));
    assert.ok(pavement.distanceTo(at(verge, j + vertex)) < .002,
      `paved shoulder joins mown verge at station ${i}`);
  }
  assert.ok(at(leftNear, j).distanceTo(at(leftFar, j + 1)) < .002,
    `left verge panels join at station ${i}`);
  assert.ok(at(rightNear, j + 1).distanceTo(at(rightFar, j)) < .002,
    `right verge panels join at station ${i}`);
  for (const outer of [at(leftFar, j), at(rightFar, j + 1)]) {
    const clearance = outer.y - groundHeight(outer.x, outer.z);
    assert.ok(clearance >= .04 && clearance <= .05,
      `grass edge hugs ground at station ${i}: ${clearance.toFixed(3)} m`);
  }
}

let surfaceTriangles = 0;
for (let turn = 1; turn <= 19; turn++) {
  for (const name of [
    `MIAMI turn ${turn} paved runoff`, `MIAMI turn ${turn} red runoff stripe`,
    `Turn ${turn} striped inside kerb`,
  ]) {
    const geometry = mesh(name).geometry;
    const points = geometry.getAttribute('position');
    const indices = geometry.getIndex();
    for (let i = 0; i < indices.count; i += 3) {
      const a = at(points, indices.getX(i));
      const b = at(points, indices.getX(i + 1));
      const c = at(points, indices.getX(i + 2));
      const normalY = b.clone().sub(a).cross(c.clone().sub(a)).y;
      assert.ok(normalY > 0, `${name} has a downward-facing triangle`);
      surfaceTriangles++;
    }
  }
}

console.log(`Miami surface continuity OK: ${samples.length} verge sections, ${surfaceTriangles} upward-facing runoff and kerb triangles.`);
