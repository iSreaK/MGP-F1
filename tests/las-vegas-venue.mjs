import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS } from '../dist/las-vegas/track-data.js';
import { prepareVegasCurve } from '../dist/las-vegas/geometry-smoothing.js';
import { addVegasVenueDetails, VEGAS_GRANDSTANDS, vegasTierOffset } from
  '../dist/las-vegas/venue-details.js';

const { curve } = prepareVegasCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
const frames = Array.from({ length: 1860 }, (_, i) => {
  const u = i / 1860;
  const point = curve.getPointAt(u);
  const forward = curve.getTangentAt(u).setY(0).normalize();
  return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
});
const frameAt = station => frames[Math.floor((((station % TRACK_LENGTH_METERS) +
  TRACK_LENGTH_METERS) % TRACK_LENGTH_METERS) / TRACK_LENGTH_METERS * frames.length)
  % frames.length];
const nearRoad = (x, z) => {
  let minimum = Infinity;
  for (const frame of frames) {
    const d2 = (x - frame.point.x) ** 2 + (z - frame.point.z) ** 2;
    if (d2 < minimum) minimum = d2;
  }
  return Math.sqrt(minimum);
};
const site = (station, side, setback, radius) => {
  const frame = frameAt(station);
  for (let distance = setback; distance < setback + 240; distance += 18) {
    const point = frame.point.clone().addScaledVector(frame.across, side * distance);
    if (nearRoad(point.x, point.z) > radius + 27) {
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(frame.across, new THREE.Vector3(0, 1, 0),
          frame.forward));
      return { point, frame, quaternion, distance };
    }
  }
  return null;
};

test('all official fan zones have a supported stand facing the circuit', () => {
  const group = new THREE.Group();
  const result = addVegasVenueDetails(THREE, group, frames, frameAt, nearRoad, site);
  assert.equal(result.grandstands.length, VEGAS_GRANDSTANDS.length,
    result.grandstands.map(stand => stand.name).join(", "));
  assert.ok(result.palmCount >= 80);
  assert.ok(result.storeCount >= 16);
  assert.ok(result.highRoller);
  for (const stand of result.grandstands) {
    const near = stand.anchor.point.clone().addScaledVector(
      frameAt(stand.station).across, vegasTierOffset(stand.side, 0, stand.rows, stand.depth));
    const far = stand.anchor.point.clone().addScaledVector(
      frameAt(stand.station).across,
      vegasTierOffset(stand.side, stand.rows - 1, stand.rows, stand.depth));
    assert.ok(nearRoad(near.x, near.z) < nearRoad(far.x, far.z),
      stand.name + ' front row faces away from the circuit');
    for (const x of [-stand.depth / 2, 0, stand.depth / 2]) {
      for (const z of [-stand.length / 2, 0, stand.length / 2]) {
        const q = stand.anchor.point.clone()
          .addScaledVector(frameAt(stand.station).across, x)
          .addScaledVector(frameAt(stand.station).forward, z);
        assert.ok(nearRoad(q.x, q.z) > 20,
          stand.name + ' overlaps the street course');
      }
    }
  }
});
