#!/usr/bin/env node
// Extract a compact, representative dry-race speed profile for the optional
// free simulation. Historic replay itself keeps every original 2 Hz sample.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = import.meta.dirname;
const source = JSON.parse(await readFile(join(root, '..', '..', 'dist', 'yas-marina',
  'data', 'yas-marina-2025-replay.json'), 'utf8'));
const length = source.session.trackLengthMeters;
const phase = source.session.controlLineBeforeStartMeters;
const count = Math.round(length / 6);
const bins = Array.from({ length: count }, () => []);
const wrap = value => ((value % length) + length) % length;
const percentile = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];
let validLaps = 0;

for (const driver of Object.values(source.drivers)) {
  const clean = driver.laps.filter(lap => lap.lap >= 3 && lap.lap <= 54
    && lap.durationSec >= 80 && lap.durationSec <= 99)
    .map(lap => lap.durationSec).sort((a, b) => a - b);
  if (clean.length < 8) continue;
  const cutoff = percentile(clean, .45) + 1;
  for (const lap of driver.laps) {
    if (lap.lap < 3 || lap.lap > 54 || lap.durationSec < 80
      || lap.durationSec > cutoff) continue;
    validLaps++;
    const first = Math.max(0, Math.ceil(lap.startSec * 2));
    const last = Math.min(driver.samples.length - 1,
      Math.floor((lap.startSec + lap.durationSec) * 2));
    for (let i = first; i <= last; i++) {
      const sample = driver.samples[i];
      if (sample[0] < lap.startSec || sample[0] >= lap.startSec + lap.durationSec
        || sample[2] < 30 || sample[2] > 360) continue;
      const station = wrap(sample[1] + phase);
      bins[Math.floor(station / length * count)].push(sample[2]);
    }
  }
}

const raw = bins.map(values => {
  values.sort((a, b) => a - b);
  return values.length ? percentile(values, .62) : null;
});
if (raw.filter(value => value !== null).length < count * .95)
  throw new Error('Insufficient racing-speed coverage around Yas Marina.');
for (let i = 0; i < count; i++) {
  if (raw[i] !== null) continue;
  let before = i, after = i;
  while (raw[((before % count) + count) % count] === null) before--;
  while (raw[((after % count) + count) % count] === null) after++;
  raw[i] = (raw[((before % count) + count) % count]
    + raw[((after % count) + count) % count]) / 2;
}
const weights = [1, 2, 3, 4, 5, 4, 3, 2, 1];
const smooth = raw.map((_, i) => weights.reduce((sum, weight, j) =>
  sum + raw[((i + j - 4) % count + count) % count] * weight, 0)
  / weights.reduce((sum, weight) => sum + weight, 0));
const rounded = smooth.map(value => Math.round(value * 10) / 10);
const rows = [];
for (let i = 0; i < rounded.length; i += 14)
  rows.push(`  ${rounded.slice(i, i + 14).join(', ')},`);
const output = `// Representative 2025 Yas Marina dry-race speed, built from ${validLaps} valid laps.\n`
  + '// Source: processed OpenF1 speed + official control-line station. Rebuild with\n'
  + '// scripts/yas-marina-replay/build-free-speed-profile.mjs after replay changes.\n'
  + `export const FREE_SPEED_PROFILE_KMH = [\n${rows.join('\n')}\n];\n`;
const destination = join(root, '..', '..', 'dist', 'yas-marina', 'free-speed-profile.js');
await writeFile(destination, output);
const meanLap = rounded.reduce((sum, speed) => sum + length / count / (speed / 3.6), 0);
console.log(`Free speed profile: ${count} stations, ${validLaps} clean laps, `
  + `${Math.min(...rounded)}–${Math.max(...rounded)} km/h, integral ${meanLap.toFixed(1)} s.`);
