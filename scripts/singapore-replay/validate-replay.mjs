#!/usr/bin/env node
// Check the generated replay against the downloaded historical archive and
// independent race facts. This script reads data only.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SINGAPORE_2025_ROSTER } from '../../dist/singapore/replay-roster.js';

const root = import.meta.dirname;
const rawDir = process.env.SINGAPORE_REPLAY_RAW_DIR || join(root, 'raw');
const replay = JSON.parse(await readFile(join(root, '..', '..', 'dist', 'singapore', 'data',
  'singapore-2025-replay.json'), 'utf8'));
const raw = async name => JSON.parse(await readFile(join(rawDir, name), 'utf8'));
const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: attendu ${expected} ± ${tolerance}, reçu ${actual}`);

assert.equal(replay.source.provider, 'OpenF1');
assert.equal(replay.source.sessionKey, 9896);
assert.equal(replay.session.trackLengthMeters, 4927);
assert.equal(replay.session.controlLineBeforeStartMeters, 137);
assert.equal(replay.session.visualPhaseShiftMeters, 137);
assert.equal(replay.session.fieldCount, 20);
assert.equal(replay.session.renderedModelCount, 19);
assert.equal(replay.session.sampleHz, 2);
assert.equal(Object.keys(replay.drivers).length, 20);
assert.equal(replay.officialField.length, 20);
assert.deepEqual(replay.sampleFields, ['tSec', 'progressMeters', 'speedKph',
  'throttlePct', 'brakePct', 'gear', 'officialPosition',
  'lateralMeters', 'lateralConfidence']);
assert.ok(replay.session.gpsLateral.registrationRmsMetres < 10);
assert.ok(replay.session.gpsLateral.phaseMetres >= 25
  && replay.session.gpsLateral.phaseMetres <= 35);
assert.equal(replay.session.gpsLateral.coveredTenMetreBins, 493);
assert.ok(replay.session.gpsLateral.confidentFrames
  > replay.session.gpsLateral.totalFrames * .85);
assert.ok(replay.session.gpsLateral.weightedLateralStepP99MetresPerHalfSecond < 1.1);
assert.ok(replay.session.gpsLateral.weightedLateralStepMaxMetresPerHalfSecond <= 1.27);
assert.deepEqual([...new Set(SINGAPORE_2025_ROSTER.map(row => row.finalPosition))]
  .sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => index + 1));
assert.deepEqual(SINGAPORE_2025_ROSTER.filter(row => row.pitLaneStart)
  .map(row => row.replayNumber).sort((a, b) => a - b), [10, 23]);

const startMs = Date.parse(replay.session.start);
const rawControl = await raw('race_control.json');
const relevantControl = rawControl.filter(row => {
  const t = Date.parse(row.date);
  return t >= startMs && t <= Date.parse(replay.session.end);
});
assert.equal(replay.events.length, relevantControl.length,
  'La chronologie des messages de direction de course est incomplète.');

let checkedFrames = 0;
let maximumSpeedDifferenceKph = 0;
let speedDifferenceTotalKph = 0;
let checkedSpeedIntervals = 0;
for (const expected of SINGAPORE_2025_ROSTER) {
  const number = expected.replayNumber;
  const driver = replay.drivers[String(number)];
  assert.ok(driver, `Pilote #${number} absent`);
  assert.equal(driver.name, expected.name);
  assert.equal(driver.number, number);
  assert.equal(driver.gridPosition, expected.gridPosition);
  assert.equal(driver.finalPosition, expected.finalPosition);
  assert.equal(driver.modelKey, expected.modelKey);
  assert.equal(driver.pitLaneStart, !!expected.pitLaneStart);
  assert.equal(driver.status, 'finished');
  assert.equal(driver.officialCompletedLaps, expected.finalPosition <= 9 ? 62 : 61);
  assert.equal(driver.laps.length, driver.officialCompletedLaps);
  assert.equal(driver.samples.length, 12234);
  assert.equal(driver.samples[0][0], 0);
  close(driver.samples.at(-1)[0], replay.session.durationSec, 0.001,
    `Dernier échantillon #${number}`);
  assert.equal(driver.samples.at(-1)[6], expected.finalPosition);

  const sourceLaps = await raw(`laps_${number}.json`);
  const sourceLocations = await raw(`location_${number}.json`);
  const sourceCarData = await raw(`car_data_${number}.json`);
  assert.ok(sourceLocations.length > 25000 && sourceCarData.length > 25000,
    `Position ou télémétrie historique insuffisante pour #${number}`);
  assert.equal(sourceLaps.length, driver.laps.length);
  for (let index = 0; index < sourceLaps.length; index++) {
    assert.equal(sourceLaps[index].lap_number, driver.laps[index].lap);
    close(startMs + driver.laps[index].startSec * 1000,
      Date.parse(sourceLaps[index].date_start), 1,
      `Passage ligne tour ${index + 1} #${number}`);
  }

  // Each passage of the control line must remain aligned with OpenF1 timing.
  // Linear interpolation of 2 Hz frames is precise to a few metres.
  for (const lap of driver.laps.slice(1)) {
    const sampleIndex = Math.floor(lap.startSec * 2);
    const a = driver.samples[sampleIndex], b = driver.samples[sampleIndex + 1];
    assert.ok(a && b && a[0] <= lap.startSec && b[0] >= lap.startSec,
      `Échantillons manquants autour du tour ${lap.lap} #${number}`);
    const blend = (lap.startSec - a[0]) / (b[0] - a[0]);
    const progress = a[1] + (b[1] - a[1]) * blend;
    close(progress, (lap.lap - 1) * 4927 - 137, 5,
      `Progression au passage du tour ${lap.lap} #${number}`);
  }
  close(driver.samples.at(-1)[1], driver.officialCompletedLaps * 4927 - 137,
    0.1, `Distance au drapeau à damier #${number}`);

  for (let index = 0; index < driver.samples.length; index++) {
    const frame = driver.samples[index];
    assert.equal(frame.length, 9);
    assert.ok(frame.every(Number.isFinite), `Valeur non finie frame ${index} #${number}`);
    assert.ok(Math.abs(frame[7]) <= 3.2 && frame[8] >= 0 && frame[8] <= 1,
      `Écart GPS hors chaussée frame ${index} #${number}`);
    assert.ok(frame[2] >= 0 && frame[2] <= 380,
      `Vitesse impossible frame ${index} #${number}`);
    assert.ok(frame[3] >= 0 && frame[3] <= 100 && frame[4] >= 0 && frame[4] <= 100,
      `Pédalier impossible frame ${index} #${number}`);
    assert.ok(frame[6] >= 1 && frame[6] <= 20,
      `Classement impossible frame ${index} #${number}`);
    if (index === 0) continue;
    const previous = driver.samples[index - 1];
    assert.ok(frame[0] > previous[0], `Temps non croissant #${number}`);
    assert.ok(frame[1] >= previous[1], `Voiture qui recule #${number}`);
    if (frame[0] >= driver.finishSec || previous[2] <= 60 || frame[2] <= 60) continue;
    const representedSpeedKph = (frame[1] - previous[1])
      / (frame[0] - previous[0]) * 3.6;
    const measuredSpeedKph = (frame[2] + previous[2]) / 2;
    const difference = Math.abs(representedSpeedKph - measuredSpeedKph);
    maximumSpeedDifferenceKph = Math.max(maximumSpeedDifferenceKph, difference);
    speedDifferenceTotalKph += difference;
    checkedSpeedIntervals++;
  }
  checkedFrames += driver.samples.length;
  console.log(`${String(number).padStart(2)} ${driver.name.padEnd(18)} `
    + `${driver.officialCompletedLaps} tours · ${driver.samples.length} frames`);
}

assert.ok(maximumSpeedDifferenceKph < 20,
  `Décalage position/vitesse maximal trop élevé : ${maximumSpeedDifferenceKph.toFixed(1)} km/h`);
const averageDifferenceKph = speedDifferenceTotalKph / checkedSpeedIntervals;
assert.ok(averageDifferenceKph < 10,
  `Décalage position/vitesse moyen trop élevé : ${averageDifferenceKph.toFixed(1)} km/h`);
console.log(`Validation : 20 pilotes, 19 modèles, ${checkedFrames} frames, 62 tours du vainqueur, `
  + `4 927 m/tour, phase 137 m, écart position/vitesse ${averageDifferenceKph.toFixed(1)} km/h moyen / `
  + `${maximumSpeedDifferenceKph.toFixed(1)} km/h maximal.`);
