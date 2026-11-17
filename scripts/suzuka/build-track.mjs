// Reproducible Suzuka 2026 geometry from Antonelli race lap49, OpenF1.
// Telemetry is a racing line rather than a surveyed kerb centreline.
import {readFile,writeFile} from 'node:fs/promises';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
const raw=JSON.parse(await readFile(new URL('./fastlap-location.json',import.meta.url)));
const laps=JSON.parse(await readFile(new URL('./antonelli-laps.json',import.meta.url)));
const lap=laps.find(lap=>lap.lap_number===49),start=Date.parse(lap.date_start),duration=lap.lap_duration*1000;
// The first GPS sample arrives188ms after the control-line timestamp. Anchor
// station zero at that timestamp, interpolating across the periodic seam;
// otherwise every corner and braking zone is shifted ~15m around the lap.
const first=raw[0],last=raw.at(-1),before=Date.parse(last.date)-start-duration,after=Date.parse(first.date)-start,t=-before/(after-before);
raw.unshift({...first,date:lap.date_start,x:last.x+(first.x-last.x)*t,y:last.y+(first.y-last.y)*t,z:last.z+(first.z-last.z)*t});
const map=JSON.parse(await readFile(new URL('./multiviewer.json',import.meta.url)));
const registration=JSON.parse(await readFile(new URL('./geographic-registration.json',import.meta.url)));
const geo=JSON.parse(await readFile(new URL('./geographic-reference.geojson',import.meta.url)));
const L=5807,N=1162,angle=-registration.calibration.angleRadians,cs=Math.cos(angle),sn=Math.sin(angle);
// Geographic registration fixes true east/south axes. The rotation is fitted
// to the WGS84 circuit, not MultiViewer's arbitrary display rotation49deg.
const tx=(x,y)=>new THREE.Vector3(x*cs-y*sn,0,-(x*sn+y*cs));
const source=raw.map(p=>tx(p.x,p.y));
const rawCurve=new THREE.CatmullRomCurve3(source,true,'centripetal',.18);
rawCurve.arcLengthDivisions=12000;rawCurve.updateArcLengths();
const factor=L/rawCurve.getLength();
const centre=new THREE.Box3().setFromPoints(source).getCenter(new THREE.Vector3());
const points=Array.from({length:N},(_,i)=>{const p=rawCurve.getPointAt(i/N).sub(centre).multiplyScalar(factor);return[p.x,p.z];});points.push(points[0]);
const len=points.slice(1).reduce((v,p,i)=>v+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
const correction=L/len;for(let i=0;i<N;i++)points[i]=points[i].map(v=>v*correction);points[N]=points[0];
const fittedScale=registration.calibration.metresPerRawUnit,worldScale=factor*correction;
const mean=tx(registration.rawCentre.x,-registration.rawCentre.z);
const geoCentre=registration.geographicCentre;
const zeroEast=geoCentre.x+(centre.x-mean.x)*fittedScale;
const zeroSouth=geoCentre.z+(centre.z-mean.z)*fittedScale;
const radians=Math.PI/180,R=6371008.8;
const originLatitude=registration.origin.latitude-zeroSouth/R/radians;
const originLongitude=registration.origin.longitude+zeroEast/(R*Math.cos(registration.origin.latitude*radians))/radians;
const anchors=Object.fromEntries([['mainStraightStart',0],['mainStraightEnd',2],['westStraightStart',127],['westStraightEnd',138]].map(([name,index])=>{
 const [lon,lat]=geo.features[0].geometry.coordinates[index];
 const east=(lon-registration.origin.longitude)*radians*R*Math.cos(registration.origin.latitude*radians),south=-(lat-registration.origin.latitude)*radians*R;
 const x=(east-geoCentre.x)*worldScale/fittedScale+(mean.x-centre.x)*worldScale;
 const z=(south-geoCentre.z)*worldScale/fittedScale+(mean.z-centre.z)*worldScale;
 let nearest=0,best=Infinity;points.slice(0,N).forEach((p,j)=>{let d=(p[0]-x)**2+(p[1]-z)**2;if(d<best){best=d;nearest=j;}});
 return[name,{longitude:lon,latitude:lat,index:nearest,residualMeters:Math.sqrt(best)}];
}));
const geographicFrame={axes:'x east / z south',source:registration.source,originLatitude,originLongitude,fitRmsMeters:registration.calibration.rms,rotationDegreesFromRawXZ:registration.calibration.angleDegrees,anchors};
const cumulative=[0];for(let i=1;i<raw.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y));
const rawLength=cumulative.at(-1)+Math.hypot(raw[0].x-raw.at(-1).x,raw[0].y-raw.at(-1).y);
const heights=raw.map((p,i)=>{let sum=0,weight=0;for(let k=-3;k<=3;k++){const w=4-Math.abs(k);sum+=raw[(i+k+raw.length)%raw.length].z*w;weight+=w;}return sum/weight;});
const min=Math.min(...heights),max=Math.max(...heights);
const profile=heights.map((h,i)=>[cumulative[i]/rawLength*L,(h-min)/(max-min)*52]);profile.push([L,profile[0][1]]);
const names=['First Curve','Second Curve','S Curves 1','S Curves 2','S Curves 3','S Curves 4','Dunlop','Degner 1','Degner 2','110R','Hairpin','200R','Spoon 1','Spoon 2','130R','Casio Triangle 1','Casio Triangle 2','Final Curve'];
const turns=Object.fromEntries(map.corners.map((c,i)=>{const p=tx(c.trackPosition.x,c.trackPosition.y).sub(centre).multiplyScalar(factor*correction);let nearest=0,dist=Infinity;points.slice(0,N).forEach(([x,z],j)=>{let d=(p.x-x)**2+(p.z-z)**2;if(d<dist){dist=d;nearest=j;}});return['T'+c.number,{name:names[i],index:nearest,distanceMeters:Math.round(nearest/N*L*10)/10}];}));
const landmarks={controlLineIndex:0,gridIndex:Math.round(300/L*N),startLineOffsetMeters:300,pitStraight:{fromIndex:Math.round(.96*N),toIndex:Math.round(.105*N),entryIndex:Math.round(.94*N),exitIndex:Math.round(.115*N),pitLaneSide:'right / negative across'},turns,sectors:{S1:{beforeTurn:'T8',beforeMeters:110},S2:{beforeTurn:'T15',beforeMeters:270}},drs:{detection1:{afterTurn:'T18',afterMeters:0},activation1:{afterTurn:'T18',afterMeters:100},detection2:{afterTurn:'T14',afterMeters:0},activation2:{afterTurn:'T14',afterMeters:70}},speedTrap:{afterTurn:'T15',afterMeters:70}};
let crossing=null;
for(let i=0;i<N;i++)for(let j=i+60;j<N;j++){const a=points[i],b=points[i+1],c=points[j],d=points[j+1],dx=b[0]-a[0],dz=b[1]-a[1],ex=d[0]-c[0],ez=d[1]-c[1],det=dx*ez-dz*ex;if(Math.abs(det)<1e-9)continue;const t=((c[0]-a[0])*ez-(c[1]-a[1])*ex)/det,u=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/det;if(t>0&&t<1&&u>0&&u<1)crossing={lowerStation:(i+t)/N*L,upperStation:(j+u)/N*L,x:a[0]+t*dx,z:a[1]+t*dz};}
if(!crossing)throw new Error('Suzuka must have exactly one figure-eight crossing');
const round=v=>Math.round(v*10000)/10000;
await writeFile(new URL('../../dist/suzuka/track-data.js',import.meta.url),`// Suzuka GP2026, OpenF1 session11253, Antonelli lap49 (29March2026).\n// A calibrated racing-line reconstruction, not a surveyed centreline.\n// 5807 m / 18 corners: Suzuka official course guide and FIA circuit map.\n// Geographic WGS84 fit fixes x east / z south; determinant-positive rotation, no reflection.\nexport const TRACK_LENGTH_METERS=5807;\nexport const TRACK_WIDTH_METERS=12;\nexport const GEOGRAPHIC_FRAME=${JSON.stringify(geographicFrame,null,2)};\nexport const TRACK_POINTS=${JSON.stringify(points.map(p=>p.map(round)))};\nexport const CROSSOVER=${JSON.stringify(crossing)};\nexport const LANDMARKS=${JSON.stringify(landmarks,null,2)};\n`);
await writeFile(new URL('../../dist/suzuka/elevation-data.js',import.meta.url),`// OpenF1 Z low-pass stations, scaled to the documented52m course relief.\n// Z does not resolve the crossover: geometry-smoothing adds an explicit bridge.\n// https://superformula.net/sf2/circuit/suzuka (official course elevation:52m).\nexport const TELEMETRY_ELEVATION_METERS=${JSON.stringify(profile.map(p=>p.map(round)))};\n`);
console.log(JSON.stringify({N,turns,crossing,len:L},null,2));
