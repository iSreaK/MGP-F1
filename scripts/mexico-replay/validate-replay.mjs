#!/usr/bin/env node
// Check the generated replay against the downloaded historical archive and
// independent race facts. This script reads data only.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MEXICO_2025_ROSTER } from '../../dist/mexico/replay-roster.js';
import { createHistoricalReplay } from '../../dist/monza/historical-replay.js';

const root = import.meta.dirname;
const rawDir = process.env.MEXICO_REPLAY_RAW_DIR || join(root, 'raw');
const replay = JSON.parse(await readFile(join(root, '..', '..', 'dist', 'mexico', 'data',
  'mexico-2025-replay.json'), 'utf8'));
const raw = async name => JSON.parse(await readFile(join(rawDir, name), 'utf8'));
const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: attendu ${expected} ± ${tolerance}, reçu ${actual}`);

assert.equal(replay.source.provider, 'OpenF1');
assert.equal(replay.source.sessionKey, 9877);
assert.equal(replay.session.trackLengthMeters, 4304);
assert.equal(replay.session.controlLineBeforeStartMeters, 230);
assert.equal(replay.session.visualPhaseShiftMeters, 230);
assert.equal(replay.session.fieldCount, 20);
assert.equal(replay.session.renderedModelCount, 19);
assert.equal(replay.session.sampleHz, 2);
assert.equal(Object.keys(replay.drivers).length, 20);
assert.equal(replay.officialField.length, 20);
assert.deepEqual(replay.sampleFields, ['tSec', 'progressMeters', 'speedKph',
  'throttlePct', 'brakePct', 'gear', 'officialPosition',
  'lateralMeters', 'lateralConfidence']);
assert.ok(replay.session.gpsLateral.registrationRmsMetres < 10);
assert.ok(replay.session.gpsLateral.phaseMetres >= -100
  && replay.session.gpsLateral.phaseMetres <= 100);
assert.ok(replay.session.gpsLateral.coveredTenMetreBins >= 350);
assert.ok(replay.session.gpsLateral.confidentFrames
  > replay.session.gpsLateral.totalFrames * .65);
assert.ok(replay.session.gpsLateral.weightedLateralStepP99MetresPerHalfSecond < 1.2);
assert.ok(replay.session.gpsLateral.weightedLateralStepMaxMetresPerHalfSecond <= 1.27);
assert.deepEqual([...new Set(MEXICO_2025_ROSTER.map(row => row.finalPosition))]
  .sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => index + 1));
assert.equal(MEXICO_2025_ROSTER.filter(row => row.pitLaneStart).length, 0);

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
for (const expected of MEXICO_2025_ROSTER) {
  const number = expected.replayNumber;
  const driver = replay.drivers[String(number)];
  assert.ok(driver, `Pilote #${number} absent`);
  assert.equal(driver.name, expected.name);
  assert.equal(driver.number, number);
  assert.equal(driver.gridPosition, expected.gridPosition);
  assert.equal(driver.finalPosition, expected.finalPosition);
  assert.equal(driver.modelKey, expected.modelKey);
  assert.equal(driver.pitLaneStart, !!expected.pitLaneStart);
  assert.equal(driver.status, expected.status || 'finished');
  assert.equal(driver.officialCompletedLaps, expected.completedLaps);
  assert.equal(driver.laps.length,
    driver.officialCompletedLaps + (driver.status === 'retired' ? 1 : 0));
  assert.equal(driver.samples.length,
    Math.ceil(replay.session.durationSec * replay.session.sampleHz) + 1);
  assert.equal(driver.samples[0][0], 0);
  close(driver.samples.at(-1)[0], replay.session.durationSec, 0.001,
    `Dernier échantillon #${number}`);
  assert.equal(driver.samples.at(-1)[6], expected.finalPosition);

  const sourceLaps = await raw(`laps_${number}.json`);
  const sourceLocations = await raw(`location_${number}.json`);
  const sourceCarData = await raw(`car_data_${number}.json`);
  const minimumMeasurements = Math.max(300, expected.completedLaps * 80);
  assert.ok(sourceLocations.length > minimumMeasurements
    && sourceCarData.length > minimumMeasurements,
    `Position ou télémétrie historique insuffisante pour #${number}`);
  assert.equal(sourceLaps.length, driver.laps.length);
  for (let index = 0; index < driver.laps.length; index++) {
    assert.equal(sourceLaps[index].lap_number, driver.laps[index].lap);
    assert.equal(driver.laps[index].complete, index < driver.officialCompletedLaps);
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
    close(progress, (lap.lap - 1) * 4304 - 230, 5,
      `Progression au passage du tour ${lap.lap} #${number}`);
  }
  if (driver.status === 'retired') {
    assert.ok(driver.samples.at(-1)[1] > driver.officialCompletedLaps * 4304 - 230 + 100
      && driver.samples.at(-1)[1] < (driver.officialCompletedLaps + 1) * 4304 - 230,
    `Abandon #${number} sur tour partiel après ${driver.officialCompletedLaps} tours complets`);
  } else {
    close(driver.samples.at(-1)[1], driver.officialCompletedLaps * 4304 - 230,
      0.1, `Distance au drapeau à damier #${number}`);
  }

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
const player = createHistoricalReplay(replay);
assert.equal(player.frame(0).cars.length, 20);
const sainz = replay.drivers['55'];
assert.equal(player.frame(sainz.finishSec - 0.5).byNumber[55].retired, false);
assert.equal(player.frame(sainz.finishSec + 0.5).byNumber[55].retired, true);
assert.equal(player.frame(sainz.finishSec - 0.5).byNumber[55].lap, 68);
assert.equal(player.frame(replay.session.durationSec).byNumber[4].finished, true);
console.log(`Validation : 20 pilotes, 19 modèles, ${checkedFrames} frames, 71 tours du vainqueur, `
  + `4 304 m/tour, phase 230 m, écart position/vitesse ${averageDifferenceKph.toFixed(1)} km/h moyen / `
  + `${maximumSpeedDifferenceKph.toFixed(1)} km/h maximal.`);
