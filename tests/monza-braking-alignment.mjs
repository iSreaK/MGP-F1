import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACK_POINTS, LANDMARKS } from '../dist/monza/track-data.js';

// Independent replay diagnostic: it reads the exported JSON and the circuit
// polyline, without importing the replay placement or reconstruction code.
const data = JSON.parse(readFileSync(new URL('../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const length = data.session.trackLengthMeters;
const FIA_CONTROL_TO_START_METERS = 309;
const totalLaps = Math.max(...Object.values(data.drivers).map(driver => driver.officialCompletedLaps));
const residual = (data.session.visualPhaseShiftMeters ?? FIA_CONTROL_TO_START_METERS)
  - FIA_CONTROL_TO_START_METERS;
const wrap = value => ((value % length) + length) % length;
const clamp01 = value => Math.max(0, Math.min(1, value));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
};

const line = TRACK_POINTS.slice(0, -1);
const travelled = [0];
for (let i = 1; i < line.length; i++) {
  travelled.push(travelled[i - 1] + Math.hypot(
    line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1],
  ));
}
const apexes = Object.fromEntries(['T1', 'T4', 'T7', 'T8', 'T11'].map(turn =>
  [turn, travelled[LANDMARKS.turns[turn].index]]));
const signedGap = (station, apex) => {
  const difference = wrap(station - apex);
  return difference > length / 2 ? difference - length : difference;
};
const visualStation = progress => wrap(progress + FIA_CONTROL_TO_START_METERS
  + residual * clamp01(progress / (totalLaps * length)));

function brakingMinima(samples) {
  const minima = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const sample = samples[i];
    const speed = sample[2];
    if (!(speed <= samples[i - 1][2] && speed <= samples[i + 1][2]
      && (speed < samples[i - 1][2] || speed < samples[i + 1][2]))) continue;
    const before = Math.max(...samples.slice(Math.max(0, i - 12), i).map(item => item[2]));
    const after = Math.max(...samples.slice(i + 1, Math.min(samples.length, i + 13)).map(item => item[2]));
    if (before - speed < 25 || after - speed < 15) continue;
    minima.push({ index: i, station: visualStation(sample[1]), speed });
  }
  return minima;
}

function brakeOnsetStation(samples, minimumIndex) {
  const time = samples[minimumIndex][0];
  const braking = [];
  for (let i = minimumIndex; i >= 0 && time - samples[i][0] <= 8; i--) {
    if (samples[i][4] >= 20) braking.push(i);
  }
  if (!braking.length) return null;
  // A chicane may have a brief pedal release between its two apexes. Treat
  // braking pulses separated by at most 2.5 s as one approach, so that a
  // second pulse is not mistaken for braking *after* the first turn.
  let first = braking[0];
  for (let i = 1; i < braking.length; i++) {
    if (samples[first][0] - samples[braking[i]][0] > 2.5) break;
    first = braking[i];
  }
  return visualStation(samples[first][1]);
}

