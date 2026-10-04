import assert from 'node:assert/strict';
import { createFreeRaceField } from '../dist/singapore/free-race-field.js';
import { SINGAPORE_2025_DISPLAYED } from '../dist/singapore/replay-roster.js';
import { TRACK_LENGTH_METERS, LANDMARKS } from '../dist/singapore/track-data.js';
import { SINGAPORE_FINISH_BEFORE_START_METERS, GRID_SLOT_SPACING } from '../dist/singapore/grid-details.js';

const entries = SINGAPORE_2025_DISPLAYED.map(driver => ({ ...driver,
  number: driver.replayNumber,
  pitStartDelaySec: driver.pitLaneStart ? 8 + (driver.gridPosition - 19) * .35 : 0 }));
const gridU = SINGAPORE_FINISH_BEFORE_START_METERS / TRACK_LENGTH_METERS;
const field = createFreeRaceField(entries, { gridU });
const initial = field.frame();
assert.equal(initial.cars.length, 19);
assert.equal(initial.byNumber[63].progressMeters, -14.1);
assert.equal(initial.byNumber[1].progressMeters, -14.1 - GRID_SLOT_SPACING);
assert.equal(initial.byNumber[1].speedKmh, 0);
assert.equal(initial.byNumber[10].offset, -14.5);
assert.equal(field.running, false);
assert.deepEqual(field.update(1), initial);

field.start();
const previous = new Map(initial.cars.map(car => [car.number, 0]));
const cleanLap = [];
let maximumSpeed = 0;
let firstControlCrossing = null;
for (let i = 0; i < 3400; i++) {
  const frame = field.update(.1);
  if (frame.timeSec <= 8) {
    const gridCars = frame.cars.filter(car => !car.pitLaneStart);
    for (const car of gridCars)
      assert.ok(Math.abs(Math.abs(car.offset) - 2.2) < .01,
        `Voie de grille fusionnée trop tôt pour #${car.number}`);
    for (let a = 0; a < gridCars.length; a++)
      for (let b = a + 1; b < gridCars.length; b++)
        if (Math.abs(gridCars[a].offset - gridCars[b].offset) < 2.3)
          assert.ok(Math.abs(gridCars[a].progressMeters
            - gridCars[b].progressMeters) > 6.4,
          `Voitures de même voie superposées au départ : #${gridCars[a].number}/#${gridCars[b].number}`);
  }
  for (const car of frame.cars) {
    assert.ok(car.distanceMeters >= previous.get(car.number));
    assert.ok(Number.isFinite(car.u) && car.u >= 0 && car.u < 1);
    assert.ok(car.speedKmh >= 0 && car.speedKmh < 370);
    if (!car.pitLaneStart || car.progressMeters > 285)
      assert.ok(Math.abs(car.offset) <= 3.55);
    previous.set(car.number, car.distanceMeters);
    maximumSpeed = Math.max(maximumSpeed, car.speedKmh);
  }
  if (frame.byNumber[63].lap === 0) cleanLap.push({
    station: frame.byNumber[63].progressMeters
      + SINGAPORE_FINISH_BEFORE_START_METERS,
    speed: frame.byNumber[63].speedKmh,
  });
  else if (firstControlCrossing === null)
    firstControlCrossing = frame.byNumber[63].progressMeters;
}
assert.ok(Math.abs(firstControlCrossing
  - (TRACK_LENGTH_METERS - SINGAPORE_FINISH_BEFORE_START_METERS)) < 10,
`Premier passage de la ligne FIA à ${firstControlCrossing?.toFixed(1)} m`);
const ending = field.frame();
const recentLapTimes = ending.cars.map(car => car.lastLapTime).filter(Number.isFinite);
assert.ok(recentLapTimes.length >= 18);
assert.ok(Math.min(...recentLapTimes) > 90 && Math.max(...recentLapTimes) < 105);
const ranks = ending.cars.slice().sort((a, b) => b.progressMeters - a.progressMeters);
const gridInversions = ranks.filter((car, index) => car.gridPosition !== index + 1).length;
assert.ok(gridInversions >= 5, 'Les voitures doivent pouvoir modifier leur ordre.');

const minima = {};
for (const id of ['T1', 'T5', 'T7']) {
  const apex = LANDMARKS.turns[id].distanceMeters;
  const candidates = cleanLap.filter(row => Math.abs(row.station - apex) <= 40);
  const slowest = candidates.reduce((best, row) => row.speed < best.speed ? row : best);
  minima[id] = slowest.station - apex;
  assert.ok(Math.abs(minima[id]) < 35,
    `${id} freinage déplacé de ${minima[id].toFixed(1)} m`);
  const at = station => cleanLap.reduce((best, row) =>
    Math.abs(row.station - station) < Math.abs(best.station - station) ? row : best);
  assert.ok(at(apex - 105).speed > at(apex - 10).speed + 18,
    `${id} doit déjà freiner avant l'apex.`);
}

field.pause();
const paused = field.frame();
assert.deepEqual(field.update(3), paused);
field.setWet(true);
field.start();
const beforeWet = field.frame().byNumber[63].speedKmh;
const afterWet = field.update(.5).byNumber[63].speedKmh;
assert.ok(Math.abs(afterWet - beforeWet) < 45,
  'Le changement de météo doit rester progressif.');
const beforeLongFrame = field.frame().timeSec;
field.update(1.3);
assert.ok(Math.abs(field.frame().timeSec - beforeLongFrame - 1.3) < 1e-6,
  'Une frame lourde doit conserver le temps de course.');
field.reset();
assert.deepEqual(field.frame(), initial);
console.log(`Simulation libre : ${gridInversions} changements de rang sur 19, `
  + `vitesse max ${maximumSpeed.toFixed(1)} km/h, tours récents `
  + `${Math.min(...recentLapTimes).toFixed(1)}–${Math.max(...recentLapTimes).toFixed(1)} s, `
  + `écart apex T1/T5/T7 ${Object.values(minima).map(value => value.toFixed(1)).join('/')} m.`);
