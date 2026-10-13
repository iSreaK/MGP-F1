import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { prepareMadridCurve } from './geometry-smoothing.js';
import { createLate2026World } from '../late-2026-world.js';

export function createMadridWorld(THREE, scene) {
  return createLate2026World(THREE, scene, {
    slug: 'madrid', name: "Madring · IFEMA Madrid",
    TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS,
    prepareCurve: prepareMadridCurve, finishBeforeStart: 245,
    gridSpacing: 8.1, gridLane: 2.15, pitSide: 1,
    groundColor: 0x73804b, shoulderColor: 0x777873,
    curbColor: 0xd52c36, accent: 0xe33b45, seed: 20260913,
    urban: true,
  });
}
