import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createSuzukaWorld} from '../dist/suzuka/world.js';
import {CROSSOVER} from '../dist/suzuka/track-data.js';
globalThis.document={createElement(){return{width:1,height:1,getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}};}};
const scene=new THREE.Scene(),world=createSuzukaWorld(THREE,scene);scene.updateMatrixWorld(true);
assert.ok(world.environment.treeCount>=600);assert.ok(world.environment.grandstandCount>=7);
for(const name of ['Suzuka International Racing Course racing surface','Suzuka rolling terrain with lower-level crossover','Suzuka figure-eight road bridge','Circuit Wheel 50m high Ferris wheel','Suzuka pit garage concrete bays','V2 main grandstand','Honda Suzuka paddock hospitality','Suzuka guardrails, catch fencing and distance boards'])assert.ok(scene.getObjectByName(name),name);
const road=scene.getObjectByName('Suzuka International Racing Course racing surface'),terrain=scene.getObjectByName('Suzuka rolling terrain with lower-level crossover');
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let clearance=Infinity;
for(let i=0;i<world.samples.length;i+=4){const p=world.samples[i];const ground=world.terrainHeightAt(p.x,p.z,-100);clearance=Math.min(clearance,p.y-ground);assert.ok(ground<p.y-.12,`terrain clips road at ${i}: ${ground} vs ${p.y}`);}
// A vertical ray at the crossover must hit two distinct drivable road levels.
let best={distance:Infinity};
for(let i=0;i<world.samples.length;i++){const station=i/world.samples.length*5807;if(Math.abs(station-CROSSOVER.lowerStation)>25)continue;for(let j=0;j<world.samples.length;j++){const s=j/world.samples.length*5807;if(Math.abs(s-CROSSOVER.upperStation)>25)continue;const a=world.samples[i],b=world.samples[j],distance=Math.hypot(a.x-b.x,a.z-b.z);if(distance<best.distance)best={distance,a,b};}}
assert.ok(best.distance<3);assert.ok(best.b.y-best.a.y>8,`road crossing ${best.b.y-best.a.y}`);
const x=(best.a.x+best.b.x)/2,z=(best.a.z+best.b.z)/2;ray.set(new THREE.Vector3(x,100,z),down);const hits=ray.intersectObject(road).map(h=>h.point.y).filter((y,i,a)=>i===0||Math.abs(y-a[i-1])>.1);assert.equal(hits.length,2,`two road levels expected, got ${hits}`);assert.ok(hits[0]-hits[1]>8);
const bridge=world.environment.landmarks.bridge;ray.set(new THREE.Vector3(x,hits[1]+1,z),new THREE.Vector3(0,1,0));const below=ray.intersectObject(bridge,true);assert.ok(below.length);assert.ok(below[0].point.y-hits[1]>6.8,`deck underside clearance ${below[0].point.y-hits[1]}`);
// Check the complete lower-route footprint against each bridge support, not
// merely the centre ray. Supports must remain outside asphalt/car volume.
bridge.traverse(object=>{if(object.name!=='Off-track bridge pier')return;const box=new THREE.Box3().setFromObject(object).expandByScalar(7.2);for(let i=0;i<world.samples.length;i++){const station=i/world.samples.length*5807;if(Math.abs(station-CROSSOVER.lowerStation)>100)continue;const p=world.samples[i];assert.ok(!box.containsPoint(new THREE.Vector3(p.x,p.y+.6,p.z)),`bridge pier intersects lower-road driving envelope at ${station}`);}});
const trunks=scene.getObjectByName('Suzuka woodland trunks'),m=new THREE.Matrix4();for(let i=0;i<trunks.count;i++){trunks.getMatrixAt(i,m);const p=new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(trunks.matrixWorld);assert.ok(world.samples.every(s=>Math.hypot(s.x-p.x,s.z-p.z)>36),`tree ${i} clips racing surface`);}
console.log(`Suzuka runtime scene OK: ${world.environment.grandstandCount} stands, ${world.environment.treeCount} trees, Circuit Wheel, pit complex, two crossing levels ${hits.map(y=>y.toFixed(2)).join('/')}m and ${(hits[0]-hits[1]-1.12).toFixed(2)}m deck clearance; terrain minimum ${clearance.toFixed(2)}m`);
