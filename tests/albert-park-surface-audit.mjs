import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createAlbertParkWorld,roadHalfWidthAt } from '../dist/albert-park/world.js';
import { makeGroundSampler } from '../dist/albert-park/scene-utils.js';
globalThis.document={createElement(){const ctx=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}})},
 {get(target,key){return key in target?target[key]:()=>{};}});return{width:1,height:1,getContext:()=>ctx};}};
const scene=new THREE.Scene(),world=createAlbertParkWorld(THREE,scene),ground=makeGroundSampler(world.curve);
scene.updateMatrixWorld(true);
let minimumRadius=Infinity,triangles=0;
for(let i=0;i<1320;i++)minimumRadius=Math.min(minimumRadius,world.roadside.curvatureAt(i/1320).radius);
assert.ok(minimumRadius>16,`source polygon kink: minimum radius ${minimumRadius}`);
for(const mesh of [...scene.getObjectByName('Albert Park track surfaces').children,
 scene.getObjectByName('AlbertPark pit entry, fast lane, working lane and exit'),
 scene.getObjectByName('Pit garage forecourt asphalt')]){
 const p=mesh.geometry.attributes.position,idx=mesh.geometry.index;
 for(let i=0;i<idx.count;i+=3){
  const a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i));
  const b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+1));
  const c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+2));
  const y=b.clone().sub(a).cross(c.clone().sub(a)).y;
  assert.ok(y>=-.001,`${mesh.name} folded triangle ${i/3}: ${y}`);triangles++;
 }
}
// The actual panel endpoints must meet, rather than merely using equal
// lengths at regular centreline intervals (which leaves gaps on bends).
for(const side of [-1,1]){
 const segments=world.trackside.wallSegments.filter(s=>s.side===side);
 for(let i=1;i<segments.length;i++){
  const before=segments[i-1],after=segments[i];
  if(after.station-before.station>4.01)continue; // deliberate pit/water clearance
  assert.ok(Math.hypot(before.b.x-after.a.x,before.b.z-after.a.z)<.001,'wall joint gap');
 }
 for(const segment of segments)for(const p of [segment.a,segment.b]){
  const near=ground.nearest(p.x,p.z);
  assert.ok(near.distance>roadHalfWidthAt(near.u)+2,`wall cuts racing surface at ${segment.station}`);
 }
}
const pit=scene.getObjectByName('AlbertPark pit entry, fast lane, working lane and exit');
const position=pit.geometry.attributes.position;
for(const index of [0,position.count-2]){
 const p=new THREE.Vector3().fromBufferAttribute(position,index);
 const near=ground.nearest(p.x,p.z);
 assert.ok(near.distance<6,`pit taper disconnected: ${near.distance}`);
}
console.log(`Albert Park surface audit: ${triangles} upward triangles, minimum radius ${minimumRadius.toFixed(2)} m; pit tapers and wall joints connected.`);
