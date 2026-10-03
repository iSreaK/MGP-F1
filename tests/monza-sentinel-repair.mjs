import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Independent acceptance check for the archive's invalid 104/104 sensor runs.
// The replay exporter is the subject under test; this file only reads its JSON.
const replay = JSON.parse(readFileSync(new URL(
  '../dist/monza/data/monza-2026-replay.json', import.meta.url), 'utf8'));
const rawDir = process.env.MONZA_REPLAY_RAW_DIR
  || fileURLToPath(new URL('../scripts/monza-replay/raw/', import.meta.url));
const columns = Object.fromEntries(replay.sampleFields.map((name, index) => [name, index]));
const speedAt = sample => sample[columns.speedKph];
const brakeAt = sample => sample[columns.brakePct];
const progressAt = sample => sample[columns.progressMeters];
const timeAt = sample => sample[columns.tSec];
const raceStart = Date.parse(replay.session.start);

const knownBlocks = [
  { number: 81, from: 3233.1, to: 3238.6, label: 'Piastri, tour 14, T1' },
  { number: 81, from: 5587.1, to: 5592.4, label: 'Piastri, tour 41, T1' },
  { number: 10, from: 4586.9, to: 4590.7, label: 'Gasly, tour 29, après S1' },
  { number: 23, from: 6206.0, to: 6210.4, label: 'Albon, tour 47, après S1' },
  { number: 43, from: 4507.8, to: 4513.7, label: 'Colapinto, tour 28, après S1' },
];

function invalidRuns(number) {
  const filename = join(rawDir, `car_data_${number}.json`);
  const rows = JSON.parse(readFileSync(filename, 'utf8'));
  const runs = [];
  let first = -1;
  const finish = end => {
    if (first < 0) return;
    const from = (Date.parse(rows[first].date) - raceStart) / 1000;
    const to = (Date.parse(rows[end].date) - raceStart) / 1000;
    if (from >= 0 && from < replay.drivers[number].finishSec
      && to - from >= 1.5 && rows[first].speed > 60) {
      runs.push({ number, from, to, label: `#${number}, t=${from.toFixed(1)} s` });
    }
    first = -1;
  };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const invalid = row.throttle === 104 && row.brake === 104 && row.speed > 60;
    if (invalid && first < 0) first = index;
    else if (!invalid) finish(index - 1);
  }
  finish(rows.length - 1);
  return runs;
}

const allRawPresent = Object.keys(replay.drivers).every(number =>
  existsSync(join(rawDir, `car_data_${number}.json`)));
const blocks = allRawPresent
  ? Object.keys(replay.drivers).flatMap(invalidRuns)
  : knownBlocks;
assert.ok(blocks.length >= (allRawPresent ? 100 : 5), 'Blocs témoins insuffisants');

let hardBraking = 0;
let checkedMotion = 0;
for (const block of blocks) {
  const driver = replay.drivers[block.number];
  assert.ok(driver, `Pilote absent : ${block.label}`);
  const samples = driver.samples.filter(sample =>
    timeAt(sample) >= block.from - 1 && timeAt(sample) <= block.to + 1.5);
  assert.ok(samples.length >= 4, `Échantillons insuffisants : ${block.label}`);

  const inPause = replay.session.pauses.some(pause =>
    block.from <= pause.endSec + 120 && block.to >= pause.startSec - 10);
  const nearPit = driver.pit?.some(pit =>
    pit.tSec >= block.from - 15 && pit.tSec <= block.to + 15);

  // High-speed 104/104 packets once made some cars stand still for several
  // seconds. A moving car must keep advancing through each reconstructed run.
  if (!inPause && !nearPit) {
    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1], current = samples[index];
      if (timeAt(current) > block.to || timeAt(current) < block.from) continue;
      if (speedAt(current) > 120) {
        checkedMotion++;
        assert.ok(progressAt(current) > progressAt(previous) + 0.1,
          `Voiture figée malgré ${speedAt(current)} km/h : ${block.label}`);
      }
    }
  }

  // Coast and ERS lift-off are allowed. A drop of over 110 km/h to below
  // 180 km/h in this short window is a heavy braking event and needs a brake
  // indication. This catches a healthy-lap donor mapped to the wrong sector.
  if (inPause || nearPit || block.to - block.from > 9) continue;
  const early = samples.filter(sample => timeAt(sample) <= block.from + 0.5);
  const later = samples.filter(sample => timeAt(sample) >= block.from);
  const entrySpeed = Math.max(...early.map(speedAt));
  const exitMinimum = Math.min(...later.map(speedAt));
  if (entrySpeed - exitMinimum < 110 || exitMinimum > 180) continue;
  hardBraking++;
  assert.ok(samples.some(sample => brakeAt(sample) >= 20),
    `Forte décélération sans frein dans ${block.label} : ${entrySpeed} → ${exitMinimum} km/h`);
}

assert.ok(checkedMotion >= 20, 'Pas assez de mouvement reconstruit vérifié');
assert.ok(hardBraking >= (allRawPresent ? 20 : 3), 'Pas assez de freinages reconstruits vérifiés');
console.log(`${blocks.length} blocs invalides contrôlés, ${checkedMotion} pas de mouvement, ${hardBraking} freinages forts cohérents`);
