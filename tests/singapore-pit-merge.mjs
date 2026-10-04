import assert from 'node:assert/strict';
import { replayPitOffset } from '../dist/singapore/replay-lanes.js';
import { PIT_START_LANE_CENTER } from '../dist/singapore/grid-details.js';
import { LANDMARKS, TRACK_POINTS, TRACK_LENGTH_METERS } from '../dist/singapore/track-data.js';

const points = TRACK_POINTS.slice(0, -1);
const cumulative = [0];
for (let i = 1; i < points.length; i++) {
  cumulative.push(cumulative.at(-1) + Math.hypot(
    points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
}
const station = index => {
  let metres = cumulative[index] - 137;
  if (metres > TRACK_LENGTH_METERS / 2) metres -= TRACK_LENGTH_METERS;
  if (metres < -TRACK_LENGTH_METERS / 2) metres += TRACK_LENGTH_METERS;
  return metres;
};
const entry = station(LANDMARKS.pitStraight.entryIndex);
const exit = station(LANDMARKS.pitStraight.exitIndex);
assert.ok(Math.abs(entry + 440) < 3, `FIA pit entry moved to ${entry.toFixed(1)} m`);
assert.ok(Math.abs(exit - 230) < 3, `FIA pit exit moved to ${exit.toFixed(1)} m`);

const pitStop = [{ tSec: 500, laneDurationSec: 200 }];
const at = metres => replayPitOffset({
  progressMeters: (metres + TRACK_LENGTH_METERS) % TRACK_LENGTH_METERS,
  speedKph: 50,
}, 400, { trackLengthMeters: TRACK_LENGTH_METERS }, pitStop, 0);
assert.equal(at(-440), 0, 'entry begins on the racing lane');
assert.ok(at(-300) < -13, 'the car is in the visible pit lane before the garages');
assert.ok(Math.abs(at(105) - PIT_START_LANE_CENTER) < .01,
  'the car stays in the pit lane until its exit taper');
assert.equal(at(230), 0, 'the car has rejoined the road at the FIA exit');
for (let s = -440; s <= 230; s += 5) {
  const next = Math.min(s + 5, 230);
  assert.ok(Math.abs(at(next) - at(s)) < 1.05,
    `pit lateral shift jumps between ${s} m and ${next} m`);
}
console.log(`Singapore pit merge follows FIA entry ${entry.toFixed(1)} m and exit ${exit.toFixed(1)} m.`);
