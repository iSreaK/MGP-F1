#!/usr/bin/env node
// Build a local, reduced Singapore 2025 replay from verified OpenF1 responses.
// Writes the local replay JSON; it does not deploy the website.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carByKey } from '../../dist/car-catalog.js';
import { SINGAPORE_2025_ROSTER, SINGAPORE_2025_TRACK_LENGTH_METERS } from '../../dist/singapore/replay-roster.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW = process.env.SINGAPORE_REPLAY_RAW_DIR || join(ROOT, 'raw');
const OUTPUT = join(ROOT, '..', '..', 'dist', 'singapore', 'data', 'singapore-2025-replay.json');
const SESSION = JSON.parse(await readFile(join(RAW, 'session.json'), 'utf8'));
if (SESSION.year !== 2025 || SESSION.country_name !== 'Singapore'
  || SESSION.session_name !== 'Race' || !Number.isInteger(SESSION.session_key)) {
  throw new Error('session.json ne décrit pas le GP de Singapour 2025.');
}
const SESSION_KEY = SESSION.session_key;
const TRACK_LENGTH_METERS = SINGAPORE_2025_TRACK_LENGTH_METERS;
// FIA 2025: 62 * 4,927 m - official race distance 305,337 m = 137 m.
const CONTROL_LINE_OFFSET_METERS = 137;
const FRAME_INTERVAL_MS = 500;
const MAX_PROGRESS_METERS_PER_SECOND = 105;
const OFFICIAL_GRID_URL = 'https://www.formula1.com/en/results/2025/races/1270/singapore/starting-grid';
const OFFICIAL_RESULT_URL = 'https://www.formula1.com/en/results/2025/races/1270/singapore/race-result';

// Keep all 20 historical entrants, including Hadjar without a 3D model.
// 2025 numbers must never be used to choose 2026 assets (Verstappen 1/3,
// Norris 4/1). The model is selected by modelKey, which names a person.
const DRIVERS = SINGAPORE_2025_ROSTER.map(driver => ({
  number: driver.replayNumber, name: driver.name,
  gridPosition: driver.gridPosition, finalPosition: driver.finalPosition,
  modelKey: driver.modelKey, team2025: driver.team2025,
  pitLaneStart: !!driver.pitLaneStart,
}));
for (const field of ['number', 'gridPosition', 'finalPosition']) {
  const values = DRIVERS.map(driver => driver[field]);
  if (DRIVERS.length !== 20 || new Set(values).size !== 20) {
    throw new Error(`La liste historique contient des ${field} manquants ou dupliqués.`);
  }
}
if (DRIVERS.filter(driver => driver.modelKey).length !== 19
  || DRIVERS.find(driver => driver.number === 6)?.modelKey !== null) {
  throw new Error('Le contrat du replay exige vingt pilotes historiques et dix-neuf modèles 3D.');
}
for (const driver of DRIVERS.filter(driver => driver.modelKey)) {
  const model = carByKey[driver.modelKey];
  if (!model || !model.driverName.toLowerCase().includes(driver.name.split(' ').at(-1).toLowerCase())) {
    throw new Error(`Modèle 2026 introuvable ou incorrect pour ${driver.name}.`);
  }
}
const SELECTED_NUMBERS = new Set(DRIVERS.map(driver => driver.number));

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const time = value => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Date invalide : ${value}`);
  return parsed;
};
const relativeSeconds = (timestamp, start) => round((timestamp - start) / 1000, 3);

async function readJson(filename, optional = false) {
  try {
    const data = JSON.parse(await readFile(join(RAW, filename), 'utf8'));
    if (!Array.isArray(data)) throw new Error(`${filename} n'est pas un tableau JSON.`);
    if (data.some(row => row.session_key !== SESSION_KEY)) {
      throw new Error(`${filename} contient une autre session.`);
    }
    return data;
  } catch (error) {
    if (optional && error.code === 'ENOENT') return [];
    throw error;
  }
}

function sortedTimed(rows, field = 'date') {
  return rows.map(row => ({ ...row, t: time(row[field]) })).sort((a, b) => a.t - b.t);
}

function findPauses(controlRows, start, end) {
  const pauses = [];
  let pending = null;
  for (const row of controlRows) {
    const message = String(row.message || '').toUpperCase();
    if (row.t < start || row.t > end) continue;
    if (/RED FLAG.*(SUSPENDED|STOPPED)|RACE SUSPENDED/.test(message)) {
      if (pending === null) pending = row.t;
    } else if (pending !== null && /SESSION STARTED|RACE RESUMED/.test(message)) {
      if (row.t > pending) pauses.push({ start: pending, end: row.t });
      pending = null;
    }
  }
  if (pending !== null) pauses.push({ start: pending, end });
  return pauses;
}

function pauseAt(pauses, t) {
  return pauses.find(pause => pause.start <= t && t < pause.end);
}

function activeDuration(a, b, pauses) {
  let duration = b - a;
  for (const pause of pauses) {
    duration -= Math.max(0, Math.min(b, pause.end) - Math.max(a, pause.start));
  }
  return Math.max(0, duration);
}

