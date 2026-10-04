import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from '../dist/singapore/track-data.js';
import { SINGAPORE_2025_ROSTER } from '../dist/singapore/replay-roster.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING, PIT_START_LANE_CENTER,
  SINGAPORE_FINISH_BEFORE_START_METERS } from '../dist/singapore/grid-details.js';
import { computeReplayPlacements } from '../dist/singapore/replay-lanes.js';
import { resolveEntitySpacing, CAR_BLOCK } from '../dist/singapore/entity-spacing.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';

const data = JSON.parse(readFileSync(new URL('../dist/singapore/data/singapore-2025-replay.json',
  import.meta.url)));
assert.equal(data.session.trackLengthMeters, TRACK_LENGTH_METERS);
assert.equal(data.session.gridSlotSpacingMeters, GRID_SLOT_SPACING);
assert.equal(SINGAPORE_2025_ROSTER.length, 20);

const coordinates = TRACK_POINTS.slice(0, -1);
const curve = new THREE.CatmullRomCurve3(
  coordinates.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal', .18);
curve.arcLengthDivisions = 12000;
curve.updateArcLengths();
const gap = createTrackGapLookup(curve);
let controlDistance = 0;
for (let i = 1; i <= LANDMARKS.controlLineIndex; i++) {
  controlDistance += Math.hypot(coordinates[i][0] - coordinates[i - 1][0],
    coordinates[i][1] - coordinates[i - 1][1]);
}
let sourceLength = 0;
for (let i = 0; i < coordinates.length; i++) {
  const next = coordinates[(i + 1) % coordinates.length];
  sourceLength += Math.hypot(next[0] - coordinates[i][0], next[1] - coordinates[i][1]);
}
const controlU = controlDistance / sourceLength;
const gridU = gap.behind(controlU, -SINGAPORE_FINISH_BEFORE_START_METERS);
const station = u => {
  const signed = gap.metresAt(u) - gap.metresAt(gridU);
  return ((signed + gap.lengthMeters / 2 + gap.lengthMeters) % gap.lengthMeters)
    - gap.lengthMeters / 2;
};

const cars = SINGAPORE_2025_ROSTER.map(driver => ({
  number: driver.replayNumber,
  gridPosition: driver.gridPosition,
  pitLaneStart: !!driver.pitLaneStart,
  progressMeters: data.drivers[driver.replayNumber].samples[0][1],
  speedKph: 0,
}));
const placements = computeReplayPlacements(cars, gridU, gap, TRACK_LENGTH_METERS);
for (const car of cars) {
  const driver = data.drivers[car.number];
  const expectedStation = car.pitLaneStart ? driver.startOffsetMeters
    : -14.1 - (car.gridPosition - 1) * GRID_SLOT_SPACING;
  const expectedLane = car.pitLaneStart ? PIT_START_LANE_CENTER
    : car.gridPosition % 2 ? -GRID_LANE_CENTER : GRID_LANE_CENTER;
  const pose = placements.get(car.number);
  assert.ok(Math.abs(station(pose.u) - expectedStation) < .2,
    `#${car.number} starts ${Math.abs(station(pose.u) - expectedStation).toFixed(2)} m outside its box`);
  assert.ok(Math.abs(pose.offset - expectedLane) < .01,
    `#${car.number} starts in the wrong lane`);
}
assert.ok(-GRID_LANE_CENTER < GRID_LANE_CENTER, 'pole is to the driver right');

const firstControlProgress = TRACK_LENGTH_METERS - SINGAPORE_FINISH_BEFORE_START_METERS;
const pole = { ...cars.find(car => car.gridPosition === 1), progressMeters: firstControlProgress };
const atControl = computeReplayPlacements([pole], gridU, gap, TRACK_LENGTH_METERS).get(pole.number);
assert.ok(Math.abs(station(atControl.u) + SINGAPORE_FINISH_BEFORE_START_METERS) < .2,
  'the first FIA control-line passage remains aligned after easing the grid correction');

for (const number of [10, 23]) {
  const car = cars.find(candidate => candidate.number === number);
  for (const progressMeters of [car.progressMeters, 165]) {
    const pose = computeReplayPlacements([{ ...car, progressMeters }],
      gridU, gap, TRACK_LENGTH_METERS).get(number);
    assert.ok(Math.abs(pose.offset - PIT_START_LANE_CENTER) < .01,
      `pit starter #${number} leaves the lane too early`);
  }
  const merged = computeReplayPlacements([{ ...car, progressMeters: 230 }],
    gridU, gap, TRACK_LENGTH_METERS).get(number);
  assert.ok(Math.abs(merged.offset) <= 2.2,
    `pit starter #${number} remains outside the road after the exit`);
}

const rendered = cars.filter(car => data.drivers[car.number].modelKey)
  .map(car => ({ number: car.number, gridPosition: car.gridPosition,
    priority: car.progressMeters, ...placements.get(car.number) }));
const resolved = [...resolveEntitySpacing(rendered, gap).values()];
for (let i = 0; i < resolved.length; i++) for (let j = i + 1; j < resolved.length; j++) {
  const ahead = gap.metresAt(resolved[i].u), behind = gap.metresAt(resolved[j].u);
  const gapMetres = Math.min(Math.abs(ahead - behind),
    gap.lengthMeters - Math.abs(ahead - behind));
  assert.ok(gapMetres >= CAR_BLOCK.length
    || Math.abs(resolved[i].offset - resolved[j].offset) >= CAR_BLOCK.width,
  'two Singapore grid car blocks overlap');
}
console.log('Singapore: 20 official positions, 19 model blocks, right-hand pole, pit starts and FIA control line aligned.');
