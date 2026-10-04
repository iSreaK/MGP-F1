import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANDMARKS, TRACK_LENGTH_METERS, TRACK_POINTS } from '../dist/singapore/track-data.js';

// Independent replay diagnostic: use the exported 2 Hz telemetry and FIA-map
// centreline, without importing replay placement or speed reconstruction.
// The turn markers come from labels on the FIA diagram, not surveyed apexes.
const replay = JSON.parse(readFileSync(new URL(
  '../dist/singapore/data/singapore-2025-replay.json', import.meta.url), 'utf8'));
const FIA_CONTROL_TO_START_METERS = 137;
const turns = ['T1', 'T5', 'T7', 'T13', 'T14'];
const driverNumbers = [1, 4, 81, 63, 16, 44];
const lapNumbers = [10, 15, 32, 40];
const wrap = metres => ((metres % TRACK_LENGTH_METERS) + TRACK_LENGTH_METERS) % TRACK_LENGTH_METERS;
const clamp01 = value => Math.max(0, Math.min(1, value));
const sorted = values => [...values].sort((a, b) => a - b);
const median = values => sorted(values)[Math.floor(values.length / 2)];
const percentile = (values, fraction) => sorted(values)[Math.ceil(fraction * values.length) - 1];

assert.equal(replay.session.trackLengthMeters, TRACK_LENGTH_METERS);
assert.equal(replay.session.controlLineBeforeStartMeters, FIA_CONTROL_TO_START_METERS);
assert.equal(replay.source.sessionKey, 9896);
const line = TRACK_POINTS.slice(0, -1);
const travelled = [0];
for (let i = 1; i < line.length; i++) {
  travelled.push(travelled.at(-1) + Math.hypot(
    line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
}
const gridStation = travelled[LANDMARKS.gridIndex];
assert.ok(Math.abs(gridStation - FIA_CONTROL_TO_START_METERS) < 2.5,
  `FIA start/control separation moved to ${gridStation.toFixed(1)} m`);
const apexes = Object.fromEntries(turns.map(turn =>
  [turn, travelled[LANDMARKS.turns[turn].index]]));
const totalLaps = Math.max(...Object.values(replay.drivers)
  .map(driver => driver.officialCompletedLaps));
const phaseResidual = (replay.session.visualPhaseShiftMeters ?? FIA_CONTROL_TO_START_METERS)
  - FIA_CONTROL_TO_START_METERS;
const visualStation = progress => wrap(gridStation + progress
  + phaseResidual * clamp01(progress / (totalLaps * TRACK_LENGTH_METERS)));
const signedGap = (station, apex) => {
  const difference = wrap(station - apex);
  return difference > TRACK_LENGTH_METERS / 2 ? difference - TRACK_LENGTH_METERS : difference;
};

function brakingMinima(samples) {
  const minima = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const speed = samples[i][2];
    if (!(speed <= samples[i - 1][2] && speed <= samples[i + 1][2]
      && (speed < samples[i - 1][2] || speed < samples[i + 1][2]))) continue;
    const before = Math.max(...samples.slice(Math.max(0, i - 12), i).map(row => row[2]));
    const after = Math.max(...samples.slice(i + 1, Math.min(samples.length, i + 13))
      .map(row => row[2]));
    // T1 flows directly into T2/T3, so the car may gain only ~12 km/h
    // between the two distinct braking troughs within this six-second window.
    if (before - speed < 25 || after - speed < 10) continue;
    minima.push({ index: i, speed, station: visualStation(samples[i][1]) });
  }
  return minima;
}

function brakeOnsetGap(samples, minimumIndex, apex) {
  const time = samples[minimumIndex][0];
  const braking = [];
  for (let i = minimumIndex; i >= 0 && time - samples[i][0] <= 8; i--) {
    if (samples[i][4] >= 20) braking.push(i);
  }
  if (!braking.length) return null;
  // A short pedal release before an apex should not look like a new brake
  // application after the turn. Join pulses separated by no more than 2.5 s.
  let first = braking[0];
  for (let i = 1; i < braking.length; i++) {
    if (samples[first][0] - samples[braking[i]][0] > 2.5) break;
    first = braking[i];
  }
  return signedGap(visualStation(samples[first][1]), apex);
}

const trackLimitsLaps = new Set();
for (const event of replay.events ?? []) {
  const match = /CAR (\d+) \([^)]+\) TIME .* DELETED - TRACK LIMITS AT TURN \d+ LAP (\d+)/
    .exec(event.message ?? '');
  if (match) trackLimitsLaps.add(`${match[1]}:${match[2]}`);
}
const measurements = Object.fromEntries(turns.map(turn => [turn, []]));
for (const number of driverNumbers) {
  const driver = replay.drivers[number];
  assert.ok(driver, `Missing car #${number}`);
  for (const lapNumber of lapNumbers) {
    const lap = driver.laps.find(row => row.lap === lapNumber);
    assert.ok(lap, `Missing lap ${lapNumber} for #${number}`);
    const start = lap.startSec;
    const end = start + lap.durationSec;
    assert.ok(lap.durationSec >= 94 && lap.durationSec <= 103,
      `Atypical lap #${number}/${lapNumber}: ${lap.durationSec} s`);
    assert.ok(!driver.pit?.some(pit => pit.tSec >= start - 30 && pit.tSec <= end + 30),
      `Pit affected lap #${number}/${lapNumber}`);
    assert.ok(!replay.session.pauses?.some(pause => pause.startSec < end && pause.endSec > start),
      `Interrupted lap #${number}/${lapNumber}`);
    assert.ok(!trackLimitsLaps.has(`${number}:${lapNumber}`),
      `Track limits lap #${number}/${lapNumber}`);
    const samples = driver.samples.filter(row => row[0] >= start && row[0] <= end);
    assert.ok(samples.length >= 175, `Sparse telemetry #${number}/${lapNumber}`);
    const minima = brakingMinima(samples);
    for (const [turn, apex] of Object.entries(apexes)) {
      const closest = minima.map(minimum => ({
        ...minimum, gap: signedGap(minimum.station, apex),
      })).sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0];
      assert.ok(closest, `No braking trough #${number}/${lapNumber} ${turn}`);
      measurements[turn].push({ number, lapNumber, ...closest,
        onsetGap: brakeOnsetGap(samples, closest.index, apex) });
    }
  }
}

