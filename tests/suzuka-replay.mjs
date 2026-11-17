import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHistoricalReplay} from '../dist/monza/historical-replay.js';
import {SUZUKA_2026_ROSTER} from '../dist/suzuka/replay-roster.js';
const data=JSON.parse(await readFile(new URL('../dist/suzuka/data/suzuka-2026-replay.json',import.meta.url)));
assert.equal(data.source.sessionKey,11253);assert.equal(data.session.fieldCount,22);assert.equal(data.session.renderedModelCount,21);assert.equal(data.session.trackLengthMeters,5807);assert.equal(data.session.controlLineBeforeStartMeters,300);assert.ok(data.session.durationSec>5280&&data.session.durationSec<5600);
assert.equal(Object.keys(data.drivers).length,22);assert.equal(data.officialField.length,22);assert.equal(data.sampleFields.length,9);
let sampleCount=0;
for(const driver of SUZUKA_2026_ROSTER){const d=data.drivers[driver.replayNumber];assert.ok(d,driver.name);assert.equal(d.modelKey,driver.modelKey);assert.equal(d.gridPosition,driver.gridPosition);assert.equal(d.officialCompletedLaps,driver.completedLaps);assert.equal(d.finalPosition,driver.finalPosition);assert.ok(d.samples.length>10000);let previous=-Infinity;for(const sample of d.samples){assert.equal(sample.length,9);assert.ok(sample.every(Number.isFinite));assert.ok(sample[1]>=previous-.001,`progress reverses for ${driver.name}`);assert.ok(sample[2]>=0&&sample[2]<=400);assert.ok(sample[3]>=0&&sample[3]<=100);assert.ok(sample[4]>=0&&sample[4]<=100);assert.ok(sample[6]>=1&&sample[6]<=22);previous=sample[1];sampleCount++;}}
const replay=createHistoricalReplay(data);const frame=replay.frame();assert.equal(frame.cars.length,22);assert.ok(frame.byNumber[6]);replay.seek(data.session.durationSec);const end=replay.frame();assert.equal(end.byNumber[12].officialPosition,1);assert.equal(end.byNumber[18].retired,true);assert.equal(end.byNumber[87].retired,true);
console.log(`Suzuka authentic2026 replay OK:22drivers, ${sampleCount} finite monotone telemetry frames, true final classification and retirements`);
