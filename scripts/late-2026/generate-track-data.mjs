#!/usr/bin/env node
// Rebuild the three late-2026 circuits from chronological OpenF1 location
// samples. The emitted x/z coordinates keep the source chirality: no mirror
// transform is applied anywhere in the scene pipeline.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const API = 'https://api.openf1.org/v1';

const circuits = [
  {
    slug: 'madrid', name: 'Madring (Madrid IFEMA)', sessionKey: 11369,
    driver: 63, lap: 49, length: 5414, width: 12, turns: 22,
    presentationScale: 1.38,
    source: 'OpenF1, GP d’Espagne 2026, tour 49 de George Russell',
  },
  {
    slug: 'baku', name: 'Baku City Circuit', sessionKey: 11377,
    driver: 63, lap: 49, length: 6003, width: 10.5, turns: 20,
    presentationScale: 1.30,
    source: 'OpenF1, GP d’Azerbaïdjan 2026, tour 49 de George Russell',
  },
  {
    slug: 'sepang', name: 'Sepang International Circuit', sessionKey: 11731,
    driver: 3, lap: 55, length: 5543, width: 15, turns: 15,
    presentationScale: 1.42,
    source: 'OpenF1, GP de Bahreïn en Malaisie 2026, tour 55 de Max Verstappen',
  },
];

const round = (value, digits = 4) => Number(value.toFixed(digits));
const wrap = (index, length) => ((index % length) + length) % length;

async function request(endpoint, query) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, attempt * 8000));
      continue;
    }
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) throw new Error(`${url}: aucune donnée`);
    return rows;
  }
}

function circularSmooth(points, radius, fields) {
  return points.map((point, i) => {
    const result = { ...point };
    for (const field of fields) {
      let sum = 0, weight = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const w = radius + 1 - Math.abs(offset);
        sum += points[wrap(i + offset, points.length)][field] * w;
        weight += w;
      }
      result[field] = sum / weight;
    }
    return result;
  });
}

function closedLength(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}

function resampleClosed(points, count) {
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    cumulative.push(cumulative.at(-1) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative.at(-1);
  const result = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const distance = i / count * total;
    while (segment < points.length - 1 && cumulative[segment + 1] < distance) segment++;
    const a = points[segment], b = points[(segment + 1) % points.length];
    const t = (distance - cumulative[segment]) /
      Math.max(1e-9, cumulative[segment + 1] - cumulative[segment]);
    result.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    });
  }
  return result;
}

function scaleAndCenter(points, targetLength) {
  let result = points.map(point => ({ ...point }));
  for (let pass = 0; pass < 3; pass++) {
    const factor = targetLength / closedLength(result);
    result = result.map(point => ({ ...point, x: point.x * factor, y: point.y * factor }));
  }
  const cx = result.reduce((sum, point) => sum + point.x, 0) / result.length;
  const cy = result.reduce((sum, point) => sum + point.y, 0) / result.length;
  return result.map(point => ({ ...point, x: point.x - cx, y: point.y - cy }));
}

