import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHistoricalReplay, interpolateReplaySample } from '../dist/monza/historical-replay.js';
import { computeReplayPlacements } from '../dist/singapore/replay-lanes.js';
import { racingLineOffset } from '../dist/singapore/race-motion.js';

const singaporeData = JSON.parse(readFileSync(new URL(
  '../dist/singapore/data/singapore-2025-replay.json', import.meta.url), 'utf8'));
const monzaData = JSON.parse(readFileSync(new URL(
  '../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const monzaSample = interpolateReplaySample(monzaData.drivers['3'].samples, 300);
assert.equal(monzaSample.lateralMeters, null);
assert.equal(monzaSample.lateralConfidence, 0);

const historical = createHistoricalReplay(singaporeData);
const sample = historical.frame(1400).byNumber[1];
assert.ok(Number.isFinite(sample.lateralMeters));
assert.ok(sample.lateralConfidence >= 0 && sample.lateralConfidence <= 1);

const length = singaporeData.session.trackLengthMeters;
const trackGap = { lengthMeters: length,
  behind: (u, metres) => ((u - metres / length) % 1 + 1) % 1 };
const syntheticCars = [
  { number: 1, gridPosition: 2, progressMeters: 400, speedKph: 170,
    lateralMeters: -2, lateralConfidence: 1 },
  { number: 2, gridPosition: 3, progressMeters: 400, speedKph: 170,
    lateralMeters: 2, lateralConfidence: 1 },
];
const observed = computeReplayPlacements(syntheticCars, 0, trackGap);
for (const car of syntheticCars) {
  const pose = observed.get(car.number);
  assert.ok(Math.abs(pose.offset - (racingLineOffset(pose.u) + car.lateralMeters)) < .001);
}
assert.ok(observed.get(2).offset - observed.get(1).offset > 3.9);

const fallback = computeReplayPlacements(syntheticCars.map(car => ({ ...car,
  lateralConfidence: 0 })), 0, trackGap);
const legacy = computeReplayPlacements(syntheticCars.map(({ lateralMeters,
  lateralConfidence, ...car }) => car), 0, trackGap);
for (const car of syntheticCars)
  assert.deepEqual(fallback.get(car.number), legacy.get(car.number));

let confident = 0, usefulClosePairs = 0, closePairs = 0;
const drivers = Object.values(singaporeData.drivers);
for (let index = 0; index < drivers[0].samples.length; index += 4) {
  const rows = drivers.map(driver => driver.samples[index]);
  for (let a = 0; a < rows.length; a++) {
    if (rows[a][8] >= .5) confident++;
    for (let b = a + 1; b < rows.length; b++) {
      const gap = ((rows[a][1] - rows[b][1] + length / 2) % length
        + length) % length - length / 2;
      if (Math.abs(gap) >= 8 || rows[a][2] < 30 || rows[b][2] < 30) continue;
      closePairs++;
      if (rows[a][8] >= .7 && rows[b][8] >= .7
        && Math.abs(rows[a][7] * rows[a][8] - rows[b][7] * rows[b][8]) > 1)
        usefulClosePairs++;
    }
  }
}
assert.ok(confident > drivers.length * drivers[0].samples.length / 4 * .85);
assert.ok(usefulClosePairs > 25,
  'Le GPS doit distinguer latéralement de nombreuses voitures côte à côte.');
console.log(`Singapour GPS : ${confident} frames confiantes échantillonnées ; `
  + `${usefulClosePairs}/${closePairs} paires proches latéralement distinctes ; `
  + 'repli Monza compatible.');
