import {createVenue} from '../circuits-2026/venue.js';
export function addEnvironment(THREE,ctx){
 const v=createVenue(THREE,ctx),{config}=ctx,{palette:p}=v,T=n=>config.turns['T'+n].station;
 // The post-2023 GP layout uses the fast final two bends, without the old chicane.
 const main=v.stand('Tribuna Principal with curved canopy',30,1,43,260,22,{color:0xa84b4a});
 if(main){const base=v.ground(main,0,0)+18;
  for(let i=0;i<19;i++){const z=-135+i*15,roof=new THREE.Group();roof.position.z=z;main.add(roof);
   for(let j=0;j<7;j++){const x=-15+j*5,y=base+3.5*Math.cos(x/24),part=v.solid(roof,'Curved silver canopy strip',[5.15,.36,15.2],[x,y,0],p.roof);part.rotation.z=-3.5/24*Math.sin(x/24);}
   v.foundation(main,15,z,.5,.7,base+3,p.steel);
  }
 }
 v.stand('Grandstand A at first braking zone',T(1)-80,1,54,110,15,{color:0xd29d4f});
 v.stand('Grandstand L on the elevated infield',T(5)+35,1,60,115,17,{color:0x8b6052});
 v.stand('Grandstand H at the fast final sector',T(13),1,58,110,15,{color:0x9a5c5b});
 v.stand('Grandstand G overlooking stadium bowl',T(12)-15,1,73,155,18,{color:0xc8b48e});
 v.stand('Grandstand B in the stadium',T(11)+20,1,55,85,14,{color:0xb7a474});
 const tower=v.landmark('Indianapolis-inspired scoring pylon',260,49);
 v.foundation(tower,0,0,3.5,3.5,27,p.steel);v.solid(tower,'Black timing pylon',[5,21,3],[0,18,0],ctx.helpers.material(0x222a2c));
 for(let i=0;i<10;i++)v.solid(tower,'Scoring display luminous bands',[5.1,.45,3.1],[0,8+i*1.8,0],ctx.helpers.material(i%2?0xd1cba8:0x6f7d78));
 // Official 2024 Rooftop: bridge before T10, 75m span and 30m south tower.
 const roof=v.landmark('Circuit Rooftop 2024 before Turn 10',T(10)-105),bridgeY=17;
 for(const x of [-33,33]){v.foundation(roof,x,0,7,13,bridgeY+4,p.concrete);v.solid(roof,'Rooftop elevator glazing',[5.8,11,10.5],[x,bridgeY-1,0],p.glass);}
 v.solid(roof,'Seventy-five metre hospitality bridge',[75,3.6,11],[0,bridgeY,0],p.glass);
 v.solid(roof,'Rooftop projecting white slab',[77,.6,14],[0,bridgeY+2.1,0],p.roof);
 v.solid(roof,'Rooftop lower white slab',[76,.6,13],[0,bridgeY-2.1,0],p.roof);
 v.foundation(roof,33,1,7.6,11.5,30,p.concrete);
 const signMat=ctx.helpers.material(0xffffff,{map:ctx.helpers.label(THREE,'CIRCUIT · BARCELONA',{background:'#a62c37'})});
 v.solid(roof,'Rooftop roof lettering',[56,1.5,.15],[0,bridgeY+3,-6.4],signMat);
 // Behind the pits, approximate hospitality modules and access pavement.
 const paddock=v.landmark('Barcelona paddock and hospitality',-45,-67);
 // A single 235 m flat plinth floated above the sloping paddock ends.
 // Each pavilion now has its own level, terrain-reaching short foundation.
 for(let i=0;i<8;i++){const z=-100+i*28;let floor=-Infinity;
  for(const x of [-9,0,9])for(const dz of [-12,0,12])floor=Math.max(floor,v.ground(paddock,x,z+dz)+.2);
  v.foundation(paddock,0,z,18,24,floor,p.concrete);
  v.solid(paddock,'Hospitality pavilion',[16,5,21],[0,floor+2.5,z],p.roof);v.solid(paddock,'Hospitality ribbon windows',[16.2,1.8,18],[0,floor+3.7,z],p.glass);
 }
 v.occupied.push({root:paddock,depth:45,span:240},{root:roof,depth:80,span:20},{root:tower,depth:10,span:10});
 // The generic gantry put its posts in the four-metre road reserve and
 // beside the pit fast lane. Span both lanes, with posts outside both.
 const gantry=v.landmark('Barcelona start gantry',90),leftPost=12.2,rightPost=-25,gantryTop=9.4;
 for(const x of [leftPost,rightPost])v.foundation(gantry,x,0,.8,.8,gantryTop,p.steel);
 const gantryMat=ctx.helpers.material(0xffffff,{map:ctx.helpers.label(THREE,'CIRCUIT DE BARCELONA-CATALUNYA',{background:'#9e2934'})});
 v.solid(gantry,'Overhead start banner spanning road and pit lane',[leftPost-rightPost+1,1.6,.35],[(leftPost+rightPost)/2,gantryTop,0],gantryMat);
 // Wide foundations need the lowest terrain sample under their full foot,
 // rather than only the centre height, to avoid floating downhill corners.
 v.group.updateMatrixWorld(true);
 v.group.traverse(mesh=>{if(mesh.name!=='Terrain-reaching foundation')return;
  const top=mesh.position.y+mesh.scale.y/2,nx=Math.max(1,Math.ceil(mesh.scale.x/3)),nz=Math.max(1,Math.ceil(mesh.scale.z/3));let bottom=mesh.position.y-mesh.scale.y/2;
  for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
   const x=mesh.position.x+(i/nx-.5)*mesh.scale.x,z=mesh.position.z+(j/nz-.5)*mesh.scale.z;
   bottom=Math.min(bottom,v.ground(mesh.parent,x,z)-.12);
  }
  mesh.scale.y=top-bottom;mesh.position.y=(top+bottom)/2;
 });
 const trees=v.forest(1800,{seed:234,pad:230,colour:0x526640,height:8});
 return {group:v.group,landmarks:v.landmarks,stats:{trees,version:'GP 14 turns / Rooftop 2024',architecturalDetail:'interpretation'}};
}
