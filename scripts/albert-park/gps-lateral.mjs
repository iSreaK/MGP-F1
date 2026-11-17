// Recover *relative* lateral motion from OpenF1 XY. The FIA diagram and the
// OpenF1 coordinate system differ locally by several metres, so absolute GPS
// offsets are not a surveyed racing line. A shared, smooth per-station median
// removes that map bias; only the residual is transported into the 3D replay.

const FIT_DRIVERS = new Set([63, 1, 4, 81, 12, 16, 14, 44]);
const FIT_LAPS = new Set([10, 15, 32, 40]);
const MAP_STEP_METRES = 2;
const BIAS_BIN_METRES = 10;
const PHASE_MIN_METRES = -100;
const PHASE_MAX_METRES = 100;
const SEARCH_RADIUS_METRES = 50;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = (value, length) => ((value % length) + length) % length;
const median = values => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];

function createMap(trackPoints, lapLength) {
  const points = trackPoints.slice(0, -1);
  const cumulative = [0];
  for (let i = 1; i < trackPoints.length; i++) {
    const a = trackPoints[i - 1], b = trackPoints[i];
    cumulative.push(cumulative.at(-1) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  if (Math.abs(cumulative.at(-1) - lapLength) > .05)
    throw new Error('FIA track length changed; GPS calibration cannot be reused.');
  const at = station => {
    const distance = wrap(station, lapLength);
    let low = 0, high = cumulative.length - 2;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle + 1] < distance) low = middle + 1;
      else high = middle;
    }
    const fraction = (distance - cumulative[low]) /
      Math.max(1e-9, cumulative[low + 1] - cumulative[low]);
    return [points[low][0] + (trackPoints[low + 1][0] - points[low][0]) * fraction,
      points[low][1] + (trackPoints[low + 1][1] - points[low][1]) * fraction];
  };
  const count = Math.round(lapLength / MAP_STEP_METRES);
  const samples = Array.from({ length: count }, (_, i) => {
    const station = i * lapLength / count;
    const point = at(station);
    const before = at(station - 2), after = at(station + 2);
    const dx = after[0] - before[0], dz = after[1] - before[1];
    const span = Math.hypot(dx, dz);
    // Positive offset follows the same driver-left convention as race-motion.
    return { station, x: point[0], z: point[1], nx: dz / span, nz: -dx / span };
  });
  return { at, samples, lapLength };
}

function xyAt(locations, timestamp) {
  let low = 0, high = locations.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (locations[middle].t <= timestamp) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  if (index < 0 || index >= locations.length - 1) return null;
  const a = locations[index], b = locations[index + 1];
  const span = b.t - a.t;
  if (!(span > 0 && span <= 2000)) return null;
  const fraction = clamp((timestamp - a.t) / span, 0, 1);
  return [(a.x + (b.x - a.x) * fraction) / 10,
    (a.y + (b.y - a.y) * fraction) / 10];
}

function fitSimilarity(sources, targets, previous = null, reflectY = false) {
  const selected = [];
  for (let i = 0; i < sources.length; i++) {
    if (!previous || Math.hypot(...transform(sources[i], previous)
      .map((value, axis) => value - targets[i][axis])) < 20)
      selected.push(i);
  }
  if (selected.length < 100) throw new Error('OpenF1 XY registration has too few inliers.');
  let ax = 0, ay = 0, bx = 0, bz = 0;
  for (const i of selected) {
    ax += sources[i][0]; ay += reflectY ? -sources[i][1] : sources[i][1];
    bx += targets[i][0]; bz += targets[i][1];
  }
  ax /= selected.length; ay /= selected.length;
  bx /= selected.length; bz /= selected.length;
  let dot = 0, cross = 0, norm = 0;
  for (const i of selected) {
    const x = sources[i][0] - ax;
    const y = (reflectY ? -sources[i][1] : sources[i][1]) - ay;
    const X = targets[i][0] - bx, Z = targets[i][1] - bz;
    dot += x * X + y * Z;
    cross += x * Z - y * X;
    norm += x * x + y * y;
  }
  const angle = Math.atan2(cross, dot);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const scale = Math.hypot(dot, cross) / norm;
  const model = { cosine, sine, scale, reflectY,
    tx: bx - scale * (ax * cosine - ay * sine),
    tz: bz - scale * (ax * sine + ay * cosine) };
  let squared = 0;
  for (const i of selected) {
    const mapped = transform(sources[i], model);
    squared += (mapped[0] - targets[i][0]) ** 2
      + (mapped[1] - targets[i][1]) ** 2;
  }
  return { ...model, rmsMetres: Math.sqrt(squared / selected.length),
    inlierCount: selected.length };
}

