// Run: node --experimental-default-type=module tests/monza-entity-spacing.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAR_BLOCK, resolveEntitySpacing } from '../dist/monza/entity-spacing.js';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { createRaceController } from '../dist/monza/race-motion.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { TRACK_POINTS, LANDMARKS } from '../dist/monza/track-data.js';
import { trackElevationAt } from '../dist/monza/terrain-profile.js';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { computeReplayPlacements, rateLimitReplayOffset, replayPitOffset, replayVisualDistance } from '../dist/monza/replay-lanes.js';
import { MONZA_FINISH_BEFORE_START_METERS } from '../dist/monza/grid-details.js';

const data = JSON.parse(readFileSync(new URL('../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const replay = createHistoricalReplay(data);
const lengthMeters = data.session.trackLengthMeters;
const wrap = value => ((value % lengthMeters) + lengthMeters) % lengthMeters;
const trackGap = {
  lengthMeters,
  metresAt: u => wrap(u * lengthMeters),
  behind: (u, metres) => wrap(u * lengthMeters - metres) / lengthMeters,
};
const stationGap = (a, b) => Math.abs(wrap(a - b + lengthMeters / 2) - lengthMeters / 2);

const centerline = TRACK_POINTS.slice(0, -1);
const cumulative = [0];
for (let i = 1; i < centerline.length; i++) {
  cumulative.push(cumulative.at(-1) + Math.hypot(
    centerline[i][0] - centerline[i - 1][0], centerline[i][1] - centerline[i - 1][1]));
}
const [firstX, firstZ] = centerline[0];
const [lastX, lastZ] = centerline.at(-1);
const perimeter = cumulative.at(-1) + Math.hypot(firstX - lastX, firstZ - lastZ);
const realCurve = new THREE.CatmullRomCurve3(centerline.map(([x, z], index) =>
  new THREE.Vector3(x, .3 + trackElevationAt(cumulative[index] / perimeter), z)),
  true, 'centripetal', .27);
const realGap = createTrackGapLookup(realCurve);
const realGridU = realGap.behind(cumulative[LANDMARKS.gridIndex] / perimeter,
  -MONZA_FINISH_BEFORE_START_METERS);

// Independently check rotated car footprints in world X/Z, including tight
// chicanes. Every local GLB is about 5.04 m long and 2.04 m wide.
function footprint(pose) {
  const tangent = realCurve.getTangentAt(pose.u).setY(0).normalize();
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
  const center = realCurve.getPointAt(pose.u).addScaledVector(side, pose.offset);
  return { center, tangent, side };
}
function footprintsOverlap(a, b) {
  for (const axis of [a.tangent, a.side, b.tangent, b.side]) {
    const gap = Math.abs(a.center.clone().sub(b.center).dot(axis));
    const projection = body => 2.7 * Math.abs(body.tangent.dot(axis))
      + 1.08 * Math.abs(body.side.dot(axis));
    if (gap >= projection(a) + projection(b)) return false;
  }
  return true;
}

function assertClear(poses, label) {
  const entries = [...poses];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [firstNumber, first] = entries[i];
      const [secondNumber, second] = entries[j];
      const longitudinal = stationGap(trackGap.metresAt(first.u), trackGap.metresAt(second.u));
      const lateral = Math.abs(first.offset - second.offset);
      assert.ok(longitudinal >= CAR_BLOCK.length - 1e-5 || lateral >= CAR_BLOCK.width - 1e-5,
        `${label}: #${firstNumber} and #${secondNumber} overlap by ${longitudinal.toFixed(2)} m / ${lateral.toFixed(2)} m`);
    }
  }
}

const crowded = [1, 2, 3, 4, 5].map(number =>
  ({ number, gridPosition: number, priority: 6 - number, u: 100 / lengthMeters, offset: 0 }));
const crowdedResolved = resolveEntitySpacing(crowded, trackGap);
assertClear(crowdedResolved, 'Five coincident cars');
assert.equal(crowded[0].offset, 0, 'The source pose remains unchanged');

const wrapResolved = resolveEntitySpacing([
  { number: 10, priority: 2, u: (lengthMeters - 1) / lengthMeters, offset: 0 },
  { number: 11, priority: 1, u: 1 / lengthMeters, offset: 0 },
], trackGap);
assertClear(wrapResolved, 'Start/finish seam');

const pitResolved = resolveEntitySpacing([
  { number: 14, priority: 1, u: 100 / lengthMeters, offset: 12.5 },
  { number: 15, priority: 2, u: 100 / lengthMeters, offset: 0 },
], trackGap);
assertClear(pitResolved, 'Separate pit lane');
assert.equal(pitResolved.get(14).offset, 12.5, 'Pit-lane centre must remain untouched');

// The renderer may move a body without altering the controller's logical
// progress or speed. This keeps the free simulation and historical HUD honest.
const radius = lengthMeters / (Math.PI * 2);
const curve = {
  getLength: () => lengthMeters,
  getPointAt: u => new THREE.Vector3(radius * Math.cos(u * Math.PI * 2), .3,
    radius * Math.sin(u * Math.PI * 2)),
  getTangentAt: u => new THREE.Vector3(-Math.sin(u * Math.PI * 2), 0,
    Math.cos(u * Math.PI * 2)),
};
const mesh = new THREE.Group();
const controller = createRaceController(THREE, curve, mesh, { startU: .2, laneOffset: -2.72 });
controller.start();
controller.update(.05);
const logicalProgress = controller.stats.progress;
const logicalDistance = controller.stats.distanceMeters;
const logicalSpeed = controller.stats.speedKmh;
const logicalPosition = mesh.position.clone();
controller.placeVisual(trackGap.behind(logicalProgress, 4), 2.55);
assert.equal(controller.stats.progress, logicalProgress);
assert.equal(controller.stats.distanceMeters, logicalDistance);
assert.equal(controller.stats.speedKmh, logicalSpeed);
assert.ok(mesh.position.distanceTo(logicalPosition) > 4, 'The 3D pose was actually moved');
controller.placeVisual(trackGap.behind(logicalProgress, 4), -4.3);
assert.equal(controller.stats.lateralOffset, -4.3,
  'The controller must render the full inside road lane selected by the block solver');
controller.placeReplay(logicalProgress, logicalDistance, logicalSpeed, -4.3,
  trackGap.behind(logicalProgress, 4));
assert.equal(controller.stats.lateralOffset, -4.3,
  'Replay placement must use the same visible lateral offset');
assert.equal(controller.stats.progress, logicalProgress,
  'A corrected replay pose retains its source progress');
controller.stop();

// In free simulation, pit starters join a moving 22-car grid. Check the
// same per-frame rate limits used by main.js through a complete merge.
const freePrevious = new Map();
for (let tick = 0; tick < 800; tick++) {
  const time = tick * .05;
  const leader = 200 + time * 75;
  const traffic = Array.from({ length: 20 }, (_, index) => ({
    number: index + 1, gridPosition: index + 1, priority: -(index + 1),
    u: wrap(leader - index * 9.05) / lengthMeters,
    offset: -2.4 + Math.min(1, Math.max(0, (leader - index * 9.05) / 120)) * 2.4,
  }));
  traffic.push({ number: 21, gridPosition: 21, priority: -21,
    u: wrap(leader - 80 + time * 12) / lengthMeters,
    offset: 17 - Math.min(1, Math.max(0, (time - 7) / 8)) * 17 });
  traffic.push({ number: 22, gridPosition: 22, priority: -22,
    u: wrap(leader - 91 + time * 10) / lengthMeters,
    offset: 17 - Math.min(1, Math.max(0, (time - 8) / 9)) * 17 });
  const poses = resolveEntitySpacing(traffic, trackGap, freePrevious,
    { lateralStep: .18, releaseStep: .35 });
  assertClear(poses, `Free race at ${time.toFixed(2)}s`);
  for (const [number, pose] of poses) freePrevious.set(number, pose);
}

const previous = new Map([[2, { offset: 0, shiftMeters: 6 }]]);
const eased = resolveEntitySpacing([
  { number: 1, priority: 2, u: 100 / lengthMeters, offset: 0 },
  { number: 2, priority: 1, u: 100 / lengthMeters, offset: 0 },
], trackGap, previous, { lateralStep: .12, releaseStep: .3 });
assertClear(eased, 'Eased response');
assert.ok(Math.abs(eased.get(2).offset) <= .12 + 1e-5, 'Lateral correction has a bounded step');
assert.ok(eased.get(2).shiftMeters >= 5.7, 'Longitudinal release has a bounded step');

let checked = 0;
let worldChecked = 0;
for (let second = 0; second <= replay.durationSec; second += 15) {
  const frame = replay.frame(second);
  const cars = frame.cars.filter(car =>
    !(car.ended && second > data.drivers[car.number].finishSec + 1))
    .map(car => ({ ...car, progressMeters: replayVisualDistance(car.progressMeters, data.session, 53) }));
  const placements = computeReplayPlacements(cars, 0, trackGap, lengthMeters);
  const entities = cars.map(car => {
    const placement = placements.get(car.number);
    return {
      number: car.number, gridPosition: car.gridPosition,
      priority: car.progressMeters, u: placement.u,
      offset: replayPitOffset(car, second, data.session, data.drivers[car.number].pit, placement.offset),
    };
  });
  const poses = resolveEntitySpacing(entities, trackGap);
  assertClear(poses, `Replay at ${second}s`);
  const worldPlacements = computeReplayPlacements(cars, realGridU, realGap, lengthMeters);
  const worldEntities = cars.map(car => ({
    number: car.number, gridPosition: car.gridPosition, priority: car.progressMeters,
    u: worldPlacements.get(car.number).u,
    offset: replayPitOffset(car, second, data.session, data.drivers[car.number].pit,
      worldPlacements.get(car.number).offset),
  }));
  const worldPoses = [...resolveEntitySpacing(worldEntities, realGap)].map(([number, pose]) =>
    [number, footprint(pose)]);
  for (let i = 0; i < worldPoses.length; i++) {
    for (let j = i + 1; j < worldPoses.length; j++) {
      assert.ok(!footprintsOverlap(worldPoses[i][1], worldPoses[j][1]),
        `3D footprints overlap at ${second}s: #${worldPoses[i][0]} and #${worldPoses[j][0]}`);
    }
  }
  worldChecked++;
  if (second === 0) {
    for (const entity of entities) {
      const resolved = poses.get(entity.number);
      assert.equal(resolved.shiftMeters, 0, `Car #${entity.number} retains its grid slot`);
      assert.equal(resolved.offset, entity.offset, `Car #${entity.number} retains its grid lane`);
    }
  }
  checked++;
}
const lateralHistory = new Map();
const entityHistory = new Map();
let movingFrames = 0;
const continuousStep = .5;
let largestVisualHoldback = 0;
let largestHoldbackAt = null;
let largestAddedHoldback = 0;
let largestAddedAt = null;
for (let second = 0; second <= replay.durationSec; second += continuousStep) {
  const cars = replay.frame(second).cars.filter(car =>
    !(car.ended && second > data.drivers[car.number].finishSec + 1))
    .map(car => ({ ...car, progressMeters: replayVisualDistance(car.progressMeters, data.session, 53) }));
  const placements = computeReplayPlacements(cars, 0, trackGap, lengthMeters);
  const entities = cars.map(car => {
    const placement = placements.get(car.number);
    let offset = replayPitOffset(car, second, data.session, data.drivers[car.number].pit, placement.offset);
    const preceding = lateralHistory.get(car.number);
    if (preceding !== undefined) {
      offset = rateLimitReplayOffset(preceding, offset, continuousStep,
        offset > 3 || preceding > 3 ? 1.2 : .65);
    }
    lateralHistory.set(car.number, offset);
    return { number: car.number, gridPosition: car.gridPosition, priority: car.progressMeters,
      u: placement.u, offset };
  });
  const poses = resolveEntitySpacing(entities, trackGap, entityHistory,
    { lateralStep: Math.min(2, continuousStep * 2.5),
      releaseStep: Math.min(1.5, continuousStep * 5) });
  assertClear(poses, `Continuous replay at ${second}s`);
  for (const [number, pose] of poses) {
    const previousPose = entityHistory.get(number);
    const addedHoldback = pose.shiftMeters - (previousPose?.shiftMeters ?? 0);
    if (addedHoldback > largestAddedHoldback) {
      largestAddedHoldback = addedHoldback;
      largestAddedAt = `${second}s, #${number}`;
    }
    entityHistory.set(number, pose);
    if (pose.shiftMeters > largestVisualHoldback) {
      largestVisualHoldback = pose.shiftMeters;
      largestHoldbackAt = `${second}s, #${number}`;
    }
  }
  movingFrames++;
}
console.log(`Entity blocks clear across ${checked} sampled historical frames (${worldChecked} verified with 3D footprints), ${movingFrames} continuous historical frames, 800 free-simulation frames, grid, pit lane and start/finish seam. Largest visual holdback: ${largestVisualHoldback.toFixed(2)} m (${largestHoldbackAt}); largest half-second addition: ${largestAddedHoldback.toFixed(2)} m (${largestAddedAt}).`);
