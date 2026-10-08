import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from '../dist/yas-marina/track-data.js';
import { prepareYasMarinaCurve } from '../dist/yas-marina/geometry-smoothing.js';
import { YAS_MARINA_2025_ROSTER, YAS_MARINA_2025_DISPLAYED } from '../dist/yas-marina/replay-roster.js';
import { GRID_SLOT_SPACING } from '../dist/yas-marina/grid-details.js';

assert.equal(TRACK_LENGTH_METERS,5281);
assert.equal(TRACK_POINTS.length,1321);
assert.equal(LANDMARKS.startLineOffsetMeters,115);
assert.equal(58*TRACK_LENGTH_METERS-LANDMARKS.startLineOffsetMeters,306183);
assert.equal(YAS_MARINA_2025_ROSTER.length,20);
assert.equal(YAS_MARINA_2025_DISPLAYED.length,19);
assert.equal(new Set(YAS_MARINA_2025_ROSTER.map(driver=>driver.replayNumber)).size,20);
assert.ok(GRID_SLOT_SPACING>=7 && GRID_SLOT_SPACING<=9);
for(const [index,point] of TRACK_POINTS.entries())
  assert.ok(point.length===2 && point.every(Number.isFinite),`invalid centreline point ${index}`);
for(let corner=1;corner<=16;corner++){
  const index=LANDMARKS.turns[`T${corner}`]?.index;
  assert.ok(Number.isInteger(index) && index>=0 && index<1320,`corner ${corner} missing`);
  if(corner>1)assert.ok(index>LANDMARKS.turns[`T${corner-1}`].index,
    `corner ${corner} out of racing order`);
}
const longStraight=(LANDMARKS.turns.T6.index-LANDMARKS.turns.T5.index)
  * TRACK_LENGTH_METERS/1320;
assert.ok(longStraight>1150 && longStraight<1250,'T5–T6 is the 1.2 km straight');
const [a,b]=[385,635];
const start=TRACK_POINTS[a],end=TRACK_POINTS[b];
const dx=end[0]-start[0],dz=end[1]-start[1],span=Math.hypot(dx,dz);
let straightDeviation=0;
for(let index=a;index<=b;index++){
  const point=TRACK_POINTS[index];
  straightDeviation=Math.max(straightDeviation,
    Math.abs((point[0]-start[0])*dz-(point[1]-start[1])*dx)/span);
}
assert.ok(straightDeviation<8,`T5–T6 wavers ${straightDeviation.toFixed(1)} m`);
const {curve}=prepareYasMarinaCurve(THREE,TRACK_POINTS,TRACK_LENGTH_METERS);
const measured=curve.getLength();
assert.ok(Math.abs(measured-TRACK_LENGTH_METERS)<1,
  `rendered curve length differs from 5281 m: ${measured.toFixed(1)}`);
console.log('Yas Marina geometry and roster OK:',{points:TRACK_POINTS.length,
  turns:16,straightMeters:+longStraight.toFixed(1),
  straightDeviation:+straightDeviation.toFixed(2),renderedMeters:+measured.toFixed(2),
  historicEntries:YAS_MARINA_2025_ROSTER.length,models:YAS_MARINA_2025_DISPLAYED.length});