function transform([x, y], model) {
  if (model.reflectY) y = -y;
  return [model.scale * (x * model.cosine - y * model.sine) + model.tx,
    model.scale * (x * model.sine + y * model.cosine) + model.tz];
}

function isFitLap(driver, timestamp) {
  return driver.laps.some(lap => FIT_LAPS.has(lap.lap_number)
    && timestamp >= lap.t && timestamp < lap.t + lap.lap_duration * 1000);
}

function fitOpenF1ToFia(drivers, frameTimes, map, controlOffset) {
  const sources = [], stations = [];
  for (const driver of drivers) {
    if (!FIT_DRIVERS.has(driver.number)) continue;
    for (let index = 0; index < frameTimes.length; index += 2) {
      const timestamp = frameTimes[index];
      if (!isFitLap(driver, timestamp)) continue;
      const xy = xyAt(driver.locations, timestamp);
      const progress = driver.reconstructed.values.get(timestamp);
      if (!xy || !Number.isFinite(progress)) continue;
      sources.push(xy);
      stations.push(progress + controlOffset);
    }
  }
  if (sources.length < 1000) throw new Error('OpenF1 XY fit has too few clean-lap points.');
  let best = null;
  for (const reflectY of [false, true]) {
    for (let phase = PHASE_MIN_METRES; phase <= PHASE_MAX_METRES; phase++) {
      const targets = stations.map(station => map.at(station + phase));
      const first = fitSimilarity(sources, targets, null, reflectY);
      let fit;
      try { fit = fitSimilarity(sources, targets, first, reflectY); }
      catch (error) {
        if (!/too few inliers/.test(error.message)) throw error;
        continue;
      }
      if (!best || fit.rmsMetres < best.rmsMetres) best = { ...fit, phaseMetres: phase };
    }
  }
  if (!best || best.rmsMetres > 10 || best.inlierCount < sources.length * .8)
    throw new Error(`OpenF1 XY/FIA fit is too weak: ${best?.rmsMetres?.toFixed(1) ?? 'no fit'} m RMS, ${best?.inlierCount ?? 0}/${sources.length} inliers, phase ${best?.phaseMetres ?? 'none'} m, reflected ${best?.reflectY ?? 'unknown'}.`);
  return { ...best, sampleCount: sources.length };
}

function mapMatch(xy, expectedStation, map, fit) {
  const [x, z] = transform(xy, fit);
  const samples = map.samples, count = samples.length;
  const nearest = Math.round(wrap(expectedStation, map.lapLength) / map.lapLength * count);
  const radius = Math.ceil(SEARCH_RADIUS_METRES / MAP_STEP_METRES);
  let best = null;
  for (let offset = -radius; offset <= radius; offset++) {
    const sample = samples[wrap(nearest + offset, count)];
    const dx = x - sample.x, dz = z - sample.z;
    const squared = dx * dx + dz * dz;
    if (!best || squared < best.squared) best = { sample, dx, dz, squared };
  }
  const stationDelta = wrap(best.sample.station - expectedStation + map.lapLength / 2,
    map.lapLength) - map.lapLength / 2;
  return { station: best.sample.station,
    lateral: best.dx * best.sample.nx + best.dz * best.sample.nz,
    distance: Math.sqrt(best.squared), stationDelta };
}

