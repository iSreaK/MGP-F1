import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS,TRACK_LENGTH_METERS,LANDMARKS,GEO_REFERENCE } from '../dist/miami/track-data.js';
import { prepareMiamiCurve,trackHeightAtStation,ELEVATION_PROFILE_METERS,RELIEF_PRESENTATION_SCALE } from '../dist/miami/geometry-smoothing.js';

assert.equal(TRACK_LENGTH_METERS,5412);
assert.equal(Object.keys(LANDMARKS.turns).length,19);
assert.deepEqual(TRACK_POINTS[0],TRACK_POINTS.at(-1));
let length=0,area=0;
for(let i=1;i<TRACK_POINTS.length;i++) {
  const a=TRACK_POINTS[i-1],b=TRACK_POINTS[i];length+=Math.hypot(b[0]-a[0],b[1]-a[1]);area+=a[0]*b[1]-b[0]*a[1];
}
assert.ok(Math.abs(length-5412)<.02);
assert.ok(area<0,'Miami remains anticlockwise with the FIA map chirality');
const point=id=>TRACK_POINTS[LANDMARKS.turns[id].index];
assert.ok(point('T1')[0]>TRACK_POINTS[0][0]&&point('T16')[0]>point('T1')[0]);
assert.ok(point('T16')[1]<point('T1')[1]&&point('T7')[1]>point('T1')[1]);
assert.ok(point('T17')[0]<TRACK_POINTS[0][0],'the T16–17 diagonal returns southwest in the FIA plan');
const prepared=prepareMiamiCurve(THREE,TRACK_POINTS);
assert.ok(Math.abs(prepared.renderedLength-5412)<.02);
assert.ok(GEO_REFERENCE.registrationRmsMetres<7);
assert.ok(Math.abs(GEO_REFERENCE.determinant-1)<1e-9,'registration must preserve chirality');
for(const [id,anchor] of Object.entries(GEO_REFERENCE.anchors)) {
  const expected=[(anchor.longitude-GEO_REFERENCE.originLongitude)*GEO_REFERENCE.metresPerDegreeLongitude,
    (GEO_REFERENCE.originLatitude-anchor.latitude)*GEO_REFERENCE.metresPerDegreeLatitude];
  const actual=point(id);
  assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<15,id+' WGS84 anchor');
}
const signs=['R','L','R','L','R','L','L','L','R','L','L','R','L','L','R','L','L','L','R'];
for(const [i,corner] of Object.values(LANDMARKS.turns).entries()) {
  const a=prepared.curve.getTangentAt((corner.distanceMeters-8)/5412);
  const b=prepared.curve.getTangentAt((corner.distanceMeters+8)/5412);
  assert.equal(a.x*b.z-a.z*b.x>0?'R':'L',signs[i],'FIA turn '+(i+1)+' handedness');
}
const p0=prepared.curve.getPointAt(0),p150=prepared.curve.getPointAt(150/5412);
const startBearing=(Math.atan2(p150.x-p0.x,-(p150.z-p0.z))*180/Math.PI+360)%360;
assert.ok(startBearing>110&&startBearing<140,'the real start straight points southeast, not due east');
const backBearing=(Math.atan2(point('T17')[0]-point('T16')[0],-(point('T17')[1]-point('T16')[1]))*180/Math.PI+360)%360;
assert.ok(backBearing>260&&backBearing<285,'T16–17 points geographically west');
const heights=ELEVATION_PROFILE_METERS.map(p=>p[1]);
assert.ok(Math.max(...heights)-Math.min(...heights)<5,'no invented large GPS elevation range');
const crest=trackHeightAtStation(LANDMARKS.turns.T14.distanceMeters);
assert.ok(crest>trackHeightAtStation(3280)+3&&crest>trackHeightAtStation(3660)+3);
assert.ok(RELIEF_PRESENTATION_SCALE<=1.2);
assert.ok(trackHeightAtStation(3446)>trackHeightAtStation(LANDMARKS.turns.T14.distanceMeters)
  &&trackHeightAtStation(3446)>trackHeightAtStation(LANDMARKS.turns.T15.distanceMeters),
  'the chicane crest lies between T14 left and T15 right');
assert.equal(trackHeightAtStation(0),trackHeightAtStation(5412));
for(let s=0;s<5412;s+=3) {
  const grade=Math.abs(trackHeightAtStation(s+.1)-trackHeightAtStation(s-.1))/.2;
  assert.ok(grade<.1,'chicane ramp should remain drivable');
}
const source=await readFile(new URL('../dist/miami/world.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/mirrorTrackPointsX|scale\.x\s*=\s*-1/);
console.log('Miami track: 5 412 m, FIA chirality, 19 ordered turns, conservative chicane relief verified.');
