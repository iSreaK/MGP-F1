import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createCircuitWorld} from '../dist/circuits-2026/world.js';
const noop=()=>{},context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(t,k)=>t[k]??noop});
globalThis.document={createElement:()=>({getContext:()=>context})};
const slugs=['montreal','monaco','barcelona','spielberg','silverstone','spa','hungaroring','zandvoort'];
for(const slug of slugs)test(slug+' integrated surface, terrain, pits and landmark volumes',{timeout:120000},async()=>{
 const [{TRACK_POINTS,CONFIG},{addEnvironment}]=await Promise.all([import('../dist/'+slug+'/track-data.js'),import('../dist/'+slug+'/environment.js')]);
 const scene=new THREE.Scene(),world=createCircuitWorld(THREE,scene,TRACK_POINTS,structuredClone(CONFIG),addEnvironment);scene.updateMatrixWorld(true);
 const g=world.road.geometry,p=g.attributes.position,index=g.index;
 assert.equal(index.count,Math.ceil(CONFIG.length/2)*6,'no missing or folded racing-surface triangle');
 for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).y>0,'road triangles consistently face upward');}
 let roadClearance=Infinity;for(let i=0;i<world.samples.length;i+=2){const f=world.frameAt(i/world.count);for(const x of [-world.halfWidthAt(f.u),0,world.halfWidthAt(f.u)]){const q=f.point.clone().addScaledVector(f.across,x);roadClearance=Math.min(roadClearance,q.y-world.terrainHeightAt(q.x,q.z));}}
 assert.ok(roadClearance>.08,`terrain never protrudes through road (${roadClearance})`);
 let pitClearance=Infinity;for(const f of world.pit.samples)for(const offset of [-f.halfWidth,0,f.halfWidth]){const p=f.point.clone().addScaledVector(f.across,offset);pitClearance=Math.min(pitClearance,p.y-world.terrainHeightAt(p.x,p.z));}
 assert.ok(pitClearance>.03,`terrain never protrudes through pit lane (${pitClearance})`);
 assert.ok(world.environment.landmarks.length>=5,'venue has several individually named characteristic landmarks');
 assert.ok(world.pit.samples.length>80);assert.ok(world.wallSegments.length>500);
 let drawCalls=0,vertices=0;scene.traverse(m=>{if(m.isMesh){drawCalls++;vertices+=m.geometry.attributes.position.count*(m.count??1);assert.ok(m.matrixWorld.determinant()>0,'no object is reflected');}});
 assert.ok(drawCalls<420,`draw budget ${drawCalls}`);
 assert.ok(vertices<5000000,`vertex budget ${vertices}`);
 if(world.environment.isWater)for(const q of world.samples)assert.ok(!world.environment.isWater(q.x,q.z),'race route is on land');
 console.log(slug,JSON.stringify({drawCalls,vertices,roadClearance,landmarks:world.environment.landmarks.length}));
 const geometries=new Set(),materials=new Set();scene.traverse(m=>{if(m.isMesh){geometries.add(m.geometry);for(const material of Array.isArray(m.material)?m.material:[m.material])materials.add(material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
});
