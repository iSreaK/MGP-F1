/** Reflect a plan-view circuit across its vertical map axis. */
export function mirrorTrackPointsX(trackPoints) {
  return trackPoints.map(([x, z]) => [-x, z]);
}

