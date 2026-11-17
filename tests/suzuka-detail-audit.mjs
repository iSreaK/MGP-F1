import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createSuzukaWorld} from '../dist/suzuka/world.js';
import {TRACK_POINTS,GEOGRAPHIC_FRAME,CROSSOVER} from '../dist/suzuka/track-data.js';
globalThis.document={createElement(){return{getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}};}};
const scene=new THREE.Scene(),world=createSuzukaWorld(THREE,scene);scene.updateMatrixWorld(true);
const deg=180/Math.PI;
const angleDelta=(a,b)=>Math.abs(((a-b+540)%360)-180);
const bearings=[];
for(const[from,to]of [['mainStraightStart','mainStraightEnd'],['westStraightStart','westStraightEnd']]){
 const a=GEOGRAPHIC_FRAME.anchors[from],b=GEOGRAPHIC_FRAME.anchors[to];
 const p=TRACK_POINTS[a.index],q=TRACK_POINTS[b.index];
 const actual=Math.atan2(q[0]-p[0],-(q[1]-p[1]))*deg;
 const reference=Math.atan2((b.longitude-a.longitude)*Math.cos((a.latitude+b.latitude)/2/deg),b.latitude-a.latitude)*deg;
 assert.ok(angleDelta(actual,reference)<1.2,`${from} geographic bearing ${actual}/${reference}`);
 assert.ok(q[0]>p[0]&&q[1]>p[1],'both straights travel geographically east and south');
 assert.ok(a.residualMeters<4&&b.residualMeters<4);bearings.push(actual.toFixed(2));
}
assert.equal(GEOGRAPHIC_FRAME.axes,'x east / z south');assert.ok(GEOGRAPHIC_FRAME.fitRmsMeters<5);

// Every driving/edge/safety triangle faces upwards. This detects the31 old
// offset folds and the reversed winding of the old pit lane and apron paint.
let triangleCount=0;
scene.traverse(mesh=>{
 if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.name.match(/racing surface|paved shoulder|safety verge|safety bed|kerb|pit entry, fast lane|forecourt asphalt|Pit lane edge paint|pit divider island/))return;
 const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index;if(!p||!ix)return;
 for(let i=0;i<ix.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,ix.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).y>=-.00001,`${mesh.name}: inverted triangle ${i/3}`);triangleCount++;}
});
const pit=scene.getObjectByName('Suzuka pit entry, fast lane, working lane and exit').geometry.getAttribute('position');
for(const[index,station]of [[0,world.grid.pitEntryStation],[pit.count-2,world.grid.pitExitStation]]){
 const frame=world.grid.frameAt(station),p=new THREE.Vector3().fromBufferAttribute(pit,index),offset=p.clone().sub(frame.point).dot(frame.across);
 assert.ok(offset>-6&&offset<-5.75,`pit merge detached: ${offset}`);
}
assert.ok(scene.getObjectByName('Suzuka continuous white pit entry and exit merge line'));
assert.equal(scene.getObjectByName('Suzuka pit garage concrete bays').count,48);

// Guardrail geometry must continue on BOTH sides of the lower route where
// its XY footprint crosses the upper route. A2D collision filter removed it.
const lowerU=CROSSOVER.lowerStation/5807,point=world.curve.getPointAt(lowerU),forward=world.curve.getTangentAt(lowerU).setY(0).normalize(),across=new THREE.Vector3(forward.z,0,-forward.x);
const rails=scene.getObjectByName('Suzuka outside Armco guardrails').geometry.getAttribute('position');
const minima=new Map([[-1,Infinity],[1,Infinity]]);
for(let i=0;i<rails.count;i++){const p=new THREE.Vector3().fromBufferAttribute(rails,i),delta=p.clone().sub(point),side=Math.sign(delta.dot(across));if(Math.abs(p.y-point.y)>2||Math.abs(delta.dot(across))<6.65||Math.abs(delta.dot(across))>25)continue;minima.set(side,Math.min(minima.get(side),Math.abs(delta.dot(forward))));}
for(const[side,distance]of minima)assert.ok(distance<4,`lower crossover guardrail gap side${side}: ${distance}`);

// Foundations touch the actual terrain even after the seating structures are
// turned to face the track. Every two bottom vertices in each skirt quad are
// sampled independently against the final terrain triangles.
let roots=0;
scene.traverse(mesh=>{if(mesh.name!=='Terrain-following foundation skirt')return;const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i+=2){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),ground=world.terrainHeightAt(v.x,v.z,-100);assert.ok(Math.abs(v.y-(ground-.08))<.004,`floating foundation ${mesh.parent.name}: ${v.y}/${ground}`);roots++;}});
assert.equal(world.environment.grandstandCount,9);assert.ok(world.environment.landmarks.controlTower);assert.ok(world.environment.landmarks.gallery);
assert.ok(world.trackside.impactBlockCount>=150);assert.ok(world.trackside.tyreCount>=300);
assert.ok(scene.getObjectByName('Suzuka crossover deck-supported catch screens'));assert.ok(scene.getObjectByName('Suzuka Japanese cedar woodland silhouettes'));
console.log(`Suzuka detailed audit OK: ${triangleCount} upward triangles, east/south bearings ${bearings.join('/')}deg, connected pit tapers, lower bridge guardrails and ${roots} grounded foundation vertices.`);