function inPitWindow(driver, timestamp) {
  return driver.pitRows.some(stop =>
    timestamp >= stop.t - (Number(stop.lane_duration) || 0) * 1000 - 15000
      && timestamp <= stop.t + 15000);
}

function buildMapBias(drivers, frameTimes, map, fit, controlOffset) {
  const BIAS_BINS = Math.round(map.lapLength / BIAS_BIN_METRES);
  const bins = Array.from({ length: BIAS_BINS }, () => []);
  let references = 0;
  for (const driver of drivers) {
    if (!FIT_DRIVERS.has(driver.number)) continue;
    for (const timestamp of frameTimes) {
      if (!isFitLap(driver, timestamp) || inPitWindow(driver, timestamp)) continue;
      const xy = xyAt(driver.locations, timestamp);
      const progress = driver.reconstructed.values.get(timestamp);
      if (!xy || !Number.isFinite(progress)) continue;
      const match = mapMatch(xy, progress + controlOffset + fit.phaseMetres, map, fit);
      if (match.distance > 15 || Math.abs(match.stationDelta) > 30) continue;
      const bin = Math.floor(match.station / map.lapLength * BIAS_BINS);
      bins[bin].push(match.lateral);
      references++;
    }
  }
  const raw = bins.map(values => median(values));
  const coveredBins = raw.filter(Number.isFinite).length;
  // The FIA schematic is not a surveyed racing line. Unmatched segments are
  // interpolated only for the common bias; their per-car confidence stays low.
  if (coveredBins < BIAS_BINS * .8)
    throw new Error(`OpenF1 XY coverage only spans ${coveredBins}/${BIAS_BINS} sectors.`);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== null) continue;
    let before = i, after = i;
    while (raw[wrap(before, raw.length)] === null) before--;
    while (raw[wrap(after, raw.length)] === null) after++;
    const fraction = (i - before) / (after - before);
    raw[i] = raw[wrap(before, raw.length)] * (1 - fraction)
      + raw[wrap(after, raw.length)] * fraction;
  }
  const weights = Array.from({ length: 21 }, (_, i) => Math.exp(-.5 * ((i - 10) / 4) ** 2));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const smoothed = raw.map((_, i) => weights.reduce((sum, weight, j) =>
    sum + raw[wrap(i + j - 10, raw.length)] * weight, 0) / weightSum);
  const biasAt = station => {
    // Each bin median represents its centre, rather than its leading edge.
    const position = wrap(station, map.lapLength) / map.lapLength * BIAS_BINS - .5;
    const index = Math.floor(position), fraction = position - index;
    return smoothed[wrap(index, BIAS_BINS)] * (1 - fraction)
      + smoothed[wrap(index + 1, BIAS_BINS)] * fraction;
  };
  return { biasAt, references, coveredBins,
    minMetres: Math.min(...smoothed), maxMetres: Math.max(...smoothed) };
}

