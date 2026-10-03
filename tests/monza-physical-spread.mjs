// Run: node --experimental-default-type=module tests/monza-physical-spread.mjs
import assert from 'node:assert/strict';
import { computeReplayPlacements, replayPitOffset } from '../dist/monza/replay-lanes.js';

const lap = 5793;
const wrap = value => ((value % lap) + lap) % lap;
const trackGap = {
  lengthMeters: lap,
  metresAt: u => wrap(u * lap),
  behind: (u, metres) => wrap(u * lap - metres) / lap,
};
const placement = cars => computeReplayPlacements(cars, 0, trackGap, lap);
const car = (number, progressMeters, speedKph = 200) => ({
  number, gridPosition: number, progressMeters, speedKph,
});

// A lapped car is thousands of source metres behind but can share the same
// physical road. Its neighbour must influence the chosen lane.
const lapped = [car(11, 2 * lap + 1000), car(43, lap + 1003)];
const together = placement(lapped);
assert.ok(Math.abs(together.get(11).offset - together.get(43).offset) >= 5.39,
  'Lapped cars three metres apart get distinct road lanes');

// A fast car begins moving aside while the cars are still separated. At the
// same spacing and speed there is no anticipatory lane movement.
const closing = [car(11, 2 * lap + 1050, 120), car(43, lap + 1000, 300)];
const steady = closing.map(entry => ({ ...entry, speedKph: 200 }));
const closingOffset = placement(closing).get(43).offset;
const steadyOffset = placement(steady).get(43).offset;
const aloneOffset = placement([steady[1]]).get(43).offset;
assert.ok(Math.abs(closingOffset - aloneOffset) > .1,
  'Closing speed triggers an early lateral response');
assert.ok(Math.abs(steadyOffset - aloneOffset) < 1e-9,
  'A distant pair at equal speed retains the racing line');

const acrossSeam = placement([car(11, 2 * lap - 2), car(43, lap + 2)]);
assert.ok(Math.abs(acrossSeam.get(11).offset - acrossSeam.get(43).offset) >= 5.39,
  'Pair spreading continues across the start/finish seam');

const pitStop = [{ tSec: 400, laneDurationSec: 60, redFlagTransit: true }];
const pitCar = car(11, 2 * lap);
const pitBase = placement([pitCar]).get(11).offset;
assert.equal(replayPitOffset(pitCar, 400, { trackLengthMeters: lap }, pitStop, pitBase), 17.5,
  'A red-flag pit transit keeps its dedicated lane');

console.log('Physical replay spread covers lapped cars, closing speed, seam and pit transit.');
