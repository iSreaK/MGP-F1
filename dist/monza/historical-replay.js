const SAMPLE = Object.freeze({
  time: 0,
  distance: 1,
  speed: 2,
  throttle: 3,
  brake: 4,
  gear: 5,
  officialPosition: 6,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lastAtOrBefore(samples, time) {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (samples[middle][SAMPLE.time] <= time) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function interpolateReplaySample(samples, time) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const at = lastAtOrBefore(samples, time);
  const before = samples[at];
  const after = samples[Math.min(at + 1, samples.length - 1)];
  const span = after[SAMPLE.time] - before[SAMPLE.time];
  const blend = span > 0 ? clamp((time - before[SAMPLE.time]) / span, 0, 1) : 0;
  const mix = index => before[index] + (after[index] - before[index]) * blend;
  return {
    time,
    progressMeters: mix(SAMPLE.distance),
    speedKph: mix(SAMPLE.speed),
    throttlePct: mix(SAMPLE.throttle),
    brakePct: mix(SAMPLE.brake),
    gear: before[SAMPLE.gear],
    officialPosition: before[SAMPLE.officialPosition] ?? after[SAMPLE.officialPosition] ?? null,
  };
}

export function replayLapDistance(progressMeters, session, finished = false) {
  const length = session.trackLengthMeters;
  if (finished) return length;
  const shifted = progressMeters + (session.visualPhaseShiftMeters || 0);
  return ((shifted % length) + length) % length;
}

export function createHistoricalReplay(data) {
  if (data?.version !== 1 || !data?.session || !data?.drivers) {
    throw new TypeError('Les données du replay historique sont incomplètes.');
  }
  const durationSec = Number(data.session.durationSec);
  const trackLengthMeters = Number(data.session.trackLengthMeters);
  if (!(durationSec > 0) || !(trackLengthMeters > 1000)) {
    throw new RangeError('La durée ou la longueur de piste du replay est invalide.');
  }
  const drivers = Object.entries(data.drivers).map(([number, driver]) => {
    if (!Array.isArray(driver.samples) || driver.samples.length < 2) {
      throw new TypeError(`Aucune trajectoire historique pour la voiture ${number}.`);
    }
    for (let i = 1; i < driver.samples.length; i++) {
      if (driver.samples[i][SAMPLE.time] < driver.samples[i - 1][SAMPLE.time]) {
        throw new RangeError(`Horodatages désordonnés pour la voiture ${number}.`);
      }
    }
    return { ...driver, number: Number(number) };
  });
  let timeSec = 0;
  let speed = 20;
  let playing = false;

  function frame(at = timeSec) {
    const time = clamp(Number(at) || 0, 0, durationSec);
    const cars = drivers.map(driver => {
      const sample = interpolateReplaySample(driver.samples, time);
      const laps = driver.laps || [];
      let lapIndex = 0;
      while (lapIndex + 1 < laps.length && laps[lapIndex + 1].startSec <= time) lapIndex++;
      const lap = laps[lapIndex];
      const finished = time >= driver.finishSec;
      return {
        ...sample,
        number: driver.number,
        gridPosition: driver.gridPosition,
        finished,
        lap: lap?.lap ?? clamp(Math.floor(Math.max(0, sample.progressMeters) / trackLengthMeters) + 1, 1, laps.length || 1),
        lapTimeSec: lap ? Math.min(lap.durationSec, Math.max(0, time - lap.startSec)) : time,
        lastLapSec: finished ? lap?.durationSec : lapIndex > 0 ? laps[lapIndex - 1].durationSec : null,
      };
    });
    cars.sort((a, b) => (a.officialPosition ?? 99) - (b.officialPosition ?? 99) ||
      b.progressMeters - a.progressMeters || a.gridPosition - b.gridPosition);
    cars.forEach((car, index) => { car.selectedRank = index + 1; });
    return { timeSec: time, cars, byNumber: Object.fromEntries(cars.map(car => [car.number, car])) };
  }

  return {
    data,
    drivers,
    durationSec,
    trackLengthMeters,
    get timeSec() { return timeSec; },
    get speed() { return speed; },
    get playing() { return playing; },
    frame,
    seek(seconds) { timeSec = clamp(Number(seconds) || 0, 0, durationSec); return frame(); },
    setSpeed(value) { speed = clamp(Number(value) || 1, .25, 100); },
    play() { if (timeSec >= durationSec) timeSec = 0; playing = true; },
    pause() { playing = false; },
    tick(deltaSec) {
      if (playing) {
        timeSec = clamp(timeSec + Math.max(0, Number(deltaSec) || 0) * speed, 0, durationSec);
        if (timeSec >= durationSec) playing = false;
      }
      return frame();
    },
  };
}
