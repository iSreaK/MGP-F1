import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { prepareSepangCurve } from './geometry-smoothing.js';
import { createLate2026World } from '../late-2026-world.js';

export function createSepangWorld(THREE, scene) {
  return createLate2026World(THREE, scene, {
    slug: 'sepang', name: "Sepang International Circuit",
    TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS,
    prepareCurve: prepareSepangCurve, finishBeforeStart: 185,
    gridSpacing: 8.15, gridLane: 2.2, pitSide: -1,
    groundColor: 0x47733f, shoulderColor: 0x777b73,
    curbColor: 0xd62d35, accent: 0x56a86a, seed: 20261004,
    urban: false,
  });
}
