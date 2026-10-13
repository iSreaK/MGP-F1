import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { prepareBakuCurve } from './geometry-smoothing.js';
import { createLate2026World } from '../late-2026-world.js';

export function createBakuWorld(THREE, scene) {
  return createLate2026World(THREE, scene, {
    slug: 'baku', name: "Baku City Circuit",
    TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS,
    prepareCurve: prepareBakuCurve, finishBeforeStart: 110,
    gridSpacing: 8.1, gridLane: 2.05, pitSide: -1,
    groundColor: 0x918a75, shoulderColor: 0x626463,
    curbColor: 0xc92b35, accent: 0x45a2bd, seed: 20260926,
    urban: true,
  });
}
