import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS } from '../dist/interlagos/track-data.js';
import { prepareInterlagosCurve } from '../dist/interlagos/geometry-smoothing.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { computeReplayPlacements, replayPitOffset, replayVisualDistance } from '../dist/interlagos/replay-lanes.js';
import { resolveEntitySpacing } from '../dist/interlagos/entity-spacing.js';
import { INTERLAGOS_2025_DISPLAYED } from '../dist/interlagos/replay-roster.js';

const data=JSON.parse(await readFile(new URL('../dist/interlagos/data/interlagos-2025-replay.json',import.meta.url)));
const player=createHistoricalReplay(data);
const {curve}=prepareInterlagosCurve(THREE,TRACK_POINTS,TRACK_LENGTH_METERS);
const gap=createTrackGapLookup(curve);
const gridU=gap.behind(0,-60);
const visibleNumbers=new Set(INTERLAGOS_2025_DISPLAYED.map(driver=>driver.replayNumber));
function footprint(u,offset) {
  const point=curve.getPointAt(u);
  const forward=curve.getTangentAt(u).setY(0).normalize();
  const across=new THREE.Vector3(forward.z,0,-forward.x);
  const center=point.addScaledVector(across,offset);
  return [
    center.clone().addScaledVector(forward,3.2).addScaledVector(across,1.15),
    center.clone().addScaledVector(forward,3.2).addScaledVector(across,-1.15),
    center.clone().addScaledVector(forward,-3.2).addScaledVector(across,-1.15),
    center.clone().addScaledVector(forward,-3.2).addScaledVector(across,1.15),
  ];
}
function intersects(a,b) {
  for(const polygon of [a,b])for(let i=0;i<4;i++) {
    const edge=polygon[(i+1)%4].clone().sub(polygon[i]);
    const axis={x:-edge.z,z:edge.x};
    const pa=a.map(p=>p.x*axis.x+p.z*axis.z);
    const pb=b.map(p=>p.x*axis.x+p.z*axis.z);
    if(Math.max(...pa)<=Math.min(...pb)+.01
      || Math.max(...pb)<=Math.min(...pa)+.01)return false;
  }
  return true;
}
const times=[0,4,25,85,300,1500,2800,4300,5590,data.session.durationSec];
for(const timeSec of times) {
  const frame=player.frame(timeSec);
  const visual=frame.cars.map(car=>({ ...car,
    progressMeters:replayVisualDistance(car.progressMeters,data.session,71) }));
  const placements=computeReplayPlacements(visual,gridU,gap,TRACK_LENGTH_METERS);
  for(const car of visual) {
    const placement=placements.get(car.number);
    placement.offset=replayPitOffset(car,timeSec,data.session,
      data.drivers[car.number]?.pit,placement.offset);
  }
  const active=visual.filter(car=>visibleNumbers.has(car.number)
    && !(car.ended && timeSec>data.drivers[car.number].finishSec+1));
  if(timeSec===0)assert.equal(active.length,19,'19 modèles sur la grille/voie des stands');
  const separated=resolveEntitySpacing(active.map(car=>({
    number:car.number,gridPosition:car.gridPosition,
    priority:car.progressMeters,...placements.get(car.number),
  })),gap,new Map(),{curve});
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++) {
    const a=separated.get(active[i].number),b=separated.get(active[j].number);
    assert.ok(!intersects(footprint(a.u,a.offset),footprint(b.u,b.offset)),
      `Les monoplaces #${active[i].number}/#${active[j].number} se chevauchent à ${timeSec}s`);
  }
}
console.log('Interlagos 2025 : 19 blocs espacés à la grille et sur 9 moments de course.');
