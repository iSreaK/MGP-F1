import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from '../dist/albert-park/track-data.js';
import { prepareAlbertParkCurve, trackHeightAtStation, DOCUMENTED_RELIEF_METERS, RELIEF_PRESENTATION_SCALE } from '../dist/albert-park/geometry-smoothing.js';
import { ALBERT_PARK_FINISH_BEFORE_START_METERS, GRID_SLOT_SPACING } from '../dist/albert-park/grid-details.js';
import { createFreeRaceField } from '../dist/albert-park/free-race-field.js';
import { ALBERT_PARK_2026_DISPLAYED as roster } from '../dist/albert-park/replay-roster.js';
assert.equal(TRACK_LENGTH_METERS,5278);assert.equal(Object.keys(LANDMARKS.turns).length,14);
assert.deepEqual(TRACK_POINTS[0],TRACK_POINTS.at(-1));
let length=0,area=0;
for(let i=1;i<TRACK_POINTS.length;i++){const a=TRACK_POINTS[i-1],b=TRACK_POINTS[i];length+=Math.hypot(b[0]-a[0],b[1]-a[1]);area+=a[0]*b[1]-b[0]*a[1];}
assert.ok(Math.abs(length-5278)<.02,`plan length ${length}`);
assert.ok(area>0,'East/south coordinates must give a clockwise, unmirrored lap');
const {curve,renderedLength}=prepareAlbertParkCurve(THREE,TRACK_POINTS);
assert.ok(Math.abs(renderedLength-5278)<.02);
const turn1=LANDMARKS.turns.T1.index;
const a=TRACK_POINTS[turn1-8],b=TRACK_POINTS[turn1],c=TRACK_POINTS[turn1+8];
assert.ok((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>0,'T1 must turn right');
const elevations=Array.from({length:5279},(_,s)=>trackHeightAtStation(s));
assert.ok(Math.abs(Math.max(...elevations)-Math.min(...elevations)-DOCUMENTED_RELIEF_METERS*RELIEF_PRESENTATION_SCALE)<.02);
assert.ok(Math.abs(trackHeightAtStation(5278-.001)-trackHeightAtStation(.001))<.001,'closed relief');
assert.equal(ALBERT_PARK_FINISH_BEFORE_START_METERS,0);
const field=createFreeRaceField(roster.map(d=>({...d,number:d.replayNumber})),{gridU:0,trackLengthMeters:5278,gridSlotSpacingMeters:GRID_SLOT_SPACING});
assert.equal(field.frame().cars.length,21);field.start();let peak=0,lap=0;
for(let i=0;i<2100;i++){const frame=field.update(.1);for(const car of frame.cars){assert.ok(Number.isFinite(car.speedKmh)&&car.u>=0&&car.u<1);peak=Math.max(peak,car.speedKmh);lap=Math.max(lap,car.lap);}}
assert.ok(peak>270&&peak<360,`top speed ${peak}`);assert.ok(lap>=1,'free field must complete a lap');
console.log(`Albert Park plan, clockwise chirality, 3.25 m rendered relief and 21-car simulation OK; top ${peak.toFixed(1)} km/h.`);
