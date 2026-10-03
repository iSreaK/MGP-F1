import { GRID_LANE_CENTER, PIT_START_LANE_CENTER, MONZA_FINISH_BEFORE_START_METERS } from './grid-details.js';
import { racingLineOffset } from './race-motion.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const wrap = (value, length) => ((value % length) + length) % length;

export function replayVisualDistance(progressMeters, session, totalLaps) {
  const difference = (session.visualPhaseShiftMeters ?? MONZA_FINISH_BEFORE_START_METERS)
    - MONZA_FINISH_BEFORE_START_METERS;
  const raceDistance = totalLaps * session.trackLengthMeters;
  return progressMeters + difference * clamp01(progressMeters / raceDistance);
}

export function replayPitOffset(car, timeSec, session, pitStops, baseOffset) {
  const stop = pitStops?.find(pit =>
    timeSec >= pit.tSec - pit.laneDurationSec - 15 && timeSec <= pit.tSec + 15);
  if (!stop) return baseOffset;
  let station = ((car.progressMeters % session.trackLengthMeters) + session.trackLengthMeters) % session.trackLengthMeters;
  if (station > session.trackLengthMeters - 600) station -= session.trackLengthMeters;
  const entry = stop.redFlagTransit
    ? smoothstep((station + 450) / 70)
    : smoothstep((station + 370) / 150);
  const exit = stop.redFlagTransit
    ? 1 - smoothstep((station - 230) / 170)
    : 1 - smoothstep((station - 220) / 110);
  const transitLane = stop.redFlagTransit ? 17.5 : car.number === 12 ? 15.2 : 12.5;
  // A stopped service car sits in the working box while other cars pass in
  // the fast lane. The box lies on the modeled paved apron (x=15.1–19.2 m).
  const service = stop.redFlagTransit || !Number.isFinite(car.speedKph)
    ? 0 : 1 - smoothstep((car.speedKph - 8) / 24);
  const pitLane = transitLane + (18 - transitLane) * service;
  return baseOffset + (pitLane - baseOffset) * entry * exit;
}

export function rateLimitReplayOffset(previous, target, raceDeltaSec, frameLimit = .65) {
  const limit = Math.min(frameLimit, Math.max(0, raceDeltaSec) * 3);
  return Math.max(previous - limit, Math.min(previous + limit, target));
}

// OpenF1's approximate coordinates cannot establish an exact lateral racing
// line. We place cars on the site's line and use a small, deterministic spread
// for close groups so that real longitudinal overtakes remain visible.
export function computeReplayPlacements(cars, gridU, trackGap, sourceLapMeters = 5793) {
  const placements = new Map();
  const ordered = [...cars].sort((a, b) => a.progressMeters - b.progressMeters);
  for (const car of ordered) {
    const renderedMetres = car.progressMeters * trackGap.lengthMeters / sourceLapMeters;
    const u = trackGap.behind(gridU, -renderedMetres);
    const lane = car.pitLaneStart ? PIT_START_LANE_CENTER
      : car.gridPosition % 2 ? -GRID_LANE_CENTER : GRID_LANE_CENTER;
    const race = racingLineOffset(u);
    const startBlend = car.pitLaneStart
      ? smoothstep((car.progressMeters - 130) / 180)
      : smoothstep(car.progressMeters / 120);
    placements.set(car.number, { u, offset: lane + (race - lane) * startBlend });
  }

  const groups = [];
  let group = [];
  for (const car of ordered) {
    if (group.length && car.progressMeters - group[group.length - 1].progressMeters >= 12) {
      groups.push(group);
      group = [];
    }
    group.push(car);
  }
  if (group.length) groups.push(group);

  for (const nearby of groups) {
    if (nearby.length < 2) continue;
    const stable = [...nearby].sort((a, b) => a.number - b.number);
    for (const car of nearby) {
      const closest = Math.min(...nearby.filter(other => other !== car)
        .map(other => Math.abs(other.progressMeters - car.progressMeters)));
      const closeness = 1 - smoothstep((closest - 6) / 6);
      const afterStart = smoothstep((car.progressMeters - 90) / 90);
      const spread = 5.4 / Math.max(1, stable.length - 1);
      const laneIndex = stable.findIndex(other => other.number === car.number);
      const target = (laneIndex - (stable.length - 1) / 2) * spread;
      const placement = placements.get(car.number);
      placement.offset += (target - placement.offset) * closeness * afterStart;
    }
  }

  // Source progress differs by a whole lap for a lapped car, although both
  // cars can occupy the same piece of road. Start spreading before the gap
  // closes; the lateral rate limiter otherwise has too little time to react.
  // Pair weights fade continuously as cars separate, so group membership
  // cannot change the target lane in a single frame.
  if (ordered.length < 2) return placements;
  const metresAt = trackGap.metresAt ?? (u => u * trackGap.lengthMeters);
  const physical = ordered.map(car => ({
    car, station: metresAt(placements.get(car.number).u),
  }));
  for (const current of physical) {
    let neighbours = 0;
    let rank = 0;
    for (const other of physical) {
      if (other === current) continue;
      const gap = wrap(other.station - current.station + trackGap.lengthMeters / 2,
        trackGap.lengthMeters) - trackGap.lengthMeters / 2;
      const closingSpeed = Math.max(0, (gap >= 0
        ? current.car.speedKph - other.car.speedKph
        : other.car.speedKph - current.car.speedKph) / 3.6) || 0;
      const response = Math.min(90, 30 + closingSpeed);
      const weight = 1 - smoothstep((Math.abs(gap) - 12) / (response - 12));
      neighbours += weight;
      rank += Math.sign(other.car.number - current.car.number) * weight;
    }
    if (neighbours < 1e-6) continue;
    const halfSpan = Math.min(4.3, 2.7 + .8 * (neighbours - 1));
    const target = halfSpan * rank / neighbours;
    const strength = smoothstep(neighbours)
      * smoothstep((current.car.progressMeters - 90) / 90);
    const placement = placements.get(current.car.number);
    placement.offset += (target - placement.offset) * strength;
  }
  return placements;
}
