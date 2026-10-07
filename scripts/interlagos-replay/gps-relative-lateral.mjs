// Relative side-to-side movement from OpenF1 GPS, without forcing the XY
// coordinates onto a schematic circuit drawing. A robust reference lap is
// assembled from measured clean laps. Only the lateral difference from that
// reference is carried to the 3D circuit, with a confidence per frame.

const FIT_DRIVERS = new Set([63, 1, 4, 81, 12, 16, 14, 44]);
const FIT_LAPS = new Set([8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]);
const STEP_METRES = 5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, size) => ((v % size) + size) % size;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];

function beforeTime(rows, t) {
  let low = 0, high = rows.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (rows[mid].t <= t) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

function xyAt(rows, t) {
  const index = beforeTime(rows, t);
  if (index < 0 || index >= rows.length - 1) return null;
  const a = rows[index], b = rows[index + 1];
  if (!(b.t > a.t) || b.t - a.t > 2000) return null;
  const fraction = (t - a.t) / (b.t - a.t);
  return [
    (a.x + (b.x - a.x) * fraction) / 10,
    (a.y + (b.y - a.y) * fraction) / 10,
  ];
}

function inPitWindow(pitRows, t) {
  return pitRows.some(stop => t >= stop.t -
    (Number(stop.lane_duration) || 0) * 1000 - 15000 && t <= stop.t + 15000);
}

function measuredLap(driver, lap, pitRows, lapLength, count) {
  const start = lap.t, end = start + lap.lap_duration * 1000;
  if (!(lap.lap_duration >= 70 && lap.lap_duration <= 115)
    || pitRows.some(stop => stop.t >= start - 40000 && stop.t <= end + 15000)) return null;
  const first = xyAt(driver.locations, start), last = xyAt(driver.locations, end);
  if (!first || !last) return null;
  const path = [{ xy: first, t: start }];
  for (const row of driver.locations) {
    if (row.t <= start || row.t >= end) continue;
    path.push({ xy: [row.x / 10, row.y / 10], t: row.t });
  }
  path.push({ xy: last, t: end });
  if (path.length < 130) return null;
  let total = 0, jumps = 0;
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].xy[0] - path[i-1].xy[0],
      path[i].xy[1] - path[i-1].xy[1]);
    if (d > 70 || d > (path[i].t-path[i-1].t)/1000 * 125) jumps++;
    total += d;
    distances.push(total);
  }
  if (jumps > 3 || total < lapLength * .87 || total > lapLength * 1.16) return null;
  const samples = [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const target = total * i / count;
    while (k + 1 < distances.length - 1 && distances[k + 1] < target) k++;
    const fraction = (target - distances[k]) /
      Math.max(1e-6, distances[k+1] - distances[k]);
    samples.push([
      path[k].xy[0] + (path[k+1].xy[0] - path[k].xy[0]) * fraction,
      path[k].xy[1] + (path[k+1].xy[1] - path[k].xy[1]) * fraction,
    ]);
  }
  return { samples, rawLengthMetres: total, driverNumber: driver.number,
    lapNumber: lap.lap_number };
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i+1)%points.length];
    area += a[0]*b[1]-b[0]*a[1];
  }
  return area/2;
}

export function makeReference(drivers, pitRows, lapLength, trackPoints) {
  const count = Math.round(lapLength / STEP_METRES);
  const measured = [];
  for (const driver of drivers) {
    if (!FIT_DRIVERS.has(driver.number)) continue;
    const ownPit = pitRows.filter(stop => stop.driver_number === driver.number);
    for (const lap of driver.laps) {
      if (!FIT_LAPS.has(lap.lap_number)) continue;
      const item = measuredLap(driver, lap, ownPit, lapLength, count);
      if (item) measured.push(item);
    }
  }
  if (measured.length < 6)
    throw new Error(`Seulement ${measured.length} tours GPS propres pour le recalage latéral.`);
  const raw = Array.from({ length: count }, (_, i) => [
    median(measured.map(lap => lap.samples[i][0])),
    median(measured.map(lap => lap.samples[i][1])),
  ]);
  // Smooth only one 20 m window; hairpins remain distinct.
  const weights = [1, 2, 3, 2, 1];
  const points = raw.map((_, i) => [0,1].map(axis =>
    weights.reduce((sum, weight, j) => sum +
      raw[wrap(i+j-2, count)][axis] * weight, 0) / 9));
  let length = 0;
  for (let i=0; i<count; i++)
    length += Math.hypot(points[(i+1)%count][0]-points[i][0],
      points[(i+1)%count][1]-points[i][1]);
  if (length < lapLength*.88 || length > lapLength*1.10)
    throw new Error(`Le tour GPS médian est incohérent : ${length.toFixed(1)} m.`);
  const normals = points.map((_, i) => {
    const before = points[wrap(i-1,count)], after = points[(i+1)%count];
    const dx=after[0]-before[0], dy=after[1]-before[1];
    const length=Math.hypot(dx,dy);
    return [dy/length,-dx/length];
  });
  const polarity = Math.sign(signedArea(points)) ===
    Math.sign(signedArea(trackPoints.slice(0,-1))) ? 1 : -1;
  const residuals = measured.flatMap(lap => lap.samples.filter((_,i) => i%4===0)
    .map((xy,j) => Math.hypot(xy[0]-points[j*4][0], xy[1]-points[j*4][1])));
  residuals.sort((a,b)=>a-b);
  return { points, normals, count, polarity, length,
    sourceLapCount: measured.length,
    sourceRawLengths: measured.map(lap => lap.rawLengthMetres),
    medianDeviationMetres: median(residuals),
    p90DeviationMetres: quantile(residuals,.9) };
}