function smoothDriverLateral(driver, frameTimes, map, fit, bias, controlOffset) {
  const raw = frameTimes.map(timestamp => {
    const progress = driver.reconstructed.values.get(timestamp);
    if (!Number.isFinite(progress) || timestamp >= driver.finish || progress < 130
      || inPitWindow(driver, timestamp)) return { lateral: 0, confidence: 0 };
    const xy = xyAt(driver.locations, timestamp);
    if (!xy) return { lateral: 0, confidence: 0 };
    const match = mapMatch(xy, progress + controlOffset + fit.phaseMetres, map, fit);
    const lateral = match.lateral - bias.biasAt(match.station);
    const distanceQuality = clamp((12 - match.distance) / 6, 0, 1);
    const lateralQuality = clamp((5 - Math.abs(lateral)) / 2, 0, 1);
    const stationQuality = clamp((20 - Math.abs(match.stationDelta)) / 12, 0, 1);
    const confidence = distanceQuality * lateralQuality * stationQuality;
    return { lateral, confidence };
  });
  const medianLateral = raw.map((sample, i) => {
    if (sample.confidence <= .1) return 0;
    const neighbours = raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3))
      .filter(other => other.confidence > .2).map(other => other.lateral);
    return median(neighbours) ?? sample.lateral;
  });
  // Smooth the confidence-weighted signal, including transitions to the
  // fallback. This avoids a full three-metre lane jump when a GPS point is
  // briefly dropped, without pretending that the missing point was measured.
  const weights = [1, 2, 3, 2, 1];
  const values = raw.map((_, i) => {
    let confidence = 0, effective = 0, weightSum = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const index = i + offset;
      if (index < 0 || index >= raw.length) continue;
      const weight = weights[offset + 2];
      confidence += raw[index].confidence * weight;
      effective += medianLateral[index] * raw[index].confidence * weight;
      weightSum += weight;
    }
    confidence /= weightSum;
    effective /= weightSum;
    return confidence > .05
      ? [clamp(effective / confidence, -3.2, 3.2), confidence]
      : [0, 0];
  });
  for (let i = 1; i < values.length; i++) {
    const previous = values[i - 1][0] * values[i - 1][1];
    const target = values[i][0] * values[i][1];
    const limited = clamp(target, previous - 1.25, previous + 1.25);
    values[i][0] = values[i][1] > .05
      ? clamp(limited / values[i][1], -3.2, 3.2) : 0;
  }
  return values;
}

export function reconstructGpsLateral(drivers, frameTimes, trackPoints, lapLength,
  controlOffset, pitRows) {
  const map = createMap(trackPoints, lapLength);
  const pitByNumber = new Map(drivers.map(driver => [driver.number,
    pitRows.filter(stop => stop.driver_number === driver.number)]));
  const prepared = drivers.map(driver => ({ ...driver,
    pitRows: pitByNumber.get(driver.number) || [] }));
  const fit = fitOpenF1ToFia(prepared, frameTimes, map, controlOffset);
  const bias = buildMapBias(prepared, frameTimes, map, fit, controlOffset);
  const byNumber = new Map();
  let frames = 0, confidentFrames = 0;
  const confidentOffsets = [], weightedSteps = [];
  for (const driver of prepared) {
    const values = smoothDriverLateral(driver, frameTimes, map, fit, bias, controlOffset);
    byNumber.set(driver.number, values);
    frames += values.length;
    for (let i = 0; i < values.length; i++) {
      const [lateral, confidence] = values[i];
      if (confidence >= .5) {
        confidentFrames++;
        confidentOffsets.push(lateral);
      }
      if (i > 0) weightedSteps.push(Math.abs(lateral * confidence
        - values[i - 1][0] * values[i - 1][1]));
    }
  }
  confidentOffsets.sort((a, b) => a - b);
  weightedSteps.sort((a, b) => a - b);
  const rounded = value => Math.round(value * 100) / 100;
  return { byNumber, quality: {
    source: 'OpenF1 XY, map-matched and debiased against shared clean laps',
    phaseMetres: fit.phaseMetres,
    registrationRmsMetres: Math.round(fit.rmsMetres * 100) / 100,
    alignment: { scale: fit.scale, cosine: fit.cosine, sine: fit.sine,
      tx: fit.tx, tz: fit.tz, reflectedY: fit.reflectY },
    registrationSamples: fit.sampleCount,
    registrationInliers: fit.inlierCount,
    referencePoints: bias.references,
    coveredTenMetreBins: bias.coveredBins,
    commonBiasRangeMetres: [Math.round(bias.minMetres * 100) / 100,
      Math.round(bias.maxMetres * 100) / 100],
    relativeOffsetP05P95Metres: [rounded(quantile(confidentOffsets, .05)),
      rounded(quantile(confidentOffsets, .95))],
    weightedLateralStepP99MetresPerHalfSecond: rounded(quantile(weightedSteps, .99)),
    weightedLateralStepMaxMetresPerHalfSecond: rounded(weightedSteps.at(-1)),
    confidentFrames, totalFrames: frames,
  } };
}
