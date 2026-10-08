import assert from 'node:assert/strict';
import { createFreeRaceField } from '../dist/yas-marina/free-race-field.js';
import { YAS_MARINA_2025_DISPLAYED } from '../dist/yas-marina/replay-roster.js';
import { TRACK_LENGTH_METERS, LANDMARKS } from '../dist/yas-marina/track-data.js';
import { YAS_MARINA_FINISH_BEFORE_START_METERS, GRID_SLOT_SPACING,
  GRID_LANE_CENTER } from '../dist/yas-marina/grid-details.js';

const entries = YAS_MARINA_2025_DISPLAYED.map(driver => ({ ...driver,
  number: driver.replayNumber }));
const gridU = YAS_MARINA_FINISH_BEFORE_START_METERS / TRACK_LENGTH_METERS;
const field = createFreeRaceField(entries, {
  gridU, gridSlotSpacingMeters: GRID_SLOT_SPACING,
});
const start = field.frame();
assert.equal(start.cars.length, 19);
assert.equal(start.byNumber[1].progressMeters, -14.1);
assert.ok(Math.abs(start.byNumber[4].progressMeters + 14.1 + GRID_SLOT_SPACING) < .001);
assert.equal(start.byNumber[1].offset, GRID_LANE_CENTER);
assert.equal(start.byNumber[4].offset, -GRID_LANE_CENTER);
assert.equal(start.byNumber[1].speedKmh, 0);

field.start();
let maximumSpeed = 0;
let fastestLap = Infinity;
let slowestLap = 0;
const firstLap = [];
for (let i = 0; i < 2800; i++) {
  const frame = field.update(.1);
  const pole = frame.byNumber[1];
  if (pole.lap === 0) firstLap.push({
    station: YAS_MARINA_FINISH_BEFORE_START_METERS + pole.progressMeters,
    speedKph: pole.speedKmh,
  });
  if (pole.lastLapTime) {
    fastestLap = Math.min(fastestLap, pole.lastLapTime);
    slowestLap = Math.max(slowestLap, pole.lastLapTime);
  }
  for (const car of frame.cars) {
    assert.ok(Number.isFinite(car.u) && car.u >= 0 && car.u < 1);
    assert.ok(Number.isFinite(car.speedKmh) && car.speedKmh >= 0 && car.speedKmh < 370);
    assert.ok(Math.abs(car.offset) < 4);
    maximumSpeed = Math.max(maximumSpeed, car.speedKmh);
  }
}
assert.ok(maximumSpeed > 285 && maximumSpeed < 355,
  `implausible top speed ${maximumSpeed.toFixed(1)} km/h`);
assert.ok(fastestLap > 85 && slowestLap < 120,
  `implausible lap times ${fastestLap.toFixed(1)}–${slowestLap.toFixed(1)} s`);
for (const id of ['T1', 'T11', 'T12']) {
  const apex = LANDMARKS.turns[id].distanceMeters;
  const window = firstLap.filter(row => Math.abs(row.station - apex) < 65);
  assert.ok(window.length >= 8, `missing ${id} speed window`);
  const minimum = window.reduce((best, row) => row.speedKph < best.speedKph ? row : best);
  assert.ok(Math.abs(minimum.station - apex) < 75,
    `${id} braking minimum displaced ${(minimum.station - apex).toFixed(1)} m`);
}
const beforePause = field.frame();
field.pause();
assert.deepEqual(field.update(1), beforePause);
field.reset();
assert.deepEqual(field.frame(), start);
console.log(`Yas Marina free race OK: 19 cars, top ${maximumSpeed.toFixed(1)} km/h, `
  + `lap ${fastestLap.toFixed(1)}–${slowestLap.toFixed(1)} s, T1/T11/T12 braking aligned.`);
