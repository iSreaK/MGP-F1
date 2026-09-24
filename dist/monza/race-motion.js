/**
 * Race motion for the Monza scene. The curve is a closed, arc-length sampled
 * THREE.CatmullRomCurve3 in metres. The car model's nose points along local -X.
 *
 * createRaceController(THREE, curve, car, {
 *   startU: 0, laneOffset: 0, carY: 0.34, maxSpeedKmh: 325,
 *   minCornerSpeedKmh: 72, lateralG: 4.0, acceleration: 11,
 *   braking: 23, onLap: (lap, seconds) => {}
 * })
 *
 * controller.start(), stop(), reset([u]), update(dtSeconds)
 * controller.stats -> live mutable readings, including speedKmh and laps
 * controller.getDirection(target) -> tangent at the current position
 */
export function createRaceController(THREE, curve, car, options = {}) {
  if (!THREE?.Vector3 || !curve?.getPointAt || !curve?.getTangentAt || !car?.position) {
    throw new TypeError('THREE, une courbe fermée et un modèle 3D sont nécessaires.');
  }

  const wrap01 = value => value >= 0 && value < 1 ? value : ((value % 1) + 1) % 1;
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const length = curve.getLength();
  if (!(length > 100)) throw new RangeError('La courbe doit être exprimée en mètres.');

  const maxSpeed = clamp(finite(options.maxSpeedKmh, 325), 90, 400) / 3.6;
  const minCornerSpeed = clamp(finite(options.minCornerSpeedKmh, 72), 35, 160) / 3.6;
  const lateralAcceleration = clamp(finite(options.lateralG, 4), 1.5, 6) * 9.81;
  const acceleration = clamp(finite(options.acceleration, 11), 1, 25);
  const braking = clamp(finite(options.braking, 23), 2, 45);
  const laneOffset = clamp(finite(options.laneOffset, 0), -4, 4);
  const carY = finite(options.carY, 0.34);
  const startU = wrap01(finite(options.startU, 0));
  const onLap = typeof options.onLap === 'function' ? options.onLap : null;

  // Enough spatial resolution to catch the chicanes without introducing
  // mesh-detail noise into the speed target. PointAt is arc-length based.
  const count = clamp(Math.ceil(length / 6), 400, 1500);
  const spacing = length / count;
  const headingSpan = clamp(spacing * 2.5, 12, 19);
  const rawCurvature = new Float32Array(count);
  const limit = new Float32Array(count);
  const speedProfile = new Float32Array(count);
  const pointBefore = new THREE.Vector3();
  const pointHere = new THREE.Vector3();
  const pointAfter = new THREE.Vector3();
  const inVec = new THREE.Vector3();
  const outVec = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const u = i / count;
    pointBefore.copy(curve.getPointAt(wrap01(u - headingSpan / length)));
    pointHere.copy(curve.getPointAt(u));
    pointAfter.copy(curve.getPointAt(wrap01(u + headingSpan / length)));
    inVec.subVectors(pointHere, pointBefore).setY(0).normalize();
    outVec.subVectors(pointAfter, pointHere).setY(0).normalize();
    const cross = inVec.x * outVec.z - inVec.z * outVec.x;
    const angle = Math.atan2(cross, clamp(inVec.dot(outVec), -1, 1));
    rawCurvature[i] = Math.abs(angle) / headingSpan;
  }

  // Smooth across roughly 25 m, then calculate a lateral-grip speed ceiling.
  for (let i = 0; i < count; i++) {
    let curvature = 0;
    for (let j = -2; j <= 2; j++) {
      const weight = j === 0 ? 3 : Math.abs(j) === 1 ? 2 : 1;
      curvature += rawCurvature[(i + j + count) % count] * weight;
    }
    curvature /= 9;
    limit[i] = clamp(Math.sqrt(lateralAcceleration / Math.max(curvature, 0.0002)), minCornerSpeed, maxSpeed);
    speedProfile[i] = limit[i];
  }

  // A backward pass starts braking before each corner; a forward pass models
  // acceleration out of it. Two laps let the cyclic constraints settle.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = count - 1; i >= 0; i--) {
      const next = (i + 1) % count;
      speedProfile[i] = Math.min(speedProfile[i], Math.sqrt(speedProfile[next] ** 2 + 2 * braking * spacing));
    }
    for (let i = 0; i < count; i++) {
      const previous = (i - 1 + count) % count;
      const previousSpeed = speedProfile[previous];
      const availableAcceleration = Math.max(2.8, acceleration * (1 - .72 * (previousSpeed / maxSpeed) ** 2));
      speedProfile[i] = Math.min(speedProfile[i], Math.sqrt(previousSpeed ** 2 + 2 * availableAcceleration * spacing));
    }
  }

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
    position: car.position,
    tangent: null,
  };
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  stats.tangent = tangent;

  function targetSpeedAt(u) {
    const sample = wrap01(u) * count;
    const index = Math.floor(sample);
    const blend = sample - index;
    return speedProfile[index] * (1 - blend) + speedProfile[(index + 1) % count] * blend;
  }

  function placeCar() {
    const at = curve.getPointAt(stats.progress);
    tangent.copy(curve.getTangentAt(stats.progress)).setY(0).normalize();
    side.set(tangent.z, 0, -tangent.x);
    car.position.copy(at).addScaledVector(side, laneOffset);
    car.position.y = carY;
    car.rotation.y = Math.atan2(tangent.z, -tangent.x);
  }

  function reset(u = startU) {
    stats.running = false;
    stats.progress = wrap01(finite(u, startU));
    stats.u = stats.progress;
    stats.laps = 0;
    stats.lap = 0;
    stats.speedKmh = 0;
    stats.targetSpeedKmh = targetSpeedAt(stats.progress) * 3.6;
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
    const oldProgress = stats.progress;
    const oldDistance = stats.distanceMeters;
    const currentSpeed = stats.speedKmh / 3.6;
    const targetSpeed = targetSpeedAt(oldProgress);
    const effectiveAcceleration = Math.max(2.8, acceleration * (1 - .72 * (currentSpeed / maxSpeed) ** 2));
    const deltaSpeed = targetSpeed - currentSpeed;
    const speed = clamp(
      currentSpeed + clamp(deltaSpeed, -braking * dt, effectiveAcceleration * dt),
      0,
      maxSpeed,
    );
    const travelled = (currentSpeed + speed) * .5 * dt;
    const progressDelta = travelled / length;
    stats.progress = wrap01(oldProgress + progressDelta);
    stats.u = stats.progress;
    stats.distanceMeters += travelled;
    stats.speedKmh = speed * 3.6;
    stats.targetSpeedKmh = targetSpeed * 3.6;
    stats.lapTime += dt;

    // Count a lap after a full circuit from the starting position. The grid
    // is metres before the painted finish line, so crossing u=0 immediately
    // after launch must not produce an extra lap.
    if (stats.distanceMeters >= (stats.laps + 1) * length) {
      const fractionToLine = ((stats.laps + 1) * length - oldDistance) / travelled;
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
    stats,
    start() { stats.running = true; return stats; },
    stop() { stats.running = false; return stats; },
    reset,
    update,
    getDirection(target = new THREE.Vector3()) {
      return target.copy(tangent);
    },
    getSpeedProfile() { return speedProfile.slice(); },
  };
}
