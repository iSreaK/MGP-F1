import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from '../../dist/vendor/three/build/three.module.js';
const source = new URL('./source/',import.meta.url);
const geo = JSON.parse(await readFile(new URL('circuit-geo.json',source),'utf8'));
const coordinates = geo.features[0].geometry.coordinates;
const origin = [144.9700,-37.8460];
const earth = 6371008.8, radians=Math.PI/180;
const project = ([lon,lat]) => [(lon-origin[0])*radians*earth*Math.cos(origin[1]*radians),
  -(lat-origin[1])*radians*earth];
const vertices = coordinates.slice(0,-1).map(point=>{const [x,z]=project(point);return new THREE.Vector3(x,0,z)});
// Keep long straights straight: Catmull-Rom overshoots when source point gaps
// vary from a few metres at a corner to hundreds of metres on the straight.
const input = [];
for (let i=0;i<vertices.length;i++) {
 const a=vertices[i],b=vertices[(i+1)%vertices.length];
 const steps=Math.max(1,Math.ceil(a.distanceTo(b)/8));
 for(let step=0;step<steps;step++)input.push(a.clone().lerp(b,step/steps));
}
const spline = new THREE.CatmullRomCurve3(input,true,'centripetal');
spline.arcLengthDivisions=16000;spline.updateArcLengths();
const scale=5278/spline.getLength();
const count=1320;
let points=Array.from({length:count},(_,i)=>spline.getPointAt(i/count).multiplyScalar(scale));
const planLength=points.reduce((sum,p,i)=>sum+p.distanceTo(points[(i+1)%count]),0);
const correction=5278/planLength;
for(const point of points)point.multiplyScalar(correction);
const geographicScale=scale*correction;
const round=v=>Math.round(v*10000)/10000;
const projectFinal = point=>project(point).map(value=>round(value*geographicScale));
const plan=points.map(p=>[round(p.x),round(p.z)]);plan.push(plan[0]);
const turnCoordinates=[
 [144.966003,-37.847543],[144.966134,-37.846408],
 [144.962149,-37.842193],[144.963676,-37.8418],
 [144.963686,-37.839876],[144.967972,-37.838005],
 [144.970926,-37.839083],[144.971701,-37.841896],
 [144.973764,-37.848102],[144.974837,-37.848123],
 [144.97859,-37.853141],[144.975842,-37.853917],
 [144.974149,-37.852065],[144.972873,-37.852884],
];
const turns=Object.fromEntries(turnCoordinates.map((coordinate,i)=>{
 const [x,z]=projectFinal(coordinate);let best=0,distance=Infinity;
 for(let j=0;j<count;j++){const d=Math.hypot(plan[j][0]-x,plan[j][1]-z);if(d<distance){distance=d;best=j;}}
 return ['T'+(i+1),{name:'Virage '+(i+1),index:best,distanceMeters:Math.round(best/count*5278*10)/10}];
}));
const landmarks={controlLineIndex:0,startLineOffsetMeters:0,
 pitStraight:{entryIndex:Math.round((5278-380)/5278*count),exitIndex:Math.round(285/5278*count)},turns,
 sectors:{S1:{distanceMeters:1753},S2:{distanceMeters:3166}}};
await writeFile(new URL('../../dist/albert-park/track-data.js',import.meta.url),
 `// Albert Park post-2022 alignment, verified against the FIA 2026 circuit map.\n`+
 `// Geographic source: bacinger/f1-circuits au-1953.geojson (5278 m configuration).\n`+
 `// x = east, z = south. Geographic north is -z: this is not a mirrored plan.\n`+
 `export const TRACK_LENGTH_METERS = 5278;\nexport const TRACK_WIDTH_METERS = 12;\n`+
 `export const TRACK_POINTS = ${JSON.stringify(plan)};\n`+
 `export const LANDMARKS = ${JSON.stringify(landmarks,null,2)};\n`);

function ringsFromOsm(json) {
 const elements=json.elements;
 const nodes=new Map(elements.filter(e=>e.type==='node').map(n=>[n.id,[n.lon,n.lat]]));
 const ways=new Map(elements.filter(e=>e.type==='way').map(w=>[w.id,w.nodes]));
 const relation=elements.find(e=>e.type==='relation'&&e.id===346429);
 const rings={outer:[],inner:[]};
 for(const role of ['outer','inner']) {
  const pool=relation.members.filter(m=>m.type==='way'&&m.role===role).map(m=>[...ways.get(m.ref)]);
  while(pool.length){let ring=pool.shift();let passes=0;
   while(ring[0]!==ring.at(-1)&&passes++<100){
    const index=pool.findIndex(w=>w[0]===ring.at(-1)||w.at(-1)===ring.at(-1));
    if(index<0)throw new Error('Open OSM shoreline');
    const way=pool.splice(index,1)[0];if(way[0]!==ring.at(-1))way.reverse();ring.push(...way.slice(1));
   }
   rings[role].push(ring.map(id=>projectFinal(nodes.get(id))));
  }
 }
 return rings;
}
const lake=ringsFromOsm(JSON.parse(await readFile(new URL('lake-osm.json',source),'utf8')));
const msacJson=JSON.parse(await readFile(new URL('msac-osm.json',source),'utf8'));
const msacNodes=new Map(msacJson.elements.filter(n=>n.type==='node').map(n=>[n.id,[n.lon,n.lat]]));
const msac=msacJson.elements.find(w=>w.type==='way').nodes.map(id=>projectFinal(msacNodes.get(id)));
await writeFile(new URL('../../dist/albert-park/venue-data.js',import.meta.url),
 `// Geographic features © OpenStreetMap contributors, ODbL.\n`+
 `// https://www.openstreetmap.org/copyright ; relation 346429 and way 15867023.\n`+
 `export const GEO_ORIGIN = ${JSON.stringify(origin)};\nexport const GEO_SCALE = ${geographicScale};\n`+
 `export const LAKE_OUTLINES = ${JSON.stringify(lake.outer)};\nexport const LAKE_ISLANDS = ${JSON.stringify(lake.inner)};\n`+
 `export const MSAC_PARCEL = ${JSON.stringify(msac)};\n`);
console.log({geographicScale,turns,lakeRings:lake.outer.length,islands:lake.inner.length});
