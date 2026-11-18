import {createVenue} from '../circuits-2026/venue.js';
export function addEnvironment(THREE,ctx){
 const v=createVenue(THREE,ctx),{config,helpers}=ctx,{palette:p}=v,T=n=>config.turns['T'+n].station;
 v.stand('Main Grandstand covered opposite pits',-5,1,40,155,17,{covered:true,color:0x6f8483});
 v.stand('Pit Grandstand',125,1,43,115,15,{color:0xe89432});
 v.stand('Tarzan-In Grandstand outside first corner',T(1)-65,1,64,115,17,{color:0xe58b27});
 v.stand('Ben Pon Grandstand at Luyendyk exit',-255,1,48,120,17,{color:0xe58727});
 v.stand('Hairpin Grandstand at Hugenholtz bowl',T(3),-1,64,100,16,{color:0xd98c34});
 v.stand('Eastside Grandstand',T(9),1,65,170,17,{color:0xe48725});
 v.stand('Arena-In Grandstand',T(11),1,60,90,16,{color:0xdf8530});
 v.stand('Arena Grandstand',T(12),-1,65,130,19,{color:0xed922e});
 v.stand('Arena-Out Grandstand',T(13)+15,1,64,115,15,{color:0xdf8b2c});
 const lounge=v.landmark('Dutch GP Lounge beside Hunserug',T(4),-52);
 v.foundation(lounge,0,0,20,45,6,p.concrete);v.solid(lounge,'Lounge glass frontage',[20.2,3.7,45.2],[0,5,0],p.glass);v.solid(lounge,'Dune lounge flat roof',[23,.4,48],[0,7.1,0],p.roof);
 v.occupied.push({root:lounge,depth:26,span:50});
 v.banner('Dutch GP start gantry',70,'ZANDVOORT · DUTCH GRAND PRIX');
 // The North Sea is geographically west, rather than mirrored onto the inland side.
 const coast=new THREE.Group();coast.name='North Sea and western coastal strip';v.group.add(coast);v.landmarks.push(coast);
 const bounds=new THREE.Box3().setFromPoints(ctx.samples),seaEdge=bounds.min.x-330;
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(20000,24000),helpers.material(0x6a9caa,{roughness:.35,metalness:.1,side:THREE.DoubleSide}));sea.rotation.x=-Math.PI/2;sea.position.set(seaEdge-10000,-.3,0);sea.name='North Sea west of the dunes';coast.add(sea);
 const beach=new THREE.Mesh(new THREE.PlaneGeometry(100,12000),helpers.material(0xd5c59b,{side:THREE.DoubleSide}));beach.rotation.x=-Math.PI/2;beach.position.set(seaEdge+45,-.2,0);beach.name='North Sea beach';coast.add(beach);
 // Low irregular dunes sit outside the racing corridor; no hills may cover asphalt.
 const dunePos=[],duneIdx=[],grass=[];let seed=1961;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<75;i++){
  const x=bounds.min.x-180+random()*(bounds.max.x-bounds.min.x+360),z=bounds.min.z-180+random()*(bounds.max.z-bounds.min.z+360),r=18+random()*27;
  if(ctx.drivingDistance(x,z)<r+26)continue;
  let occupied=false;for(const o of v.occupied){const q=o.root.worldToLocal(new THREE.Vector3(x,0,z));if(Math.abs(q.x)<o.depth/2+r&&Math.abs(q.z)<o.span/2+r){occupied=true;break;}}if(occupied)continue;
  const k=dunePos.length/3,y=ctx.groundHeightAt(x,z)-.1,h=2+random()*5;
  dunePos.push(x,y+h,z);for(let a=0;a<=12;a++){const angle=a/12*Math.PI*2,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;dunePos.push(px,ctx.groundHeightAt(px,pz)-.15,pz);if(a)duneIdx.push(k,k+a+1,k+a);}
  for(let j=0;j<16;j++){const a=random()*Math.PI*2,rr=Math.sqrt(random())*r,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr;grass.push({position:[px,y+h*(1-rr/r)+.35,pz],rotation:[0,random()*Math.PI,0],scale:[.25,.7,.25]});}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(dunePos,3));g.setIndex(duneIdx);g.computeVertexNormals();const dunes=new THREE.Mesh(g,helpers.material(0xc7bb8d,{side:THREE.DoubleSide}));dunes.name='Sculpted coastal sand dunes away from track';v.group.add(dunes);
 helpers.instances(v.group,'Marram grass dune tufts',new THREE.ConeGeometry(1,1,3),helpers.material(0x8d9560),grass);
 const trees=v.forest(450,{seed:861,pad:140,colour:0x687650,height:5});
 return {group:v.group,landmarks:v.landmarks,stats:{trees,banking:'18 degrees at T3/T14; progressive transitions',relief:'estimated centreline profile'}};
}
