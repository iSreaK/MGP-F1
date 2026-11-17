import assert from 'node:assert/strict';
import { createFreeRaceField } from '../dist/miami/free-race-field.js';
import { MIAMI_2026_DISPLAYED } from '../dist/miami/replay-roster.js';
import { carCatalog } from '../dist/car-catalog.js';
import { GRID_SLOT_SPACING } from '../dist/miami/grid-details.js';
const entries=carCatalog.map(car=>({...car,gridPosition:MIAMI_2026_DISPLAYED.find(d=>d.modelKey===car.key)?.gridPosition??22,pitLaneStart:false}));
const field=createFreeRaceField(entries,{gridU:158/5412,gridSlotSpacingMeters:GRID_SLOT_SPACING});
const initial=field.frame();assert.equal(initial.cars.length,22);assert.equal(initial.byNumber[12].progressMeters,-14.1);
field.start();let max=0,lap=0;
for(let i=0;i<2400;i++) {
  const frame=field.update(.1);
  for(const car of frame.cars) {
    assert.ok(car.u>=0&&car.u<1&&Number.isFinite(car.u));
    assert.ok(Math.abs(car.offset)<4);
    assert.ok(car.speedKmh>=0&&car.speedKmh<365);
    max=Math.max(max,car.speedKmh);lap=Math.max(lap,car.lastLapTime||0);
  }
}
assert.ok(max>300&&max<355);
assert.ok(lap>85&&lap<115);
const stopped=field.frame();field.pause();assert.deepEqual(field.update(1),stopped);
field.reset();assert.deepEqual(field.frame(),initial);
console.log('Miami free simulation: 22 garage cars, drivable speeds, lap timing, pause and reset verified.');
