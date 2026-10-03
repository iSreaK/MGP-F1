import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { TRACK_LENGTH_METERS, TRACK_POINTS, LANDMARKS } from '../dist/monza/track-data.js';
import { trackElevationAt } from '../dist/monza/terrain-profile.js';
import { createTrackGapLookup } from '../dist/monza/track-gap.js';
import { carCatalog } from '../dist/car-catalog.js';
import {
  addMonzaGridDetails,
  MONZA_FINISH_BEFORE_START_METERS,
  GRID_SLOT_SPACING,
  GRID_LANE_CENTER,
  PIT_START_LANE_CENTER,
} from '../dist/monza/grid-details.js';

const centerline = TRACK_POINTS.slice(0, -1);
const travelled = [0];
for (let i = 1; i < centerline.length; i++) {
  travelled.push(travelled[i - 1] + Math.hypot(
    centerline[i][0] - centerline[i - 1][0],
    centerline[i][1] - centerline[i - 1][1],
  ));
}
const polylineLength = travelled.at(-1) + Math.hypot(
  centerline[0][0] - centerline.at(-1)[0],
  centerline[0][1] - centerline.at(-1)[1],
);
const points = centerline.map(([x, z], i) =>
  new THREE.Vector3(x, .30 + trackElevationAt(travelled[i] / polylineLength), z));
const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', .27);
const gap = createTrackGapLookup(curve);
const scene = new THREE.Scene();
const { group, gridU, gridPoint, gridTangent } = addMonzaGridDetails(
  THREE, scene, curve, points, LANDMARKS, .30,
);

const distanceAhead = (from, to) =>
  ((gap.metresAt(to) - gap.metresAt(from)) % gap.lengthMeters + gap.lengthMeters) % gap.lengthMeters;
const controlU = travelled[LANDMARKS.gridIndex] / polylineLength;
assert.ok(Math.abs(polylineLength - TRACK_LENGTH_METERS) < .01);
assert.ok(Math.abs(gap.lengthMeters - TRACK_LENGTH_METERS) < 3);
assert.ok(Math.abs(distanceAhead(controlU, gridU) - MONZA_FINISH_BEFORE_START_METERS) < .02,
  'La grille doit être 309 m après la ligne de contrôle, sur le tracé 3D');
assert.ok(gridPoint.distanceTo(curve.getPointAt(gridU)) < .001);
assert.ok(gridTangent.dot(curve.getTangentAt(gridU).setY(0).normalize()) > .999);

function centroid(mesh) {
  assert.ok(mesh, 'Marquage de piste manquant');
  const position = mesh.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.x += position.getX(i);
    point.y += position.getY(i);
    point.z += position.getZ(i);
  }
  return point.divideScalar(position.count);
}

const controlPoint = curve.getPointAt(controlU);
const finishStripe = group.getObjectByName('Chequered control finish line');
const startStripe = group.getObjectByName('Separate white race start line');
assert.ok(centroid(finishStripe).distanceTo(controlPoint) < 2,
  'Le damier doit se trouver sur le point de contrôle du tracé');
assert.ok(centroid(startStripe).distanceTo(gridPoint) < 1,
  'La ligne de départ doit traverser le point de grille');

// Compare each painted front line to its three-dimensional slot position.
// The first car is parked 3.4 m behind its front line.
const gridMarks = group.getObjectByName('Twenty two staggered FIA grid boxes');
const paintedVertices = gridMarks.geometry.getAttribute('position');
for (let position = 1; position <= 22; position++) {
  const frontStation = -10.7 - (position - 1) * GRID_SLOT_SPACING;
  const frontU = gap.behind(gridU, -frontStation);
  const forward = curve.getTangentAt(frontU).setY(0).normalize();
  const across = new THREE.Vector3(forward.z, 0, -forward.x);
  const lane = position % 2 ? -GRID_LANE_CENTER : GRID_LANE_CENTER;
  const expected = curve.getPointAt(frontU).addScaledVector(across, lane);
  const painted = new THREE.Vector3();
  for (let corner = 0; corner < 4; corner++) {
    const vertex = (position - 1) * 20 + corner;
    painted.add(new THREE.Vector3(
      paintedVertices.getX(vertex),
      paintedVertices.getY(vertex),
      paintedVertices.getZ(vertex),
    ));
  }
  painted.divideScalar(4);
  assert.ok(painted.distanceTo(expected) < .15, `Marquage de la case ${position}`);
}

// Check the pit starters against the actual mesh edges, catching a shift of
// the grid without its adjacent road or a lane on the racing surface.
const pitRoad = group.getObjectByName('Pit lane aligned with the curved Monza straight');
const pitVertices = pitRoad.geometry.getAttribute('position');
for (const entry of carCatalog.filter(car => car.pitLaneStart)) {
  const station = entry.pitStartOffsetMeters;
  const section = Math.floor((station + 452) / 4);
  const blend = (station - (-452 + section * 4)) / 4;
  const point = vertex => new THREE.Vector3(
    pitVertices.getX(vertex), pitVertices.getY(vertex), pitVertices.getZ(vertex),
  );
  const inner = point(section * 4).lerp(point(section * 4 + 2), blend);
  const outer = point(section * 4 + 1).lerp(point(section * 4 + 3), blend);
  const u = gap.behind(gridU, -station);
  const forward = curve.getTangentAt(u).setY(0).normalize();
  const across = new THREE.Vector3(forward.z, 0, -forward.x);
  const car = curve.getPointAt(u).addScaledVector(across, PIT_START_LANE_CENTER);
  const road = outer.clone().sub(inner);
  const laneFraction = car.clone().sub(inner).dot(road) / road.lengthSq();
  const nearestRoadPoint = inner.addScaledVector(road, laneFraction);
  assert.ok(laneFraction > .1 && laneFraction < .9 && car.distanceTo(nearestRoadPoint) < .5,
    `Voiture ${entry.number} sur la voie des stands`);
}

// Fixed turn geometry must remain anchored to the SVG/FIA centreline. From
// the actual standing start, the first chicane is now roughly 565 m away.
const turnOneU = travelled[LANDMARKS.turns.T1.index] / polylineLength;
assert.ok(Math.abs(distanceAhead(gridU, turnOneU) - 565) < 15);

console.log('Monza : départ +309 m, damier, 22 cases et premier virage alignés.');