function matchXY(xy, station, reference, lapLength) {
  const { points, normals, count } = reference;
  const expected = Math.round(wrap(station,lapLength)/lapLength*count);
  const radius = Math.ceil(95/lapLength*count);
  let bestDistance = Infinity, bestIndex = 0;
  for (let offset=-radius; offset<=radius; offset++) {
    const i=wrap(expected+offset,count);
    const distance=Math.hypot(xy[0]-points[i][0],xy[1]-points[i][1]);
    if (distance<bestDistance) { bestDistance=distance; bestIndex=i; }
  }
  const point=points[bestIndex], normal=normals[bestIndex];
  const stationDelta=wrap((bestIndex-expected)*lapLength/count+lapLength/2,
    lapLength)-lapLength/2;
  return { lateral:(xy[0]-point[0])*normal[0]+(xy[1]-point[1])*normal[1],
    distance:bestDistance, stationDelta };
}

export function reconstructGpsLateral(drivers, frameTimes, trackPoints,
  lapLength, controlOffset, pitRows) {
  const reference=makeReference(drivers,pitRows,lapLength,trackPoints);
  const byNumber=new Map();
  const weightedSteps=[], confidentOffsets=[];
  let confidentFrames=0, totalFrames=0;
  for (const driver of drivers) {
    const ownPit=pitRows.filter(stop=>stop.driver_number===driver.number);
    const raw=frameTimes.map(t=>{
      const progress=driver.reconstructed.values.get(t);
      if (!Number.isFinite(progress) || t>=driver.finish || progress<130
        || inPitWindow(ownPit,t)) return [0,0];
      const xy=xyAt(driver.locations,t);
      if (!xy) return [0,0];
      const match=matchXY(xy,progress+controlOffset,reference,lapLength);
      const distanceQuality=clamp((13-match.distance)/6,0,1);
      const stationQuality=clamp((55-Math.abs(match.stationDelta))/30,0,1);
      const lateralQuality=clamp((6-Math.abs(match.lateral))/2,0,1);
      const confidence=distanceQuality*stationQuality*lateralQuality;
      return [clamp(match.lateral*reference.polarity,-3.2,3.2),confidence];
    });
    const smoothed=raw.map((_,i)=>{
      let lateral=0,confidence=0,weightSum=0;
      for (let k=-2;k<=2;k++) {
        const j=i+k;
        if (j<0 || j>=raw.length) continue;
        const weight=3-Math.abs(k);
        lateral+=raw[j][0]*raw[j][1]*weight;
        confidence+=raw[j][1]*weight;
        weightSum+=weight;
      }
      const averageConfidence=confidence/weightSum;
      return averageConfidence>.05
        ? [clamp(lateral/Math.max(.001,confidence),-3.2,3.2),averageConfidence]
        : [0,0];
    });
    for (let i=1;i<smoothed.length;i++) {
      const previous=smoothed[i-1][0]*smoothed[i-1][1];
      const target=smoothed[i][0]*smoothed[i][1];
      const limited=clamp(target,previous-1.25,previous+1.25);
      smoothed[i][0]=smoothed[i][1]>.05
        ? clamp(limited/smoothed[i][1],-3.2,3.2) : 0;
      weightedSteps.push(Math.abs(smoothed[i][0]*smoothed[i][1]-previous));
    }
    for (const [offset,confidence] of smoothed) {
      totalFrames++;
      if (confidence>=.5) { confidentFrames++; confidentOffsets.push(offset); }
    }
    byNumber.set(driver.number,smoothed);
  }
  weightedSteps.sort((a,b)=>a-b);
  confidentOffsets.sort((a,b)=>a-b);
  const round=value=>Math.round(value*100)/100;
  return { byNumber, quality: {
    source:'OpenF1 XY relative to a median of measured clean laps; transferred to the schematic 3D centreline',
    referenceLapCount:reference.sourceLapCount,
    referenceLengthMetres:round(reference.length),
    rawLapLengthRangeMetres:[round(Math.min(...reference.sourceRawLengths)),
      round(Math.max(...reference.sourceRawLengths))],
    referenceMedianDeviationMetres:round(reference.medianDeviationMetres),
    referenceP90DeviationMetres:round(reference.p90DeviationMetres),
    orientationPolarity:reference.polarity,
    relativeOffsetP05P95Metres:confidentOffsets.length
      ? [round(quantile(confidentOffsets,.05)),round(quantile(confidentOffsets,.95))]
      : [0,0],
    weightedLateralStepP99MetresPerHalfSecond:round(quantile(weightedSteps,.99)),
    weightedLateralStepMaxMetresPerHalfSecond:round(weightedSteps.at(-1)),
    confidentFrames,totalFrames,
  } };
}
