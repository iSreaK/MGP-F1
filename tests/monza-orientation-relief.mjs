import assert from 'node:assert/strict';
import { TRACK_POINTS, LANDMARKS } from '../dist/monza/track-data.js';
import {
  DOCUMENTED_RELIEF_METERS,
  RELIEF_PRESENTATION_SCALE,
  trackElevationAt,
} from '../dist/monza/terrain-profile.js';

// world.js reflects the imported SVG on X before it builds every dependent
// asset. On the corrected plan, the start straight is east of Lesmo/Ascari.
const displayX = index => -TRACK_POINTS[index][0];
const startX = displayX(LANDMARKS.gridIndex);
const lesmoX = displayX(LANDMARKS.turns.T7.index);
assert.ok(startX > lesmoX,
  `Monza display orientation regressed: grid x=${startX}, Lesmo 2 x=${lesmoX}`);

const samples = Array.from({ length: 10001 }, (_, i) => trackElevationAt(i / 10000));
const range = Math.max(...samples) - Math.min(...samples);
const expectedRange = DOCUMENTED_RELIEF_METERS * RELIEF_PRESENTATION_SCALE;
assert.ok(Math.abs(range - expectedRange) < .03,
  `Monza relief should render at ${expectedRange} m, got ${range} m`);

const lesmo2 = trackElevationAt(.484);
const serraglioDip = trackElevationAt(.61);
const ascariRise = trackElevationAt(.706);
const parabolica = trackElevationAt(.888);
assert.ok(lesmo2 > serraglioDip && ascariRise > serraglioDip,
  'The documented Lesmo 2–Ascari dip must remain visible');
assert.ok(ascariRise > parabolica,
  'The run from Ascari toward Parabolica must remain downhill');

console.log('Monza orientation and relief:', {
  startX,
  lesmoX,
  documentedRelief: DOCUMENTED_RELIEF_METERS,
  presentationScale: RELIEF_PRESENTATION_SCALE,
  renderedRange: range,
});
