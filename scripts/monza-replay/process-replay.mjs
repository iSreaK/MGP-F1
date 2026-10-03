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
    // A lap line crossed under a red flag is an official timing event, but the
    // visual replay is frozen. Reconcile at the next post-restart line instead.
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
  return new Map(frameTimes.map(t => [t, values[indexByTime.get(t)]]));
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
    const carData = sortedTimed(carRows).filter(row => row.t >= laps[0].t - 2000 && row.t <= finish + 2000);
    if (locations.length < 100 || carData.length < 100) {
      throw new Error(`Position ou télémétrie insuffisante pour ${driver.number}.`);
    }
    return { ...driver, laps, finish, locations, carData };
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
        progress: 'Positions XY approximatives OpenF1, intégrées et recalées sur les tours ; pics limités à 105 m/s. Le placement latéral exact n’est pas fourni.',
        redFlagTransit: 'Le retour réel aux stands sous drapeau rouge est omis visuellement : les voitures restent figées jusqu’à la reprise.',
        lapTiming: 'Les dates des tours restent celles de la source ; les passages visuels sont décalés pour aligner les cases des deux départs après la reprise.',
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
    return { ...driver, startOffsetMeters, anchors, segments,
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
    const { startOffsetMeters, segments, smoothedProgress, ownPositions } = driver;
    const ownIntervals = intervals.filter(row => row.driver_number === driver.number);
    const ownPit = pit.filter(row => row.driver_number === driver.number);
    const ownStints = stints.filter(row => row.driver_number === driver.number)
      .sort((a, b) => a.stint_number - b.stint_number);
    const samples = [];
    const telemetryIndex = { value: 0 }, positionIndex = { value: 0 };
    for (const t of frameTimes) {
      const isPaused = !!pauseAt(pauses, t);
      const isFinished = t >= driver.finish;
      const progress = correctedProgress(smoothedProgress.get(t),
        startOffsetMeters, visualPhaseShiftMeters);
      const telemetry = isPaused || isFinished
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
      startOffsetMeters: round(startOffsetMeters, 2), finishSec: relativeSeconds(driver.finish, start),
      restartGridStops: gridStops.get(driver.number).filter(Boolean).map(stop => ({
        label: stop.label, tSec: relativeSeconds(stop.t, start),
        officialPosition: stop.officialPosition,
        rawXY: [Math.round(stop.xy.x), Math.round(stop.xy.y)],
        gridErrorMeters: round(signedTrackOffset(stop.phase - visualPhaseShiftMeters), 1),
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
    console.log(`${driver.name.padEnd(18)} P${driver.gridPosition.toString().padEnd(2)} ${String(samples.length).padStart(5)} frames · ${driver.laps.length} tours · ${backwards} reculs · segment mini ${Math.round(minimum / 10)} m bruts`);
    if (backwards) throw new Error(`Progression non monotone pour ${driver.number}.`);
  }

  await writeFile(OUTPUT, JSON.stringify(result));
  console.log(`Écrit ${OUTPUT} (${(Buffer.byteLength(JSON.stringify(result)) / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`Pause(s) : ${result.session.pauses.map(p => `${p.startSec}s–${p.endSec}s`).join(', ')}`);
  console.log(`Calage grille après reprise : -${round(visualPhaseShiftMeters, 2)} m (erreur maximale ${round(worstGridError, 1)} m)`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
