// FIA 2026 media kit gives 10–15.4 m. Intermediate width stations and wall
// setbacks are conservative reconstructions, not surveyed boundary data.
export const ROAD_WIDTH_PROFILE_METERS = Object.freeze([
  [0,15.4],[310,15.4],[440,12],[1050,12],[1450,11.5],[1850,12],
  [3000,12],[3190,11],[3380,10],[3560,10],[3690,12],
  [4850,12],[5050,13],[5260,15.4],[5412,15.4],
]);
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function roadHalfWidthAt(u) {
  const s=((u%1)+1)%1*5412;
  const i=ROAD_WIDTH_PROFILE_METERS.findIndex((p,j,a)=>j<a.length-1&&s>=p[0]&&s<a[j+1][0]);
  const [a,w]=ROAD_WIDTH_PROFILE_METERS[Math.max(0,i)], [b,v]=ROAD_WIDTH_PROFILE_METERS[Math.max(0,i)+1];
  return (w+(v-w)*smooth((s-a)/(b-a)))/2;
}
export const cornerWindowMetres = corner => [14,15].includes(corner)?8:([1,11,17].includes(corner)?32:22);
export const runoffDepthMetres = corner => [1,11,17].includes(corner)?14:([12,13,14,15,16].includes(corner)?1.2:5.5);

export function createWallOffsetSampler(curve,landmarks) {
  const turns=Object.entries(landmarks.turns).map(([id,t])=>{
    const number=Number(id.slice(1)),u=t.distanceMeters/5412;
    const a=curve.getTangentAt((u-8/5412+1)%1),b=curve.getTangentAt((u+8/5412)%1);
    return {u,number,outside:a.x*b.z-a.z*b.x>0?1:-1};
  });
  return (u,side)=>{
    let extra=2.2;
    for(const turn of turns) {
      if(side!==turn.outside)continue;
      let delta=((u-turn.u+.5)%1+1)%1-.5;
      const fade=1-smooth((Math.abs(delta)*5412-cornerWindowMetres(turn.number))/34);
      extra=Math.max(extra,2.2+runoffDepthMetres(turn.number)*fade);
    }
    return roadHalfWidthAt(u)+extra;
  };
}
