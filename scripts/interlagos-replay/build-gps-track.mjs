#!/usr/bin/env node
// Build Interlagos plan geometry from a median of measured 2025 OpenF1 laps.
// The FIA schematic supplies turn names/sequence; official lap length fixes
// the physical scale. Long straights are constrained to lines to reject GPS
// waviness. The generated data is self-contained for the shipped page.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TRACK_POINTS as HAND_POINTS, LANDMARKS as HAND_LANDMARKS,
  TRACK_LENGTH_METERS } from '../interlagos/hand-trace.js';
import { makeReference } from './gps-relative-lateral.mjs';

const rawDir=join(import.meta.dirname,'raw');
const output=join(import.meta.dirname,'..','..','dist','interlagos','track-data.js');
const read=async name=>JSON.parse(await readFile(join(rawDir,name),'utf8'));
const numbers=[63,1,4,81,12,16,14,44];
const drivers=await Promise.all(numbers.map(async number=>({
  number,
  laps:(await read(`laps_${number}.json`)).map(row=>({
    ...row,t:Date.parse(row.date_start) })),
  locations:(await read(`location_${number}.json`))
    .map(row=>({ ...row,t:Date.parse(row.date) }))
    .sort((a,b)=>a.t-b.t),
})));
const pitRows=(await read('pit.json')).map(row=>({ ...row,t:Date.parse(row.date) }));
const reference=makeReference(drivers,pitRows,TRACK_LENGTH_METERS,HAND_POINTS);
const L=TRACK_LENGTH_METERS;
const wrap=(v,size)=>((v%size)+size)%size;
const smooth=t=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
const medianLength=reference.length;

const handDistances=[0];
for(let i=1;i<HAND_POINTS.length;i++) handDistances.push(handDistances.at(-1)
  +Math.hypot(HAND_POINTS[i][0]-HAND_POINTS[i-1][0],
    HAND_POINTS[i][1]-HAND_POINTS[i-1][1]));
function handAt(station) {
  station=wrap(station,L);
  let low=0,high=handDistances.length-2;
  while(low<high){const mid=(low+high)>>1;
    if(handDistances[mid+1]<station)low=mid+1;else high=mid;}
  const f=(station-handDistances[low])/(handDistances[low+1]-handDistances[low]);
  return [0,1].map(axis=>HAND_POINTS[low][axis]
    +(HAND_POINTS[low+1][axis]-HAND_POINTS[low][axis])*f);
}

const source=reference.points;
const fixedScale=L/medianLength;
function fit(phase) {
  const target=source.map((_,i)=>handAt(i*L/source.length+phase));
  const mean=(points,axis)=>points.reduce((sum,p)=>sum+p[axis],0)/points.length;
  const ax=mean(source,0),ay=mean(source,1);
  const bx=mean(target,0),by=mean(target,1);
  let dot=0,cross=0;
  for(let i=0;i<source.length;i++) {
    const x=source[i][0]-ax,y=source[i][1]-ay;
    const X=target[i][0]-bx,Y=target[i][1]-by;
    dot+=x*X+y*Y;cross+=x*Y-y*X;
  }
  const angle=Math.atan2(cross,dot), cosine=Math.cos(angle),sine=Math.sin(angle);
  const points=source.map(p=>{
    const x=p[0]-ax,y=p[1]-ay;
    return [fixedScale*(x*cosine-y*sine)+bx,
      fixedScale*(x*sine+y*cosine)+by];
  });
  const rms=Math.sqrt(points.reduce((sum,p,i)=>sum+
    Math.hypot(p[0]-target[i][0],p[1]-target[i][1])**2,0)/points.length);
  return { phase,points,rms,angle,scale:fixedScale };
}
const fitted=Array.from({length:49},(_,i)=>fit(-120+i*5))
  .sort((a,b)=>a.rms-b.rms)[0];
if(fitted.rms>25)throw new Error(`Calage GPS/carte trop incertain : ${fitted.rms} m RMS`);
let points=fitted.points;

// The raw median path retains a little low-amplitude GPS noise. A local
// circular Gaussian removes it before the straight constraints.
const weights=[1,2,3,4,3,2,1];
points=points.map((_,i)=>[0,1].map(axis=>weights.reduce((sum,w,j)=>
  sum+points[wrap(i+j-3,points.length)][axis]*w,0)/weights.reduce((a,b)=>a+b,0)));
