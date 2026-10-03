import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayPitOffset } from '../dist/monza/replay-lanes.js';
import { resolveEntitySpacing, CAR_BLOCK } from '../dist/monza/entity-spacing.js';

const data = JSON.parse(readFileSync(new URL('../dist/monza/data/monza-2026-replay.json',
  import.meta.url), 'utf8'));
const length = data.session.trackLengthMeters;
const errors = [];
let suspectFreezes = 0;
let impossibleBraking = 0;
let maxMotionSpeed = 0;
let lapCrossings = 0;

for (const driver of Object.values(data.drivers)) {
  const samples = driver.samples;
  let stillStart = null;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1], current = samples[index];
    const dt = current[0] - previous[0];
    const step = current[1] - previous[1];
    assert.ok(dt > 0 && step >= -0.001, `${driver.name} chronology/progression`);
    maxMotionSpeed = Math.max(maxMotionSpeed, step / dt);
    if (current[0] < driver.finishSec) {
      assert.ok(current[3] >= 0 && current[3] <= 100,
        `${driver.name} accélérateur à ${current[0]} s`);
      assert.ok(current[4] >= 0 && current[4] <= 100,
        `${driver.name} frein à ${current[0]} s`);
      if (dt <= .501 && previous[2] - current[2] > 180) impossibleBraking++;
    }
    if (step < .02 && current[2] > 150) {
      if (stillStart === null) stillStart = previous[0];
    } else {
      if (stillStart !== null && previous[0] - stillStart >= 2) suspectFreezes++;
      stillStart = null;
    }
  }

  for (const lap of driver.laps.slice(1)) {
    const index = Math.min(samples.length - 2, Math.floor(lap.startSec * data.session.sampleHz));
    const before = samples[index], after = samples[index + 1];
    const fraction = (lap.startSec - before[0]) / (after[0] - before[0]);
    const progress = before[1] + (after[1] - before[1]) * fraction;
    const expected = (lap.lap - 1) * length - data.session.visualPhaseShiftMeters;
    assert.ok(Math.abs(progress - expected) < 1,
      `${driver.name} ligne du tour ${lap.lap} à ${lap.startSec} s`);
    lapCrossings++;
  }

  // Compare displayed motion against the independently recorded speed over
  // two-second windows in ordinary timed laps, including braking zones.
  for (let lapIndex = 0; lapIndex + 1 < driver.laps.length; lapIndex++) {
    const start = driver.laps[lapIndex].startSec;
    const end = driver.laps[lapIndex + 1].startSec;
    if (end - start < 70 || end - start > 130) continue;
    const first = Math.ceil(start * data.session.sampleHz);
    const last = Math.floor(end * data.session.sampleHz) - 4;
    for (let index = first; index <= last; index++) {
      let travelledBySpeed = 0;
      for (let next = index + 1; next <= index + 4; next++) {
        const a = samples[next - 1], b = samples[next];
        travelledBySpeed += (a[2] + b[2]) / 7.2 * (b[0] - a[0]);
      }
      if (travelledBySpeed < 83.33) continue;
      const travelledByCar = samples[index + 4][1] - samples[index][1];
      errors.push(Math.abs(travelledByCar / travelledBySpeed - 1));
    }
  }
}

errors.sort((a, b) => a - b);
assert.equal(Object.keys(data.drivers).length, 22);
assert.equal(suspectFreezes, 0, 'Aucun gel pendant que la télémétrie indique >150 km/h');
assert.equal(impossibleBraking, 0, 'Aucune chute de >180 km/h en 0,5 s');
assert.ok(maxMotionSpeed < 105, `Vitesse de pose maximale ${maxMotionSpeed.toFixed(1)} m/s`);
assert.ok(lapCrossings > 1000);
assert.ok(errors.length > 100000);
assert.ok(errors[Math.floor(errors.length * .99)] < .05,
  `Discordance vitesse/déplacement p99 ${(errors[Math.floor(errors.length * .99)] * 100).toFixed(1)} %`);
assert.ok(errors.at(-1) < .08,
  `Discordance vitesse/déplacement max ${(errors.at(-1) * 100).toFixed(1)} %`);

const parkedAt = 400;
const parked = Object.values(data.drivers).filter(driver => driver.finishSec > parkedAt)
  .map(driver => {
    const progress = driver.samples[parkedAt * data.session.sampleHz][1];
    const offset = replayPitOffset({ number: driver.number, progressMeters: progress },
      parkedAt, data.session, driver.pit, 0);
    return { number: driver.number, gridPosition: driver.gridPosition,
      priority: progress, u: ((progress % length) + length) % length / length, offset };
  });
assert.equal(parked.length, 21);
for (const car of parked) assert.equal(car.offset, 17.5, `Voie des stands ${car.number}`);
const track = {
  lengthMeters: length,
  metresAt: u => u * length,
  behind: (u, metres) => ((u * length - metres) % length + length) % length / length,
};
const poses = resolveEntitySpacing(parked, track);
const stations = parked.map(car => track.metresAt(poses.get(car.number).u))
  .map(station => station > length - 600 ? station - length : station)
  .sort((a, b) => a - b);
for (let index = 1; index < stations.length; index++) {
  assert.ok(stations[index] - stations[index - 1] >= CAR_BLOCK.length - .001,
    'Les voitures arrêtées ne se superposent pas dans les stands');
}
assert.ok(stations[0] > -450 && stations.at(-1) < -80);

console.log(`Replay continu : ${lapCrossings} passages officiels, 0 gel, p99 vitesse/déplacement `
  + `${(errors[Math.floor(errors.length * .99)] * 100).toFixed(1)} %, 21 voitures séparées aux stands.`);
