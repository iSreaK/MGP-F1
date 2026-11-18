import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three/build/three.module.js';

const specs = [
  { slug: 'madrid', className: 'Madrid', length: 5414, turns: 22,
    areaSign: -1, physicalRelief: [23, 25], renderedRelief: [31, 35] },
  { slug: 'baku', className: 'Baku', length: 6003, turns: 20,
    areaSign: 1, physicalRelief: [25, 28], renderedRelief: [32, 37] },
  { slug: 'sepang', className: 'Sepang', length: 5543, turns: 15,
    areaSign: -1, physicalRelief: [20, 23], renderedRelief: [28, 32] },
];

for (const spec of specs) {
  const track = await import(`../dist/${spec.slug}/track-data.js`);
  const geometry = await import(`../dist/${spec.slug}/geometry-smoothing.js`);
  const roster = await import(`../dist/${spec.slug}/replay-roster.js`);
  const prepare = geometry[`prepare${spec.className}Curve`];

  assert.equal(track.TRACK_LENGTH_METERS, spec.length);
  assert.equal(Object.keys(track.LANDMARKS.turns).length, spec.turns);
  assert.deepEqual(track.TRACK_POINTS[0], track.TRACK_POINTS.at(-1),
    `${spec.slug}: the plan must close exactly`);
  assert.ok(track.TRACK_POINTS.length > 850,
    `${spec.slug}: OpenF1 plan is too coarsely sampled`);

  let planarLength = 0, signedArea = 0;
  for (let i = 1; i < track.TRACK_POINTS.length; i++) {
    const a = track.TRACK_POINTS[i - 1], b = track.TRACK_POINTS[i];
    planarLength += Math.hypot(b[0] - a[0], b[1] - a[1]);
    signedArea += a[0] * b[1] - b[0] * a[1];
  }
  assert.ok(Math.abs(planarLength - spec.length) < .02,
    `${spec.slug}: ${planarLength} m plan`);
  assert.equal(Math.sign(signedArea), spec.areaSign,
    `${spec.slug}: source chirality changed`);

  const prepared = prepare(THREE, track.TRACK_POINTS, spec.length);
  assert.ok(Math.abs(prepared.renderedLength - spec.length) < .02,
    `${spec.slug}: ${prepared.renderedLength} m 3D curve`);

  const heights = geometry.ELEVATION_PROFILE_METERS.map(point => point[1]);
  const physicalRelief = Math.max(...heights) - Math.min(...heights);
  assert.ok(physicalRelief >= spec.physicalRelief[0]
    && physicalRelief <= spec.physicalRelief[1],
  `${spec.slug}: unexpected physical relief ${physicalRelief} m`);
  const renderedRelief = physicalRelief * geometry.RELIEF_PRESENTATION_SCALE;
  assert.ok(renderedRelief >= spec.renderedRelief[0]
    && renderedRelief <= spec.renderedRelief[1],
  `${spec.slug}: unreadable or excessive rendered relief ${renderedRelief} m`);

  const prefix = `${spec.slug.toUpperCase()}_2026`;
  const entries = roster[`${prefix}_DISPLAYED`];
  assert.equal(entries.length, 22, `${spec.slug}: all 2026 models must be present`);
  assert.equal(new Set(entries.map(entry => entry.replayNumber)).size, 22);
  assert.deepEqual(entries.map(entry => entry.gridPosition).sort((a, b) => a - b),
    Array.from({ length: 22 }, (_, index) => index + 1));

  const worldSource = await readFile(new URL(`../dist/${spec.slug}/world.js`, import.meta.url), 'utf8');
  assert.doesNotMatch(worldSource, /mirrorTrackPointsX|scale\.x\s*=\s*-1/,
    `${spec.slug}: no mirror transform is allowed`);
}

const sharedWorld = await readFile(new URL('../dist/late-2026-world.js', import.meta.url), 'utf8');
assert.doesNotMatch(sharedWorld, /mirrorTrackPointsX|scale\.x\s*=\s*-1/);

const menu = await readFile(new URL('../dist/circuit-menu.js', import.meta.url), 'utf8');
for (const spec of specs) assert.match(menu, new RegExp(`slug: '${spec.slug}'`));
assert.match(menu, /slug: 'yas-marina', number: '23'/);

console.log('late-2026 circuits: source direction, scale, relief, roster and menu verified');