function straight(from,to,blendMetres=35) {
  const n=points.length;
  if(to<from)to+=L;
  const start=Math.round(from/L*n),end=Math.round(to/L*n);
  const first=points[wrap(start,n)],last=points[wrap(end,n)];
  for(let k=start+1;k<end;k++) {
    const station=k/n*L;
    const fraction=(station-from)/(to-from);
    const target=[first[0]+(last[0]-first[0])*fraction,
      first[1]+(last[1]-first[1])*fraction];
    const blend=smooth((station-from)/blendMetres)
      *smooth((to-station)/blendMetres);
    const i=wrap(k,n);
    points[i]=[points[i][0]*(1-blend)+target[0]*blend,
      points[i][1]*(1-blend)+target[1]*blend];
  }
}
// Three rectilinear stretches visible from the cameras: the start/finish
// straight, Reta Oposta and the shorter run toward Junção.
straight(4070,4309+255,34);
straight(680,1390,30);
straight(3000,3150,24);

// Resample the de-noised centreline at a uniform physical arc distance and
// scale to the FIA lap length once more (straightening changes total length).
const cumulative=[0];
for(let i=1;i<=points.length;i++) {
  const a=points[i-1],b=points[i%points.length];
  cumulative.push(cumulative.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));
}
const geometricLength=cumulative.at(-1);
const centroid=[0,1].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length);
const factor=L/geometricLength;
const resampled=[];
let k=0;
const sampleCount=957;
for(let i=0;i<sampleCount;i++) {
  const distance=i/sampleCount*geometricLength;
  while(k+1<cumulative.length-1&&cumulative[k+1]<distance)k++;
  const t=(distance-cumulative[k])/(cumulative[k+1]-cumulative[k]);
  const a=points[k],b=points[(k+1)%points.length];
  resampled.push([0,1].map(axis=>Math.round((centroid[axis]
    +((a[axis]+(b[axis]-a[axis])*t)-centroid[axis])*factor)*1e4)/1e4));
}
resampled.push([...resampled[0]]);
const sampledLength=resampled.slice(1).reduce((sum,p,i)=>sum+
  Math.hypot(p[0]-resampled[i][0],p[1]-resampled[i][1]),0);
const finalScale=L/sampledLength;
for(const point of resampled)for(let axis=0;axis<2;axis++)
  point[axis]=Math.round((centroid[axis]
    +(point[axis]-centroid[axis])*finalScale)*1e6)/1e6;
const sourceDistances=[0];
for(let i=1;i<resampled.length;i++)sourceDistances.push(sourceDistances.at(-1)
  +Math.hypot(resampled[i][0]-resampled[i-1][0],
    resampled[i][1]-resampled[i-1][1]));
const nearestIndex=station=>{
  let best=0,distance=Infinity;
  for(let i=0;i<resampled.length-1;i++){
    const error=Math.abs(sourceDistances[i]-station);
    if(error<distance){distance=error;best=i;}
  }
  return best;
};
const landmarks=structuredClone(HAND_LANDMARKS);
const shift=-fitted.phase;
landmarks.controlLineIndex=0;
landmarks.gridIndex=nearestIndex(60);
landmarks.startLineOffsetMeters=60;
for(const mark of Object.values(landmarks.turns)) {
  const station=wrap(mark.distanceMeters+shift,L);
  mark.index=nearestIndex(station);
  mark.distanceMeters=Math.round(sourceDistances[mark.index]*10)/10;
}
for(const key of ['fromIndex','entryIndex'])
  landmarks.pitStraight[key]=landmarks.turns.T15.index;
for(const key of ['toIndex','exitIndex'])
  landmarks.pitStraight[key]=landmarks.turns.T1.index;

const text=`// Interlagos 2025 centreline from a median of ${reference.sourceLapCount} OpenF1 measured clean laps.\n`
  +`// Scaled to the FIA 4,309 m lap and smoothed; long straights line-constrained.\n`
  +`// Not a surveyed road edge: width, pit lane and scenery placement are visual estimates.\n`
  +`// https://www.fia.com/system/files/decision-document/2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map.pdf\n`
  +`// https://openf1.org/docs/\n`
  +`export const TRACK_LENGTH_METERS = ${L};\n`
  +`export const TRACK_WIDTH_METERS = 13;\n`
  +`export const TRACK_POINTS = ${JSON.stringify(resampled)};\n`
  +`export const LANDMARKS = ${JSON.stringify(landmarks,null,2)};\n`;
await writeFile(output,text);
console.log({output,sourceLaps:reference.sourceLapCount,
  phaseMetres:fitted.phase,fitRmsMetres:fitted.rms,
  medianLengthMetres:medianLength,afterSmoothingMetres:geometricLength,
  outputLengthMetres:sourceDistances.at(-1),points:resampled.length});
