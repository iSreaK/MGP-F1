import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createInterlagosWorld } from '../dist/interlagos/world.js';

globalThis.document={createElement(){return {width:1,height:1,getContext(){return {
  fillStyle:'',font:'',textAlign:'',
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData(){},fillRect(){},fillText(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},fill(){},arc(){},
};}};}};
const scene=new THREE.Scene();
const world=createInterlagosWorld(THREE,scene);
scene.updateMatrixWorld(true);
const road=scene.getObjectByName('Autódromo José Carlos Pace racing surface');
const pit=scene.getObjectByName('Interlagos pit entry, fast lane, working lane and exit');
assert.ok(road?.isMesh && pit?.isMesh);
assert.ok(world.environment.grandstandCount>=6,
  `only ${world.environment.grandstandCount} stands were placed`);
assert.ok(world.environment.treeCount>=300);
assert.ok(world.trackside.barrierCount>100);
const asphalt=world.samples;
const half=6.5;
const nearest=(x,z)=>{
  let min=Infinity;
  for(let i=0;i<asphalt.length;i+=3){
    const p=asphalt[i]; min=Math.min(min,Math.hypot(x-p.x,z-p.z));
  }
  return min;
};
const intrusions=[];
const position=new THREE.Vector3();
const transform=new THREE.Matrix4();
const inspect=(obj,category,minClearance)=>{
  if(!obj.isMesh) return;
  const count=obj.isInstancedMesh?obj.count:1;
  for(let i=0;i<count;i++) {
    if(obj.isInstancedMesh){obj.getMatrixAt(i,transform);transform.premultiply(obj.matrixWorld);}
    else transform.copy(obj.matrixWorld);
    position.setFromMatrixPosition(transform);
    const d=nearest(position.x,position.z);
    if(d<minClearance) intrusions.push({category,name:obj.name,index:i,d});
  }
};
world.environment.group.traverse(obj=>{
  if(obj.name.includes('seating terraces')||obj.name.includes('support legs')
    ||obj.name.includes('canopy')||obj.name.includes('tree crowns')
    ||obj.name.includes('tree trunks')||obj.name.includes('city silhouette'))
    inspect(obj,'scenery',half+8);
});
assert.deepEqual(intrusions.slice(0,10),[],`scenery intrudes over racing surface: ${JSON.stringify(intrusions.slice(0,10))}`);
console.log('Interlagos scenery OK',{stands:world.environment.grandstandCount,
  trees:world.environment.treeCount,barriers:world.trackside.barrierCount,
  checkedIntrusions:intrusions.length});
