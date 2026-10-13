import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mirrorTrackPointsX } from '../dist/track-orientation.js';
import * as austin from '../dist/austin/geometry-smoothing.js';
import * as interlagos from '../dist/interlagos/geometry-smoothing.js';
import * as mexico from '../dist/mexico/geometry-smoothing.js';
import * as singapore from '../dist/singapore/geometry-smoothing.js';
import * as vegas from '../dist/las-vegas/geometry-smoothing.js';
import * as lusail from '../dist/lusail/geometry-smoothing.js';
import * as yas from '../dist/yas-marina/geometry-smoothing.js';

const example = [[12, -4], [-3, 8], [12, -4]];
assert.deepEqual(mirrorTrackPointsX(example), [[-12, -4], [3, 8], [-12, -4]]);
assert.deepEqual(example, [[12, -4], [-3, 8], [12, -4]],
  'reflection does not mutate official source coordinates');

const circuits = [
  ['austin', austin, 5513, 42 * austin.RELIEF_PRESENTATION_SCALE],
  ['interlagos', interlagos, 4309,
    interlagos.DOCUMENTED_RELIEF_METERS * interlagos.RELIEF_PRESENTATION_SCALE],
  ['mexico', mexico, 4304,
    mexico.DOCUMENTED_RELIEF_METERS * mexico.RELIEF_PRESENTATION_SCALE],
  ['singapore', singapore, 4927,
    singapore.DOCUMENTED_RELIEF_METERS * singapore.RELIEF_PRESENTATION_SCALE],
  ['las-vegas', vegas, 6201,
    vegas.ILLUSTRATIVE_RELIEF_METERS * vegas.RELIEF_PRESENTATION_SCALE],
  ['lusail', lusail, 5419,
    lusail.ILLUSTRATIVE_RELIEF_METERS * lusail.RELIEF_PRESENTATION_SCALE],
  ['yas-marina', yas, 5281,
    yas.DOCUMENTED_RELIEF_METERS * yas.RELIEF_PRESENTATION_SCALE],
];

for (const [slug, profile, lapLength, expectedRelief] of circuits) {
  const heights = Array.from({ length: 10001 }, (_, index) =>
    profile.trackHeightAtStation(index / 10000 * lapLength));
  const relief = Math.max(...heights) - Math.min(...heights);
  assert.ok(Math.abs(relief - expectedRelief) < .03,
    `${slug} relief is ${relief.toFixed(3)}m, expected ${expectedRelief.toFixed(3)}m`);
  assert.ok(Math.abs(profile.trackHeightAtStation(0)
    - profile.trackHeightAtStation(lapLength - .001)) < .01,
  `${slug} closes without an elevation seam`);

  const worldSource = await readFile(new URL(`../dist/${slug}/world.js`, import.meta.url), 'utf8');
  assert.match(worldSource, /mirrorTrackPointsX\(TRACK_POINTS\)/,
    `${slug} production world uses the reflected plan geometry`);
}

console.log('Seven remaining circuits use mirrored plans and visible closed relief profiles.');
