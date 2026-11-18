import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import {createCircuitWorld} from '../../dist/circuits-2026/world.js';
const slug=process.argv[2]||'zandvoort',noop=()=>{},context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(t,k)=>t[k]??noop});globalThis.document={createElement:()=>({getContext:()=>context})};
const [{TRACK_POINTS,CONFIG},{addEnvironment}]=await Promise.all([import('../../dist/'+slug+'/track-data.js'),import('../../dist/'+slug+'/environment.js')]);
const world=createCircuitWorld(THREE,new THREE.Scene(),TRACK_POINTS,structuredClone(CONFIG),addEnvironment);world.scene.updateMatrixWorld(true);
const cells=new Map(),cellSize=24,objects=[],m=new THREE.Matrix4();
world.environment.group.traverse(mesh=>{if(!mesh.isMesh||mesh.material.transparent||mesh.geometry.type==='BufferGeometry')return;mesh.geometry.computeBoundingBox();const local=mesh.geometry.boundingBox;
 for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
  if(mesh.isInstancedMesh){mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);}else m.copy(mesh.matrixWorld);
  const box=local.clone().applyMatrix4(m);if(box.max.y-box.min.y<.15)continue;
  const object={name:mesh.name,index:i,local,inverse:m.clone().invert(),box},id=objects.push(object)-1;
  for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);}
 }
});
const collisions=[];let probes=0;
function inspect(p,station,kind){probes++;for(const id of cells.get(Math.floor(p.x/cellSize)+','+Math.floor(p.z/cellSize))||[]){const o=objects[id];if(o.box.containsPoint(p)&&o.local.containsPoint(p.clone().applyMatrix4(o.inverse)))collisions.push({kind,station:+station.toFixed(1),name:o.name,index:o.index});}}
for(let s=0;s<world.length;s+=2){const f=world.frameAt(s/world.length),width=world.halfWidthAt(f.u)+4;for(let x=-width;x<=width;x+=1.5)for(const lift of [.55,2.7])inspect(f.point.clone().addScaledVector(f.across,x).addScaledVector(f.normal,lift),s,'road');}
for(let i=0;i<world.pit.samples.length;i++){const f=world.pit.samples[i];for(const x of [-f.halfWidth-4,0,f.halfWidth+4])inspect(f.point.clone().addScaledVector(f.across,x).add(new THREE.Vector3(0,1,0)),i*3,'pit');}
console.log(JSON.stringify({slug,objects:objects.length,probes,collisions:collisions.length,examples:collisions.slice(0,20)},null,2));assert.equal(collisions.length,0,'car-height scenery clearance including a four metre reserve');
