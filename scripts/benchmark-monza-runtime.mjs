// Local CPU benchmark for the 22-car replay pipeline; excludes WebGL and DOM.
// Run: node scripts/benchmark-monza-runtime.mjs
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS } from '../dist/monza/track-data.js';
import { trackElevationAt } from '../dist/monza/terrain-profile.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { createRaceController } from '../dist/monza/race-motion.js';
import { createHistoricalReplay } from '../dist/monza/historical-replay.js';
import { replayVisualDistance, replayPitOffset, computeReplayPlacements } from '../dist/monza/replay-lanes.js';
import { resolveEntitySpacing } from '../dist/monza/entity-spacing.js';

const data = JSON.parse(readFileSync(new URL('../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const replay = createHistoricalReplay(data);
const centerline = TRACK_POINTS.slice(0, -1);
const distances = [0];
for (let index = 1; index < centerline.length; index++) {
  distances.push(distances.at(-1) + Math.hypot(
    centerline[index][0] - centerline[index - 1][0],
    centerline[index][1] - centerline[index - 1][1]));
}
const first = centerline[0];
const last = centerline.at(-1);
const length = distances.at(-1) + Math.hypot(first[0] - last[0], first[1] - last[1]);
const curve = new THREE.CatmullRomCurve3(centerline.map(([x, z], index) =>
  new THREE.Vector3(x, .3 + trackElevationAt(distances[index] / length), z)), true, 'centripetal', .27);
const trackGap = createTrackGapLookup(curve);
const start = performance.now();
const controllers = Object.fromEntries(replay.drivers.map(driver => [driver.number,
  createRaceController(THREE, curve, new THREE.Group(), {
    startU: 0,
    trackHeightAt: u => curve.getPointAt(u).y,
  })]));
const controllerBuildMs = performance.now() - start;
const previous = new Map();
const samples = { frame: [], placement: [], spacing: [], pose: [] };
for (let index = 0; index < 1100; index++) {
  const time = index * 1.04;
  let at = performance.now();
  const frame = replay.frame(time);
  let next = performance.now();
  if (index >= 100) samples.frame.push(next - at);
  const cars = frame.cars.map(car => ({
    ...car, progressMeters: replayVisualDistance(car.progressMeters, data.session, 53),
  }));
  at = next;
  const placements = computeReplayPlacements(cars, 0, trackGap, replay.trackLengthMeters);
  next = performance.now();
  if (index >= 100) samples.placement.push(next - at);
  at = next;
  const entities = resolveEntitySpacing(cars.map(car => ({
    number: car.number, gridPosition: car.gridPosition, priority: car.progressMeters,
    ...placements.get(car.number),
    offset: replayPitOffset(car, time, data.session, data.drivers[car.number]?.pit,
      placements.get(car.number).offset),
  })), trackGap, previous, { lateralStep: 2, releaseStep: 1.5 });
  next = performance.now();
  if (index >= 100) samples.spacing.push(next - at);
  at = next;
  for (const car of frame.cars) {
    const pose = entities.get(car.number);
    const place = placements.get(car.number);
    controllers[car.number].placeReplay(place.u, car.progressMeters, car.speedKph,
      pose?.offset ?? place.offset, pose?.u ?? place.u);
    if (pose) previous.set(car.number, pose);
  }
  next = performance.now();
  if (index >= 100) samples.pose.push(next - at);
}
function report(values) {
  const ordered = values.toSorted((a, b) => a - b);
  return {
    meanMs: +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3),
    p95Ms: +ordered[Math.floor(values.length * .95)].toFixed(3),
    maxMs: +ordered.at(-1).toFixed(3),
  };
}
console.log(JSON.stringify({ controllerBuildMs: +controllerBuildMs.toFixed(1),
  replay: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, report(values)])) }, null, 2));
