import { createElevationSampler } from '../elevation-profile.js';

// Albert Park is essentially flat. F1 documents a 2.6 m total elevation
// difference on the older layout, with the low point on the main straight
// and high point near the old T13 (now T11). The intermediate stations below
// are a smooth visual approximation, not a published kerb-level survey.
// https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc
export const DOCUMENTED_RELIEF_METERS = 2.6;
export const RELIEF_PRESENTATION_SCALE = 1.25;
export const ELEVATION_PROFILE_METERS = Object.freeze([
  [0,0],[350,.1],[650,.4],[1000,.65],[1400,1.1],[1800,1.5],
  [2200,1.3],[2650,1.15],[3100,1.35],[3500,1.85],[3900,2.6],
  [4250,2.05],[4600,1.15],[4900,.4],[5150,.08],[5278,0],
]);
export const trackHeightAtStation = createElevationSampler(ELEVATION_PROFILE_METERS,
  { lapLength:5278,baseY:2.2,presentationScale:RELIEF_PRESENTATION_SCALE });
export const trackHeightAtFraction = fraction=>trackHeightAtStation(fraction*5278);

export function prepareAlbertParkCurve(THREE,trackPoints,targetLengthMetres=5278) {
  const sourcePoints=trackPoints.slice(0,-1).map(([x,z],i)=>
    new THREE.Vector3(x,trackHeightAtFraction(i/(trackPoints.length-1)),z));
  const curve=new THREE.CatmullRomCurve3(sourcePoints,true,'centripetal');
  curve.arcLengthDivisions=16000;curve.updateArcLengths();
  for(let pass=0;pass<3;pass++){
    const correction=targetLengthMetres/curve.getLength();
    for(const point of sourcePoints){point.x*=correction;point.z*=correction;}
    curve.updateArcLengths();
  }
  return {curve,sourcePoints,renderedLength:curve.getLength()};
}
