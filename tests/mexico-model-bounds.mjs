import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { CAR_BLOCK } from '../dist/mexico/entity-spacing.js';

function boundsOf(path) {
  const buffer = readFileSync(path);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const box = new THREE.Box3();
  const empty = new THREE.Box3();
  const visit = (index, parent) => {
    const node = json.nodes[index];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix)
      : new THREE.Matrix4().compose(
        new THREE.Vector3(...(node.translation || [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
        new THREE.Vector3(...(node.scale || [1, 1, 1])),
      );
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
      const position = json.accessors[primitive.attributes.POSITION];
      if (!position.min || !position.max) continue;
      empty.min.set(...position.min);
      empty.max.set(...position.max);
      box.union(empty.clone().applyMatrix4(world));
    }
    for (const child of node.children || []) visit(child, world);
  };
  for (const index of json.scenes[json.scene ?? 0].nodes) visit(index, new THREE.Matrix4());
  return box.getSize(new THREE.Vector3());
}

let count = 0;
let longest = 0;
let widest = 0;
for (const file of readdirSync(new URL('../dist/', import.meta.url))) {
  if (!file.endsWith('.glb')) continue;
  const size = boundsOf(new URL(`../dist/${file}`, import.meta.url));
  assert.ok(size.x <= CAR_BLOCK.length && size.z <= CAR_BLOCK.width,
    `${file} exceeds its collision block: ${size.x.toFixed(2)} × ${size.z.toFixed(2)} m`);
  count++;
  longest = Math.max(longest, size.x);
  widest = Math.max(widest, size.z);
}
assert.ok(count >= 19, 'all Mexico race models are represented');
console.log(`Mexico model bounds: ${count} models, max ${longest.toFixed(2)} × `
  + `${widest.toFixed(2)} m inside ${CAR_BLOCK.length} × ${CAR_BLOCK.width} m blocks.`);
