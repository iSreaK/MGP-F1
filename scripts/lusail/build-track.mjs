#!/usr/bin/env node
// Build a metre-spaced, straight-preserving centreline from the MIT GPS outline.
// Official reference for corner order, start/control lines and the 5,419 m scale:
// https://www.fia.com/system/files/decision-document/2025_lusail_event_-_circuit_map_-_qatar_2025.pdf
// The source outline is not an FIA kerb survey. The Qatar GPS aspect is checked
// against the FIA diagram; only the lap circumference is calibrated to 5,419 m.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const { points: supplied } = JSON.parse(await readFile(path.join(import.meta.dirname, 'gps-reference.json'), 'utf8'));
const officialLength = 5419;
// The source normalises each GPS axis separately. Restore the x:z ratio from
// the FIA plan-view bounding box before applying the measured lap scale.
const aspect = 970 / 1125;
const source = supplied.slice(0, -1).map(([u, v]) => [(u - .5) * aspect, (v - .5)]);
const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cumulative = [0];
for (let i = 1; i <= source.length; i++) {
  cumulative.push(cumulative.at(-1) + close(source[i - 1], source[i % source.length]));
}
const rawLength = cumulative.at(-1);
const scale = officialLength / rawLength;
const scaled = source.map(([x, z]) => [x * scale, z * scale]);
const stations = cumulative.map(distance => distance * scale);
function pointAt(station) {
  const s = ((station % officialLength) + officialLength) % officialLength;
  let lo = 0, hi = stations.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (stations[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = scaled[lo], b = scaled[(lo + 1) % scaled.length];
  const t = (s - stations[lo]) / (stations[lo + 1] - stations[lo]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
// The outline begins around the FIA standing-start line. The chequered control
// line is 272 m behind it in the driving direction (57*5419 - 308611).
const controlStation = officialLength - 272;
const count = Math.round(officialLength / 4);
const raw = Array.from({ length: count }, (_, i) => pointAt(controlStation + i * officialLength / count));
// A short symmetric smoothing pass removes digitisation kinks in corners while
// retaining mathematically straight centres along the long tangent sections.
const weights = [1, 4, 6, 4, 1];
const smooth = raw.map((_, i) => [0, 1].map(axis =>
  weights.reduce((sum, weight, j) => sum + weight * raw[(i + j - 2 + count) % count][axis], 0) / 16));
let smoothLength = 0;
for (let i = 0; i < count; i++) smoothLength += close(smooth[i], smooth[(i + 1) % count]);
const correction = officialLength / smoothLength;
const output = smooth.map(([x, z]) => [+((x - smooth[0][0]) * correction).toFixed(4), +((z - smooth[0][1]) * correction).toFixed(4)]);
output.push([...output[0]]);
const corners = [
  [.05,.3425], [.2836,.3286], [.2827,.2354], [.4934,.05],
  [.5712,.1249], [.4534,.2532], [.7311,.2376], [.6605,.3262],
  [.6369,.3909], [.4864,.4561], [.6713,.5483], [.8876,.5402],
  [.95,.6359], [.8582,.7442], [.6433,.7169], [.4659,.95],
];
const nearest = ([u, v]) => {
  const x = (u - .5) * aspect * scale * correction - smooth[0][0] * correction;
  const z = (v - .5) * scale * correction - smooth[0][1] * correction;
  let best = 0, distance = Infinity;
  for (let i = 0; i < count; i++) {
    const d = (output[i][0] - x) ** 2 + (output[i][1] - z) ** 2;
    if (d < distance) { best = i; distance = d; }
  }
  return best;
};
const turns = Object.fromEntries(corners.map((position, i) => {
  const index = nearest(position);
  return [`T${i + 1}`, { name: `Virage ${i + 1}`, index,
    distanceMeters: +((index / count) * officialLength).toFixed(1) }];
}));
const pitEntry = nearest([.39,.87]);  // after T16, before control line
const pitExit = nearest([.12,.47]);   // on the approach to T1
const landmarks = {
  controlLineIndex: 0,
  gridIndex: Math.round(272 / officialLength * count),
  startLineOffsetMeters: 272,
  pitStraight: { fromIndex: pitEntry, toIndex: pitExit,
    pitLaneSide: 'left of travel / positive across',
    entryIndex: pitEntry, exitIndex: pitExit },
  turns,
  sectors: { S1: { beforeTurn: 'T6', beforeMeters: 80 },
    S2: { beforeTurn: 'T12', beforeMeters: 75 } },
  drs: { detection1: { afterTurn: 'T15', afterMeters: 40 },
    activation1: { afterTurn: 'T16', afterMeters: 305 } },
  speedTrap: { beforeTurn: 'T1', beforeMeters: 205 },
};
const header = `// Lusail International Circuit · FIA 2025 F1 layout, clockwise.\n// FIA circuit map: https://www.fia.com/system/files/decision-document/2025_lusail_event_-_circuit_map_-_qatar_2025.pdf\n// Outline: MIT GPS-derived data in scripts/lusail/gps-reference.json.\n// Centreline scaled to official 5,419 m. Width, kerbs, pit lane and elevations\n// are visual reconstructions rather than surveyed FIA geometry.\n\n`;
const data = `${header}export const TRACK_LENGTH_METERS = 5419;\nexport const TRACK_WIDTH_METERS = 12;\nexport const TRACK_POINTS = ${JSON.stringify(output)};\nexport const LANDMARKS = ${JSON.stringify(landmarks, null, 2)};\n`;
await writeFile(path.join(ROOT, 'dist/lusail/track-data.js'), data);
console.log(`Lusail: ${count} centreline points; ${smoothLength.toFixed(2)} m before calibration; pit ${pitEntry}→${pitExit}; corners ${Object.values(turns).map(turn => turn.index).join(',')}`);