function turnIndices(points, count, trackLength) {
  const candidates = [];
  const reach = Math.max(5, Math.round(points.length * 42 / trackLength));
  for (let i = 0; i < points.length; i++) {
    const a = points[wrap(i - reach, points.length)];
    const b = points[i];
    const c = points[wrap(i + reach, points.length)];
    const ax = b.x - a.x, ay = b.y - a.y;
    const bx = c.x - b.x, by = c.y - b.y;
    const angle = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    candidates.push({ index: i, score: angle });
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen = [];
  const minGap = Math.max(5, Math.round(points.length * 48 / trackLength));
  for (const candidate of candidates) {
    if (chosen.every(other => {
      const delta = Math.abs(candidate.index - other.index);
      return Math.min(delta, points.length - delta) >= minGap;
    })) chosen.push(candidate);
    if (chosen.length === count) break;
  }
  return chosen.map(item => item.index).sort((a, b) => a - b);
}

function profileAt(points, trackLength) {
  const min = Math.min(...points.map(point => point.z));
  const samples = [];
  const step = 75;
  for (let distance = 0; distance < trackLength; distance += step) {
    const index = Math.round(distance / trackLength * points.length) % points.length;
    samples.push([distance, Math.max(0, (points[index].z - min) / 10)]);
  }
  samples.push([trackLength, samples[0][1]]);
  return samples;
}

function trackModule(config, points, turns) {
  const plan = points.map(point => `  [${round(point.x)}, ${round(point.y)}],`).join('\n');
  const turnEntries = turns.map((index, i) => {
    const distance = index / points.length * config.length;
    return `    T${i + 1}: { name: 'Virage ${i + 1}', index: ${index}, distanceMeters: ${round(distance, 1)} },`;
  }).join('\n');
  return `// ${config.name}, configuration Formule 1 2026.\n` +
`// Géométrie reconstruite depuis les positions chronologiques du tour de référence.\n` +
`// Source : ${config.source}. https://openf1.org/\n` +
`// Les coordonnées gardent la chiralité OpenF1 : aucun effet miroir n'est appliqué.\n\n` +
`export const TRACK_LENGTH_METERS = ${config.length};\n` +
`export const TRACK_WIDTH_METERS = ${config.width};\n` +
`export const TRACK_POINTS = [\n${plan}\n  [${round(points[0].x)}, ${round(points[0].y)}],\n];\n\n` +
`export const LANDMARKS = {\n  controlLineIndex: 0,\n` +
`  pitStraight: { entryIndex: ${Math.round(points.length * .92)}, exitIndex: ${Math.round(points.length * .04)} },\n` +
`  turns: {\n${turnEntries}\n  },\n};\n`;
}

function elevationModule(config, profile) {
  const values = profile.map(([distance, height]) => `  [${round(distance, 1)}, ${round(height, 3)}],`).join('\n');
  const fn = config.slug[0].toUpperCase() + config.slug.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return `// Relief issu du canal z OpenF1 du même tour que le plan du circuit.\n` +
`// OpenF1 exprime z en décimètres ; la présentation verticale est amplifiée\n` +
`// modérément pour rester lisible dans la vue du circuit entier.\n` +
`const LAP_LENGTH = ${config.length};\nconst BASE_Y = .36;\n` +
`export const RELIEF_PRESENTATION_SCALE = ${config.presentationScale};\n` +
`export const ELEVATION_PROFILE_METERS = Object.freeze([\n${values}\n]);\n\n` +
`export function trackHeightAtStation(station) {\n` +
`  const distance = ((station % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;\n` +
`  let low = 0, high = ELEVATION_PROFILE_METERS.length - 2;\n` +
`  while (low < high) {\n    const middle = (low + high) >> 1;\n` +
`    if (ELEVATION_PROFILE_METERS[middle + 1][0] <= distance) low = middle + 1;\n    else high = middle;\n  }\n` +
`  const [x0, y0] = ELEVATION_PROFILE_METERS[low];\n` +
`  const [x1, y1] = ELEVATION_PROFILE_METERS[low + 1];\n` +
`  const t = (distance - x0) / Math.max(1e-9, x1 - x0);\n` +
`  const eased = t * t * (3 - 2 * t);\n` +
`  return BASE_Y + (y0 + (y1 - y0) * eased) * RELIEF_PRESENTATION_SCALE;\n}\n\n` +
`export const trackHeightAtFraction = fraction => trackHeightAtStation(fraction * LAP_LENGTH);\n\n` +
`export function prepare${fn}Curve(THREE, trackPoints, targetLengthMetres = LAP_LENGTH) {\n` +
`  const points2D = trackPoints.slice(0, -1);\n  const cumulative = [0];\n` +
`  for (let i = 1; i < points2D.length; i++) cumulative.push(cumulative.at(-1) +\n` +
`    Math.hypot(points2D[i][0] - points2D[i - 1][0], points2D[i][1] - points2D[i - 1][1]));\n` +
`  const last = points2D.at(-1), first = points2D[0];\n` +
`  const horizontalLength = cumulative.at(-1) + Math.hypot(first[0] - last[0], first[1] - last[1]);\n` +
`  const sourcePoints = points2D.map(([x, z], i) =>\n` +
`    new THREE.Vector3(x, trackHeightAtFraction(cumulative[i] / horizontalLength), z));\n` +
`  const curve = new THREE.CatmullRomCurve3(sourcePoints, true, 'centripetal', .18);\n` +
`  curve.arcLengthDivisions = 12000;\n  curve.updateArcLengths();\n` +
`  for (let pass = 0; pass < 3; pass++) {\n` +
`    const correction = targetLengthMetres / curve.getLength();\n` +
`    for (const point of sourcePoints) { point.x *= correction; point.z *= correction; }\n` +
`    curve.updateArcLengths();\n  }\n` +
`  return { curve, sourcePoints, horizontalLength, renderedLength: curve.getLength() };\n}\n`;
}

for (const config of circuits) {
  const laps = await request('laps', {
    session_key: config.sessionKey, driver_number: config.driver, lap_number: config.lap,
  });
  const lap = laps[0];
  const start = lap.date_start;
  const end = new Date(Date.parse(start) + lap.lap_duration * 1000 + 1500).toISOString();
  const rows = await request('location', {
    session_key: config.sessionKey, driver_number: config.driver,
    'date>': start, 'date<': end,
  });
  let points = rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .filter(row => [row.x, row.y, row.z].every(Number.isFinite))
    .map(row => ({ x: row.x, y: row.y, z: row.z }));
  points = points.filter((point, i) => !i || Math.hypot(point.x - points[i - 1].x,
    point.y - points[i - 1].y) > 1);
  points = circularSmooth(points, 2, ['x', 'y']);
  points = circularSmooth(points, 5, ['z']);
  points = resampleClosed(points, Math.round(config.length / 6));
  points = circularSmooth(points, 1, ['x', 'y']);
  points = scaleAndCenter(points, config.length);
  const turns = turnIndices(points, config.turns, config.length);
  const profile = profileAt(points, config.length);
  const folder = path.join(ROOT, 'dist', config.slug);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'track-data.js'), trackModule(config, points, turns));
  await writeFile(path.join(folder, 'geometry-smoothing.js'), elevationModule(config, profile));
  console.log(`${config.slug}: ${points.length} points, ${turns.length} virages, ` +
    `plan ${closedLength(points).toFixed(2)} m, relief ${Math.min(...profile.map(p => p[1])).toFixed(1)}–${Math.max(...profile.map(p => p[1])).toFixed(1)} m`);
}
