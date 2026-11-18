import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createCircuitGeometry} from '../dist/circuits-2026/geometry.js';
import {createSimulation} from '../dist/circuits-2026/simulation.js';
const slugs=['montreal','monaco','barcelona','spielberg','silverstone','spa','hungaroring','zandvoort'];
for(const slug of slugs)test(slug+' geography, lap length, relief and circulation',async()=>{
 const {TRACK_POINTS,CONFIG}=await import('../dist/'+slug+'/track-data.js');
 const reference=JSON.parse(await readFile(new URL('../scripts/'+slug+'/source/registered-reference.json',import.meta.url),'utf8'));
 const g=createCircuitGeometry(THREE,TRACK_POINTS,CONFIG);
 assert.ok(Math.abs(g.curve.getLength()-CONFIG.length)<.08,'3D lap length retains official reference');
 assert.equal(CONFIG.geography.determinant,1);assert.ok(reference.registrationRmsMeters<8);
 let area=0;for(let i=1;i<TRACK_POINTS.length;i++)area+=TRACK_POINTS[i-1][0]*TRACK_POINTS[i][2]-TRACK_POINTS[i][0]*TRACK_POINTS[i-1][2];assert.ok(area>0,'clockwise geographic traversal');
 const heights=TRACK_POINTS.map(p=>p[1]);assert.ok(Math.abs(Math.max(...heights)-Math.min(...heights)-CONFIG.relief*CONFIG.reliefScale)<.04,'closed smooth reference relief');
 assert.deepEqual(TRACK_POINTS[0],TRACK_POINTS.at(-1));assert.equal(Object.keys(CONFIG.turns).length,CONFIG.turnCount);
 for(const corner of reference.corners){const t=CONFIG.turns['T'+corner.number];assert.ok(Math.hypot(t.position[0]-corner.x*CONFIG.geography.scale,t.position[2]-corner.z*CONFIG.geography.scale)<8,'independent corner registration');}
 const turn=CONFIG.turns.T1,turnSign=g.curvatureAt(turn.u).sign;assert.equal(turnSign,CONFIG.firstTurn==='left'?-1:1,'first corner has its real left/right handedness');
 for(const p of TRACK_POINTS)assert.ok(p.every(Number.isFinite));
 const field=createSimulation(g,22);for(let t=0;t<900;t++)field.update(1/30);
 for(const car of field.cars){assert.ok(car.travelled>200);assert.ok(car.u>=0&&car.u<1);assert.ok(car.speed<=325/3.6+.001);assert.ok(Math.abs(car.lateral)<2.11);}
 if(slug==='zandvoort')for(const id of ['T3','T14']){const f=g.frameAt(CONFIG.turns[id].u);assert.ok(Math.abs(Math.abs(Math.asin(f.across.y))*180/Math.PI-18)<.001,'banking reaches 18 degrees');assert.equal(Math.sign(f.across.y),id==='T3'?-1:1);}
});
