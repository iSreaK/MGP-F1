import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { MIAMI_2026_ROSTER,MIAMI_2026_DISPLAYED } from '../dist/miami/replay-roster.js';
import { carByKey } from '../dist/car-catalog.js';
const data=JSON.parse(await readFile(new URL('../dist/miami/data/miami-2026-replay.json',import.meta.url),'utf8'));
assert.equal(data.source.sessionKey,11280);
assert.equal(data.session.fieldCount,22);
assert.equal(data.session.renderedModelCount,21);
assert.equal(data.session.trackLengthMeters,5412);
assert.equal(data.session.controlLineBeforeStartMeters,158);
assert.equal(MIAMI_2026_ROSTER.length,22);
assert.equal(MIAMI_2026_DISPLAYED.length,21);
assert.equal(data.drivers[6].modelKey,null);
assert.equal(data.drivers[6].pitLaneStart,true);
assert.equal(data.drivers[12].finalPosition,1);
assert.equal(data.drivers[1].finalPosition,2);
assert.equal(data.drivers[12].officialCompletedLaps,57);
assert.ok(!data.drivers[22],'Tsunoda must not replace a real 2026 Miami entrant');
for(const driver of MIAMI_2026_ROSTER) {
  const d=data.drivers[driver.replayNumber];assert.ok(d);
  assert.equal(d.officialCompletedLaps,driver.completedLaps);
  assert.equal(d.modelKey,driver.modelKey);
  if(d.modelKey) assert.ok(carByKey[d.modelKey].driverName.endsWith(driver.name.split(' ').at(-1)));
  for(let i=1;i<d.samples.length;i++) {
    assert.ok(d.samples[i][1]>=d.samples[i-1][1]-.01,'no backward teleport');
    assert.ok(d.samples[i][2]>=0&&d.samples[i][2]<=380);
    assert.ok(d.samples[i].every(Number.isFinite));
  }
}
const replay=createHistoricalReplay(data);
assert.equal(replay.drivers.length,22);
assert.ok(replay.durationSec>5500&&replay.durationSec<5900);
const frame=replay.seek(2000);assert.equal(frame.cars.length,22);
assert.ok(frame.byNumber[12]);
console.log('Miami replay: actual 3 May 2026 race, 22 entrants, 21 matching assets, pit starter and monotone telemetry verified.');
