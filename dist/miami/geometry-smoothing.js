import { createElevationSampler } from '../elevation-profile.js';

// Miami is predominantly flat. F1 describes an uphill T14–15 chicane crest,
// with a downhill exit under the Turnpike flyovers, not a large natural hill.
// The metre values below are a conservative visual approximation, not survey
// measurements. The timing-location z channel is deliberately not treated as
// surveyed altitude. Sources and assumptions: scripts/miami/README.md.
export const RELIEF_PRESENTATION_SCALE = 1.15;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0,.5],[400,.55],[900,.45],[1500,.3],[1866,.4],[2400,.55],
  [2850,.55],[3150,.65],[3280,1.05],[3390,2.5],[3433,4.1],
  [3446,4.5],[3458,4.35],[3483,3.6],[3558,1.05],[3660,.55],
  [4000,.5],[4800,.4],[5412,.5],
]);
const height = createElevationSampler(ELEVATION_PROFILE_METERS, {
  lapLength:5412, baseY:.36, presentationScale:RELIEF_PRESENTATION_SCALE,
});
export const trackHeightAtStation = station => height(station);
export const trackHeightAtFraction = u => height(u*5412);

export function prepareMiamiCurve(THREE, trackPoints, targetLengthMetres=5412) {
  const xy=trackPoints.slice(0,-1), cumulative=[0];
  for(let i=1;i<xy.length;i++) cumulative.push(cumulative.at(-1)+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1]));
  const last=xy.at(-1),first=xy[0];
  const horizontalLength=cumulative.at(-1)+Math.hypot(first[0]-last[0],first[1]-last[1]);
  const sourcePoints=xy.map(([x,z],i)=>new THREE.Vector3(x,trackHeightAtFraction(cumulative[i]/horizontalLength),z));
  const curve=new THREE.CatmullRomCurve3(sourcePoints,true,'centripetal',.18);
  curve.arcLengthDivisions=12000;
  curve.updateArcLengths();
  for(let p=0;p<3;p++) {
    const scale=targetLengthMetres/curve.getLength();
    for(const v of sourcePoints){v.x*=scale;v.z*=scale;}
    curve.updateArcLengths();
  }
  return {curve,sourcePoints,horizontalLength,renderedLength:curve.getLength()};
}
