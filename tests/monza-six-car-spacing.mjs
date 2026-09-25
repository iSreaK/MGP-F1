// Run: node --experimental-default-type=module tests/monza-six-car-spacing.mjs
// Keep all six staggered cars clear of one another across the entire Monza lap.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, LANDMARKS } from '../dist/monza/track-data.js';
import { trackElevationAt } from '../dist/monza/terrain-profile.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING } from '../dist/monza/grid-details.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { createRaceController } from '../dist/monza/race-motion.js';

const centerline = TRACK_POINTS.slice(0, -1);
const cumulative = [0];
for (let i = 1; i < centerline.length; i++) {
  const [ax, az] = centerline[i - 1];
  const [bx, bz] = centerline[i];
  cumulative.push(cumulative.at(-1) + Math.hypot(bx - ax, bz - az));
}
const [firstX, firstZ] = centerline[0];
const [lastX, lastZ] = centerline.at(-1);
const perimeter = cumulative.at(-1) + Math.hypot(firstX - lastX, firstZ - lastZ);
const curve = new THREE.CatmullRomCurve3(centerline.map(([x, z], i) =>
  new THREE.Vector3(x, .30 + trackElevationAt(cumulative[i] / perimeter), z)),
  true, 'centripetal', .27);
const lookup = createTrackGapLookup(curve);

let minimum = Infinity;
for (let i = 0; i < 1024; i++) {
  const leaderU = i / 1024;
  const positions = [0, 1, 2, 3, 4, 5].map(slot =>
    curve.getPointAt(lookup.behind(leaderU, slot * GRID_SLOT_SPACING)));
  for (let slot = 0; slot < 5; slot++) {
    minimum = Math.min(minimum, positions[slot].distanceTo(positions[slot + 1]));
  }
}
assert.ok(minimum > 7, `Adjacent cars close to ${minimum.toFixed(2)} m`);
console.log(`Six-car minimum adjacent center distance: ${minimum.toFixed(2)} m`);

// The centre of each car must fall inside its painted staggered box on the
// actual curved straight; parameter offsets alone would drift across it.
const gridIndex = LANDMARKS.gridIndex ?? 0;
const gridU = cumulative[gridIndex] / perimeter;
const poleU = lookup.behind(gridU, 14.1);
let largestGridOffset = 0;
for (let slot = 0; slot < 6; slot++) {
  const station = -10.7 - slot * GRID_SLOT_SPACING;
  const markCenterU = lookup.behind(gridU, -(station - 3.4));
  const markCenter = curve.getPointAt(markCenterU);
  const laneCenter = slot % 2 === 0 ? -GRID_LANE_CENTER : GRID_LANE_CENTER;
  const tangent = curve.getTangentAt(markCenterU).setY(0).normalize();
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
  const boxCenter = markCenter.clone().addScaledVector(side, laneCenter);
  const startU = lookup.behind(poleU, slot * GRID_SLOT_SPACING);
  const car = new THREE.Group();
  createRaceController(THREE, curve, car, { startU, laneOffset: laneCenter });
  const gridOffset = Math.hypot(boxCenter.x - car.position.x, boxCenter.z - car.position.z);
  largestGridOffset = Math.max(largestGridOffset, gridOffset);
  console.log(`Slot ${slot + 1}: centre offset ${gridOffset.toFixed(2)} m`);
  assert.ok(gridOffset < .05, `Car ${slot + 1} misses its painted grid box by ${gridOffset.toFixed(2)} m`);
}
console.log(`Maximum grid-box centre offset: ${largestGridOffset.toFixed(2)} m`);
