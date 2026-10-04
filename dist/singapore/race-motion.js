import { TRACK_POINTS, TRACK_LENGTH_METERS, LANDMARKS } from './track-data.js';

// Lateral path is a modest outside/apex/outside reconstruction derived from
// the FIA corner positions. OpenF1 does not supply surveyed racing-line offsets.
// Positive lateral values are to the driver's left. The replay's longitudinal
// motion and speed come from historical data, not these free-drive estimates.
const CIRCUIT_METERS = TRACK_LENGTH_METERS;
const wrap01 = value => value >= 0 && value < 1 ? value : ((value % 1) + 1) % 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = value => value * value * (3 - 2 * value);
const gaussian = (distance, spread) => Math.exp(-.5 * (distance / spread) ** 2);
const cyclicDelta = (a, b) => {
  let difference = a - b;
  if (difference > CIRCUIT_METERS / 2) difference -= CIRCUIT_METERS;
  if (difference < -CIRCUIT_METERS / 2) difference += CIRCUIT_METERS;
  return difference;
};

const CORNERS = Object.entries(LANDMARKS.turns).map(([id, corner]) => {
  const index = corner.index;
  const n = TRACK_POINTS.length - 1;
  const a = TRACK_POINTS[(index - 6 + n) % n];
  const b = TRACK_POINTS[index];
  const c = TRACK_POINTS[(index + 6) % n];
  const before = [b[0] - a[0], b[1] - a[1]];
  const after = [c[0] - b[0], c[1] - b[1]];
  const cross = before[0] * after[1] - before[1] * after[0];
  const right = cross < 0 ? 1 : -1;
  const angle = Math.atan2(Math.abs(cross), before[0] * after[0] + before[1] * after[1]);
  const span = (Math.hypot(...before) + Math.hypot(...after)) * .5;
  const radius = clamp(span / Math.max(.025, angle), 9, 280);
  // Illustrative cap for the optional free simulation. Historical replay uses
  // the measured speed channel and the same FIA-derived path stationing.
  const speedKmh = clamp(Math.sqrt(3.5 * 9.81 * radius) * 3.6, 58, 240);
  return { id, distance: corner.distanceMeters, right, speedKmh };
}).sort((a, b) => a.distance - b.distance);

const SECTIONS = [[0, 'Ligne droite des stands'],
  ...CORNERS.map(corner => [corner.distance, `Virage ${corner.id.slice(1)}`])];
const CORNER_CAPS = CORNERS.map(corner => [corner.distance, corner.speedKmh, 23]);

function lateralOffset(u) {
  const distance = wrap01(u) * CIRCUIT_METERS;
  let offset = 0;
  for (const corner of CORNERS) {
    const delta = cyclicDelta(distance, corner.distance);
    offset += corner.right * (
      1.55 * gaussian(delta, 20)
      - 1.05 * gaussian(delta + 48, 27)
      - .84 * gaussian(delta - 43, 29));
  }
  return clamp(offset, -2.15, 2.15);
}

export const racingLineOffset = lateralOffset;

function sectionAt(u) {
  const distance = wrap01(u) * CIRCUIT_METERS;
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    if (distance >= SECTIONS[i][0]) return SECTIONS[i][1];
  }
  return SECTIONS[0][1];
}

import { WHEEL_GEOMETRY } from '../monza/wheel-spin.js';

/**
 * createRaceController(THREE, curve, car, { startU, laneOffset, trackHeightAt,
 *   maxSpeedKmh, minCornerSpeedKmh, lateralG, acceleration, braking, onLap })
 *
 * start(), stop(), reset([u]), update(dtSeconds) retain the previous API.
 * stats.sectionName identifies the current part of the lap for the HUD.
 */
