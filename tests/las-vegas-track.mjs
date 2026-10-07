import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_LENGTH_METERS, TRACK_POINTS, LANDMARKS } from '../dist/las-vegas/track-data.js';
import { prepareVegasCurve } from '../dist/las-vegas/geometry-smoothing.js';
import { GRID_SLOT_SPACING, VEGAS_FINISH_BEFORE_START_METERS } from '../dist/las-vegas/grid-details.js';
import { VEGAS_2025_ROSTER, VEGAS_2025_DISPLAYED } from '../dist/las-vegas/replay-roster.js';
import { FREE_SPEED_PROFILE_KMH } from '../dist/las-vegas/free-speed-profile.js';

const points = TRACK_POINTS.slice(0, -1);
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

test('FIA loop closes without a self crossing and retains all 17 turns', () => {
  assert.equal(points.length, 1242);
  assert.deepEqual(TRACK_POINTS.at(-1), TRACK_POINTS[0]);
  assert.equal(Object.keys(LANDMARKS.turns).length, 17);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) > .5,
      `Duplicate or pinched road station ${i}`);
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      assert.ok(!(cross(a, b, c) * cross(a, b, d) < 0
        && cross(c, d, a) * cross(c, d, b) < 0),
      `Road centreline crosses itself at segments ${i} and ${j}`);
    }
  }
});

test('the long FIA straights are straight in the exported geometry', () => {
  for (const [name, from, to] of [
    ['Plaza', 1221, 1241], ['Koval', 179, 282], ['Sands', 470, 507],
    ['Strip', 849, 1007], ['Harmon', 1083, 1170],
  ]) {
    const a = points[from], b = points[to];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = from; i <= to; i++) {
      assert.ok(Math.abs(cross(a, b, points[i])) / length < .02,
        `${name} has a visible lateral wave at point ${i}`);
    }
  }
});

test('rendered circuit length and separate start/control lines match race facts', () => {
  const { curve } = prepareVegasCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
  assert.ok(Math.abs(curve.getLength() - 6201) < .05);
  assert.equal(VEGAS_FINISH_BEFORE_START_METERS, 92);
  let sourceStartGap = 0;
  for (let i = 0; i < LANDMARKS.gridIndex; i++) {
    sourceStartGap += Math.hypot(points[i + 1][0] - points[i][0],
      points[i + 1][1] - points[i][1]);
  }
  assert.ok(Math.abs(sourceStartGap - 92) < 5,
    'The FIA-drawn standing start and control markers drift apart');
});

test('2025 replay grid has one pit starter, two post-race DSQs and 19 3D models', () => {
  assert.equal(VEGAS_2025_ROSTER.length, 20);
  assert.equal(VEGAS_2025_DISPLAYED.length, 19);
  assert.deepEqual(VEGAS_2025_ROSTER.filter(car => car.pitLaneStart)
    .map(car => car.replayNumber), [22]);
  assert.deepEqual(VEGAS_2025_ROSTER.filter(car => car.classification === 'DSQ')
    .map(car => car.replayNumber), [4, 81]);
  assert.deepEqual(VEGAS_2025_ROSTER.filter(car => !car.pitLaneStart)
    .map(car => car.gridPosition).sort((a, b) => a - b),
  Array.from({ length: 19 }, (_, i) => i + 1));
  assert.ok(GRID_SLOT_SPACING >= 8 && GRID_SLOT_SPACING <= 9);
});

test('free-race speed profile comes from Las Vegas race telemetry', () => {
  assert.ok(FREE_SPEED_PROFILE_KMH.length > 1000);
  assert.ok(Math.min(...FREE_SPEED_PROFILE_KMH) < 120);
  assert.ok(Math.max(...FREE_SPEED_PROFILE_KMH) > 325);
  assert.ok(FREE_SPEED_PROFILE_KMH.every(speed => speed >= 50 && speed <= 365));
});
