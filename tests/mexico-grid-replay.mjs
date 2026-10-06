import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from '../dist/mexico/track-data.js';
import { prepareMexicoCurve } from '../dist/mexico/geometry-smoothing.js';
import { MEXICO_2025_ROSTER } from '../dist/mexico/replay-roster.js';
import { MEXICO_FINISH_BEFORE_START_METERS, GRID_LANE_CENTER,
  GRID_SLOT_SPACING } from '../dist/mexico/grid-details.js';
import { computeReplayPlacements, replayPitOffset } from '../dist/mexico/replay-lanes.js';
import { resolveEntitySpacing, CAR_BLOCK } from '../dist/mexico/entity-spacing.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';

const data = JSON.parse(readFileSync(new URL('../dist/mexico/data/mexico-2025-replay.json',
  import.meta.url)));
assert.equal(data.session.trackLengthMeters, TRACK_LENGTH_METERS);
assert.equal(data.session.gridSlotSpacingMeters, GRID_SLOT_SPACING);
assert.equal(data.session.controlLineBeforeStartMeters, MEXICO_FINISH_BEFORE_START_METERS);
assert.equal(MEXICO_2025_ROSTER.length, 20);
assert.equal(MEXICO_2025_ROSTER.filter(driver => driver.modelKey).length, 19);

const { curve } = prepareMexicoCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const gap = createTrackGapLookup(curve);
const gridU = gap.behind(0, -MEXICO_FINISH_BEFORE_START_METERS);
const wrap = value => ((value + gap.lengthMeters / 2 + gap.lengthMeters)
  % gap.lengthMeters) - gap.lengthMeters / 2;
const station = u => wrap(gap.metresAt(u) - gap.metresAt(gridU));
const cars = MEXICO_2025_ROSTER.map(driver => ({
  number: driver.replayNumber,
  gridPosition: driver.gridPosition,
  pitLaneStart: false,
  progressMeters: data.drivers[driver.replayNumber].samples[0][1],
  speedKph: 0,
}));
const placements = computeReplayPlacements(cars, gridU, gap, TRACK_LENGTH_METERS);
for (const car of cars) {
  const expectedStation = -14.1 - (car.gridPosition - 1) * GRID_SLOT_SPACING;
  const expectedLane = car.gridPosition % 2 ? GRID_LANE_CENTER : -GRID_LANE_CENTER;
  const pose = placements.get(car.number);
  assert.ok(Math.abs(station(pose.u) - expectedStation) < .25,
    `#${car.number} misses grid box by ${station(pose.u) - expectedStation} m`);
  assert.ok(Math.abs(pose.offset - expectedLane) < .01,
    `#${car.number} starts in wrong grid column`);
}
const rendered = cars.filter(car => data.drivers[car.number].modelKey)
  .map(car => ({ number: car.number, gridPosition: car.gridPosition,
    priority: car.progressMeters, ...placements.get(car.number) }));
const resolved = [...resolveEntitySpacing(rendered, gap).values()];
for (let i = 0; i < resolved.length; i++) for (let j = i + 1; j < resolved.length; j++) {
  const separation = Math.abs(gap.metresAt(resolved[i].u) - gap.metresAt(resolved[j].u));
  const longitudinal = Math.min(separation, gap.lengthMeters - separation);
  assert.ok(longitudinal >= CAR_BLOCK.length
    || Math.abs(resolved[i].offset - resolved[j].offset) >= CAR_BLOCK.width,
  `grid car blocks #${resolved[i].number}/#${resolved[j].number} overlap`);
}
const firstControlProgress = TRACK_LENGTH_METERS - MEXICO_FINISH_BEFORE_START_METERS;
const pole = { ...cars.find(car => car.gridPosition === 1),
  progressMeters: firstControlProgress };
const controlPose = computeReplayPlacements([pole], gridU, gap, TRACK_LENGTH_METERS)
  .get(pole.number);
assert.ok(Math.abs(station(controlPose.u) + MEXICO_FINISH_BEFORE_START_METERS) < .25,
  'first control-line crossing has wrong phase');

const line = TRACK_POINTS.slice(0, -1);
const lengths = [0];
for (let i = 1; i < line.length; i++) lengths.push(lengths.at(-1) + Math.hypot(
  line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
const pitStation = index => wrap(lengths[index] - MEXICO_FINISH_BEFORE_START_METERS);
const entry = pitStation(LANDMARKS.pitStraight.entryIndex);
const exit = pitStation(LANDMARKS.pitStraight.exitIndex);
assert.ok(entry < -200 && entry > -500 && exit > 700 && exit < 1100);
const stop = [{ tSec: 500, laneDurationSec: 200 }];
const offsetAt = metres => replayPitOffset({
  progressMeters: (metres + TRACK_LENGTH_METERS) % TRACK_LENGTH_METERS,
  speedKph: 50,
}, 400, data.session, stop, 0);
assert.ok(Math.abs(offsetAt(entry)) < .001);
assert.ok(offsetAt(entry + 90) > 12, 'pit entry misses visible fast lane');
assert.ok(offsetAt(exit - 70) > 12, 'pit car exits before the taper');
assert.ok(Math.abs(offsetAt(exit)) < .001);
for (let s = entry; s < exit; s += 5) {
  assert.ok(Math.abs(offsetAt(Math.min(exit, s + 5)) - offsetAt(s)) < 1.8,
    `pit lateral jump near ${s.toFixed(0)} m`);
}
console.log(`Mexico grid and pit replay OK: 20 starters, 19 car blocks, pole left, pit ${entry.toFixed(0)} to ${exit.toFixed(0)} m.`);