const all = Object.values(measurements).flat();
assert.equal(all.length, driverNumbers.length * lapNumbers.length * turns.length);
const failures = [];
for (const [turn, values] of Object.entries(measurements)) {
  const gaps = values.map(value => value.gap);
  const errors = gaps.map(Math.abs);
  const onsets = values.filter(value => value.onsetGap !== null).map(value => value.onsetGap);
  console.log(`${turn}: n=${values.length}, median=${median(gaps).toFixed(1)} m, `
    + `median absolute=${median(errors).toFixed(1)} m, p90=${percentile(errors, .9).toFixed(1)} m, `
    + `max=${Math.max(...errors).toFixed(1)} m, median speed=${median(values.map(value => value.speed))} km/h, `
    + `brake onset=${onsets.length ? `${median(onsets).toFixed(1)} m (${onsets.length}/${values.length}, `
      + `${onsets.filter(gap => gap < 0).length} before apex)` : 'unavailable'}`);
  const outliers = values.filter(value => Math.abs(value.gap) > 45);
  if (outliers.length) console.log(`  outliers: ${outliers.map(value =>
    `#${value.number}/L${value.lapNumber} ${value.gap.toFixed(0)} m`).join(', ')}`);
  if (!(median(errors) < 35 && percentile(errors, .9) < 45))
    failures.push(`${turn} speed troughs do not align with the FIA turn marker`);
  if (!values.every(value => Math.abs(value.gap) < 60))
    failures.push(`${turn} has a speed trough more than 60 m from its turn marker`);
  if (!(onsets.length >= values.length * .9))
    failures.push(`${turn} has too few observed brake applications`);
  if (!(median(onsets) < -50 && onsets.filter(gap => gap > 0).length <= 1))
    failures.push(`${turn} braking begins at or after the apex`);
}
const errors = all.map(value => Math.abs(value.gap));
console.log(`Singapore: ${driverNumbers.length * lapNumbers.length} clean laps, ${all.length} turns, `
  + `overall median absolute=${median(errors).toFixed(1)} m, p90=${percentile(errors, .9).toFixed(1)} m.`);
assert.deepEqual(failures, []);
