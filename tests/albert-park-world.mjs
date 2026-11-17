import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createAlbertParkWorld } from '../dist/albert-park/world.js';
import { LAKE_OUTLINES, LAKE_ISLANDS } from '../dist/albert-park/venue-data.js';
globalThis.document={createElement(){const ctx=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}})},
 {get(target,key){return key in target?target[key]:()=>{};}});return{width:1,height:1,getContext:()=>ctx};}};
const scene=new THREE.Scene();const world=createAlbertParkWorld(THREE,scene);scene.updateMatrixWorld(true);
assert.equal(world.environment.grandstandCount,5);assert.equal(world.environment.bridgeCount,3);
assert.ok(world.environment.treeCount>=400);assert.ok(world.environment.palmCount>=20);
for(const name of ['Albert Lake water with three island cutouts','Albert Lake sloped planted shoreline',
 'Melbourne Sports and Aquatic Centre','Lakeside Stadium athletics oval','Melbourne CBD skyline north of Albert Park',
 '2026 Clubhouse elevated hospitality opposite T8','Albert Park three-level race control','Fangio main grandstand']){
 assert.ok(scene.getObjectByName(name),name);
}
assert.equal(LAKE_OUTLINES.length,1);assert.ok(LAKE_ISLANDS.length>=2);
const terrain=scene.getObjectByName('Albert Park continuous ground with lake cutout');
const road=scene.getObjectByName('Albert Park racing surface');assert.ok(terrain&&road);
const ray=new THREE.Raycaster();let checked=0;
for(let i=0;i<world.samples.length;i+=5){const p=world.samples[i];
 ray.set(new THREE.Vector3(p.x,p.y+4,p.z),new THREE.Vector3(0,-1,0));
 const roadHit=ray.intersectObject(road)[0];assert.ok(roadHit,`road missing at ${i}`);
 const landHit=ray.intersectObject(terrain)[0];assert.ok(landHit,`terrain missing at ${i}`);
 assert.ok(landHit.point.y<=roadHit.point.y-.025,`ground clips road at ${i}: ${landHit.point.y} / ${roadHit.point.y}`);checked++;
}
for(const bridge of world.environment.landmarks.bridges){
 const deck=bridge.getObjectByName('Bridge deck above 7.4 m clearance');
 const bounds=new THREE.Box3().setFromObject(deck);
 assert.ok(bounds.min.y-bridge.position.y>=7.4,`${bridge.name} vertical clearance`);
}
// No safety wall or tree trunk may intrude into the actual racing envelope.
for(const name of ['Albert Park continuous concrete safety walls','Albert Park eucalyptus trunks','Albert Park palm trunks']){
 const mesh=scene.getObjectByName(name);assert.ok(mesh);const matrix=new THREE.Matrix4();
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
  let nearest=Infinity;for(const sample of world.samples)nearest=Math.min(nearest,Math.hypot(sample.x-p.x,sample.z-p.z));
  assert.ok(nearest>8.5,`${name} ${i} intrudes into road (${nearest})`);
 }
}
console.log(`Albert Park world OK: exact lake holes, 5 stands, 3 bridges, ${world.environment.treeCount} trees; ${checked} terrain/road rays.`);
