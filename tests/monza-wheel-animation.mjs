import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { carCatalog } from '../dist/car-catalog.js';
import { bindWheelSpin, isRotatingWheelPart, WHEEL_GEOMETRY, WHEEL_PART_NAMES } from '../dist/monza/wheel-spin.js';

const wheelCenters = [
  [WHEEL_GEOMETRY.frontX, -WHEEL_GEOMETRY.frontZ],
  [WHEEL_GEOMETRY.frontX, WHEEL_GEOMETRY.frontZ],
  [WHEEL_GEOMETRY.rearX, -WHEEL_GEOMETRY.rearZ],
  [WHEEL_GEOMETRY.rearX, WHEEL_GEOMETRY.rearZ],
];

function makeCar(partNames = WHEEL_PART_NAMES) {
  const car = new THREE.Group();
  const sources = [];
  for (const name of partNames) {
    const positions = [];
    for (const [x, z] of wheelCenters) {
      positions.push(x - .1, .36, z, x + .1, .36, z, x, .46, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([...Array(positions.length / 3).keys()]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = name.replaceAll(' ', '_');
    mesh.userData.name = name;
    car.add(mesh);
    sources.push(mesh);
  }
  return { car, sources };
}

assert.ok(isRotatingWheelPart({ isMesh: true, name: 'Pirelli_slick_rubber', userData: {} }));
assert.equal(isRotatingWheelPart({ isMesh: true, name: 'Wheel_V4_brake_caliper', userData: {} }), false);

const { car, sources } = makeCar();
const binding = bindWheelSpin(THREE, car);
assert.equal(binding.enabled, true, 'GLTFLoader sanitized names should animate');
assert.equal(binding.pivots.length, 4);
assert.equal(binding.triangleCount, WHEEL_PART_NAMES.length * 4);
assert.ok(sources.every(source => !source.visible), 'the static source tyres must be hidden');
for (const pivot of binding.pivots) {
  assert.equal(pivot.children.length, WHEEL_PART_NAMES.length);
  assert.ok(pivot.children.every(part => part.geometry.getAttribute('position').count === 3),
    'a pivot contains compact wheel-only geometry');
}
binding.setDistance(WHEEL_GEOMETRY.radius * Math.PI / 2);
assert.ok(binding.pivots.every(pivot => Math.abs(pivot.rotation.z - Math.PI / 2) < 1e-10));
binding.update(WHEEL_GEOMETRY.radius * Math.PI / 2);
assert.ok(binding.pivots.every(pivot => Math.abs(pivot.rotation.z - Math.PI) < 1e-10));
binding.dispose();
assert.ok(sources.every(source => source.visible));
assert.ok(binding.pivots.every(pivot => !pivot.parent));

const partial = makeCar(WHEEL_PART_NAMES.slice(1));
const fallback = bindWheelSpin(THREE, partial.car);
assert.equal(fallback.enabled, false, 'incompatible models keep static wheels');
assert.ok(partial.sources.every(source => source.visible));
assert.equal(partial.car.children.length, partial.sources.length);

// Verify the real 22 GLBs retain all eight wheel parts. These are the meshes
// the browser loader will expose through userData.name.
function glbAccessor(gltf, bytes, binaryOffset, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const componentSize = accessor.componentType === 5125 || accessor.componentType === 5126 ? 4 : 2;
  const itemSize = accessor.type === 'VEC3' ? 3 : 1;
  const stride = bufferView.byteStride || componentSize * itemSize;
  const offset = binaryOffset + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  return {
    count: accessor.count,
    read(index, component = 0) {
      const at = offset + index * stride + component * componentSize;
      if (accessor.componentType === 5126) return bytes.readFloatLE(at);
      if (accessor.componentType === 5125) return bytes.readUInt32LE(at);
      if (accessor.componentType === 5123) return bytes.readUInt16LE(at);
      throw new Error(`Unsupported GLB component type ${accessor.componentType}`);
    },
  };
}

for (const entry of carCatalog) {
  const file = new URL(`../dist/${entry.url.slice(2).split('?')[0]}`, import.meta.url);
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${entry.key}: GLB header`);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binaryOffset = 20 + jsonLength + 8;
  assert.equal(bytes.toString('ascii', binaryOffset - 4, binaryOffset), 'BIN\0', `${entry.key}: BIN chunk`);
  const names = gltf.nodes.map(node => node.name);
  for (const name of WHEEL_PART_NAMES) {
    assert.equal(names.filter(nodeName => nodeName === name).length, 1,
      `${entry.key}: expected one ${name} mesh`);
    const node = gltf.nodes.find(candidate => candidate.name === name);
    const primitive = gltf.meshes[node.mesh].primitives[0];
    const positions = glbAccessor(gltf, bytes, binaryOffset, primitive.attributes.POSITION);
    const indices = glbAccessor(gltf, bytes, binaryOffset, primitive.indices);
    const quadrants = [0, 0, 0, 0];
    for (let i = 0; i < indices.count; i += 3) {
      const first = indices.read(i);
      const quadrant = (positions.read(first, 0) >= 0 ? 2 : 0) +
        (positions.read(first, 2) >= 0 ? 1 : 0);
      quadrants[quadrant]++;
    }
    assert.ok(quadrants.every(count => count > 0), `${entry.key}: ${name} must contain four wheels`);
  }
  assert.ok(names.includes('Wheel V4 brake caliper'), `${entry.key}: stationary caliper`);
}

console.log(`Animation des roues : quatre pivots, retour statique et ${carCatalog.length} modèles vérifiés.`);
