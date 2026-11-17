import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createSuzukaWorld} from '../dist/suzuka/world.js';
import {batchStaticPrimitives} from '../dist/suzuka/static-batches.js';

// Exercise nested translation, rotation and nonuniform scale: batching must
// preserve the exact world-space shape, not just each source centre.
const root=new THREE.Group(),nested=new THREE.Group();root.add(nested);
nested.position.set(13,7,-9);nested.rotation.y=.73;
const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial();
const originals=[];
for(let i=0;i<3;i++){
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i*2,1,i*3);
 mesh.rotation.z=i*.14;mesh.scale.set(2+i,.4+i,3-i*.6);
 mesh.userData.staticPrimitive='box';mesh.castShadow=true;nested.add(mesh);originals.push(mesh);
}
root.updateMatrixWorld(true);
const expected=originals.map(mesh=>Array.from({length:geometry.attributes.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld)));
const stats=batchStaticPrimitives(THREE,root);
assert.equal(stats.savedDrawCalls,2);assert.equal(stats.savedShadowDrawCalls,2);
root.updateMatrixWorld(true);const batch=root.children.find(object=>object.isInstancedMesh),matrix=new THREE.Matrix4();
for(let j=0;j<batch.count;j++){
 batch.getMatrixAt(j,matrix);matrix.premultiply(batch.matrixWorld);
 for(let i=0;i<geometry.attributes.position.count;i++){
  const actual=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(matrix);
  assert.ok(actual.distanceTo(expected[j][i])<.00001,'batch preserves every transformed vertex');
 }
}

globalThis.document={createElement(){return{getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}};}};
const scene=new THREE.Scene(),world=createSuzukaWorld(THREE,scene);scene.updateMatrixWorld(true);
let calls=0,shadowCalls=0;const geometries=new Set(),lods=[];
scene.traverse(object=>{
 if(object.isLOD)lods.push(object);
 if(!object.isMesh&&!object.isLine)return;
 const draws=Array.isArray(object.material)?object.geometry.groups.length:1;
 calls+=draws;if(object.castShadow)shadowCalls+=draws;geometries.add(object.geometry);
});
assert.ok(calls<330,`venue draw-call regression: ${calls}`);
assert.ok(shadowCalls<25,`venue shadow-call regression: ${shadowCalls}`);
assert.ok(geometries.size<230,`duplicate primitive geometry regression: ${geometries.size}`);
assert.ok(world.environment.batching.savedDrawCalls>800);
assert.equal(lods.length,9,'all stands have distant spectator detail control');
const camera=new THREE.PerspectiveCamera();camera.position.set(0,10000,0);camera.updateMatrixWorld(true);
for(const lod of lods){lod.update(camera);assert.equal(lod.levels[0].object.visible,false);camera.position.setFromMatrixPosition(lod.matrixWorld);camera.updateMatrixWorld(true);lod.update(camera);assert.equal(lod.levels[0].object.visible,true);camera.position.set(0,10000,0);camera.updateMatrixWorld(true);}
console.log(`Suzuka render budget OK: ${calls} scene calls, ${shadowCalls} shadow calls, ${geometries.size} unique geometries; transformed vertices and 9 near/far spectator LODs verified.`);
