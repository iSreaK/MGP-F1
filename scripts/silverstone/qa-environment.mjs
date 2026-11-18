import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import {TRACK_POINTS,CONFIG} from '../../dist/silverstone/track-data.js';
import {createCircuitWorld} from '../../dist/circuits-2026/world.js';
import {addEnvironment} from '../../dist/silverstone/environment.js';

globalThis.document={createElement(){return{width:1,height:1,getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}};}};
const started=performance.now(),scene=new THREE.Scene();
const world=createCircuitWorld(THREE,scene,TRACK_POINTS,structuredClone(CONFIG),addEnvironment);
scene.updateMatrixWorld(true);
const env=world.environment,find=name=>env.landmarks.find(group=>group.name.includes(name));
for(const name of ['Wing 390m','Hilton Garden Inn','enclosed pedestrian bridge','BRDC Clubhouse','BRDC Farm','Museum restored RAF','old pit garages west','old pit garages east','Becketts grandstand','Copse A grandstand','Chapel grandstand'])assert.ok(find(name),name);
assert.equal(find('Wing 390m').userData.lengthMeters,390);
assert.equal(find('Wing 390m').userData.garageBays,41);
assert.equal(env.group.userData.solarPanelCount,2764);
assert.ok(env.group.userData.treeCount>=450);
assert.ok(env.group.userData.grandstandCount>=9);
let meshes=0,triangles=0,foundationVertices=0,minimumPrimitiveClearance=Infinity;
const matrix=new THREE.Matrix4(),instance=new THREE.Matrix4(),vertex=new THREE.Vector3();
env.group.traverse(mesh=>{
 if(!mesh.isMesh)return;meshes++;
 const position=mesh.geometry.getAttribute('position');
 triangles+=((mesh.geometry.index?.count??position.count)/3)*(mesh.count??1);
 assert.ok([...position.array].every(Number.isFinite),mesh.name+' finite geometry');
 if(mesh.name==='Silverstone terrain-following foundation skirt')for(let i=0;i<position.count;i+=2){
  vertex.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
  assert.ok(Math.abs(vertex.y-(world.groundHeightAt(vertex.x,vertex.z)-.07))<.005,'foundation against exact rendered terrain');foundationVertices++;
 }
 // Buildings and every repeated corner vertex must keep the road/pit reserve.
 // The audited overhead bridge has a separate vertical clearance check.
 if(!mesh.isInstancedMesh||mesh.parent===find('enclosed pedestrian bridge'))return;
 for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);
  for(let j=0;j<position.count;j++){
   vertex.fromBufferAttribute(position,j).applyMatrix4(matrix);
   const clearance=world.drivingDistance(vertex.x,vertex.z);
   minimumPrimitiveClearance=Math.min(minimumPrimitiveClearance,clearance);
   assert.ok(clearance>CONFIG.width/2+3.8,`${mesh.userData.sourceNames[i]} clips driving reserve: ${clearance}`);
  }
 }
});
assert.ok(meshes<150,'static scene draw budget');assert.ok(triangles<100000,'environment triangle budget');
const bridge=find('enclosed pedestrian bridge'),ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);
let minimumBridgeClearance=Infinity,crossingSamples=0;
for(const point of world.samples){
 ray.set(point.clone().add(new THREE.Vector3(0,.25,0)),up);
 const hit=ray.intersectObject(bridge,true)[0];if(!hit)continue;
 minimumBridgeClearance=Math.min(minimumBridgeClearance,hit.point.y-point.y);crossingSamples++;
}
assert.ok(crossingSamples>=1,'bridge genuinely crosses the supplied road');
assert.ok(minimumBridgeClearance>8,'Hilton bridge clears full road car envelope');
for(const p of bridge.userData.supportPoints)assert.ok(world.drivingDistance(p.x,p.z)>CONFIG.width/2+4.8,'bridge pier outside race/pit');
console.log(JSON.stringify({buildAndAuditMs:Math.round(performance.now()-started),meshes,triangles,foundationVertices,
 minimumPrimitiveClearance,minimumBridgeClearance,crossingSamples,counts:env.group.userData,skipped:env.diagnostics.skipped},null,2));