export function createRaceController(THREE, curve, car, options = {}) {
  if (!THREE?.Vector3 || !curve?.getPointAt || !curve?.getTangentAt || !car?.position) {
    throw new TypeError('THREE, une courbe fermée et un modèle 3D sont nécessaires.');
  }

  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const length = curve.getLength();
  if (!(length > 100)) throw new RangeError('La courbe doit être exprimée en mètres.');

  const maxSpeed = clamp(finite(options.maxSpeedKmh, 320), 90, 400) / 3.6;
  const minCornerSpeed = clamp(finite(options.minCornerSpeedKmh, 55), 35, 160) / 3.6;
  const lateralAcceleration = clamp(finite(options.lateralG, 4), 1.5, 6) * 9.81;
  const acceleration = clamp(finite(options.acceleration, 11), 1, 25);
  const braking = clamp(finite(options.braking, 23), 2, 45);
  const laneOffset = clamp(finite(options.laneOffset, 0), -19, 3);
  const pitLaneStart = !!options.pitLaneStart;
  const trackHeightAt = typeof options.trackHeightAt === 'function'
    ? options.trackHeightAt
    : u => curve.getPointAt(wrap01(u)).y;
  const startU = wrap01(finite(options.startU, 0));
  const onLap = typeof options.onLap === 'function' ? options.onLap : null;
  let wetGrip = 1;

  const side = new THREE.Vector3();
  function pointOnLine(u, target = new THREE.Vector3(), offset = lateralOffset(u)) {
    u = wrap01(u);
    const point = curve.getPointAt(u);
    const trackTangent = curve.getTangentAt(u).setY(0).normalize();
    side.set(trackTangent.z, 0, -trackTangent.x);
    return target.copy(point).addScaledVector(side, offset);
  }

  const directionBefore = new THREE.Vector3();
  const directionAfter = new THREE.Vector3();
  const directionStep = 2.2 / length;
  function directionOnLine(u, target, offset = null) {
    pointOnLine(u - directionStep, directionBefore, offset ?? lateralOffset(u - directionStep));
    pointOnLine(u + directionStep, directionAfter, offset ?? lateralOffset(u + directionStep));
    return target.subVectors(directionAfter, directionBefore).setY(0).normalize();
  }

  // Six-metre samples retain the tight chicanes. The speed calculation and
  // the car's heading both use this same driven line.
  const count = clamp(Math.ceil(length / 6), 400, 1500);
  const spacing = length / count;
  const headingSpan = clamp(spacing * 2.5, 12, 19);
  const rawCurvature = new Float32Array(count);
  const limit = new Float32Array(count);
  const speedProfile = new Float32Array(count);
  const segmentMetres = new Float32Array(count);
  const pointBefore = new THREE.Vector3();
  const pointHere = new THREE.Vector3();
  const pointAfter = new THREE.Vector3();
  const inVec = new THREE.Vector3();
  const outVec = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const u = i / count;
    pointOnLine(u - headingSpan / length, pointBefore);
    pointOnLine(u, pointHere);
    pointOnLine(u + headingSpan / length, pointAfter);
    inVec.subVectors(pointHere, pointBefore).setY(0).normalize();
    outVec.subVectors(pointAfter, pointHere).setY(0).normalize();
    const cross = inVec.x * outVec.z - inVec.z * outVec.x;
    const angle = Math.atan2(cross, clamp(inVec.dot(outVec), -1, 1));
    const meanSpan = (pointBefore.distanceTo(pointHere) + pointHere.distanceTo(pointAfter)) * .5;
    rawCurvature[i] = Math.abs(angle) / Math.max(meanSpan, 1);
    pointOnLine((i + 1) / count, pointAfter);
    segmentMetres[i] = Math.max(1, pointHere.distanceTo(pointAfter));
  }

  // Smooth within approximately 25 m without merging the S-corner apexes.
  for (let i = 0; i < count; i++) {
    let curvature = 0;
    for (let j = -2; j <= 2; j++) {
      const weight = j === 0 ? 3 : Math.abs(j) === 1 ? 2 : 1;
      curvature += rawCurvature[(i + j + count) % count] * weight;
    }
    curvature /= 9;
    limit[i] = clamp(Math.sqrt(lateralAcceleration / Math.max(curvature, 0.0002)), minCornerSpeed, maxSpeed);
    const metres = i / count * CIRCUIT_METERS;
    for (const [apex, speedKmh, spread] of CORNER_CAPS) {
      const distance = Math.abs(metres - apex);
      if (distance >= spread * 3) continue;
      const influence = Math.exp(-.5 * (distance / spread) ** 2);
      const ceiling = maxSpeed - (maxSpeed - speedKmh / 3.6) * influence;
      limit[i] = Math.min(limit[i], ceiling);
    }
    speedProfile[i] = limit[i];
  }

  // Backward braking and forward acceleration passes across the closed lap.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = count - 1; i >= 0; i--) {
      const next = (i + 1) % count;
      speedProfile[i] = Math.min(speedProfile[i], Math.sqrt(speedProfile[next] ** 2 + 2 * braking * segmentMetres[i]));
    }
    for (let i = 0; i < count; i++) {
      const previous = (i - 1 + count) % count;
      const previousSpeed = speedProfile[previous];
      const availableAcceleration = Math.max(2.8, acceleration * (1 - .72 * (previousSpeed / maxSpeed) ** 2));
      speedProfile[i] = Math.min(speedProfile[i], Math.sqrt(previousSpeed ** 2 + 2 * availableAcceleration * segmentMetres[previous]));
    }
  }

  const tangent = new THREE.Vector3();
  const stats = {
    running: false,
    progress: startU,
    u: startU,
    laps: 0,
    lap: 0,
    speedKmh: 0,
    targetSpeedKmh: 0,
    lapTime: 0,
    lastLapTime: null,
    distanceMeters: 0,
    trackLengthMeters: length,
    sectionName: sectionAt(startU),
    lateralOffset: laneOffset,
    position: car.position,
    tangent,
  };
  function interpolated(profile, u) {
    const sample = wrap01(u) * count;
    const index = Math.floor(sample);
    const blend = sample - index;
    return profile[index] * (1 - blend) + profile[(index + 1) % count] * blend;
  }

  function placeCar(replayOffset = null, visualU = stats.progress) {
    const raceOffset = lateralOffset(visualU);
    const gridBlend = pitLaneStart
      ? 1 - smoothstep(clamp((stats.distanceMeters - 130) / 180, 0, 1))
      : 1 - smoothstep(clamp(stats.distanceMeters / 120, 0, 1));
    const offset = replayOffset === null
      ? raceOffset + (laneOffset - raceOffset) * gridBlend
      : clamp(replayOffset, -19, 4.7);
    pointOnLine(visualU, car.position, offset);
    directionOnLine(visualU, tangent, replayOffset === null ? null : offset);
    const yaw = Math.atan2(tangent.z, -tangent.x);
    const { frontX, rearX, frontZ, rearZ, centerY, radius } = WHEEL_GEOMETRY;
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const heightUnderWheel = (wheelX, wheelZ, pitch) => {
      // R_y(yaw) * R_z(pitch) matches the car's Euler rotation below.
      const localX = wheelX * Math.cos(pitch) - centerY * Math.sin(pitch);
      const x = car.position.x + localX * cosYaw + wheelZ * sinYaw;
      const z = car.position.z - localX * sinYaw + wheelZ * cosYaw;
      return trackHeightAt(visualU, x, z);
    };
    const axleHeights = pitch => ({
      front: (heightUnderWheel(frontX, -frontZ, pitch) + heightUnderWheel(frontX, frontZ, pitch)) * .5,
      rear: (heightUnderWheel(rearX, -rearZ, pitch) + heightUnderWheel(rearX, rearZ, pitch)) * .5,
    });
    let pitch = 0;
    for (let i = 0; i < 2; i++) {
      const { front, rear } = axleHeights(pitch);
      pitch = Math.asin(clamp((rear - front) / (rearX - frontX), -.9, .9));
    }
    const { front: frontHeight, rear: rearHeight } = axleHeights(pitch);
    // A circular tyre's bottom is centre minus radius even when pitched.
    // Fit both axles to the rendered road, then average their origin heights
    // to absorb the tiny residual from longitudinal road curvature.
    const wheelBottomAtOrigin = centerY * Math.cos(pitch) - radius;
    const frontOrigin = frontHeight - frontX * Math.sin(pitch) - wheelBottomAtOrigin;
    const rearOrigin = rearHeight - rearX * Math.sin(pitch) - wheelBottomAtOrigin;
    car.position.y = (frontOrigin + rearOrigin) * .5;
    car.rotation.set(0, yaw, pitch);
    stats.lateralOffset = offset;
    stats.sectionName = sectionAt(stats.progress);
  }

  function reset(u = startU) {
    stats.running = false;
    stats.progress = wrap01(finite(u, startU));
    stats.u = stats.progress;
    stats.laps = 0;
    stats.lap = 0;
    stats.speedKmh = 0;
    stats.targetSpeedKmh = interpolated(speedProfile, stats.progress) * wetGrip * 3.6;
    stats.lapTime = 0;
    stats.lastLapTime = null;
    stats.distanceMeters = 0;
    placeCar();
    return stats;
  }

  function update(dtSeconds) {
    if (!stats.running) return stats;
    const dt = clamp(finite(dtSeconds, 0), 0, 0.1);
    if (dt === 0) return stats;
    const currentSpeed = stats.speedKmh / 3.6;
    const targetSpeed = interpolated(speedProfile, stats.progress) * wetGrip;
    const effectiveAcceleration = Math.max(2.4, acceleration * wetGrip * (1 - .72 * (currentSpeed / maxSpeed) ** 2));
    const effectiveBraking = braking * wetGrip;
    const speed = clamp(
      currentSpeed + clamp(targetSpeed - currentSpeed, -effectiveBraking * dt, effectiveAcceleration * dt),
      0,
      maxSpeed,
    );
    const travelled = (currentSpeed + speed) * .5 * dt;
    const localScale = interpolated(segmentMetres, stats.progress) / spacing;
    const progressDelta = travelled / (length * localScale);
    const beforeReference = stats.distanceMeters;
    const referenceStep = progressDelta * length;
    stats.distanceMeters += referenceStep;
    stats.progress = wrap01(stats.progress + progressDelta);
    stats.u = stats.progress;
    stats.speedKmh = speed * 3.6;
    stats.targetSpeedKmh = targetSpeed * 3.6;
    stats.lapTime += dt;

    // Count a full revolution from the starting grid, not its nearby line.
    if (stats.distanceMeters >= (stats.laps + 1) * length) {
      const fractionToLine = ((stats.laps + 1) * length - beforeReference) / referenceStep;
      const elapsedAfterLine = (1 - fractionToLine) * dt;
      stats.lastLapTime = stats.lapTime - elapsedAfterLine;
      stats.lapTime = elapsedAfterLine;
      stats.laps += 1;
      stats.lap = stats.laps;
      onLap?.(stats.laps, stats.lastLapTime);
    }
    placeCar();
    return stats;
  }

  reset(startU);
  return {
    car,
    stats,
    start() { stats.running = true; return stats; },
    stop() { stats.running = false; return stats; },
    reset,
    update,
    // Place a second car a fixed distance behind the leader, while retaining
    // the same four-wheel road contact and opening-grid lane transition.
    placeAt(u, distanceMeters = stats.distanceMeters) {
      stats.progress = wrap01(finite(u, startU));
      stats.u = stats.progress;
      stats.distanceMeters = Math.max(0, finite(distanceMeters, 0));
      placeCar();
      return stats;
    },
    // Historical telemetry supplies each car's own longitudinal distance and
    // speed. Its lateral line is reconstructed separately for this 3D track.
    placeReplay(u, distanceMeters, speedKmh, lateralMetres, visualU = u) {
      stats.progress = wrap01(finite(u, startU));
      stats.u = stats.progress;
      stats.distanceMeters = finite(distanceMeters, 0);
      stats.speedKmh = Math.max(0, finite(speedKmh, 0));
      placeCar(finite(lateralMetres, laneOffset), wrap01(finite(visualU, u)));
      return stats;
    },
    // Resolve close traffic on screen without changing the independent
    // simulation/replay progress used by timing, speed and wheel animation.
    placeVisual(u, lateralMetres) {
      placeCar(finite(lateralMetres, stats.lateralOffset), wrap01(finite(u, stats.progress)));
      return stats;
    },
    setWet(wet) { wetGrip = wet ? .82 : 1; return stats; },
    getDirection(target = new THREE.Vector3()) { return target.copy(tangent); },
    getSpeedProfile() { return speedProfile.slice(); },
  };
}
