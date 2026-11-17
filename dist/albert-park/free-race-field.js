import { TRACK_POINTS, TRACK_LENGTH_METERS } from './track-data.js';
import { racingLineOffset } from './race-motion.js';
import { FREE_SPEED_PROFILE_KMH } from './free-speed-profile.js';

// A deterministic, independent free-race field. Distances are in metres from
// each driver's own grid box; poses use the 5,278 m FIA centreline stationing.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = (value, length) => ((value % length) + length) % length;
const wrap01 = value => wrap(value, 1);
const smoothstep = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function sampledTrack(points, length) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumulative.push(cumulative.at(-1) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  if (Math.abs(cumulative.at(-1) - length) > .1)
    throw new Error('La longueur de la piste libre diffère de la carte FIA.');
  return station => {
    const s = wrap(station, length);
    let low = 0, high = cumulative.length - 2;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle + 1] < s) low = middle + 1;
      else high = middle;
    }
    const blend = (s - cumulative[low]) /
      Math.max(1e-8, cumulative[low + 1] - cumulative[low]);
    return [points[low][0] + (points[low + 1][0] - points[low][0]) * blend,
      points[low][1] + (points[low + 1][1] - points[low][1]) * blend];
  };
}

function curvatureProfile(points, length) {
  const at = sampledTrack(points, length);
  const count = Math.ceil(length / 6);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const s = i * length / count;
    const a = at(s - 13), b = at(s), c = at(s + 13);
    const before = [b[0] - a[0], b[1] - a[1]];
    const after = [c[0] - b[0], c[1] - b[1]];
    const span = (Math.hypot(...before) + Math.hypot(...after)) * .5;
    const cross = before[0] * after[1] - before[1] * after[0];
    const dot = before[0] * after[0] + before[1] * after[1];
    values[i] = Math.abs(Math.atan2(cross, dot)) / Math.max(1, span);
  }
  const smoothed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    smoothed[i] = (values[wrap(i - 2, count)] + 2 * values[wrap(i - 1, count)]
      + 3 * values[i] + 2 * values[(i + 1) % count]
      + values[(i + 2) % count]) / 9;
  }
  return smoothed;
}

function speedProfile(curvature, length, traits) {
  const count = curvature.length;
  const step = length / count;
  const limit = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    limit[i] = clamp(Math.sqrt(traits.lateralAcceleration /
      Math.max(curvature[i], .0002)), traits.minimumCornerSpeed,
    traits.maximumSpeed);
  }
  // The backward pass starts braking before the apex; the forward pass
  // prevents full throttle immediately after it. Wrap both around the lap.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = count - 1; i >= 0; i--) {
      const next = (i + 1) % count;
      limit[i] = Math.min(limit[i], Math.sqrt(limit[next] ** 2
        + 2 * traits.braking * step));
    }
    for (let i = 0; i < count; i++) {
      const previous = (i - 1 + count) % count;
      const available = Math.max(2.6, traits.acceleration
        * (1 - .7 * (limit[previous] / traits.maximumSpeed) ** 2));
      limit[i] = Math.min(limit[i], Math.sqrt(limit[previous] ** 2
        + 2 * available * step));
    }
  }
  return limit;
}

function atProfile(values, station, length) {
  const position = wrap(station, length) / length * values.length;
  const i = Math.floor(position), blend = position - i;
  return values[i] * (1 - blend) + values[(i + 1) % values.length] * blend;
}

function paceTraits(entry) {
  const seed = ((entry.number * 2654435761) >>> 0) / 4294967296;
  return {
    seed,
    pace: .975 + seed * .055 + (11 - entry.gridPosition) * .0006,
    maximumSpeed: (290 + seed * 25) / 3.6,
    minimumCornerSpeed: (55 + seed * 9) / 3.6,
    lateralAcceleration: (3.45 + seed * .9) * 9.81,
    // Similar launch acceleration keeps a compressed grid from telescoping
    // before the first braking zone; pace differences develop over the lap.
    acceleration: 9.25 + seed * .95,
    braking: 15.5 + seed * 3.5,
  };
}

