import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHistoricalReplay, replayLapDistance } from '../dist/monza/historical-replay.js';
import { computeReplayPlacements, rateLimitReplayOffset, replayPitOffset, replayVisualDistance } from '../dist/monza/replay-lanes.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING, PIT_START_LANE_CENTER, MONZA_FINISH_BEFORE_START_METERS } from '../dist/monza/grid-details.js';
import { carCatalog } from '../dist/car-catalog.js';

const data = JSON.parse(readFileSync(new URL('../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const replay = createHistoricalReplay(data);
assert.equal(replay.speed, 1, 'Le replay démarre à vitesse réelle');
const start = replay.frame();
const grid = [...carCatalog].sort((a, b) => a.gridPosition - b.gridPosition);
// Official 2026 Italian Grand Prix starting order, including the two pit starters.
const officialGridNumbers = [10, 63, 16, 44, 3, 81, 43, 1, 41, 5, 87,
  27, 55, 31, 22, 77, 11, 18, 12, 23, 14, 30];
assert.equal(new Set(grid.map(car => car.key)).size, grid.length);
assert.equal(new Set(grid.map(car => car.number)).size, grid.length);
assert.ok(grid.every(car => car.gridPosition >= 1 && car.gridPosition <= 22));
for (const car of grid) {
  assert.equal(officialGridNumbers[car.gridPosition - 1], car.number, `${car.driverName} grid`);
  assert.equal(!!car.pitLaneStart, car.number === 14 || car.number === 30,
    `${car.driverName} départ des stands`);
  assert.ok(existsSync(new URL(`../dist/${car.url.slice(2).split('?')[0]}`, import.meta.url)),
    `Modèle manquant pour ${car.driverName}`);
}
assert.deepEqual(start.cars.map(car => car.number), grid.map(car => car.number));
assert.deepEqual(start.cars.map(car => car.gridPosition), grid.map(car => car.gridPosition));
assert.equal(new Set(grid.map(car => car.gridPosition)).size, grid.length);
for (const car of start.cars) {
  const expectedDistance = car.pitLaneStart ? carCatalog.find(entry => entry.number === car.number).pitStartOffsetMeters
    : -14.1 - (car.gridPosition - 1) * GRID_SLOT_SPACING;
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
  assert.equal(initialPlacement.get(car.number).offset, car.pitLaneStart ? PIT_START_LANE_CENTER
    : car.gridPosition % 2 ? -GRID_LANE_CENTER : GRID_LANE_CENTER);
}
assert.equal(computeReplayPlacements([{ number: 14, gridPosition: 21,
  progressMeters: -195.1, pitLaneStart: true }], 0, trackGap).get(14).offset,
PIT_START_LANE_CENTER);
const renderedLapLength = 5794.964847710454;
const scaledGap = {
  lengthMeters: renderedLapLength,
  behind: (u, metres) => ((u - metres / renderedLapLength) % 1 + 1) % 1,
};
assert.ok(computeReplayPlacements([{ number: 3, gridPosition: 5, progressMeters: data.session.trackLengthMeters }],
  0, scaledGap, data.session.trackLengthMeters).get(3).u < 1e-10);

const [redFlag] = data.session.pauses;
const redFlagStart = replay.frame(redFlag.startSec + 10);
const parkedA = replay.frame(redFlag.startSec + 180);
const parkedB = replay.frame(redFlag.endSec - 60);
for (const car of parkedA.cars) {
  const atStart = redFlagStart.byNumber[car.number];
  const later = parkedB.byNumber[car.number];
  if (!atStart.retired) {
    assert.ok(car.progressMeters > atStart.progressMeters + 100,
      `Retour aux stands sous drapeau rouge ${car.number}`);
  }
  assert.ok(Math.abs(car.progressMeters - later.progressMeters) < 25,
    `Arrêt aux stands sous drapeau rouge ${car.number}`);
  assert.ok(car.speedKph <= 2, `Vitesse au stand ${car.number}`);
  assert.ok(later.speedKph <= 2, `Vitesse au stand ${car.number}`);
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
assert.deepEqual(finish.cars.map(car => car.number).sort((a, b) => a - b),
  grid.map(car => car.number).sort((a, b) => a - b));
// F1's official classification; NC entries have no finishing rank.
const classified = new Map([
  [12, [1, 53]], [63, [2, 53]], [3, [3, 53]], [1, [4, 53]],
  [81, [5, 53]], [44, [6, 53]], [10, [7, 53]], [41, [8, 53]],
  [43, [9, 53]], [22, [10, 53]], [5, [11, 53]], [27, [12, 53]],
  [55, [13, 53]], [30, [14, 53]], [87, [15, 53]], [31, [16, 52]],
  [23, [17, 52]], [11, [18, 52]], [77, [19, 51]],
]);
const retiredLaps = new Map([[16, 1], [14, 23], [18, 26]]);
for (const car of grid) {
  const result = classified.get(car.number);
  if (result) {
    assert.equal(finish.byNumber[car.number].officialPosition, result[0], `${car.driverName} result`);
    assert.equal(data.drivers[car.number].officialCompletedLaps, result[1], `${car.driverName} laps`);
    assert.equal(finish.byNumber[car.number].finished, true);
  } else {
    assert.equal(finish.byNumber[car.number].retired, true);
    assert.equal(data.drivers[car.number].officialCompletedLaps, retiredLaps.get(car.number));
  }
}
assert.equal(finish.byNumber[16].retired, true);
assert.equal(finish.byNumber[16].finished, false);
assert.equal(finish.byNumber[16].lap, 2);
assert.equal(data.drivers[16].officialCompletedLaps, 1);
assert.equal(data.drivers[16].restartGridStops.length, 0);
const justBeforeLeclercCrash = replay.frame(data.drivers[16].finishSec - 1).byNumber[16];
assert.equal(justBeforeLeclercCrash.retired, false);
assert.ok(justBeforeLeclercCrash.speedKph > 0);
assert.equal(replay.frame(data.drivers[16].finishSec + 1).byNumber[16].speedKph, 0);
assert.ok(replay.frame(data.drivers[16].finishSec + 1).byNumber[16].lapTimeSec > 0);
assert.equal(replayLapDistance(finish.cars[0].progressMeters, data.session, finish.cars[0].finished),
  data.session.trackLengthMeters);
assert.ok(finish.cars.filter(car => car.finished).every(car =>
  Math.abs(car.progressMeters - (data.drivers[car.number].officialCompletedLaps *
    data.session.trackLengthMeters - data.session.visualPhaseShiftMeters)) < .11));
const finishVisual = replayVisualDistance(finish.cars[0].progressMeters, data.session, 53);
assert.ok(Math.abs(finishVisual - (53 * data.session.trackLengthMeters - MONZA_FINISH_BEFORE_START_METERS)) < .2);
for (const driver of Object.values(data.drivers).filter(driver => driver.status !== 'retired')) {
  assert.equal(driver.restartGridStops.length, 2);
  for (const stop of driver.restartGridStops) {
    const progress = driver.samples[Math.round(stop.tSec * data.session.sampleHz)][1];
    const slot = -14.1 - (stop.officialPosition - 1) * GRID_SLOT_SPACING;
    let difference = ((progress - slot + data.session.trackLengthMeters / 2) % data.session.trackLengthMeters
      + data.session.trackLengthMeters) % data.session.trackLengthMeters - data.session.trackLengthMeters / 2;
    assert.ok(Math.abs(difference) < 15, `Restart grid ${driver.number}: ${difference.toFixed(1)} m`);
  }
}
assert.equal(rateLimitReplayOffset(2.65, -2.7, .5), 2);
const pitSample = data.drivers[12].samples[Math.round(4545 * 2)];
const pitProgress = replayVisualDistance(pitSample[1], data.session, 53);
assert.ok(replayPitOffset({ number: 12, progressMeters: pitProgress }, 4545,
  data.session, data.drivers[12].pit, 0) > 12);

const serviceFrame = replay.frame(4487);
const ocon = serviceFrame.byNumber[31];
const sainz = serviceFrame.byNumber[55];
const pitVisual = car => ({ ...car,
  progressMeters: replayVisualDistance(car.progressMeters, data.session, 53) });
const oconBox = replayPitOffset(pitVisual(ocon), 4487,
  data.session, data.drivers[31].pit, 0);
const sainzTransit = replayPitOffset(pitVisual(sainz), 4487,
  data.session, data.drivers[55].pit, 0);
assert.equal(ocon.speedKph, 0);
assert.ok(sainz.speedKph > 70);
assert.ok(oconBox >= 17.5 && oconBox <= 18, 'Stopped car sits in the paved working box');
assert.ok(Math.abs(sainzTransit - 12.5) < .01, 'Moving car stays in the pit fast lane');
assert.ok(oconBox - sainzTransit > 2.3, 'Service and transit car bodies remain separate');
const easingBox = replayPitOffset({ ...pitVisual(ocon), speedKph: 20 }, 4487,
  data.session, data.drivers[31].pit, 0);
assert.ok(easingBox > sainzTransit && easingBox < oconBox, 'Box entry eases with speed');
const redFlagCar = pitVisual(parkedA.byNumber[31]);
assert.equal(replayPitOffset({ ...redFlagCar, speedKph: 0 }, parkedA.timeSec,
  data.session, data.drivers[31].pit, 0),
replayPitOffset({ ...redFlagCar, speedKph: 80 }, parkedA.timeSec,
  data.session, data.drivers[31].pit, 0), 'Red-flag queue keeps its original path');

console.log('Replay historique : grille, interruption, contrôle du temps et arrivée vérifiés.');
