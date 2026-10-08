#!/usr/bin/env node
// Yas Marina 2025 centreline from the MIT GPS-derived outline. The FIA map
// fixes driving direction, corner order, control line and measured 5,281 m lap.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const { points: supplied } = JSON.parse(await readFile(path.join(import.meta.dirname, 'gps-reference.json'), 'utf8'));
const LENGTH = 5281;
// Normalised axes were scaled independently; the 2025 FIA plan has a width
// to height ratio close to 0.47. This also gives a T5–T6 straight of ~1.2 km.
const aspect = .47;
const source = supplied.slice(0, -1).map(([u, v]) => [(u - .5) * aspect, -(v - .5)]);
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const cumulative = [0];
for (let i=1;i<=source.length;i++) cumulative.push(cumulative.at(-1)+distance(source[i-1],source[i%source.length]));
const scale=LENGTH/cumulative.at(-1);
const scaled=source.map(([x,z])=>[x*scale,z*scale]);
const stations=cumulative.map(d=>d*scale);
function pointAt(station){
  const s=((station%LENGTH)+LENGTH)%LENGTH;
  let lo=0,hi=stations.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>>1;if(stations[mid]<=s)lo=mid;else hi=mid;}
  const a=scaled[lo],b=scaled[(lo+1)%scaled.length];
  const t=(s-stations[lo])/(stations[lo+1]-stations[lo]);
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
// The official 306,183 m race distance puts the start 115 m after control.
const count=Math.round(LENGTH/4), controlStation=LENGTH-115;
const raw=Array.from({length:count},(_,i)=>pointAt(controlStation+i*LENGTH/count));
const weights=[1,4,6,4,1];
const smooth=raw.map((_,i)=>[0,1].map(axis=>weights.reduce((sum,w,j)=>sum+w*raw[(i+j-2+count)%count][axis],0)/16));
let rendered=0;
for(let i=0;i<count;i++)rendered+=distance(smooth[i],smooth[(i+1)%count]);
const correction=LENGTH/rendered;
const origin=smooth[0];
const output=smooth.map(([x,z])=>[+((x-origin[0])*correction).toFixed(4),+((z-origin[1])*correction).toFixed(4)]);
output.push([...output[0]]);
function nearest([u,v]){
  const x=((u-.5)*aspect*scale-origin[0])*correction;
  const z=(-(v-.5)*scale-origin[1])*correction;
  let best=0,minimum=Infinity;
  for(let i=0;i<count;i++){
    const d=(output[i][0]-x)**2+(output[i][1]-z)**2;
    if(d<minimum){minimum=d;best=i;}
  }
  return best;
}
const corners=[
  [.7889,.5156], [.7249,.4069], [.5201,.3309], [.559,.2174],
  [.4763,.05], [.05,.6372], [.1273,.6447], [.1854,.7264],
  [.95,.9145], [.86,.8683], [.6245,.8567], [.4732,.7574],
  [.6053,.7232], [.5917,.677], [.3205,.6861], [.1667,.586],
];
const turns=Object.fromEntries(corners.map((position,i)=>{
  const index=nearest(position);
  return [`T${i+1}`,{name:`Virage ${i+1}`,index,distanceMeters:+(index/count*LENGTH).toFixed(1)}];
}));
const pitEntry=nearest([.2027,.5735]);
const pitExit=nearest([.618,.546]);
const landmarks={
  controlLineIndex:0, gridIndex:Math.round(115/LENGTH*count), startLineOffsetMeters:115,
  pitStraight:{fromIndex:pitEntry,toIndex:pitExit,pitLaneSide:'right of travel / positive across',entryIndex:pitEntry,exitIndex:pitExit},
  turns,
  sectors:{S1:{beforeTurn:'T5',beforeMeters:205},S2:{beforeTurn:'T9',beforeMeters:100}},
  drs:{detection1:{beforeTurn:'T5',beforeMeters:250},activation1:{afterTurn:'T5',afterMeters:260},
    detection2:{afterTurn:'T7',afterMeters:50},activation2:{afterTurn:'T7',afterMeters:165}},
  speedTrap:{beforeTurn:'T6',beforeMeters:150},
};
const header=`// Yas Marina Circuit · FIA 2025 F1 layout, 16 corners, 5,281 m.\n// https://www.fia.com/system/files/decision-document/2025_yas_marina_event_-_circuit_map_-_yas_marina_2025.pdf\n// MIT GPS outline: scripts/yas-marina/gps-reference.json. Width, kerbs, pit\n// lane and buildings are visual reconstructions, not survey geometry.\n\n`;
await writeFile(path.join(ROOT,'dist/yas-marina/track-data.js'),
  `${header}export const TRACK_LENGTH_METERS = 5281;\nexport const TRACK_WIDTH_METERS = 13;\nexport const TRACK_POINTS = ${JSON.stringify(output)};\nexport const LANDMARKS = ${JSON.stringify(landmarks,null,2)};\n`);
console.log(`Yas Marina: ${count} points, T5-T6 ${((turns.T6.index-turns.T5.index+count)%count*LENGTH/count).toFixed(0)} m; corners ${Object.values(turns).map(t=>t.index).join(',')}; pit ${pitEntry}→${pitExit}`);
