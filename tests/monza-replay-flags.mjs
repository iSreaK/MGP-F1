import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createReplayFlagTimeline } from '../dist/monza/replay-flags.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(await readFile(resolve(here, '../dist/monza/data/monza-2026-replay.json'), 'utf8'));
const historical = createReplayFlagTimeline(data);
const expect = (time, kind, detail = null) => {
  const state = historical.at(time);
  assert.equal(state.kind, kind, `flag at ${time}s`);
  if (detail) assert.match(state.detail, detail, `detail at ${time}s`);
  assert.ok(/^#[0-9a-f]+$/i.test(state.color), `colour at ${time}s`);
};

expect(181, 'green');
expect(182.064, 'double-yellow', /Secteur 15/);
expect(184.064, 'double-yellow', /Secteurs 15, 16/);
expect(198.064, 'safety-car');
expect(251.826, 'red');
expect(252.064, 'red');
expect(600, 'red');
expect(2129.165, 'red');
expect(2129.166, 'green');
expect(2583.064, 'yellow', /Secteurs 7, 8/);
expect(2588, 'yellow', /Secteur 7/);
expect(2590.064, 'green');
expect(4439.064, 'yellow', /Secteurs 2, 3/);
expect(4454.064, 'vsc');
expect(4560.064, 'vsc');
expect(4571.064, 'green');
expect(6675.064, 'chequered');

// A sector clearance must not erase a simultaneous yellow in another sector.
// A later yellow may downgrade double-yellow, but a same-time batch may not.
const synthetic = createReplayFlagTimeline({
  session: { pauses: [{ startSec: 10, endSec: 20 }] },
  events: [
    { tSec: 5, category: 'Flag', flag: 'DOUBLE YELLOW', message: 'DOUBLE YELLOW IN TRACK SECTOR 3' },
    { tSec: 5, category: 'Flag', flag: 'YELLOW', message: 'YELLOW IN TRACK SECTOR 3' },
    { tSec: 5, category: 'Flag', flag: 'YELLOW', message: 'YELLOW IN TRACK SECTOR 4' },
    { tSec: 6, category: 'Flag', flag: 'CLEAR', message: 'CLEAR IN TRACK SECTOR 3' },
    { tSec: 7, category: 'Flag', flag: 'BLUE', driverNumber: 12, message: 'WAVED BLUE FLAG FOR CAR 12' },
    { tSec: 8, category: 'Flag', flag: 'CLEAR', message: 'CLEAR IN TRACK SECTOR 4' },
    { tSec: 11, category: 'Flag', flag: 'YELLOW', message: 'YELLOW IN TRACK SECTOR 5' },
    { tSec: 20, category: 'SessionStatus', message: 'SESSION STARTED' },
    { tSec: 21, category: 'SafetyCar', message: 'VSC DEPLOYED' },
    { tSec: 22, category: 'SafetyCar', message: 'VSC ENDING' },
    { tSec: 23, category: 'Flag', flag: 'CLEAR', message: 'TRACK CLEAR' },
    { tSec: 24, category: 'Flag', flag: 'CHEQUERED', message: 'CHEQUERED FLAG' },
  ],
});
assert.deepEqual(synthetic.at(5).sectors, [3]);
assert.equal(synthetic.at(5).kind, 'double-yellow');
assert.deepEqual(synthetic.at(6).sectors, [4]);
assert.equal(synthetic.at(7).kind, 'yellow');
assert.equal(synthetic.at(8).kind, 'green');
assert.equal(synthetic.at(11).kind, 'red');
assert.equal(synthetic.at(20).kind, 'green');
assert.equal(synthetic.at(22).kind, 'vsc');
assert.equal(synthetic.at(23).kind, 'green');
assert.equal(synthetic.at(24).kind, 'chequered');
assert.equal(synthetic.at(5).kind, 'double-yellow', 'seeking backwards is deterministic');

console.log('Monza historical race-control flags: OK');
