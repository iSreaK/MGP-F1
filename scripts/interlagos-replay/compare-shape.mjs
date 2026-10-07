#!/usr/bin/env node
// Diagnostic only: quantify the difference between the official schematic
// trace and the 2025 OpenF1 XY median after one optimal 2D similarity fit.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TRACK_POINTS, TRACK_LENGTH_METERS } from '../interlagos/hand-trace.js';
import { makeReference } from './gps-relative-lateral.mjs';

const rawDir = join(import.meta.dirname, 'raw');
const read = async name => JSON.parse(await readFile(join(rawDir,name),'utf8'));
const numbers = [63,1,4,81,12,16,14,44];
const drivers = await Promise.all(numbers.map(async number => ({
  number,
  laps:(await read(`laps_${number}.json`)).map(row => ({
    ...row,t:Date.parse(row.date_start),
  })),
  locations:(await read(`location_${number}.json`))
    .map(row => ({ ...row,t:Date.parse(row.date) }))
    .sort((a,b)=>a.t-b.t),
})));
const pitRows = (await read('pit.json')).map(row => ({ ...row,t:Date.parse(row.date) }));
const reference = makeReference(drivers,pitRows,TRACK_LENGTH_METERS,TRACK_POINTS);
const trackDistances=[0];
for(let i=1;i<TRACK_POINTS.length;i++) trackDistances.push(trackDistances.at(-1)
  +Math.hypot(TRACK_POINTS[i][0]-TRACK_POINTS[i-1][0],
    TRACK_POINTS[i][1]-TRACK_POINTS[i-1][1]));
function mapAt(station) {
  let low=0,high=trackDistances.length-2;
  while(low<high){const mid=(low+high)>>1;
    if(trackDistances[mid+1]<station)low=mid+1;else high=mid;}
  const f=(station-trackDistances[low])/(trackDistances[low+1]-trackDistances[low]);
  return [0,1].map(axis=>TRACK_POINTS[low][axis]
    +(TRACK_POINTS[low+1][axis]-TRACK_POINTS[low][axis])*f);
}
const source=reference.points;
function fit(reflected, phase) {
  const target=source.map((_,i)=>mapAt((i*TRACK_LENGTH_METERS/source.length
    + phase + TRACK_LENGTH_METERS)%TRACK_LENGTH_METERS));
  const a=source.map(p=>[p[0],reflected?-p[1]:p[1]]);
  const mean=(points,axis)=>points.reduce((s,p)=>s+p[axis],0)/points.length;
  const ax=mean(a,0),ay=mean(a,1),bx=mean(target,0),by=mean(target,1);
  let dot=0,cross=0,norm=0;
  for(let i=0;i<a.length;i++) {
    const x=a[i][0]-ax,y=a[i][1]-ay,X=target[i][0]-bx,Y=target[i][1]-by;
    dot+=x*X+y*Y; cross+=x*Y-y*X; norm+=x*x+y*y;
  }
  const angle=Math.atan2(cross,dot),scale=Math.hypot(dot,cross)/norm;
  const cosine=Math.cos(angle),sine=Math.sin(angle);
  const residuals=a.map((p,i)=>{
    const x=p[0]-ax,y=p[1]-ay;
    return Math.hypot(scale*(x*cosine-y*sine)+bx-target[i][0],
      scale*(x*sine+y*cosine)+by-target[i][1]);
  }).sort((a,b)=>a-b);
  const rms=Math.sqrt(residuals.reduce((sum,e)=>sum+e*e,0)/residuals.length);
  return { reflected, phase, scale, angleDegrees:angle*180/Math.PI,
    rmsMetres:rms, medianMetres:residuals[residuals.length>>1],
    p90Metres:residuals[Math.floor(residuals.length*.9)],
    maximumMetres:residuals.at(-1) };
}
const fits=[];
for(const reflected of [false,true]) for(let phase=-120;phase<=120;phase+=5)
  fits.push(fit(reflected,phase));
console.log({ laps:reference.sourceLapCount,
  referenceLengthMetres:reference.length,
  best:fits.sort((a,b)=>a.rmsMetres-b.rmsMetres)[0] });