function findBefore(rows, t) {
  let low = 0, high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle].t <= t) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function positionAtTime(locations, t) {
  const before = findBefore(locations, t);
  if (before < 0) return locations[0];
  if (before >= locations.length - 1) return locations.at(-1);
  const a = locations[before], b = locations[before + 1];
  if (a.t === t || b.t - a.t > 2000) return a;
  const fraction = (t - a.t) / (b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}

function makeAnchors(laps, startOffsetMeters, pauses, finish) {
  const anchors = [{ t: laps[0].t, progress: startOffsetMeters }];
  for (let index = 0; index < laps.length; index++) {
    const lap = laps[index];
    const end = index + 1 < laps.length
      ? laps[index + 1].t
      : finish;
    if (!(end > lap.t)) throw new Error(`Tour ${lap.lap_number} non chronologique.`);
    if (!pauseAt(pauses, end)) {
      anchors.push({ t: end, progress: lap.lap_number * TRACK_LENGTH_METERS });
    }
  }
  for (let index = 1; index < anchors.length; index++) {
    if (!(anchors[index].t > anchors[index - 1].t)
      || !(anchors[index].progress > anchors[index - 1].progress)) {
      throw new Error('Ancres de progression non monotones.');
    }
  }
  return anchors;
}

function makeSegment(a, b, locations, pauses) {
  const nodes = [
    { ...positionAtTime(locations, a.t), t: a.t },
    ...locations.filter(point => point.t > a.t && point.t < b.t),
    ...pauses.flatMap(pause => [pause.start, pause.end]
      .filter(t => t > a.t && t < b.t)
      .map(t => ({ ...positionAtTime(locations, t), t }))),
    { ...positionAtTime(locations, b.t), t: b.t },
  ].sort((left, right) => left.t - right.t);

  let cumulative = 0;
  nodes[0].distance = 0;
  for (let index = 1; index < nodes.length; index++) {
    const previous = nodes[index - 1], current = nodes[index];
    const seconds = (current.t - previous.t) / 1000;
    const step = Math.hypot(current.x - previous.x, current.y - previous.y);
    const midpoint = (previous.t + current.t) / 2;
    // OpenF1 coordinates are about ten units per metre here. Ignore GPS noise,
    // impossible jumps and all travel during a red-flag suspension.
    if (seconds > 0 && seconds <= 10 && step >= 2
      && step / seconds <= 1800 && !pauseAt(pauses, midpoint)) {
      cumulative += step;
    }
    current.distance = cumulative;
  }
  return { start: a, end: b, nodes, totalDistance: cumulative, activeMs: activeDuration(a.t, b.t, pauses) };
}

function progressAtTime(segments, anchors, pauses, timestamp) {
  if (timestamp <= anchors[0].t) return anchors[0].progress;
  if (timestamp >= anchors.at(-1).t) return anchors.at(-1).progress;
  const pause = pauseAt(pauses, timestamp);
  const t = pause ? pause.start : timestamp;
  let low = 0, high = segments.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (segments[middle].end.t < t) low = middle + 1;
    else high = middle;
  }
  const segment = segments[low];
  const index = Math.max(0, findBefore(segment.nodes, t));
  const node = segment.nodes[index], next = segment.nodes[index + 1];
  const blend = next && next.t > node.t ? (t - node.t) / (next.t - node.t) : 0;
  const travelled = node.distance + (next ? (next.distance - node.distance) * blend : 0);
  let fraction;
  if (segment.totalDistance > 0) {
    fraction = travelled / segment.totalDistance;
  } else if (segment.activeMs > 0) {
    fraction = activeDuration(segment.start.t, t, pauses) / segment.activeMs;
  } else {
    fraction = 0;
  }
  return segment.start.progress + (segment.end.progress - segment.start.progress) * clamp(fraction, 0, 1);
}

function smoothProgress(frameTimes, segments, anchors, pauses) {
  // Keep the exact timing anchors, but limit local GPS spikes to a plausible
  // track speed. A forward and backward pass redistributes excess motion over
  // the rest of that lap; pauses have zero active time, so their pose is fixed.
  const allTimes = [...new Set([
    ...frameTimes,
    ...anchors.map(anchor => anchor.t),
    ...pauses.flatMap(pause => [pause.start, pause.end]),
  ])].sort((a, b) => a - b);
  const values = allTimes.map(t => progressAtTime(segments, anchors, pauses, t));
  const indexByTime = new Map(allTimes.map((t, index) => [t, index]));
  for (let section = 0; section < anchors.length - 1; section++) {
    const first = indexByTime.get(anchors[section].t);
    const last = indexByTime.get(anchors[section + 1].t);
    const p0 = anchors[section].progress, p1 = anchors[section + 1].progress;
    const activeSeconds = activeDuration(allTimes[first], allTimes[last], pauses) / 1000;
    if (p1 - p0 > activeSeconds * MAX_PROGRESS_METERS_PER_SECOND + 0.01) {
      throw new Error(`Tour ${section + 1} trop court pour lisser la progression.`);
    }
    values[first] = p0;
    values[last] = p1;
    for (let index = first + 1; index < last; index++) {
      const elapsed = activeDuration(allTimes[first], allTimes[index], pauses) / 1000;
      const remaining = activeDuration(allTimes[index], allTimes[last], pauses) / 1000;
      values[index] = clamp(values[index],
        Math.max(p0, p1 - MAX_PROGRESS_METERS_PER_SECOND * remaining),
        Math.min(p1, p0 + MAX_PROGRESS_METERS_PER_SECOND * elapsed));
    }
    for (let index = first + 1; index <= last; index++) {
      const maximumStep = MAX_PROGRESS_METERS_PER_SECOND
        * activeDuration(allTimes[index - 1], allTimes[index], pauses) / 1000;
      values[index] = clamp(values[index], values[index - 1], values[index - 1] + maximumStep);
    }
    for (let index = last - 1; index >= first; index--) {
      const maximumStep = MAX_PROGRESS_METERS_PER_SECOND
        * activeDuration(allTimes[index], allTimes[index + 1], pauses) / 1000;
      values[index] = clamp(values[index], values[index + 1] - maximumStep, values[index + 1]);
    }
  }
  return new Map(allTimes.map((t, index) => [t, values[index]]));
}