export function createFreeRaceField(entries, {
  gridU = 0,
  trackLengthMeters = TRACK_LENGTH_METERS,
  trackPoints = TRACK_POINTS,
  gridSlotSpacingMeters = 7.91,
  gridBoxBackMeters = 14.1,
} = {}) {
  if (!Array.isArray(entries) || !entries.length)
    throw new TypeError('La simulation libre nécessite des voitures.');
  const numbers = entries.map(entry => entry.number);
  if (new Set(numbers).size !== numbers.length || numbers.some(number => !Number.isFinite(number)))
    throw new TypeError('Chaque voiture doit avoir un numéro unique.');
  const length = trackLengthMeters;
  const controlLineBeforeStart = gridU * length;
  const curvature = curvatureProfile(trackPoints, length);
  const states = entries.map(entry => {
    const traits = paceTraits(entry);
    return { entry, traits, profile: speedProfile(curvature, length, traits),
      startOffset: entry.pitLaneStart
        ? -Math.max(0, Number(entry.pitStartProgressMeters) || 180)
        : -gridBoxBackMeters - (entry.gridPosition - 1) * gridSlotSpacingMeters,
      distanceMeters: 0, speed: 0, offset: entry.pitLaneStart ? -14.5
        : entry.gridPosition % 2 ? 2.4 : -2.4,
      lap: 0, lapTime: 0, lastLapTime: null,
      passingNumber: null, passSide: 0 };
  });
  let timeSec = 0;
  let running = false;
  let wet = false;

  const progress = state => state.startOffset + state.distanceMeters;
  const stationGap = (ahead, behind) => wrap(progress(ahead) - progress(behind), length);
  function nearestAhead(state) {
    let nearest = null, gap = Infinity;
    for (const other of states) {
      if (other === state) continue;
      const distance = stationGap(other, state);
      if (distance > .01 && distance < gap) { nearest = other; gap = distance; }
    }
    return { other: nearest, gap };
  }

  function passingSide(state, ahead) {
    const base = racingLineOffset(wrap01(gridU + progress(state) / length));
    const costs = [-1, 1].map(side => {
      const target = clamp(base + side * 2.65, -3.5, 3.5);
      let cost = 0;
      for (const other of states) {
        if (other === state || other === ahead) continue;
        const gap = Math.min(stationGap(other, state), stationGap(state, other));
        if (gap < 22 && Math.abs(other.offset - target) < 2.2)
          cost += (22 - gap) / 22;
      }
      return cost;
    });
    return costs[0] === costs[1]
      ? (state.entry.number + ahead.entry.number) % 2 ? -1 : 1
      : costs[0] < costs[1] ? -1 : 1;
  }

  function step(dt) {
    timeSec += dt;
    const intentions = states.map(state => {
      const s = progress(state);
      const { other, gap } = nearestAhead(state);
      const afterStart = !state.entry.pitLaneStart ||
        timeSec >= (state.entry.pitStartDelaySec ?? 8);
      const racingOffset = racingLineOffset(wrap01(gridU + s / length));
      const wetGrip = wet ? .80 : 1;
      const momentaryPace = state.traits.pace
        * (1 + .011 * Math.sin(timeSec / 43 + state.traits.seed * 21));
      // The polyline begins at the FIA control line, 137 m before the grid.
      // The car's progress starts at the grid, so include that phase here.
      const fiaStation = s + gridU * length;
      const measuredSpeed = atProfile(FREE_SPEED_PROFILE_KMH, fiaStation, length) / 3.6;
      const physicalCeiling = atProfile(state.profile, fiaStation, length) * 1.08;
      let targetSpeed = Math.min(measuredSpeed, physicalCeiling,
        state.traits.maximumSpeed) * wetGrip * momentaryPace;
      if (state.entry.pitLaneStart && s < 235)
        targetSpeed = Math.min(targetSpeed, 80 / 3.6);
      if (!afterStart) targetSpeed = 0;

      const passed = state.passingNumber !== null &&
        states.find(otherState => otherState.entry.number === state.passingNumber);
      if (passed) {
        const signed = wrap(progress(passed) - s + length / 2, length) - length / 2;
        // Stay in the passing lane until fully clear. A fixed timeout could
        // force a car back into its rival while they were still side by side.
        if (signed < -15 || signed > 75)
          state.passingNumber = null;
      }
      if (state.passingNumber === null && other && gap < 48
        && targetSpeed > other.speed + 1.2 && s > 600
        && Math.abs(state.offset - other.offset) < 2.7) {
        state.passingNumber = other.entry.number;
        state.passSide = passingSide(state, other);
      }
      let targetOffset = racingOffset;
      if (state.passingNumber !== null)
        targetOffset = clamp(racingOffset + state.passSide * 2.65, -3.5, 3.5);
      if (state.entry.pitLaneStart) {
        const merge = smoothstep((s - 165) / 65);
        targetOffset = -14.5 + (targetOffset + 14.5) * merge;
      } else {
        // Keep both starting columns through the first chicane. Merge only
        // after T3, and wait if a car is still alongside in the other column.
        const alongside = state.distanceMeters < 850 && states.some(otherState =>
          otherState !== state
          && Math.abs(wrap(progress(otherState) - s + length / 2, length)
            - length / 2) < 11
          && Math.abs(otherState.offset - state.offset) > 2.8);
        const gridBlend = alongside ? 1
          : 1 - smoothstep((state.distanceMeters - 420) / 240);
        const gridLane = state.entry.gridPosition % 2 ? 2.4 : -2.4;
        targetOffset += (gridLane - targetOffset) * gridBlend;
      }
      return { state, targetSpeed, targetOffset, afterStart };
    });

    // Check every car ahead, not only the nearest centre. At the start the
    // nearest one can be in the other grid column while a same-lane car is
    // just beyond it. Brake before a planned lane merge as well as overlap.
    for (const intention of intentions) {
      const { state } = intention;
      const braking = state.traits.braking * (wet ? .83 : 1);
      for (const other of intentions) {
        if (other === intention) continue;
        const gap = stationGap(other.state, state);
        if (gap <= .001 || gap > 85) continue;
        const currentAcross = Math.abs(state.offset - other.state.offset);
        const plannedAcross = Math.abs(intention.targetOffset - other.targetOffset);
        if (currentAcross >= 2.8 && plannedAcross >= 2.8) continue;
        const freeGap = Math.max(0, gap - 8.5);
        const safeSpeed = Math.sqrt(other.state.speed ** 2
          + 2 * braking * freeGap) - 1.0;
        intention.targetSpeed = Math.min(intention.targetSpeed,
          Math.max(0, safeSpeed));
      }
    }

    for (const { state, targetSpeed, targetOffset, afterStart } of intentions) {
      const before = state.distanceMeters;
      const braking = state.traits.braking * (wet ? .83 : 1);
      const acceleration = state.traits.acceleration * (wet ? .82 : 1);
      const speed = afterStart ? clamp(targetSpeed, state.speed - braking * dt,
        state.speed + acceleration * dt) : 0;
      state.distanceMeters += Math.max(0, (state.speed + speed) * .5 * dt);
      state.speed = Math.max(0, speed);
      const merging = state.entry.pitLaneStart && progress(state) >= 160
        && progress(state) <= 250;
      const lateralStep = dt * (merging ? 5.5 : 2.9);
      state.offset += clamp(targetOffset - state.offset, -lateralStep, lateralStep);
      const beforeProgress = state.startOffset + before;
      const afterProgress = progress(state);
      const nextControlLine = (state.lap + 1) * length - controlLineBeforeStart;
      if (beforeProgress < nextControlLine && afterProgress >= nextControlLine) {
        const ratio = clamp((nextControlLine - beforeProgress)
          / Math.max(1e-9, afterProgress - beforeProgress), 0, 1);
        const elapsedBeforeLine = dt * ratio;
        state.lastLapTime = state.lapTime + elapsedBeforeLine;
        state.lapTime = dt - elapsedBeforeLine;
        state.lap++;
      } else state.lapTime += dt;
    }
  }

  function frame() {
    const cars = states.map(state => {
      const progressMeters = progress(state);
      const u = wrap01(gridU + progressMeters / length);
      return { number: state.entry.number, modelKey: state.entry.modelKey,
        gridPosition: state.entry.gridPosition,
        pitLaneStart: !!state.entry.pitLaneStart,
        distanceMeters: state.distanceMeters, progressMeters,
        u, progress: u, speedKmh: state.speed * 3.6, offset: state.offset,
        lap: state.lap, lapTime: state.lapTime,
        lastLapTime: state.lastLapTime, trackLengthMeters: length };
    });
    return { timeSec, cars,
      byNumber: Object.fromEntries(cars.map(car => [car.number, car])) };
  }

  return {
    get running() { return running; },
    frame,
    update(dtSeconds) {
      if (!running) return frame();
      let remaining = clamp(Number(dtSeconds) || 0, 0, 2);
      while (remaining > 1e-8) {
        const dt = Math.min(.05, remaining);
        step(dt);
        remaining -= dt;
      }
      return frame();
    },
    start() { running = true; return frame(); },
    pause() { running = false; return frame(); },
    stop() { running = false; return frame(); },
    reset() {
      running = false;
      timeSec = 0;
      for (const state of states) {
        state.distanceMeters = 0;
        state.speed = 0;
        state.offset = state.entry.pitLaneStart ? -14.5
          : state.entry.gridPosition % 2 ? 2.4 : -2.4;
        state.lap = 0;
        state.lapTime = 0;
        state.lastLapTime = null;
        state.passingNumber = null;
        state.passSide = 0;
      }
      return frame();
    },
    setWet(value) { wet = !!value; return frame(); },
  };
}