const preferredDrivers = [12, 63, 3, 1, 81, 44];
const measurements = Object.fromEntries(Object.keys(apexes).map(turn => [turn, []]));
const lapsByDriver = new Map();
const trackLimitsLaps = new Set();
for (const event of data.events ?? []) {
  const match = /CAR (\d+) \([^)]+\) TIME .* DELETED - TRACK LIMITS AT TURN \d+ LAP (\d+)/.exec(event.message ?? '');
  if (match) trackLimitsLaps.add(`${match[1]}:${match[2]}`);
}
const excludedLaps = [];
for (const number of preferredDrivers) {
  const driver = data.drivers[number];
  assert.ok(driver, `Données manquantes pour la voiture ${number}`);
  let used = 0;
  for (const lap of driver.laps) {
    const start = lap.startSec;
    const end = start + lap.durationSec;
    if (lap.lap < 8 || lap.lap > 46 || start < 2650 || end > 6400
      || lap.durationSec < 80 || lap.durationSec > 96) continue;
    if (driver.pit?.some(pit => pit.tSec >= start - 30 && pit.tSec <= end + 30)) continue;
    if (data.session.pauses?.some(pause => pause.startSec < end && pause.endSec > start)) continue;
    if (trackLimitsLaps.has(`${number}:${lap.lap}`)) {
      excludedLaps.push(`#${number}/T${lap.lap}`);
      continue;
    }
    const samples = driver.samples.filter(sample => sample[0] >= start && sample[0] <= end);
    if (samples.length < 100) continue;
    const minima = brakingMinima(samples);
    let complete = true;
    for (const [turn, apex] of Object.entries(apexes)) {
      const candidates = minima.map(minimum => ({
        ...minimum, gap: signedGap(minimum.station, apex),
      })).filter(minimum => Math.abs(minimum.gap) <= 400)
        .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
      if (!candidates.length) {
        complete = false;
        break;
      }
    }
    if (!complete) continue;
    for (const [turn, apex] of Object.entries(apexes)) {
      const closest = minima.map(minimum => ({
        ...minimum, gap: signedGap(minimum.station, apex),
      })).filter(minimum => Math.abs(minimum.gap) <= 400)
        .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0];
      const onset = brakeOnsetStation(samples, closest.index);
      measurements[turn].push({ number, lap: lap.lap, ...closest,
        onsetGap: onset === null ? null : signedGap(onset, apex) });
    }
    used++;
  }
  lapsByDriver.set(number, used);
}

const all = Object.values(measurements).flat();
assert.ok(all.length >= 100 && [...lapsByDriver.values()].filter(count => count >= 3).length >= 4,
  'Échantillon insuffisant de tours rapides et de pilotes');
console.log(`Tours rapides contrôlés : ${[...lapsByDriver].map(([number, count]) => `#${number}=${count}`).join(', ')}`);
console.log(`Tours exclus pour limites de piste : ${excludedLaps.length}${excludedLaps.length ? ` (${excludedLaps.join(', ')})` : ''}`);
for (const [turn, values] of Object.entries(measurements)) {
  const errors = values.map(value => Math.abs(value.gap));
  const onsets = values.filter(value => value.onsetGap !== null).map(value => value.onsetGap);
  const late = values.filter(value => value.onsetGap > 30);
  const outliers = values.filter(value => Math.abs(value.gap) > 100);
  console.log(`${turn}: n=${values.length}, médiane signée=${median(values.map(value => value.gap)).toFixed(1)} m, `
    + `médiane absolue=${median(errors).toFixed(1)} m, p90=${percentile(errors, .9).toFixed(1)} m, `
    + `${outliers.length} minima >100 m, `
    + `début freinage=${onsets.length ? `${median(onsets).toFixed(1)} m `
      + `(${onsets.length} cas, ${(100 * onsets.filter(value => value < 0).length / onsets.length).toFixed(0)} % avant virage, `
      + `${late.length} >30 m après)`
      : 'indisponible'}`);
  if (late.length > values.length * .05) {
    console.log(`  Retards marqués : ${late.slice(0, 8).map(value =>
      `#${value.number}/T${value.lap} +${value.onsetGap.toFixed(0)} m`).join(', ')}`);
  }
  if (outliers.length) {
    console.log(`  Minima décalés : ${outliers.map(value =>
      `#${value.number}/T${value.lap} ${value.gap.toFixed(0)} m`).join(', ')}`);
  }
}
const errors = all.map(value => Math.abs(value.gap));
console.log(`Global : n=${all.length}, médiane absolue=${median(errors).toFixed(1)} m, `
  + `p90=${percentile(errors, .9).toFixed(1)} m`);

assert.ok(median(errors) < 70 && percentile(errors, .9) < 110,
  'Freinages et virages trop décalés sur le tracé 3D');
assert.equal(errors.filter(value => value > 100).length, 0,
  'Un tour normal conserve un minimum de vitesse décalé de plus de 100 m');