function telemetryAt(rows, t, index) {
  while (index.value + 1 < rows.length && rows[index.value + 1].t <= t) index.value++;
  const a = rows[index.value], b = rows[index.value + 1] || a;
  const fraction = b.t > a.t && b.t - a.t < 2000 ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  const interpolate = field => Number.isFinite(a[field]) && Number.isFinite(b[field])
    ? a[field] + (b[field] - a[field]) * fraction
    : Number(a[field]) || 0;
  return [Math.round(interpolate('speed')), Math.round(interpolate('throttle')),
    Number(a.brake) || 0, Number(a.n_gear) || 0];
}

const staleTelemetry = row => row.throttle === 104 && row.brake === 104;

function validTelemetryAt(rows, t) {
  const index = findBefore(rows, t);
  if (index < 0 || index >= rows.length - 1) return null;
  const a = rows[index], b = rows[index + 1];
  if (b.t - a.t > 1200 || staleTelemetry(a) || staleTelemetry(b)) return null;
  const fraction = clamp((t - a.t) / (b.t - a.t), 0, 1);
  const mix = field => a[field] + (b[field] - a[field]) * fraction;
  return { speed: mix('speed'), throttle: mix('throttle'),
    brake: mix('brake'), n_gear: fraction < .5 ? a.n_gear : b.n_gear };
}

function sectorBounds(lap, end) {
  const seconds = [lap.duration_sector_1, lap.duration_sector_2,
    lap.duration_sector_3];
  if (seconds.some(value => !Number.isFinite(value) || value <= 0)
    || Math.abs(seconds.reduce((a, b) => a + b, 0) * 1000 - (end - lap.t)) > 2000) {
    return null;
  }
  return [lap.t, lap.t + seconds[0] * 1000,
    lap.t + (seconds[0] + seconds[1]) * 1000, end];
}

function remapSectorTime(t, source, target) {
  let sector = 2;
  for (let index = 0; index < 3; index++) {
    if (t < source[index + 1]) { sector = index; break; }
  }
  const fraction = clamp((t - source[sector])
    / (source[sector + 1] - source[sector]), 0, 1);
  return target[sector] + fraction * (target[sector + 1] - target[sector]);
}

