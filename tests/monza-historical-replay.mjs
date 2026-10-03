import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHistoricalReplay, replayLapDistance } from '../dist/monza/historical-replay.js';
import { computeReplayPlacements, rateLimitReplayOffset, replayPitOffset, replayVisualDistance } from '../dist/monza/replay-lanes.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING, MONZA_FINISH_BEFORE_START_METERS } from '../dist/monza/grid-details.js';

const data = JSON.parse(readFileSync(new URL('../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const replay = createHistoricalReplay(data);
const start = replay.frame();
assert.deepEqual(start.cars.map(car => car.number), [10, 44, 3, 1, 5, 12]);
assert.deepEqual(start.cars.map(car => car.gridPosition), [1, 4, 5, 8, 10, 19]);
for (const car of start.cars) {
  const expectedDistance = -14.1 - (car.gridPosition - 1) * GRID_SLOT_SPACING;
  assert.ok(Math.abs(car.progressMeters - expectedDistance) <= .06, `Grid slot ${car.number}`);
  assert.equal(car.speedKph, 0);
}
assert.ok(Math.abs(replayLapDistance(start.cars[0].progressMeters, data.session) -
  (start.cars[0].progressMeters + data.session.visualPhaseShiftMeters)) < .01);

const trackGap = {
  lengthMeters: data.session.trackLengthMeters,
  behind: (u, metres) => ((u - metres / data.session.trackLengthMeters) % 1 + 1) % 1,
};
const initialPlacement = computeReplayPlacements(start.cars, 0, trackGap);
for (const car of start.cars) {
  assert.equal(initialPlacement.get(car.number).offset, car.gridPosition % 2 ? -GRID_LANE_CENTER : GRID_LANE_CENTER);
}
const renderedLapLength = 5794.964847710454;
const scaledGap = {
  lengthMeters: renderedLapLength,
  behind: (u, metres) => ((u - metres / renderedLapLength) % 1 + 1) % 1,
};
assert.ok(computeReplayPlacements([{ number: 3, gridPosition: 5, progressMeters: data.session.trackLengthMeters }],
  0, scaledGap, data.session.trackLengthMeters).get(3).u < 1e-10);

const [redFlag] = data.session.pauses;
const stoppedA = replay.frame(redFlag.startSec + 30);
const stoppedB = replay.frame(redFlag.endSec - 30);
for (const car of stoppedA.cars) {
  assert.equal(car.progressMeters, stoppedB.byNumber[car.number].progressMeters, `Drapeau rouge ${car.number}`);
  assert.equal(car.speedKph, 0);
}
replay.setSpeed(60);
replay.play();
replay.tick(5);
assert.equal(replay.timeSec, 300);
replay.pause();
replay.seek(0);
assert.equal(replay.timeSec, 0);
assert.equal(replay.playing, false);

const finish = replay.frame(replay.durationSec);
assert.deepEqual(finish.cars.map(car => car.number), [12, 3, 1, 44, 10, 5]);
assert.deepEqual(finish.cars.map(car => car.officialPosition), [1, 3, 4, 6, 7, 11]);
assert.ok(finish.cars.every(car => car.finished && car.lap === 53));
assert.equal(replayLapDistance(finish.cars[0].progressMeters, data.session, finish.cars[0].finished),
  data.session.trackLengthMeters);
assert.ok(finish.cars.every(car => Math.abs(car.progressMeters - (53 * data.session.trackLengthMeters - data.session.visualPhaseShiftMeters)) < .11));
const finishVisual = replayVisualDistance(finish.cars[0].progressMeters, data.session, 53);
assert.ok(Math.abs(finishVisual - (53 * data.session.trackLengthMeters - MONZA_FINISH_BEFORE_START_METERS)) < .2);
for (const driver of Object.values(data.drivers)) {
  assert.equal(driver.restartGridStops.length, 2);
  for (const stop of driver.restartGridStops) {
    const progress = driver.samples[Math.round(stop.tSec * data.session.sampleHz)][1];
    const slot = -14.1 - (stop.officialPosition - 1) * GRID_SLOT_SPACING;
    let difference = ((progress - slot + data.session.trackLengthMeters / 2) % data.session.trackLengthMeters
      + data.session.trackLengthMeters) % data.session.trackLengthMeters - data.session.trackLengthMeters / 2;
    assert.ok(Math.abs(difference) < 10, `Restart grid ${driver.number}: ${difference.toFixed(1)} m`);
  }
}
assert.equal(rateLimitReplayOffset(2.65, -2.7, .5), 2);
const pitSample = data.drivers[12].samples[Math.round(4545 * 2)];
const pitProgress = replayVisualDistance(pitSample[1], data.session, 53);
assert.ok(replayPitOffset({ number: 12, progressMeters: pitProgress }, 4545,
  data.session, data.drivers[12].pit, 0) > 12);

console.log('Replay historique : grille, interruption, contrôle du temps et arrivée vérifiés.');
