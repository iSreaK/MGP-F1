#!/usr/bin/env node
// Build a local, reduced Monza replay from the OpenF1 session 11361 archive.
// This script does not modify or publish the website.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carCatalog } from '../../dist/car-catalog.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW = process.env.MONZA_REPLAY_RAW_DIR || join(ROOT, 'raw');
const OUTPUT = join(ROOT, '..', '..', 'dist', 'monza', 'data', 'monza-2026-replay.json');
const SESSION_KEY = 11361;
const TRACK_LENGTH_METERS = 5793;
const GRID_SLOT_SPACING_METERS = 9.05;
const POLE_OFFSET_METERS = -14.1;
const CONTROL_LINE_OFFSET_METERS = 309;
const FRAME_INTERVAL_MS = 500;
const MAX_PROGRESS_METERS_PER_SECOND = 105;
const OFFICIAL_GRID_URL = 'https://www.formula1.com/en/results/2026/races/1293/italy/starting-grid';

// The public OpenF1 starting_grid endpoint has no rows for this session.
// These positions are from the official 2026 Monza starting grid above.
const DRIVERS = [...carCatalog]
  .sort((a, b) => a.gridPosition - b.gridPosition)
  .map(car => ({ number: car.number, gridPosition: car.gridPosition,
    name: car.driverName, retiredAt: car.retiredAt, pitLaneStart: car.pitLaneStart,
    pitStartOffsetMeters: car.pitStartOffsetMeters }));
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

