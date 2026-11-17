import { TELEMETRY_ELEVATION_METERS } from './elevation-data.js';
import { CROSSOVER } from './track-data.js';
import { createElevationSampler } from '../elevation-profile.js';
export const DOCUMENTED_RELIEF_METERS = 52;
export const RELIEF_PRESENTATION_SCALE = 1.16;
export const BRIDGE_ROAD_SEPARATION_METERS = 8;
export const ELEVATION_PROFILE_METERS = TELEMETRY_ELEVATION_METERS;
const physicalAt=createElevationSampler(TELEMETRY_ELEVATION_METERS,{lapLength:5807,baseY:0,presentationScale:1});
const bridgeCorrection=physicalAt(CROSSOVER.lowerStation)+BRIDGE_ROAD_SEPARATION_METERS-physicalAt(CROSSOVER.upperStation);
// OpenF1 Z collapses the over/under crossing. Restore a plausible structural
// clearance: 8m is a modelling estimate, not a surveyed bridge dimension.
// The same curve carries road, cars, kerbs, grid and scenery anchoring.
export function trackHeightAtStation(station){
 const s=((station%5807)+5807)%5807;
 const d=Math.abs(s-CROSSOVER.upperStation);
 const blend=d<240?.5+.5*Math.cos(Math.PI*d/240):0;
 return .36+(physicalAt(s)+bridgeCorrection*blend)*RELIEF_PRESENTATION_SCALE;
}
export function trackHeightAtFraction(u){return trackHeightAtStation(u*5807);}
export function prepareSuzukaCurve(THREE,trackPoints,targetLengthMetres=5807){
 const points2D=trackPoints.slice(0,-1),distance=[0];
 for(let i=1;i<points2D.length;i++)distance.push(distance.at(-1)+Math.hypot(points2D[i][0]-points2D[i-1][0],points2D[i][1]-points2D[i-1][1]));
 const horizontalLength=distance.at(-1)+Math.hypot(points2D[0][0]-points2D.at(-1)[0],points2D[0][1]-points2D.at(-1)[1]);
 const sourcePoints=points2D.map(([x,z],i)=>new THREE.Vector3(x,trackHeightAtStation(distance[i]/horizontalLength*5807),z));
 const curve=new THREE.CatmullRomCurve3(sourcePoints,true,'centripetal',.18);curve.arcLengthDivisions=16000;curve.updateArcLengths();
 const beforeCalibration=curve.getLength();let scale=1;
 for(let pass=0;pass<4;pass++){const correction=targetLengthMetres/curve.getLength();scale*=correction;sourcePoints.forEach(p=>{p.x*=correction;p.z*=correction;});curve.updateArcLengths();}
 return{curve,sourcePoints,horizontalLength,beforeCalibration,scale,renderedLength:curve.getLength()};
}
