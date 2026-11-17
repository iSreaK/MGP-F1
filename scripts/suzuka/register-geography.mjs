// Geographic calibration only: no reflection, no reordering of the race lap.
import{readFile,writeFile}from'node:fs/promises';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
const raw=JSON.parse(await readFile(new URL('./fastlap-location.json',import.meta.url)));
const geo=JSON.parse(await readFile(new URL('./geographic-reference.geojson',import.meta.url)));
const coordinates=geo.features[0].geometry.coordinates;
const origin={longitude:136.533,latitude:34.844};
const R=6371008.8,rad=Math.PI/180;
const project=([lon,lat])=>new THREE.Vector3((lon-origin.longitude)*rad*R*Math.cos(origin.latitude*rad),0,-(lat-origin.latitude)*rad*R);
function resample(points,count){const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');curve.arcLengthDivisions=16000;curve.updateArcLengths();return Array.from({length:count},(_,i)=>curve.getPointAt(i/count));}
const N=600,a=resample(raw.map(p=>new THREE.Vector3(p.x,0,-p.y)),N),b=resample(coordinates.slice(0,-1).map(project),N);
const ac=a.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/N),bc=b.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/N);
let best=null;
for(let offset=0;offset<N;offset++){
 let dot=0,cross=0,den=0;
 for(let i=0;i<N;i++){const p=a[i].clone().sub(ac),q=b[(i+offset)%N].clone().sub(bc);dot+=p.x*q.x+p.z*q.z;cross+=p.x*q.z-p.z*q.x;den+=p.x*p.x+p.z*p.z;}
 const angle=Math.atan2(cross,dot),scale=Math.hypot(dot,cross)/den,c=Math.cos(angle),s=Math.sin(angle);let squared=0;
 for(let i=0;i<N;i++){const p=a[i].clone().sub(ac),q=b[(i+offset)%N].clone().sub(bc);squared+=(scale*(p.x*c-p.z*s)-q.x)**2+(scale*(p.x*s+p.z*c)-q.z)**2;}
 const rms=Math.sqrt(squared/N);if(!best||rms<best.rms)best={offset,rms,angleRadians:angle,angleDegrees:angle/rad,metresPerRawUnit:scale};
}
const result={source:'https://github.com/bacinger/f1-circuits/blob/master/circuits/jp-1962.geojson',license:'MIT - Copyright (c) 2019-2025 Tomislav Bacinger',coordinates:'WGS84 longitude/latitude',worldAxes:'x east / z south',origin,calibration:best,referencePoints:coordinates.map((p,i)=>({index:i,longitude:p[0],latitude:p[1],...((i===0||i===2||i===coordinates.length-1)?{reference:true}:{})})),rawCentre:{x:ac.x,z:ac.z},geographicCentre:{x:bc.x,z:bc.z}};
await writeFile(new URL('./geographic-registration.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({origin,...best}));
