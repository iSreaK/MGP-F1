import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createFreeRaceField } from '../dist/singapore/free-race-field.js';
import { CAR_BLOCK, resolveEntitySpacing } from '../dist/singapore/entity-spacing.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { prepareSingaporeCurve } from '../dist/singapore/geometry-smoothing.js';
import { GRID_SLOT_SPACING, SINGAPORE_FINISH_BEFORE_START_METERS } from '../dist/singapore/grid-details.js';
import { computeReplayPlacements, replayPitOffset, replayVisualDistance } from '../dist/singapore/replay-lanes.js';
import { SINGAPORE_2025_DISPLAYED } from '../dist/singapore/replay-roster.js';
import { TRACK_LENGTH_METERS, TRACK_POINTS } from '../dist/singapore/track-data.js';

const entries = SINGAPORE_2025_DISPLAYED.map(driver => ({
  ...driver,
  number: driver.replayNumber,
  pitStartDelaySec: driver.pitLaneStart ? 8 + (driver.gridPosition - 19) * .35 : undefined,
}));
const { curve } = prepareSingaporeCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const trackGap = createTrackGapLookup(curve);
const gridU = trackGap.behind(0, -SINGAPORE_FINISH_BEFORE_START_METERS);
const field = createFreeRaceField(entries, {
  gridU,
  trackLengthMeters: trackGap.lengthMeters,
  gridSlotSpacingMeters: GRID_SLOT_SPACING,
});
const previous = new Map();
const wrap = value => ((value % trackGap.lengthMeters) + trackGap.lengthMeters) % trackGap.lengthMeters;
const signedGap = (a, b) => wrap(a - b + trackGap.lengthMeters / 2) - trackGap.lengthMeters / 2;

function footprint(pose) {
  const tangent = curve.getTangentAt(pose.u).setY(0).normalize();
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
  const center = curve.getPointAt(pose.u).addScaledVector(side, pose.offset);
  return { center, tangent, side };
}

function footprintPenetration(a, b) {
  const separation = a.center.clone().sub(b.center);
  let minimum = Infinity;
  for (const axis of [a.tangent, a.side, b.tangent, b.side]) {
    const projection = footprint => CAR_BLOCK.length / 2 * Math.abs(footprint.tangent.dot(axis))
      + CAR_BLOCK.width / 2 * Math.abs(footprint.side.dot(axis));
    const overlap = projection(a) + projection(b) - Math.abs(separation.dot(axis));
    if (overlap <= 1e-4) return 0;
    minimum = Math.min(minimum, overlap);
  }
  return minimum;
}

field.start();
let checkedFrames = 0;
let largestShift = 0;
let largestAddedShift = 0;
let largestLateralMove = 0;
let largestShiftAt = null;
let largestAddedAt = null;
let pitMergeSeen = false;
let sideBySideSeen = false;
let trackOverlapCount = 0;
const trackOverlapExamples = [];
let worldOverlapCount = 0;
const worldOverlapExamples = [];
const stepSec = .1;
for (let tick = 0; tick <= 3600; tick++) {
  const frame = tick === 0 ? field.frame() : field.update(stepSec);
  const source = frame.cars.map(car => ({
    number: car.number,
    gridPosition: car.gridPosition,
    priority: car.progressMeters,
    u: car.u,
    offset: car.offset,
  }));
  const poses = resolveEntitySpacing(source, trackGap, previous, {
    curve,
    lateralStep: Math.min(.18, stepSec * 4),
    releaseStep: Math.min(.35, stepSec * 7),
  });
  assert.equal(poses.size, entries.length, 'each loaded car has one visible pose');

  for (const car of source) {
    const pose = poses.get(car.number);
    const older = previous.get(car.number);
    assert.ok(Number.isFinite(pose.u) && pose.u >= 0 && pose.u < 1);
    assert.ok(Number.isFinite(pose.offset) && Number.isFinite(pose.shiftMeters));
    assert.ok(pose.shiftMeters >= -1e-6, 'the renderer never pushes a car forward');
    assert.ok(pose.offset >= -19 && pose.offset <= 4.7,
      'the model stays on the circuit or its separate pit lane');
    const visualShift = signedGap(trackGap.metresAt(car.u), trackGap.metresAt(pose.u));
    assert.ok(Math.abs(visualShift - pose.shiftMeters) < .02,
      'the spline pose matches the separation solver displacement');
    if (pose.shiftMeters > largestShift) {
      largestShift = pose.shiftMeters;
      largestShiftAt = `${frame.timeSec.toFixed(1)} s, #${car.number}`;
    }
    if (older) {
      const lateralMove = Math.abs(pose.offset - older.offset);
      largestLateralMove = Math.max(largestLateralMove, lateralMove);
      assert.ok(lateralMove <= .18 + 1e-6,
        'visible lateral corrections respect the per-frame rate limit');
      assert.ok(pose.shiftMeters >= older.shiftMeters - .35 - 1e-6,
        'a visual holdback releases gradually');
      if (pose.shiftMeters - older.shiftMeters > largestAddedShift) {
        largestAddedShift = pose.shiftMeters - older.shiftMeters;
        largestAddedAt = `${frame.timeSec.toFixed(1)} s, #${car.number}`;
      }
    }
  }

  const pairs = [...poses];
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const [firstNumber, first] = pairs[i];
    const [secondNumber, second] = pairs[j];
    const along = Math.abs(signedGap(trackGap.metresAt(first.u), trackGap.metresAt(second.u)));
    const across = Math.abs(first.offset - second.offset);
    if (along < CAR_BLOCK.length - 1e-4 && across < CAR_BLOCK.width - 1e-4) {
      trackOverlapCount++;
      if (trackOverlapExamples.length < 8)
        trackOverlapExamples.push({ time: +frame.timeSec.toFixed(1), cars: [firstNumber, secondNumber],
          along: +along.toFixed(2), across: +across.toFixed(2) });
    }
    if (along < 8 && across >= CAR_BLOCK.width) sideBySideSeen = true;
    if (along < 20) {
      const firstFootprint = footprint(first), secondFootprint = footprint(second);
      const penetration = footprintPenetration(firstFootprint, secondFootprint);
      if (penetration > 0) {
        worldOverlapCount++;
        if (worldOverlapExamples.length < 12)
          worldOverlapExamples.push({ time: +frame.timeSec.toFixed(1),
            cars: [firstNumber, secondNumber],
            stations: [first, second].map(pose => +trackGap.metresAt(pose.u).toFixed(2)),
            offsets: [first.offset, second.offset].map(value => +value.toFixed(2)),
            shifts: [first.shiftMeters, second.shiftMeters].map(value => +value.toFixed(2)),
            along: +along.toFixed(2), across: +across.toFixed(2),
            centres: +firstFootprint.center.distanceTo(secondFootprint.center).toFixed(2),
            penetration: +penetration.toFixed(2) });
      }
    }
  }
  checkedFrames++;
  if (frame.byNumber[10]?.progressMeters > 250 && frame.byNumber[10]?.offset > -4)
    pitMergeSeen = true;
  for (const [number, pose] of poses) previous.set(number, pose);
}

