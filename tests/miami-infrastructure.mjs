import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createMiamiWorld} from '../dist/miami/world.js';
import {roadHalfWidthAt} from '../dist/miami/road-layout.js';
import {GEO_REFERENCE} from '../dist/miami/track-data.js';
import {TURNPIKE_ROADS} from '../dist/miami/highway-data.js';
globalThis.document={createElement(){return{width:1,height:1,getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},fillRect(){},fillText(){}};}};}};
const scene=new THREE.Scene(),world=createMiamiWorld(THREE,scene);scene.updateMatrixWorld(true);
const road=scene.getObjectByName('Miami International Autodrome racing surface').geometry;
const p=road.getAttribute('position'),index=road.getIndex();
for(let i=0;i<world.samples.length;i++) {
  const left=new THREE.Vector3().fromBufferAttribute(p,i*4),right=new THREE.Vector3().fromBufferAttribute(p,i*4+1);
  const width=left.distanceTo(right);assert.ok(width>=9.999&&width<=15.401);
  assert.ok(Math.abs(width-roadHalfWidthAt(i/world.samples.length)*2)<.002);
}
for(let i=0;i<index.count;i+=3) {
  const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));
  assert.ok(b.sub(a).cross(c.sub(a)).y>0,'race road has no folded strip, including T14–15');
}
assert.ok(roadHalfWidthAt(3450/5412)<=5.01&&roadHalfWidthAt(158/5412)>7.6);
assert.ok(!scene.getObjectByName('MIAMI outside Armco guardrails'),'street walls replace permanent-circuit Armco');
assert.ok(world.trackside.barrierCount>3000);
assert.equal(scene.getObjectByName('Miami pit garage concrete bays').count,37);
assert.ok(scene.getObjectByName('Miami Paddock Club third floor glazing'));
const pit=scene.getObjectByName('Miami pit entry, fast lane, working lane and exit').geometry.getAttribute('position');
for(const [vertex,station] of [[0,world.pitLane.pitEntryStation],[pit.count-2,world.pitLane.pitExitStation]]) {
  const f=world.pitLane.frameAt(station),edge=f.point.clone().addScaledVector(f.across,-roadHalfWidthAt(f.u));
  const endpoint=new THREE.Vector3().fromBufferAttribute(pit,vertex);
  assert.ok(Math.hypot(edge.x-endpoint.x,edge.z-endpoint.z)<.025,'pit taper meets variable-width race edge');
  assert.ok(Math.abs(edge.y-endpoint.y)<.02);
}
assert.equal(world.environment.stadium.children.filter(m=>m.name.startsWith('Miami infield team hospitality ')).length,11);
const club=world.environment.yachtClub;
assert.equal(club.children.filter(m=>m.name.startsWith('MSC Yacht Club terrace deck ')).length,5);
assert.equal(club.children.filter(m=>m.name==='MSC Yacht Club ground level cabana').length,9);
const hull=scene.getObjectByName('MSC Yacht Club full size sculpted hull');hull.geometry.computeBoundingBox();
const dimensions=hull.geometry.boundingBox.getSize(new THREE.Vector3());
assert.ok(Math.abs(dimensions.x-80.47)<.05&&Math.abs(dimensions.z-29.26)<.05,'official 264 × 96 ft hospitality ship footprint');
const osm=JSON.parse(await readFile(new URL('../scripts/miami/source/highways-osm.json',import.meta.url),'utf8'));
assert.ok(TURNPIKE_ROADS.length>30&&world.environment.turnpike.segmentCount>200);
for(const item of TURNPIKE_ROADS.slice(0,3)) {
  const source=osm.elements.find(x=>x.id===item.id).geometry[0];
  assert.ok(Math.abs(item.points[0][0]-(source.lon-GEO_REFERENCE.originLongitude)*GEO_REFERENCE.metresPerDegreeLongitude)<.01);
  assert.ok(Math.abs(item.points[0][2]-(GEO_REFERENCE.originLatitude-source.lat)*GEO_REFERENCE.metresPerDegreeLatitude)<.01);
}
let maxRampGrade=0;
for(const road of TURNPIKE_ROADS)for(let i=1;i<road.points.length;i++) {
  const a=road.points[i-1],b=road.points[i];
  maxRampGrade=Math.max(maxRampGrade,Math.abs(b[1]-a[1])/Math.hypot(b[0]-a[0],b[2]-a[2]));
}
assert.ok(maxRampGrade<.0403,'connected highway ramps stay within 4% plus millimetre export rounding');
console.log('Miami infrastructure:',JSON.stringify({roadWidthMetres:[10,15.4],garageBays:37,infieldTeams:11,yachtDecks:5,yachtCabanas:9,highwayWays:world.environment.turnpike.wayCount,highwaySegments:world.environment.turnpike.segmentCount,highwayPiers:world.environment.turnpike.pierCount,maxRampGradePercent:Number((maxRampGrade*100).toFixed(3)),palms:world.environment.palmCount}));
