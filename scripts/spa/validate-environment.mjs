import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS,CONFIG } from '../../dist/spa/track-data.js';
import { addEnvironment } from '../../dist/spa/environment.js';
const canvasContext=new Proxy({}, {get:()=>()=>{}});
globalThis.document={createElement:()=>({getContext:()=>canvasContext})};
const points=TRACK_POINTS.slice(0,-1).map(p=>new THREE.Vector3(...p));
const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');curve.arcLengthDivisions=14000;curve.updateArcLengths();
const samples=Array.from({length:1400},(_,i)=>curve.getPointAt(i/1400));
function nearest(x,z){let distance=Infinity,point=samples[0];for(const p of samples){const d=(p.x-x)**2+(p.z-z)**2;if(d<distance){distance=d;point=p}}return{distance:Math.sqrt(distance),point};}
const scene=new THREE.Scene();
const ctx={scene,curve,samples,length:CONFIG.length,config:CONFIG,
frameAt(u){const point=curve.getPointAt(u),forward=curve.getTangentAt(u),horizontal=forward.clone().setY(0).normalize();return{point,forward,across:new THREE.Vector3(horizontal.z,0,-horizontal.x),normal:new THREE.Vector3(0,1,0),u}},
at(s,lateral=0,lift=0){const f=this.frameAt(((s/CONFIG.length)%1+1)%1);return f.point.clone().addScaledVector(f.across,lateral).add(new THREE.Vector3(0,lift,0))},
roadDistance:(x,z)=>nearest(x,z).distance,groundHeightAt:(x,z)=>nearest(x,z).point.y-.65};
console.time('Spa environment');const result=addEnvironment(THREE,ctx);console.timeEnd('Spa environment');scene.updateMatrixWorld(true);
assert.ok(result.landmarks.length>=10);let drawCalls=0,triangles=0,instances=0;const collisions=[];const probe=new THREE.Vector3();
scene.traverse(mesh=>{if(!mesh.isMesh)return;drawCalls++;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);instances+=mesh.isInstancedMesh?mesh.count:1;if(mesh.isInstancedMesh)return;mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone();box.min.x-=1.6;box.max.x+=1.6;box.min.z-=1.6;box.max.z+=1.6;for(let i=0;i<samples.length;i++){probe.copy(samples[i]);probe.y+=1;mesh.worldToLocal(probe);if(box.containsPoint(probe)){collisions.push(mesh.name+'@'+Math.round(i/1400*CONFIG.length));break}}});
assert.deepEqual(collisions,[]);assert.ok(drawCalls<330,drawCalls+' draw calls');assert.ok(triangles<240000,triangles+' triangles');
for(const lm of result.landmarks){if(lm.userData.minimumRoadDistance!==undefined)assert.ok(lm.userData.minimumRoadDistance>=14,lm.name);}
console.log({landmarks:result.landmarks.length,drawCalls,triangles,instances,forest:result.landmarks.find(l=>l.name.startsWith('Ardennes')).userData.treeCount});
console.log(result.landmarks.map(l=>({name:l.name,station:l.userData.stationMeters,minRoad:l.userData.minimumRoadDistance})));