// The same solver places historical telemetry. Sample the full Grand Prix and
// several dense opening-race moments, using the exact replay placement path.
const replayData = JSON.parse(readFileSync(new URL(
  '../dist/singapore/data/singapore-2025-replay.json', import.meta.url), 'utf8'));
const replay = createHistoricalReplay(replayData);
const replayLaps = Math.max(...replay.drivers.map(driver => driver.laps?.length || 0));
const modelNumbers = new Set(entries.map(entry => entry.number));
const timestamps = [...new Set([
  ...Array.from({ length: 151 }, (_, index) => replay.durationSec * index / 150),
  ...Array.from({ length: 31 }, (_, index) => index * 6),
].map(value => Math.round(value * 1000)))].sort((a, b) => a - b);
let replayWorldOverlaps = 0;
const replayExamples = [];
let replayLargestShift = 0;
for (const milliseconds of timestamps) {
  const frame = replay.frame(milliseconds / 1000);
  const visualCars = frame.cars.map(car => ({ ...car,
    progressMeters: replayVisualDistance(car.progressMeters, replayData.session, replayLaps),
  }));
  const placements = computeReplayPlacements(visualCars, gridU, trackGap,
    replay.trackLengthMeters);
  for (const car of visualCars) {
    const placement = placements.get(car.number);
    placement.offset = replayPitOffset(car, frame.timeSec, replayData.session,
      replayData.drivers[car.number]?.pit, placement.offset);
  }
  const visible = visualCars.filter(car => modelNumbers.has(car.number)
    && !(car.ended && frame.timeSec > replayData.drivers[car.number].finishSec + 1));
  const poses = resolveEntitySpacing(visible.map(car => ({
    number: car.number,
    gridPosition: car.gridPosition,
    priority: car.progressMeters,
    ...placements.get(car.number),
  })), trackGap, new Map(), { curve });
  for (const pose of poses.values()) replayLargestShift = Math.max(replayLargestShift,
    pose.shiftMeters);
  const pairs = [...poses];
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const [firstNumber, first] = pairs[i];
    const [secondNumber, second] = pairs[j];
    const along = Math.abs(signedGap(trackGap.metresAt(first.u), trackGap.metresAt(second.u)));
    if (along >= 20) continue;
    const penetration = footprintPenetration(footprint(first), footprint(second));
    if (penetration > 0) {
      replayWorldOverlaps++;
      if (replayExamples.length < 8) replayExamples.push({
        time: +frame.timeSec.toFixed(1), cars: [firstNumber, secondNumber],
        penetration: +penetration.toFixed(2),
      });
    }
  }
}

assert.ok(pitMergeSeen, 'the pit starter joins the racing surface');
assert.ok(sideBySideSeen, 'the test exercised actual wheel-to-wheel traffic');
console.log('Collision audit:', JSON.stringify({ trackOverlapCount, trackOverlapExamples,
  worldOverlapCount, worldOverlapExamples,
  largestShift: +largestShift.toFixed(2), largestShiftAt,
  largestAddedShift: +largestAddedShift.toFixed(2), largestAddedAt,
  largestLateralMove: +largestLateralMove.toFixed(2),
  replayFrames: timestamps.length, replayWorldOverlaps, replayExamples,
  replayLargestShift: +replayLargestShift.toFixed(2) }));
assert.ok(largestShift < 8,
  'the visual solver never holds a car back by more than a short car-to-car gap');
assert.ok(largestAddedShift < 3,
  'a 0.1-second frame never adds a visibly abrupt whole-car visual holdback');
assert.equal(trackOverlapCount, 0, 'car blocks do not overlap in track coordinates');
assert.equal(worldOverlapCount, 0, '3D-oriented car blocks do not overlap on the rendered curve');
assert.equal(replayWorldOverlaps, 0,
  'historical replay car blocks do not overlap on the rendered curve');
console.log(`Singapore free race: ${checkedFrames} sampled 3D frames across 6 minutes, `
  + `${largestShift.toFixed(2)} m max visual holdback, `
  + `${largestAddedShift.toFixed(2)} m max holdback addition, `
  + `${largestLateralMove.toFixed(2)} m max lateral step; `
  + `${timestamps.length} historical replay moments; no overlapping car blocks.`);
