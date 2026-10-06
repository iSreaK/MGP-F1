import assert from 'node:assert/strict';
import { createFreeRaceField } from '../dist/mexico/free-race-field.js';
import { MEXICO_2025_DISPLAYED } from '../dist/mexico/replay-roster.js';
import { TRACK_LENGTH_METERS, LANDMARKS } from '../dist/mexico/track-data.js';
import { MEXICO_FINISH_BEFORE_START_METERS, GRID_SLOT_SPACING,
  GRID_LANE_CENTER } from '../dist/mexico/grid-details.js';

const entries = MEXICO_2025_DISPLAYED.map(driver => ({ ...driver,
  number: driver.replayNumber }));
const gridU = MEXICO_FINISH_BEFORE_START_METERS / TRACK_LENGTH_METERS;
const field = createFreeRaceField(entries, {
  gridU, gridSlotSpacingMeters: GRID_SLOT_SPACING,
});
const start = field.frame();
assert.equal(start.cars.length, 19);
assert.equal(start.byNumber[4].progressMeters, -14.1);
assert.ok(Math.abs(start.byNumber[16].progressMeters + 14.1 + GRID_SLOT_SPACING) < .001);
assert.equal(start.byNumber[4].offset, GRID_LANE_CENTER);
assert.equal(start.byNumber[16].offset, -GRID_LANE_CENTER);
assert.equal(start.byNumber[4].speedKmh, 0);

field.start();
let maximumSpeed = 0;
let fastestLap = Infinity;
let slowestLap = 0;
const firstLap = [];
for (let i = 0; i < 2800; i++) {
  const frame = field.update(.1);
  const pole = frame.byNumber[4];
  if (pole.lap === 0) firstLap.push({
    station: MEXICO_FINISH_BEFORE_START_METERS + pole.progressMeters,
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
assert.ok(fastestLap > 75 && slowestLap < 105,
  `implausible lap times ${fastestLap.toFixed(1)}–${slowestLap.toFixed(1)} s`);
// The first two heavy braking zones are multi-corner sequences: their slowest
// point is T2/T5, not the entry apex T1/T4.
for (const id of ['T2', 'T5', 'T13']) {
  const apex = LANDMARKS.turns[id].distanceMeters;
  const window = firstLap.filter(row => Math.abs(row.station - apex) < 65);
  assert.ok(window.length >= 8, `missing ${id} speed window`);
  const minimum = window.reduce((best, row) => row.speedKph < best.speedKph ? row : best);
  assert.ok(Math.abs(minimum.station - apex) < 48,
    `${id} braking minimum displaced ${(minimum.station - apex).toFixed(1)} m`);
}
const beforePause = field.frame();
field.pause();
assert.deepEqual(field.update(1), beforePause);
field.reset();
assert.deepEqual(field.frame(), start);
console.log(`Mexico free race OK: 19 cars, top ${maximumSpeed.toFixed(1)} km/h, `
  + `lap ${fastestLap.toFixed(1)}–${slowestLap.toFixed(1)} s, T2/T5/T13 braking aligned.`);
