import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { ALBERT_PARK_2026_ROSTER } from '../dist/albert-park/replay-roster.js';
import { GRID_SLOT_SPACING } from '../dist/albert-park/grid-details.js';

const data = JSON.parse(await readFile(new URL('../dist/albert-park/data/albert-park-2026-replay.json',import.meta.url)));
assert.equal(data.source.sessionKey,11234);
assert.equal(data.session.trackLengthMeters,5278);
assert.equal(data.session.controlLineBeforeStartMeters,0);
assert.equal(data.session.gridSlotSpacingMeters,GRID_SLOT_SPACING);
assert.equal(data.session.entrantCount,22);
assert.equal(data.session.fieldCount,20);
assert.equal(data.session.renderedModelCount,19);
assert.equal(data.officialField.length,22);
assert.deepEqual([...data.session.nonStarters].sort((a,b)=>a-b),[27,81]);
assert.equal(data.session.gpsLateral.available,false);
assert.match(data.session.reconstruction.lateral,/indicative/);
let frames=0;
for (const entry of ALBERT_PARK_2026_ROSTER) {
  const driver=data.drivers[entry.replayNumber];
  if(entry.status==='dns') { assert.equal(driver,undefined);continue; }
  assert.ok(driver,entry.name);
  assert.equal(driver.modelKey,entry.modelKey);
  assert.equal(driver.gridPosition,entry.gridPosition);
  assert.equal(driver.officialCompletedLaps,entry.completedLaps);
  assert.equal(driver.finalPosition,entry.finalPosition);
  assert.ok(driver.samples.length>10000);
  let previousDistance=-Infinity,previousTime=-Infinity;
  for (const sample of driver.samples) {
    assert.equal(sample.length,9);
    assert.ok(sample.every(Number.isFinite));
    assert.ok(sample[0]>previousTime);
    assert.ok(sample[1]>=previousDistance-.001,`reverse progress: ${entry.name}`);
    assert.ok(sample[2]>=0&&sample[2]<=400);
    assert.ok(sample[3]>=0&&sample[3]<=100);
    assert.ok(sample[4]>=0&&sample[4]<=100);
    assert.ok(sample[6]>=1&&sample[6]<=22);
    assert.equal(sample[8],0,'Rejected GPS must never be labelled confident');
    previousDistance=sample[1];previousTime=sample[0];frames++;
  }
}
const replay=createHistoricalReplay(data);
assert.equal(replay.frame().cars.length,20);
assert.ok(replay.frame().byNumber[6]);
assert.equal(data.drivers[6].modelKey,null);
assert.equal(replay.frame().byNumber[81],undefined);
assert.equal(replay.frame().byNumber[27],undefined);
replay.seek(data.session.durationSec);
const end=replay.frame();
assert.equal(end.byNumber[63].officialPosition,1);
assert.equal(end.byNumber[12].officialPosition,2);
assert.equal(end.byNumber[16].officialPosition,3);
assert.equal(end.byNumber[6].retired,true);
console.log(`Albert Park replay OK: ${frames} finite monotone frames, 20 real starters, 2 DNS, official podium and retirements.`);
