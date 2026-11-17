import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {TRACK_POINTS,TRACK_LENGTH_METERS,LANDMARKS,CROSSOVER} from '../dist/suzuka/track-data.js';
import {prepareSuzukaCurve,trackHeightAtStation,DOCUMENTED_RELIEF_METERS,RELIEF_PRESENTATION_SCALE} from '../dist/suzuka/geometry-smoothing.js';
import {SUZUKA_2026_ROSTER,SUZUKA_2026_DISPLAYED} from '../dist/suzuka/replay-roster.js';
assert.equal(TRACK_LENGTH_METERS,5807);assert.equal(Object.keys(LANDMARKS.turns).length,18);assert.deepEqual(TRACK_POINTS[0],TRACK_POINTS.at(-1));
const planar=TRACK_POINTS.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-TRACK_POINTS[i][0],p[1]-TRACK_POINTS[i][1]),0);assert.ok(Math.abs(planar-5807)<.01);
const prepared=prepareSuzukaCurve(THREE,TRACK_POINTS);assert.ok(Math.abs(prepared.renderedLength-5807)<.002);
assert.equal(DOCUMENTED_RELIEF_METERS,52);
const heights=Array.from({length:5807},(_,i)=>trackHeightAtStation(i)),relief=Math.max(...heights)-Math.min(...heights);assert.ok(relief>=59&&relief<62,`rendered relief ${relief}`);
assert.ok(Math.abs(trackHeightAtStation(CROSSOVER.upperStation)-trackHeightAtStation(CROSSOVER.lowerStation)-8*RELIEF_PRESENTATION_SCALE)<.01);
// A clockwise right-hand first curve has a positive ground-XZ turn. A mirror
// changes this sign even when the car still follows the same point order.
const t1=LANDMARKS.turns.T1.index,a=TRACK_POINTS[t1-12],b=TRACK_POINTS[t1],c=TRACK_POINTS[t1+12];assert.ok((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>0,'T1 must be a right turn');
const order=Object.values(LANDMARKS.turns).map(t=>t.index);assert.deepEqual([...order].sort((a,b)=>a-b),order);
assert.equal(SUZUKA_2026_ROSTER.length,22);assert.equal(SUZUKA_2026_DISPLAYED.length,21);assert.equal(SUZUKA_2026_ROSTER.find(d=>d.replayNumber===6).modelKey,null);assert.equal(SUZUKA_2026_ROSTER.find(d=>d.replayNumber===12).finalPosition,1);assert.equal(SUZUKA_2026_ROSTER.find(d=>d.replayNumber===18).completedLaps,30);assert.equal(SUZUKA_2026_ROSTER.find(d=>d.replayNumber===87).completedLaps,20);
console.log(`Suzuka plan, chronological corner order, no-mirror right T1, 5807m 3D lap, ${relief.toFixed(2)}m rendered relief and two-level crossing OK`);
