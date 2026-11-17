import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createAlbertParkWorld,roadHalfWidthAt } from '../dist/albert-park/world.js';
globalThis.document={createElement(){const ctx=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}})},
 {get(target,key){return key in target?target[key]:()=>{};}});return{width:1,height:1,getContext:()=>ctx};}};
const scene=new THREE.Scene(),world=createAlbertParkWorld(THREE,scene);scene.updateMatrixWorld(true);
const segments=[],cells=new Map(),size=32,key=(x,z)=>x+','+z;
function corridor(a,b,halfWidth){
 const centre=a.clone().add(b).multiplyScalar(.5),forward=b.clone().sub(a).setY(0).normalize();
 const across=new THREE.Vector3(forward.z,0,-forward.x),halfLength=a.distanceTo(b)/2+.08;
 const id=segments.length;segments.push({centre,forward,across,halfLength,halfWidth});
 for(let x=Math.floor((Math.min(a.x,b.x)-halfWidth)/size);x<=Math.floor((Math.max(a.x,b.x)+halfWidth)/size);x++)
  for(let z=Math.floor((Math.min(a.z,b.z)-halfWidth)/size);z<=Math.floor((Math.max(a.z,b.z)+halfWidth)/size);z++){
   const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id);
  }
}
for(let i=0;i<world.samples.length;i++)corridor(world.samples[i],world.samples[(i+1)%world.samples.length],roadHalfWidthAt(i/world.samples.length)+2);
const pit=scene.getObjectByName('AlbertPark pit entry, fast lane, working lane and exit'),pp=pit.geometry.attributes.position;
for(let i=0;i<pp.count;i+=4){const p=Array.from({length:4},(_,j)=>new THREE.Vector3().fromBufferAttribute(pp,i+j));
 corridor(p[0].clone().add(p[1]).multiplyScalar(.5),p[2].clone().add(p[3]).multiplyScalar(.5),Math.max(p[0].distanceTo(p[1]),p[2].distanceTo(p[3]))/2+.4);
}
let triangles=0,checks=0;const collisions=[];
const matrix=new THREE.Matrix4(),instance=new THREE.Matrix4(),box=new THREE.Box3(),triangle=new THREE.Triangle();
const v=Array.from({length:3},()=>new THREE.Vector3()),local=v.map(()=>new THREE.Vector3());
function inspect(mesh){
 const p=mesh.geometry.attributes.position,idx=mesh.geometry.index;
 for(let item=0;item<(mesh.isInstancedMesh?mesh.count:1);item++){
  matrix.copy(mesh.matrixWorld);if(mesh.isInstancedMesh){mesh.getMatrixAt(item,instance);matrix.multiply(instance);}
  for(let i=0;i<(idx?.count??p.count);i+=3){
   for(let j=0;j<3;j++)v[j].fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(matrix);
   triangles++;const ids=new Set();
   for(let x=Math.floor(Math.min(...v.map(p=>p.x))/size);x<=Math.floor(Math.max(...v.map(p=>p.x))/size);x++)
    for(let z=Math.floor(Math.min(...v.map(p=>p.z))/size);z<=Math.floor(Math.max(...v.map(p=>p.z))/size);z++)
     for(const id of cells.get(key(x,z))||[])ids.add(id);
   for(const id of ids){const s=segments[id];
    for(let j=0;j<3;j++){const dx=v[j].x-s.centre.x,dz=v[j].z-s.centre.z;
     local[j].set(dx*s.across.x+dz*s.across.z,v[j].y-s.centre.y,dx*s.forward.x+dz*s.forward.z);}
    box.min.set(-s.halfWidth,-.3,-s.halfLength);box.max.set(s.halfWidth,7.4,s.halfLength);
    checks++;triangle.set(...local);
    if(box.intersectsTriangle(triangle)){collisions.push({name:mesh.name,item,id});return;}
   }
  }
 }
}
// Ground, golf greens, lake and city silhouettes are not obstacles. Check
// the complete triangles of buildings, trees, stands and pedestrian bridges.
const landmarks=world.environment.landmarks;
for(const object of [...landmarks.stands,...landmarks.bridges,landmarks.msac,landmarks.stadium,landmarks.raceControl,
 landmarks.golf.getObjectByName('2026 Clubhouse elevated hospitality opposite T8')])object.traverse(mesh=>{if(mesh.isMesh)inspect(mesh);});
for(const name of ['Albert Park eucalyptus trunks','Albert Park eucalyptus crowns','Albert Park palm trunks','Albert Park palm fronds'])inspect(scene.getObjectByName(name));
assert.equal(collisions.length,0,`Albert Park scenery blocks a driving corridor: ${JSON.stringify(collisions)}`);
console.log(`Albert Park scenery clearance: ${triangles} triangles / ${checks} corridor checks, no obstruction below 7.4 m.`);
