import { LANDMARKS, TRACK_LENGTH_METERS } from './track-data.js';
import { smooth, wrap } from './scene-utils.js';

// Procedural estimates of safety areas, informed by the FIA 2026 map and
// Competition Notes V2. These are not surveyed barrier coordinates.
export const SAFETY_AREAS = Object.freeze([
  {id:'T1',width:30,type:'gravel'}, {id:'T2',width:13,type:'grass'},
  {id:'T3',width:37,type:'gravel'}, {id:'T4',width:15,type:'grass'},
  {id:'T5',width:12,type:'grass'}, {id:'T6',width:25,type:'gravel',grassStrip:2.3},
  {id:'T9',width:15,type:'grass'}, {id:'T10',width:13,type:'grass'},
  {id:'T11',width:43,type:'gravel'}, {id:'T12',width:17,type:'grass'},
  {id:'T13',width:25,type:'gravel'}, {id:'T14',width:19,type:'paved'},
]);

export function createRoadsideProfile(THREE,curve,halfWidthAt) {
  const count=1320,step=TRACK_LENGTH_METERS/count;
  const data=Array.from({length:count},(_,i)=>{
    const u=i/count,a=curve.getPointAt(wrap(u-8/TRACK_LENGTH_METERS));
    const b=curve.getPointAt(u),c=curve.getPointAt(wrap(u+8/TRACK_LENGTH_METERS));
    const cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
    const radius=Math.abs(cross)>1e-7?a.distanceTo(b)*b.distanceTo(c)*c.distanceTo(a)/(2*Math.abs(cross)):1e6;
    return {radius,turnSign:Math.sign(cross)};
  });
  const at=u=>data[Math.round(wrap(u)*count)%count];
  const innerLimit=(u,side)=>side*at(u).turnSign<0 ? Math.max(halfWidthAt(u)+5.5,at(u).radius*.82) : 1e6;
  const areas=SAFETY_AREAS.map(area=>{
    const station=LANDMARKS.turns[area.id].distanceMeters;
    return {...area,station,side:at(station/TRACK_LENGTH_METERS).turnSign>0?1:-1};
  });
  const weightAt=(area,u)=>{
    let d=wrap(u)*TRACK_LENGTH_METERS-area.station;
    if(d>TRACK_LENGTH_METERS/2)d-=TRACK_LENGTH_METERS;
    if(d<-TRACK_LENGTH_METERS/2)d+=TRACK_LENGTH_METERS;
    return smooth((d+90)/55)*(1-smooth((d-40)/70));
  };
  const safetyEdgeAt=(u,side)=>Math.min(innerLimit(u,side),areas.reduce((edge,area)=>
    area.side===side?Math.max(edge,halfWidthAt(u)+1.15+area.width*weightAt(area,u)):edge,halfWidthAt(u)+2.1));
  const earthStartAt=(u,side)=>Math.min(innerLimit(u,side)-2.5,
    Math.max(halfWidthAt(u)+10,safetyEdgeAt(u,side)+.4));
  const earthEndAt=(u,side)=>Math.min(innerLimit(u,side),Math.max(halfWidthAt(u)+66,earthStartAt(u,side)+16));
  const heightAtOffset=(u,side,offset)=>{
    const from=earthStartAt(u,side),to=earthEndAt(u,side),y=curve.getPointAt(wrap(u)).y;
    return (y-.09)*(1-smooth((Math.abs(offset)-from)/Math.max(.1,to-from)))
      +1.65*smooth((Math.abs(offset)-from)/Math.max(.1,to-from));
  };
  return {areas,weightAt,innerLimit,safetyEdgeAt,earthStartAt,earthEndAt,heightAtOffset,
    wallOffsetAt:(u,side)=>Math.max(halfWidthAt(u)+4.5,safetyEdgeAt(u,side)+2.6),
    curvatureAt:at,step};
}