function makeAnchors(laps, startOffsetMeters, pauses, finish, partialDistanceMeters = null) {
  const anchors = [{ t: laps[0].t, progress: startOffsetMeters }];
  for (let index = 0; index < laps.length; index++) {
    const lap = laps[index];
    const end = index + 1 < laps.length
      ? laps[index + 1].t
      : finish;
    if (!(end > lap.t)) throw new Error(`Tour ${lap.lap_number} non chronologique.`);
    // The legacy GPS path omits pit-lane transit under red flag. The speed-based
    // path below inserts the official line crossing during that transit.
    if (!pauseAt(pauses, end)) {
      const progress = index === laps.length - 1 && partialDistanceMeters !== null
        ? (lap.lap_number - 1) * TRACK_LENGTH_METERS + partialDistanceMeters
        : lap.lap_number * TRACK_LENGTH_METERS;
      anchors.push({ t: end, progress });
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

function estimatePartialLapDistance(driver, startOffsetMeters, pauses) {
  const lastLap = driver.laps.at(-1);
  const partial = makeSegment({ t: lastLap.t }, { t: driver.finish }, driver.locations, pauses).totalDistance;
  const scales = [];
  for (let index = 0; index < driver.laps.length - 1; index++) {
    const lap = driver.laps[index];
    if (!Number.isFinite(lap.lap_duration)) continue;
    const next = driver.laps[index + 1];
    const raw = makeSegment({ t: lap.t }, { t: next.t }, driver.locations, pauses).totalDistance;
    const physical = index === 0
      ? TRACK_LENGTH_METERS - (CONTROL_LINE_OFFSET_METERS + startOffsetMeters)
      : TRACK_LENGTH_METERS;
    if (raw > 1000) scales.push(physical / raw);
  }
  const metresPerUnit = scales.length ? median(scales) : .1;
  return clamp(partial * metresPerUnit, 1, TRACK_LENGTH_METERS - 1);
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

const signedTrackOffset = value =>
  ((value + TRACK_LENGTH_METERS / 2) % TRACK_LENGTH_METERS + TRACK_LENGTH_METERS)
    % TRACK_LENGTH_METERS - TRACK_LENGTH_METERS / 2;

function findStationaryGridStop(driver, window, bounds, start, frameTimes, smoothedProgress, positions) {
  const points = driver.carData.filter(row => row.t >= window.start && row.t <= window.end);
  let current = null, best = null;
  const finish = () => {
    if (current && (!best || current.end - current.start > best.end - best.start)) best = current;
    current = null;
  };
  for (const point of points) {
    const xy = positionAtTime(driver.locations, point.t);
    const isOnGrid = xy.x >= bounds.minX && xy.x <= bounds.maxX
      && xy.y >= bounds.minY && xy.y <= bounds.maxY;
    if (point.speed <= 1 && isOnGrid) {
      if (current && point.t - current.end <= 1200) current.end = point.t;
      else { finish(); current = { start: point.t, end: point.t }; }
    } else finish();
  }
  finish();
  if (!best || best.end - best.start < 8000) return null;
  const midpoint = (best.start + best.end) / 2;
  const frameIndex = clamp(Math.round((midpoint - start) / FRAME_INTERVAL_MS), 0, frameTimes.length - 1);
  const frameTime = frameTimes[frameIndex];
  const official = positions[Math.max(0, findBefore(positions, midpoint))]?.position;
  if (!Number.isInteger(official)) return null;
  const targetOffset = POLE_OFFSET_METERS - (official - 1) * GRID_SLOT_SPACING_METERS;
  const rawProgress = smoothedProgress.get(frameTime);
  return {
    label: window.label, t: frameTime, officialPosition: official,
    xy: positionAtTime(driver.locations, midpoint),
    targetOffset, phase: signedTrackOffset(rawProgress - targetOffset),
    rawProgress,
  };
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length % 2
    ? ordered[(ordered.length - 1) / 2]
    : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
}

function correctedProgress(rawProgress, startOffset, phaseShift) {
  // The archive's lap timing line is about 320 m before the physical grid.
  // Ramp in that measured phase during lap one to retain the real starting
  // boxes, then keep one constant physical map for both restart grids.
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
    // Car telemetry remains live while the race is suspended: the cars return
    // to the pit lane, stop there, and later drive out for the restart.
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
    const finish = driver.retiredAt ? time(driver.retiredAt)
      : finalLap.t + finalLap.lap_duration * 1000;
    if (!(finish > finalLap.t) || !driver.retiredAt && !Number.isFinite(finalLap.lap_duration)) {
      throw new Error(`Fin de course inconnue pour ${driver.number}.`);
    }
    const locations = sortedTimed(locationRows)
      .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y)
        && (row.x !== 0 || row.y !== 0)
        && row.t >= laps[0].t - 2000 && row.t <= finish + 2000);
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
  const intervals = sortedTimed(intervalRows).filter(row => SELECTED_NUMBERS.has(row.driver_number));
  const pit = sortedTimed(pitRows).filter(row => SELECTED_NUMBERS.has(row.driver_number));
  const stints = stintRows.filter(row => SELECTED_NUMBERS.has(row.driver_number));
  const weather = sortedTimed(weatherRows).filter(row => row.t >= start && row.t <= end);
  const result = {
    version: 1,
    source: { provider: 'OpenF1', sessionKey: SESSION_KEY, gridSource: OFFICIAL_GRID_URL },
    session: {
      key: SESSION_KEY, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      durationSec: relativeSeconds(end, start), sampleHz: 2,
      trackLengthMeters: TRACK_LENGTH_METERS,
      pauses: pauses.map(pause => ({ startSec: relativeSeconds(pause.start, start), endSec: relativeSeconds(pause.end, start) })),
      reconstruction: {
        progress: 'Vitesses OpenF1 intégrées entre les passages de ligne officiels ; les positions XY servent au calage des grilles. Le placement latéral exact n’est pas fourni.',
        telemetryRepair: 'Les blocs de capteurs invalides (accélérateur=frein=104) à vitesse élevée sont reconstruits depuis le même secteur de tours propres du pilote ou entre mesures valides voisines. Le freinage est estimé si la décélération réparée est forte mais le canal de frein manque.',
        redFlagTransit: 'La vitesse OpenF1 reconstitue le retour aux stands puis l’immobilisation sous drapeau rouge. La trajectoire latérale dans la voie des stands est approximée.',
        lapTiming: 'Les passages de ligne restent aux dates officielles, y compris sous drapeau rouge ; le repère spatial est calé sur les deux grilles après la reprise.',
      },
    },
    // The tuples' position field is the OFFICIAL rank in the full race field.
    // It is not a rank computed among the visible cars.
    sampleFields: ['tSec', 'progressMeters', 'speedKph', 'throttlePct', 'brakePct', 'gear', 'officialPosition'],
    drivers: {},
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

  const prepared = input.map(driver => {
    if (driver.pitLaneStart && !Number.isFinite(driver.pitStartOffsetMeters)) {
      throw new Error(`Position de départ des stands manquante pour ${driver.number}.`);
    }
    const startOffsetMeters = driver.pitLaneStart ? driver.pitStartOffsetMeters
      : POLE_OFFSET_METERS - (driver.gridPosition - 1) * GRID_SLOT_SPACING_METERS;
    const partialDistanceMeters = driver.retiredAt
      ? estimatePartialLapDistance(driver, startOffsetMeters, pauses) : null;
    const anchors = makeAnchors(driver.laps, startOffsetMeters, pauses, driver.finish, partialDistanceMeters);
    const segments = anchors.slice(0, -1)
      .map((anchor, index) => makeSegment(anchor, anchors[index + 1], driver.locations, pauses));
    return { ...driver, startOffsetMeters, anchors, segments, pauses,
      smoothedProgress: smoothProgress(frameTimes, segments, anchors, pauses),
      ownPositions: positions.filter(row => row.driver_number === driver.number) };
  });
  const initialGridXY = prepared.map(driver => positionAtTime(driver.locations, start));
  const gridBounds = {
    minX: Math.min(...initialGridXY.map(point => point.x)) - 250,
    maxX: Math.max(...initialGridXY.map(point => point.x)) + 250,
    minY: Math.min(...initialGridXY.map(point => point.y)) - 300,
    maxY: Math.max(...initialGridXY.map(point => point.y)) + 300,
  };
  const standingStarts = control.filter(row => /STANDING START/i.test(row.message || ''));
  const extraFormation = control.find(row => /EXTRA FORMATION LAP/i.test(row.message || ''));
  if (standingStarts.length < 2 || !extraFormation) {
    throw new Error('Procédure de redémarrage 2026 absente du contrôle de course.');
  }
  const restartWindows = [
    { label: 'restart-grid', start: standingStarts[0].t, end: extraFormation.t },
    { label: 'extra-formation-grid', start: standingStarts[1].t, end: standingStarts[1].t + 180000 },
  ];
  const gridStops = new Map(prepared.map(driver => [driver.number,
    restartWindows.map(window => findStationaryGridStop(driver, window, gridBounds,
      start, frameTimes, driver.smoothedProgress, driver.ownPositions)),
  ]));
  const calibrationDrivers = new Set([3, 44, 10, 1, 12, 5]);
  const calibrations = [...gridStops].filter(([number]) => calibrationDrivers.has(number))
    .flatMap(([, stops]) => stops).filter(Boolean);
  if (calibrations.length < calibrationDrivers.size * 2) {
    throw new Error(`Seuls ${calibrations.length} des 12 arrêts de référence sur grille ont été identifiés.`);
  }
  const visualPhaseShiftMeters = median(calibrations.map(stop => stop.phase));
  const worstGridError = Math.max(...calibrations.map(stop =>
    Math.abs(signedTrackOffset(stop.phase - visualPhaseShiftMeters))));
  if (worstGridError > 15) {
    throw new Error(`Calage géométrique de grille imprécis : ${round(worstGridError)} m.`);
  }
  result.session.visualPhaseShiftMeters = round(visualPhaseShiftMeters, 2);

  for (const driver of prepared) {
    const { segments, ownPositions } = driver;
    const reconstructed = rebuildProgressFromSpeed(driver, frameTimes,
      visualPhaseShiftMeters, gridStops.get(driver.number).filter(Boolean));
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
      const officialPosition = ownPositions.length
        ? officialPositionAt(ownPositions, t, positionIndex, driver.gridPosition)
        : driver.gridPosition;
      samples.push([relativeSeconds(t, start), round(progress, 1), ...telemetry, officialPosition]);
    }
    const driverResult = {
      name: driver.name, number: driver.number, gridPosition: driver.gridPosition,
      pitLaneStart: !!driver.pitLaneStart,
      status: driver.retiredAt ? 'retired' : 'finished',
      officialCompletedLaps: driver.retiredAt ? driver.laps.at(-1).lap_number - 1 : driver.laps.length,
      startOffsetMeters: round(driver.startOffsetMeters, 2), finishSec: relativeSeconds(driver.finish, start),
      restartGridStops: gridStops.get(driver.number).filter(Boolean).map(stop => ({
        label: stop.label, tSec: relativeSeconds(stop.t, start),
        officialPosition: stop.officialPosition,
        rawXY: [Math.round(stop.xy.x), Math.round(stop.xy.y)],
        gridErrorMeters: round(signedTrackOffset(samples[Math.round((stop.t - start)
          / FRAME_INTERVAL_MS)][1] - stop.targetOffset), 1),
        sourceCalibrationErrorMeters: round(signedTrackOffset(stop.phase - visualPhaseShiftMeters), 1),
      })),
      laps: driver.laps.map(lap => ({ lap: lap.lap_number, startSec: relativeSeconds(lap.t, start),
        durationSec: Number.isFinite(lap.lap_duration) ? round(lap.lap_duration, 3) : null })),
      samples,
      intervals: ownIntervals.filter(row => row.t >= start && row.t <= end)
        .map(row => [relativeSeconds(row.t, start), row.gap_to_leader, row.interval]),
      pit: ownPit.map(row => ({ tSec: relativeSeconds(row.t, start), lap: row.lap_number,
        laneDurationSec: row.lane_duration, stopDurationSec: row.stop_duration,
        redFlagTransit: row.lane_duration > 300 })),
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

  await writeFile(OUTPUT, JSON.stringify(result));
  console.log(`Écrit ${OUTPUT} (${(Buffer.byteLength(JSON.stringify(result)) / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`Pause(s) : ${result.session.pauses.map(p => `${p.startSec}s–${p.endSec}s`).join(', ')}`);
  console.log(`Calage grille après reprise : -${round(visualPhaseShiftMeters, 2)} m (erreur maximale ${round(worstGridError, 1)} m)`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
