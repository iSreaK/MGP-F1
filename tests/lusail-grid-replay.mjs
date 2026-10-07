import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from '../dist/lusail/track-data.js';
import { prepareLusailCurve } from '../dist/lusail/geometry-smoothing.js';
import { LUSAIL_2025_ROSTER } from '../dist/lusail/replay-roster.js';
import { LUSAIL_FINISH_BEFORE_START_METERS, GRID_LANE_CENTER,
  GRID_SLOT_SPACING } from '../dist/lusail/grid-details.js';
import { computeReplayPlacements, replayPitOffset, replayVisualDistance } from '../dist/lusail/replay-lanes.js';
import { resolveEntitySpacing, CAR_BLOCK } from '../dist/lusail/entity-spacing.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';

const data = JSON.parse(readFileSync(new URL('../dist/lusail/data/lusail-2025-replay.json',
  import.meta.url)));
assert.equal(data.session.trackLengthMeters, TRACK_LENGTH_METERS);
assert.equal(data.session.gridSlotSpacingMeters, GRID_SLOT_SPACING);
assert.equal(data.session.controlLineBeforeStartMeters, LUSAIL_FINISH_BEFORE_START_METERS);
assert.equal(LUSAIL_2025_ROSTER.length, 20);
assert.equal(LUSAIL_2025_ROSTER.filter(driver => driver.modelKey).length, 19);

const { curve } = prepareLusailCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const gap = createTrackGapLookup(curve);
const gridU = gap.behind(0, -LUSAIL_FINISH_BEFORE_START_METERS);
const wrap = value => ((value + gap.lengthMeters / 2 + gap.lengthMeters)
  % gap.lengthMeters) - gap.lengthMeters / 2;
const station = u => wrap(gap.metresAt(u) - gap.metresAt(gridU));
const cars = LUSAIL_2025_ROSTER.map(driver => ({
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
const firstControlProgress = TRACK_LENGTH_METERS - LUSAIL_FINISH_BEFORE_START_METERS;
const pole = { ...cars.find(car => car.gridPosition === 1),
  progressMeters: firstControlProgress };
const controlPose = computeReplayPlacements([pole], gridU, gap, TRACK_LENGTH_METERS)
  .get(pole.number);
assert.ok(Math.abs(station(controlPose.u) + LUSAIL_FINISH_BEFORE_START_METERS) < .25,
  'first control-line crossing has wrong phase');

const line = TRACK_POINTS.slice(0, -1);
const lengths = [0];
for (let i = 1; i < line.length; i++) lengths.push(lengths.at(-1) + Math.hypot(
  line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
const pitStation = index => wrap(lengths[index] - LUSAIL_FINISH_BEFORE_START_METERS);
const entry = pitStation(LANDMARKS.pitStraight.entryIndex);
const exit = pitStation(LANDMARKS.pitStraight.exitIndex);
assert.ok(entry < -400 && exit > 100 && exit < 260);
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

// Audit snapshots across the complete replay, including the busy opening
// laps and pit-stop windows. Test the finished world-space car rectangles.
const player = createHistoricalReplay(data);
const times = [0, ...Array.from({ length: 20 }, (_, i) => (i + 1) * .5)];
for (let t = 30; t < data.session.durationSec; t += 30) times.push(t);
const halfLength = CAR_BLOCK.length / 2 + .035;
const halfWidth = CAR_BLOCK.width / 2 + .035;
function footprint(pose) {
  const point = curve.getPointAt(pose.u);
  const tangent = curve.getTangentAt(pose.u).setY(0).normalize();
  const across = new THREE.Vector3(tangent.z, 0, -tangent.x);
  return { centre: point.addScaledVector(across, pose.offset), tangent, across };
}
function overlaps(a, b) {
  const delta = b.centre.clone().sub(a.centre);
  for (const axis of [a.tangent, a.across, b.tangent, b.across]) {
    const gap = Math.abs(delta.dot(axis));
    const radius = shape => halfLength * Math.abs(shape.tangent.dot(axis))
      + halfWidth * Math.abs(shape.across.dot(axis));
    if (gap >= radius(a) + radius(b)) return false;
  }
  return true;
}
let auditedCars = 0;
for (const t of times) {
  const frame = player.frame(t);
  const visualCars = frame.cars.map(car => ({
    ...car, progressMeters: replayVisualDistance(car.progressMeters,
      data.session, 57),
  }));
  const poses = computeReplayPlacements(visualCars, gridU, gap, TRACK_LENGTH_METERS);
  for (const car of visualCars) {
    const pose = poses.get(car.number);
    pose.offset = replayPitOffset(car, t, data.session,
      data.drivers[car.number]?.pit, pose.offset);
  }
  const visible = visualCars.filter(car => data.drivers[car.number]?.modelKey
    && !(car.ended && t > data.drivers[car.number].finishSec + 1));
  const resolved = resolveEntitySpacing(visible.map(car => ({
    number: car.number, gridPosition: car.gridPosition,
    priority: car.progressMeters, ...poses.get(car.number),
  })), gap, new Map(), { curve });
  const rectangles = visible.map(car => ({ number: car.number,
    shape: footprint(resolved.get(car.number)) }));
  for (let i = 0; i < rectangles.length; i++) {
    for (let j = i + 1; j < rectangles.length; j++) {
      assert.ok(!overlaps(rectangles[i].shape, rectangles[j].shape),
        `rendered car blocks overlap at ${t}s: #${rectangles[i].number}/#${rectangles[j].number}`);
    }
  }
  auditedCars += rectangles.length;
}
console.log(`Lusail grid and pit replay OK: 20 starters, 19 car blocks, pit ${entry.toFixed(0)} to ${exit.toFixed(0)} m; ${times.length} race snapshots and ${auditedCars} car poses clear.`);