function repairStaleTelemetry(rows, laps, finish) {
  const repaired = rows.map(row => ({ ...row }));
  const summary = { blocks: 0, seconds: 0, rows: 0, templateBlocks: 0,
    fallbackBlocks: 0, sanitizedChannelRows: 0, inferredBrakeRows: 0 };
  const lapEnd = index => index + 1 < laps.length ? laps[index + 1].t : finish;
  for (let index = 0; index < rows.length;) {
    if (!staleTelemetry(rows[index]) || rows[index].speed <= 60
      || rows[index].t >= finish) { index++; continue; }
    let first = index;
    const plateauSpeed = rows[index].speed;
    while (index < rows.length && staleTelemetry(rows[index])
      && rows[index].speed > 60 && rows[index].t < finish) index++;
    while (first > 1 && (rows[first - 1].throttle > 100 || rows[first - 1].brake > 100)
      && Math.abs(rows[first - 1].speed - plateauSpeed) <= 3
      && rows[first].t - rows[first - 1].t < 1200) first--;
    // Some packets clear their invalid sensor flags one sample before the
    // cached speed jumps to the true corner speed. Include that stale tail.
    while (index + 1 < rows.length && Math.abs(rows[index].speed - plateauSpeed) <= 3
      && rows[index].speed - rows[index + 1].speed > 100
      && rows[index + 1].t - rows[index].t < 1000) index++;
    const last = index - 1;
    const sharpDrop = index < rows.length && rows[last].speed - rows[index].speed > 90
      && rows[index].t - rows[last].t < 1000;
    if ((rows[last].t - rows[first].t < 1500 && !sharpDrop)
      || first === 0 || index >= rows.length) continue;
    const left = rows[first - 1], right = rows[index];
    if (staleTelemetry(left) || staleTelemetry(right)
      || !Number.isFinite(left.speed) || !Number.isFinite(right.speed)) continue;
    const lapIndex = findBefore(laps, (left.t + right.t) / 2);
    if (lapIndex < 0) continue;
    const currentLap = laps[lapIndex], currentEnd = lapEnd(lapIndex);
    const duration = currentEnd - currentLap.t;
    const currentSectors = sectorBounds(currentLap, currentEnd);
    const candidates = [];
    if (duration >= 70000 && duration <= 140000 && right.t <= currentEnd) {
      for (let other = 0; other < laps.length - 1; other++) {
        if (other === lapIndex) continue;
        const otherDuration = lapEnd(other) - laps[other].t;
        if (otherDuration < 70000 || otherDuration > 105000) continue;
        const otherSectors = sectorBounds(laps[other], lapEnd(other));
        let score = Math.abs(other - lapIndex);
        let mappedTime;
        if (currentSectors && otherSectors) {
          let comparable = true;
          for (let sector = 0; sector < 3; sector++) {
            if (left.t >= currentSectors[sector + 1]
              || right.t < currentSectors[sector]) continue;
            const sourceDuration = currentSectors[sector + 1] - currentSectors[sector];
            const donorDuration = otherSectors[sector + 1] - otherSectors[sector];
            const difference = Math.abs(donorDuration / sourceDuration - 1);
            if (difference > .15) { comparable = false; break; }
            score += difference * 20;
          }
          if (!comparable) continue;
          mappedTime = t => remapSectorTime(t, currentSectors, otherSectors);
        } else {
          const difference = Math.abs(otherDuration / duration - 1);
          if (difference > .08) continue;
          score += difference * 20;
          mappedTime = t => laps[other].t
            + (t - currentLap.t) * otherDuration / duration;
        }
        let clean = true;
        for (let t = left.t; t <= right.t; t += 1000) {
          if (!validTelemetryAt(rows, mappedTime(t))) { clean = false; break; }
        }
        if (clean && validTelemetryAt(rows, mappedTime(right.t))) {
          candidates.push({ other, mappedTime, score });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const templates = candidates.slice(0, 3);
    const templateAt = t => {
      const profiles = templates.map(candidate =>
        validTelemetryAt(rows, candidate.mappedTime(t)));
      if (profiles.some(profile => !profile)) return null;
      return { speed: median(profiles.map(profile => profile.speed)),
        throttle: median(profiles.map(profile => profile.throttle)),
        brake: median(profiles.map(profile => profile.brake)),
        n_gear: Math.round(median(profiles.map(profile => profile.n_gear))) };
    };
    const leftTemplate = templates.length ? templateAt(left.t) : null;
    const rightTemplate = templates.length ? templateAt(right.t) : null;
    const useTemplate = !!leftTemplate && !!rightTemplate;
    for (let at = first; at <= last; at++) {
      const row = rows[at];
      const fraction = (row.t - left.t) / (right.t - left.t);
      const profile = useTemplate ? templateAt(row.t) : null;
      const speed = profile
        ? profile.speed + (left.speed - leftTemplate.speed) * (1 - fraction)
          + (right.speed - rightTemplate.speed) * fraction
        : left.speed + (right.speed - left.speed) * fraction;
      repaired[at].speed = clamp(round(speed), 0, 380);
      repaired[at].throttle = profile
        ? clamp(Math.round(profile.throttle), 0, 100)
        : clamp(Math.round(left.throttle + (right.throttle - left.throttle) * fraction), 0, 100);
      repaired[at].brake = profile
        ? clamp(Math.round(profile.brake), 0, 100)
        : clamp(Math.round(left.brake + (right.brake - left.brake) * fraction), 0, 100);
      repaired[at].n_gear = profile ? profile.n_gear
        : fraction < .5 ? left.n_gear : right.n_gear;
    }
    for (let at = first; at <= last; at++) {
      const before = repaired[Math.max(first - 1, at - 1)];
      const after = repaired[Math.min(last + 1, at + 1)];
      const seconds = (after.t - before.t) / 1000;
      const deceleration = seconds > 0 ? (before.speed - after.speed) / seconds : 0;
      if (deceleration > 20 && repaired[at].speed > 60
        && repaired[at].brake < 20) {
        // The sensor packet is unavailable; sustained deceleration makes a
        // braking estimate safer than displaying simultaneous full throttle.
        repaired[at].brake = clamp(Math.round((deceleration - 15) * 4), 20, 100);
        repaired[at].throttle = Math.min(repaired[at].throttle, 30);
        summary.inferredBrakeRows++;
      }
    }
    summary.blocks++;
    summary.seconds += (rows[last].t - rows[first].t) / 1000;
    summary.rows += last - first + 1;
    if (useTemplate) summary.templateBlocks++;
    else summary.fallbackBlocks++;
  }
  const sanitized = new Set();
  for (const field of ['throttle', 'brake']) {
    const nextValid = new Array(repaired.length);
    let next = -1;
    for (let index = repaired.length - 1; index >= 0; index--) {
      nextValid[index] = next;
      if (repaired[index][field] >= 0 && repaired[index][field] <= 100) next = index;
    }
    let previous = -1;
    for (let index = 0; index < repaired.length; index++) {
      const row = repaired[index];
      if (row[field] >= 0 && row[field] <= 100) { previous = index; continue; }
      const after = nextValid[index];
      const beforeRow = previous >= 0 ? repaired[previous] : null;
      const afterRow = after >= 0 ? repaired[after] : null;
      const span = beforeRow && afterRow ? afterRow.t - beforeRow.t : Infinity;
      const value = span <= 5000
        ? beforeRow[field] + (afterRow[field] - beforeRow[field])
          * (row.t - beforeRow.t) / span
        : beforeRow && row.t - beforeRow.t <= 2000 ? beforeRow[field]
          : afterRow && afterRow.t - row.t <= 2000 ? afterRow[field] : 0;
      row[field] = clamp(Math.round(value), 0, 100);
      sanitized.add(index);
    }
  }
  summary.sanitizedChannelRows = sanitized.size;
  summary.seconds = round(summary.seconds, 1);
  return { rows: repaired, summary };
}

function officialPositionAt(rows, t, index, fallback) {
  while (index.value + 1 < rows.length && rows[index.value + 1].t <= t) index.value++;
  return Number.isInteger(rows[index.value]?.position) ? rows[index.value].position : fallback;
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length % 2
    ? ordered[(ordered.length - 1) / 2]
    : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
}

function measuredGridGeometry(drivers, start, pauses) {
  const onGrid = drivers.filter(driver => !driver.pitLaneStart)
    .sort((a, b) => a.gridPosition - b.gridPosition);
  if (onGrid.length !== 18 || onGrid[0].gridPosition !== 1) {
    throw new Error('Les 18 voitures de la grille 2025 ne correspondent pas à la grille officielle.');
  }
  // Position snapshots before lights-out avoid a launch-time GPS offset.
  const preStartTime = start - 10_000;
  const parked = new Map(onGrid.map(driver => [driver.gridPosition,
    positionAtTime(driver.locations, preStartTime)]));
  const rawLapLengths = drivers.filter(driver => !driver.pitLaneStart && driver.laps.length > 2)
    .map(driver => makeSegment({ t: driver.laps[1].t }, { t: driver.laps[2].t },
      driver.locations, pauses).totalDistance)
    .filter(distance => distance > 20_000 && distance < 100_000);
  if (rawLapLengths.length < 8) {
    throw new Error('Impossible de calibrer les unités des coordonnées OpenF1 sur des tours valides.');
  }
  const metresPerRawUnit = TRACK_LENGTH_METERS / median(rawLapLengths);
  const spacing = [];
  for (let position = 1; position <= 16; position++) {
    const a = parked.get(position), b = parked.get(position + 2);
    if (a && b) spacing.push(Math.hypot(a.x - b.x, a.y - b.y)
      * metresPerRawUnit / 2);
  }
  const gridSlotSpacingMeters = median(spacing.filter(value => value >= 4 && value <= 18));
  if (!(gridSlotSpacingMeters >= 6 && gridSlotSpacingMeters <= 13)) {
    throw new Error(`Espacement de grille OpenF1 invraisemblable : ${gridSlotSpacingMeters} m.`);
  }
  const first = parked.get(1), last = parked.get(17);
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (!(length > 200)) throw new Error('Axe de grille impossible à déterminer.');
  const backwardX = (last.x - first.x) / length;
  const backwardY = (last.y - first.y) / length;
  const pitStartOffset = driver => {
    const point = positionAtTime(driver.locations, preStartTime);
    const offset = -((point.x - first.x) * backwardX
      + (point.y - first.y) * backwardY) * metresPerRawUnit;
    if (!Number.isFinite(offset) || Math.abs(offset) > 500) {
      throw new Error(`Position de départ des stands invraisemblable pour ${driver.number}.`);
    }
    return offset;
  };
  return { gridSlotSpacingMeters, metresPerRawUnit, pitStartOffset };
}

function correctedProgress(rawProgress, startOffset, phaseShift) {
  // Lap timing anchors use the control line; the initial pose uses the pole
  // grid box. Ramp in the FIA 137 m start/control separation during lap one.
  const firstLapFraction = clamp((rawProgress - startOffset)
    / (TRACK_LENGTH_METERS - startOffset), 0, 1);
  return rawProgress - phaseShift * firstLapFraction;
}

function rebuildProgressFromSpeed(driver, frameTimes, phaseShift, gridStops) {
  const oldProgress = t => correctedProgress(driver.smoothedProgress.get(t),
    driver.startOffsetMeters, phaseShift);
  const anchors = driver.anchors.map(anchor => ({
    t: anchor.t,
    progress: correctedProgress(anchor.progress, driver.startOffsetMeters, phaseShift),
    kind: 'lap',
  }));
  for (const lap of driver.laps.slice(1)) {
    if (!pauseAt(driver.pauses, lap.t)) continue;
    const progress = correctedProgress((lap.lap_number - 1) * TRACK_LENGTH_METERS,
      driver.startOffsetMeters, phaseShift);
    anchors.push({ t: lap.t, progress, kind: 'suspended-lap' });
  }
  for (const stop of gridStops) {
    // The raw stop phase is measured against the exact official grid slot.
    anchors.push({ t: stop.t, progress: stop.rawProgress - stop.phase,
      kind: stop.label });
  }
  anchors.sort((left, right) => left.t - right.t);
  for (let index = 1; index < anchors.length; index++) {
    if (!(anchors[index].t > anchors[index - 1].t)
      || anchors[index].progress < anchors[index - 1].progress - 0.01) {
      throw new Error(`Ancres télémétriques incompatibles pour ${driver.number}.`);
    }
  }

  const times = [...new Set([...frameTimes, ...anchors.map(anchor => anchor.t)])]
    .sort((left, right) => left - right);
  const indexByTime = new Map(times.map((t, index) => [t, index]));
  const telemetryIndex = { value: 0 };
  const speeds = times.map(t => telemetryAt(driver.carData, t, telemetryIndex)[0] / 3.6);
  const distance = [0];
  for (let index = 1; index < times.length; index++) {
    // Integrate measured speed before scaling to the exact lap timing anchors.
    const seconds = (times[index] - times[index - 1]) / 1000;
    distance.push(distance.at(-1) + (speeds[index - 1] + speeds[index]) / 2 * seconds);
  }
  const values = new Map();
  const fallbackSegments = [];
  for (let section = 0; section < anchors.length - 1; section++) {
    const a = anchors[section], b = anchors[section + 1];
    const first = indexByTime.get(a.t), last = indexByTime.get(b.t);
    const delta = b.progress - a.progress;
    const measured = distance[last] - distance[first];
    const scale = measured > 0 ? delta / measured : 0;
    const useSpeed = delta > 0 && scale >= .8 && scale <= 1.1;
    if (delta > 0 && !useSpeed) {
      fallbackSegments.push({ from: a.kind, to: b.kind,
        tSec: round((b.t - a.t) / 1000, 1), scale: round(scale, 3) });
    }
    const baselineA = useSpeed || delta <= 0 ? 0 : oldProgress(a.t);
    const baselineB = useSpeed || delta <= 0 ? 0 : oldProgress(b.t);
    for (let index = first; index <= last; index++) {
      const t = times[index];
      let progress;
      if (delta <= 0) progress = a.progress;
      else if (useSpeed) progress = a.progress
        + (distance[index] - distance[first]) * scale;
      else {
        // Keep the bounded GPS reconstruction only when telemetry is insufficient
        // to meet a timing anchor at a physically plausible scale.
        const blend = (t - a.t) / (b.t - a.t);
        progress = oldProgress(t) + (a.progress - baselineA) * (1 - blend)
          + (b.progress - baselineB) * blend;
      }
      values.set(t, progress);
    }
  }
  const first = anchors[0], last = anchors.at(-1);
  for (const t of frameTimes) {
    if (t < first.t) values.set(t, first.progress);
    else if (t > last.t) values.set(t, last.progress);
  }
  return { values, fallbackSegments };
}

async function main() {
  const [raceControl, positionRows, intervalRows, pitRows, stintRows, weatherRows] = await Promise.all([
    readJson('race_control.json', true), readJson('position.json', true),
    readJson('intervals.json', true), readJson('pit.json', true),
    readJson('stints.json', true), readJson('weather.json', true),
  ]);
  const input = await Promise.all(DRIVERS.map(async driver => {
    const [lapRows, locationRows, carRows] = await Promise.all([
      readJson(`laps_${driver.number}.json`),
      readJson(`location_${driver.number}.json`),
      readJson(`car_data_${driver.number}.json`),
    ]);
    for (const [label, rows] of [['laps', lapRows], ['location', locationRows], ['car_data', carRows]]) {
      if (!rows.length || rows.some(row => row.driver_number !== driver.number)) {
        throw new Error(`${label}_${driver.number}.json manque ou contient un mauvais pilote.`);
      }
    }
    const laps = sortedTimed(lapRows, 'date_start').sort((a, b) => a.lap_number - b.lap_number);
    if (laps[0].lap_number !== 1 || laps.some((lap, index) => lap.lap_number !== index + 1)) {
      throw new Error(`Tours manquants ou dupliqués pour la voiture ${driver.number}.`);
    }
    const finalLap = laps.at(-1);
    const finish = finalLap.t + finalLap.lap_duration * 1000;
    if (!(finish > finalLap.t) || !Number.isFinite(finalLap.lap_duration)) {
      throw new Error(`Fin de course inconnue pour ${driver.number}.`);
    }
    const locations = sortedTimed(locationRows)
      .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y)
        && (row.x !== 0 || row.y !== 0)
        && row.t >= laps[0].t - 60000 && row.t <= finish + 2000);
    const rawCarData = sortedTimed(carRows).filter(row => row.t >= laps[0].t - 2000 && row.t <= finish + 2000);
    if (locations.length < 100 || rawCarData.length < 100) {
      throw new Error(`Position ou télémétrie insuffisante pour ${driver.number}.`);
    }
    const repairedTelemetry = repairStaleTelemetry(rawCarData, laps, finish);
    return { ...driver, laps, finish, locations, carData: repairedTelemetry.rows,
      telemetryRepair: repairedTelemetry.summary };
  }));

  const start = Math.min(...input.map(driver => driver.laps[0].t));
  const end = Math.max(...input.map(driver => driver.finish));
  const control = sortedTimed(raceControl);
  const pauses = findPauses(control, start, end);
  const positions = sortedTimed(positionRows).filter(row => SELECTED_NUMBERS.has(row.driver_number));
  if (positions.length < DRIVERS.length * 10) {
    throw new Error('Classement historique OpenF1 incomplet.');
  }
  const intervals = sortedTimed(intervalRows).filter(row => SELECTED_NUMBERS.has(row.driver_number));
  const pit = sortedTimed(pitRows).filter(row => SELECTED_NUMBERS.has(row.driver_number));
  const stints = stintRows.filter(row => SELECTED_NUMBERS.has(row.driver_number));
  const weather = sortedTimed(weatherRows).filter(row => row.t >= start && row.t <= end);
  const result = {
    version: 1,
    source: { provider: 'OpenF1', sessionKey: SESSION_KEY,
      gridSource: OFFICIAL_GRID_URL, resultSource: OFFICIAL_RESULT_URL,
      circuitSource: 'https://www.fia.com/system/files/decision-document/2025_singapore_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_map_and_quarantine_zone.pdf' },
    session: {
      key: SESSION_KEY, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      durationSec: relativeSeconds(end, start), sampleHz: 2,
      trackLengthMeters: TRACK_LENGTH_METERS,
      controlLineBeforeStartMeters: CONTROL_LINE_OFFSET_METERS,
      fieldCount: 20, renderedModelCount: 19,
      pauses: pauses.map(pause => ({ startSec: relativeSeconds(pause.start, start), endSec: relativeSeconds(pause.end, start) })),
      reconstruction: {
        progress: 'Vitesses OpenF1 intégrées et recalées à chaque passage de ligne. Le tracé FIA 2025 mesure 4 927 m ; la distance officielle de 305 337 m sur 62 tours situe la ligne de contrôle 137 m avant le départ. Les positions latérales exactes ne sont pas établies.',
        telemetryRepair: 'Deux courts segments de télémétrie invalide sont estimés depuis des tours valides du même pilote ; les valeurs isolées de pédalier hors plage sont interpolées ou neutralisées. Tous les comptes de correction sont conservés dans telemetryRepair.',
        grid: 'Espacement longitudinal dérivé des positions XY OpenF1 pré-départ et de la longueur mesurée du tour. La première case sert de repère spatial ; son décalage exact par rapport à la ligne de départ reste inconnu.',
        pitLane: 'Gasly et Albon partent de la voie des stands. Leur station longitudinale initiale est projetée depuis les coordonnées OpenF1 sur l’axe de la grille ; la trajectoire de la voie des stands reste approximative.',
      },
    },
    // The tuples' position field is the OFFICIAL rank in the full race field.
    // It is not a rank computed among the visible cars.
    sampleFields: ['tSec', 'progressMeters', 'speedKph', 'throttlePct', 'brakePct', 'gear', 'officialPosition'],
    drivers: {},
    officialField: SINGAPORE_2025_ROSTER.map(driver => ({
      number: driver.replayNumber, name: driver.name,
      gridPosition: driver.gridPosition, finalPosition: driver.finalPosition,
      modelKey: driver.modelKey,
    })),
    events: control.filter(row => row.t >= start && row.t <= end)
      .map(row => ({ tSec: relativeSeconds(row.t, start), category: row.category,
        flag: row.flag, driverNumber: row.driver_number, message: row.message })),
    weather: weather.map(row => [relativeSeconds(row.t, start), row.air_temperature,
      row.track_temperature, row.rainfall, row.humidity, row.wind_speed]),
  };
  result.session.telemetryRepair = input.reduce((total, driver) => {
    for (const field of ['blocks', 'seconds', 'rows', 'templateBlocks',
      'fallbackBlocks', 'sanitizedChannelRows', 'inferredBrakeRows']) {
      total[field] += driver.telemetryRepair[field];
    }
    if (driver.telemetryRepair.blocks) total.drivers++;
    return total;
  }, { blocks: 0, seconds: 0, rows: 0, templateBlocks: 0,
    fallbackBlocks: 0, sanitizedChannelRows: 0, inferredBrakeRows: 0,
    drivers: 0 });
  result.session.telemetryRepair.seconds = round(result.session.telemetryRepair.seconds, 1);
  const frameTimes = [];
  for (let t = start; t < end; t += FRAME_INTERVAL_MS) frameTimes.push(t);
  frameTimes.push(end);

  const gridGeometry = measuredGridGeometry(input, start, pauses);
  const visualPhaseShiftMeters = CONTROL_LINE_OFFSET_METERS;
  result.session.visualPhaseShiftMeters = visualPhaseShiftMeters;
  result.session.gridSlotSpacingMeters = round(gridGeometry.gridSlotSpacingMeters, 2);
  result.session.positionScaleMetersPerUnit = round(gridGeometry.metresPerRawUnit, 6);
  const prepared = input.map(driver => {
    const startOffsetMeters = driver.pitLaneStart
      ? gridGeometry.pitStartOffset(driver)
      : -(driver.gridPosition - 1) * gridGeometry.gridSlotSpacingMeters;
    const anchors = makeAnchors(driver.laps, startOffsetMeters, pauses, driver.finish);
    const segments = anchors.slice(0, -1)
      .map((anchor, index) => makeSegment(anchor, anchors[index + 1], driver.locations, pauses));
    return { ...driver, startOffsetMeters, anchors, segments, pauses,
      smoothedProgress: smoothProgress(frameTimes, segments, anchors, pauses),
      ownPositions: positions.filter(row => row.driver_number === driver.number) };
  });

  for (const driver of prepared) {
    const { segments, ownPositions } = driver;
    const reconstructed = rebuildProgressFromSpeed(driver, frameTimes,
      visualPhaseShiftMeters, []);
    const ownIntervals = intervals.filter(row => row.driver_number === driver.number);
    const ownPit = pit.filter(row => row.driver_number === driver.number);
    const ownStints = stints.filter(row => row.driver_number === driver.number)
      .sort((a, b) => a.stint_number - b.stint_number);
    const samples = [];
    const telemetryIndex = { value: 0 }, positionIndex = { value: 0 };
    for (const t of frameTimes) {
      const isFinished = t >= driver.finish;
      const progress = reconstructed.values.get(t);
      const telemetry = isFinished
        ? [0, 0, 0, 0]
        : telemetryAt(driver.carData, t, telemetryIndex);
      const officialPosition = t >= end - FRAME_INTERVAL_MS
        ? driver.finalPosition : ownPositions.length
        ? officialPositionAt(ownPositions, t, positionIndex, driver.gridPosition)
        : driver.gridPosition;
      samples.push([relativeSeconds(t, start), round(progress, 1), ...telemetry, officialPosition]);
    }
    const driverResult = {
      name: driver.name, number: driver.number, gridPosition: driver.gridPosition,
      finalPosition: driver.finalPosition, modelKey: driver.modelKey,
      team2025: driver.team2025,
      pitLaneStart: !!driver.pitLaneStart,
      status: 'finished',
      officialCompletedLaps: driver.laps.length,
      startOffsetMeters: round(driver.startOffsetMeters, 2), finishSec: relativeSeconds(driver.finish, start),
      preStartXY: (() => {
        const point = positionAtTime(driver.locations, start - 10_000);
        return [Math.round(point.x), Math.round(point.y)];
      })(),
      laps: driver.laps.map(lap => ({ lap: lap.lap_number, startSec: relativeSeconds(lap.t, start),
        durationSec: Number.isFinite(lap.lap_duration) ? round(lap.lap_duration, 3) : null })),
      samples,
      intervals: ownIntervals.filter(row => row.t >= start && row.t <= end)
        .map(row => [relativeSeconds(row.t, start), row.gap_to_leader, row.interval]),
      pit: ownPit.map(row => ({ tSec: relativeSeconds(row.t, start), lap: row.lap_number,
        laneDurationSec: row.lane_duration, stopDurationSec: row.stop_duration,
        redFlagTransit: pauses.some(pause => pause.start <= row.t && row.t < pause.end) })),
      stints: ownStints.map(row => ({ stint: row.stint_number, lapStart: row.lap_start,
        lapEnd: row.lap_end, compound: row.compound, tyreAgeAtStart: row.tyre_age_at_start })),
    };
    result.drivers[String(driver.number)] = driverResult;
    const progressValues = samples.map(sample => sample[1]);
    let backwards = 0;
    for (let index = 1; index < progressValues.length; index++) {
      if (progressValues[index] < progressValues[index - 1] - 0.001) backwards++;
    }
    const minimum = Math.min(...segments.map(segment => segment.totalDistance));
    console.log(`${driver.name.padEnd(18)} P${driver.gridPosition.toString().padEnd(2)} ${String(samples.length).padStart(5)} frames · ${driver.laps.length} tours · ${backwards} reculs · ${reconstructed.fallbackSegments.length} segments GPS · segment mini ${Math.round(minimum / 10)} m bruts`);
    for (const fallback of reconstructed.fallbackSegments) {
      console.log(`  GPS ${fallback.from} → ${fallback.to} : ${fallback.tSec} s, facteur télémétrique ${fallback.scale}`);
    }
    if (backwards) throw new Error(`Progression non monotone pour ${driver.number}.`);
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(result));
  console.log(`Écrit ${OUTPUT} (${(Buffer.byteLength(JSON.stringify(result)) / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`Pause(s) : ${result.session.pauses.map(p => `${p.startSec}s–${p.endSec}s`).join(', ')}`);
  console.log(`Ligne de contrôle FIA : ${visualPhaseShiftMeters} m avant départ ; espacement de grille estimé : ${round(gridGeometry.gridSlotSpacingMeters, 2)} m.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
