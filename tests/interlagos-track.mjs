import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS }
  from '../dist/interlagos/track-data.js';
import { prepareInterlagosCurve, trackHeightAtStation }
  from '../dist/interlagos/geometry-smoothing.js';

const source=TRACK_POINTS.slice(0,-1);
const n=source.length;
const point=i=>source[(i+n)%n];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const cumulative=[0];
for(let i=1;i<n;i++) cumulative.push(cumulative.at(-1)+dist(point(i-1),point(i)));
const total=cumulative.at(-1)+dist(point(n-1),point(0));
assert.deepEqual(TRACK_POINTS.at(-1),TRACK_POINTS[0]);
assert.ok(Math.abs(total-TRACK_LENGTH_METERS)<.02,`length ${total}`);
for(let i=0;i<n;i++) for(let j=i+8;j<n;j++) {
  if(n-(j-i)<8) continue;
  const a=point(i),b=point(i+1),c=point(j),d=point(j+1);
  assert.ok(!(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0),
    `centreline intersects at ${i}/${j}`);
}
let previous=0;
for(let corner=1;corner<=15;corner++) {
  const turn=LANDMARKS.turns[`T${corner}`];
  assert.ok(turn.index>previous,`T${corner} follows race direction`);
  assert.ok(Math.abs(cumulative[turn.index]-turn.distanceMeters)<3,
    `T${corner} station mismatch`);
  previous=turn.index;
}
assert.ok(Math.abs(cumulative[LANDMARKS.gridIndex]-60)<5,
  '2025 grid is around 60m after the control line');
const backStraight=source.filter((_,i)=>cumulative[i]>760&&cumulative[i]<1250);
const a=backStraight[0],b=backStraight.at(-1);
const span=dist(a,b);
const wobble=Math.max(...backStraight.map(p=>Math.abs(cross(a,b,p))/span));
assert.ok(wobble<.015,`Reta Oposta is straight (${wobble}m wave)`);
const rendered=prepareInterlagosCurve(THREE,TRACK_POINTS,TRACK_LENGTH_METERS);
assert.ok(Math.abs(rendered.renderedLength-TRACK_LENGTH_METERS)<.02,
  'rendered 3D lap length remains calibrated');
let minRadius=Infinity,minStation=0,maxGrade=0;
const size=TRACK_LENGTH_METERS;
const samples=Array.from({length:size},(_,i)=>rendered.curve.getPointAt(i/size));
for(let i=0;i<size;i++) {
  const prev=samples[(i-1+size)%size],p=samples[i],next=samples[(i+1)%size];
  const ux=p.x-prev.x,uz=p.z-prev.z,vx=next.x-p.x,vz=next.z-p.z;
  const angle=Math.abs(Math.atan2(ux*vz-uz*vx,ux*vx+uz*vz));
  if(angle>1e-8) { const radius=(Math.hypot(ux,uz)+Math.hypot(vx,vz))/(2*angle);
    if(radius<minRadius){minRadius=radius;minStation=i;} }
  maxGrade=Math.max(maxGrade,Math.abs(p.y-prev.y)/Math.max(.01,Math.hypot(ux,uz)));
}
assert.ok(minRadius>TRACK_WIDTH_METERS/2+1,`inner edge has room at radius ${minRadius} near ${minStation}m`);
assert.ok(maxGrade<.16,`grade is bounded at ${maxGrade}`);
assert.ok(Math.abs(trackHeightAtStation(0)-trackHeightAtStation(4308.999))<.05);
const relief=trackHeightAtStation(LANDMARKS.turns.T1.distanceMeters)
  - trackHeightAtStation(LANDMARKS.turns.T5.distanceMeters);
assert.ok(Math.abs(relief-43)<.1,`Interlagos relief is 43m, got ${relief}`);
console.log('Interlagos track OK', {sourcePoints:n,sourceLength:total,
  renderedLength:rendered.renderedLength,wobble,minRadius,maxGrade,relief});
