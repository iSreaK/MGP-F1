import {createCircuitGeometry,createRibbon,wrap,smooth,delta} from './geometry.js';
import {createHelpers} from './helpers.js';
import {batchStaticPrimitives} from '../suzuka/static-batches.js';

function noiseTexture(THREE,base,spread=18){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),image=ctx.createImageData(128,128);let seed=1726;
 for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=base+(seed/4294967296-.5)*spread;image.data[i]=v;image.data[i+1]=v;image.data[i+2]=v;image.data[i+3]=255;}
 ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;return texture;
}
function addPit(THREE,ctx,helpers){
 const {config,length,frameAt,halfWidthAt}=ctx,pit=config.pit,group=new THREE.Group();group.name=config.name+' pit lane';ctx.scene.add(group);
 const samples=[],halfWidth=3.25;
 if(config.pitGeographic?.length){
  const g=config.geography,raw=config.pitGeographic.map(([lon,lat])=>new THREE.Vector3((lon-g.origin[0])*g.metresPerDegree[0]*g.scale,0,-(lat-g.origin[1])*g.metresPerDegree[1]*g.scale));
  const first=ctx.nearest(raw[0].x,raw[0].z),last=ctx.nearest(raw.at(-1).x,raw.at(-1).z);
  raw.unshift(first.point.clone());raw.push(last.point.clone());
  const distance=[0];for(let i=1;i<raw.length;i++)distance.push(distance.at(-1)+raw[i].distanceTo(raw[i-1]));
  for(let i=0;i<raw.length;i++)raw[i].y=first.point.y+(last.point.y-first.point.y)*smooth(distance[i]/distance.at(-1))-.018;
  const curve=new THREE.CatmullRomCurve3(raw,false,'centripetal');curve.arcLengthDivisions=4000;curve.updateArcLengths();
  const count=Math.ceil(curve.getLength()/3);
  for(let i=0;i<=count;i++){const u=i/count,point=curve.getPointAt(u),forward=curve.getTangentAt(u).setY(0).normalize();
   samples.push({point,forward,across:new THREE.Vector3(forward.z,0,-forward.x),halfWidth:halfWidth*Math.min(1,.06+u*18,.06+(1-u)*18)});}
 }else{
  const count=Math.ceil((pit.exit-pit.entry)/3);
  for(let i=0;i<=count;i++){const s=pit.entry+(pit.exit-pit.entry)*i/count,u=wrap(s/length),f=frameAt(u),t=smooth((s-pit.entry)/75)*(1-smooth((s-pit.exit+75)/75));
   const width=.10+halfWidth*t,offset=pit.side*(halfWidthAt(u)-.25+(halfWidth+4)*t);
   const point=f.point.clone().addScaledVector(f.across,offset);point.y-=.018;
   samples.push({point,forward:f.forward,across:f.across,halfWidth:width,station:s});
  }
 }
 const vertices=[],indices=[],paint=[],paintIndices=[];
 for(let i=0;i<samples.length;i++){const f=samples[i];
  for(const x of [-f.halfWidth,f.halfWidth]){const p=f.point.clone().addScaledVector(f.across,x);vertices.push(...p.toArray());}
  for(const x of [-f.halfWidth+.1,-f.halfWidth+.23,f.halfWidth-.23,f.halfWidth-.1]){const p=f.point.clone().addScaledVector(f.across,x);p.y+=.04;paint.push(...p.toArray());}
  if(i){const k=(i-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);const j=(i-1)*4;for(const x of [0,2])paintIndices.push(j+x,j+x+4,j+x+1,j+x+1,j+x+4,j+x+5);}
 }
 function mesh(name,p,idx,material){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);return mesh;}
 const road=mesh(config.name+' pit asphalt',vertices,indices,helpers.material(0x4b5154,{side:THREE.DoubleSide}));
 mesh('Pit entry and exit white lines',paint,paintIndices,new THREE.MeshBasicMaterial({color:0xe7eadf,side:THREE.DoubleSide}));
 const pitDistance=(x,z)=>{let best=Infinity;for(let i=1;i<samples.length;i++){const a=samples[i-1].point,b=samples[i].point,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}return best;};
 if(pit.building!==false){
  const garages=new THREE.Group();garages.name=config.name+' pit garages and paddock';group.add(garages);
  const pale=helpers.material(0xd1d3c8),glass=helpers.material(0x355263,{metalness:.25,roughness:.3}),roof=helpers.material(0xb1b9b5),shutter=helpers.material(0x7f8e90);
  for(let s=-155;s<120;s+=9){const f=frameAt(s/length),offset=pit.side*(halfWidthAt(f.u)+22),p=f.point.clone().addScaledVector(f.across,offset);
   if(ctx.roadDistance(p.x,p.z)<14)continue;
   const bay=new THREE.Group();bay.position.copy(p);bay.rotation.y=Math.atan2(f.forward.x,f.forward.z);garages.add(bay);
   const ground=ctx.groundHeightAt(p.x,p.z)-p.y;
   helpers.box(bay,'Pit garage grounded concrete bay',[15,6-ground,9.15],[0,(6+ground)/2,0],pale);
   helpers.box(bay,'Pit garage roller shutter',[.12,4.6,7.7],[-pit.side*7.56,2.45,0],shutter);
   helpers.box(bay,'Paddock glazing',[14,3.7,8.8],[0,8,0],glass);
   helpers.box(bay,'Pit building overhanging roof',[17,.45,9.25],[0,10.1,0],roof);
  }
 }
 return {group,samples,pitDistance,road};
}

export function createCircuitWorld(THREE,scene,points,config,addEnvironment){
 const geometry=createCircuitGeometry(THREE,points,config),helpers=createHelpers(THREE),group=new THREE.Group();group.name=config.name+' racing infrastructure';scene.add(group);
 const bounds=new THREE.Box3().setFromPoints(geometry.samples),size=bounds.getSize(new THREE.Vector3());
 const pad=config.theme==='city'||config.theme==='island'?180:360,res=160;
 const minX=bounds.min.x-pad,minZ=bounds.min.z-pad,dx=(size.x+pad*2)/res,dz=(size.z+pad*2)/res;
 const ground=[];
 for(let z=0;z<=res;z++)for(let x=0;x<=res;x++){
  const px=minX+x*dx,pz=minZ+z*dz,reach=Math.hypot(dx,dz)+config.width;
  const nearest=geometry.nearest(px,pz);let height=geometry.groundHeightAt(px,pz,nearest);
  for(const j of geometry.nearbyIndices(px,pz,reach)){const p=geometry.samples[j];
   if(Math.hypot(px-p.x,pz-p.z)<reach)height=Math.min(height,p.y-config.width*.5*Math.abs(Math.sin(geometry.bankAt(j/geometry.count)))-.55);}
  ground.push(height);
 }
 // Foundations and the road bed use precisely the same triangular interpolation as the mesh.
 const terrainHeightAt=(x,z)=>{
  const gx=Math.max(0,Math.min(res-1e-6,(x-minX)/dx)),gz=Math.max(0,Math.min(res-1e-6,(z-minZ)/dz));
  const ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz,k=iz*(res+1)+ix;
  const a=ground[k],b=ground[k+1],c=ground[k+res+1],d=ground[k+res+2];
  return tx+tz<=1?a+(b-a)*tx+(c-a)*tz:d+(c-d)*(1-tx)+(b-d)*(1-tz);
 };
 const context={...geometry,scene,group,config,helpers,groundHeightAt:terrainHeightAt,terrainHeightAt};config.seaLevel??=0;
 const pit=addPit(THREE,context,helpers);context.pitSamples=pit.samples;context.pitDistance=pit.pitDistance;
 if(config.pitGeographic){const reach=Math.hypot(dx,dz)+8;
  for(let z=0;z<=res;z++)for(let x=0;x<=res;x++){const px=minX+x*dx,pz=minZ+z*dz,k=z*(res+1)+x;
   for(const f of pit.samples)if(Math.abs(px-f.point.x)<reach&&Math.abs(pz-f.point.z)<reach&&Math.hypot(px-f.point.x,pz-f.point.z)<reach)ground[k]=Math.min(ground[k],f.point.y-.5);}
 }
 context.drivingDistance=(x,z)=>Math.min(context.roadDistance(x,z),pit.pitDistance(x,z));
 const environment=addEnvironment(THREE,context)||{};
 const isWater=environment.isWater||(()=>false);
 const {length,frameAt,halfWidthAt,curvatureAt}=geometry;
 const asphalt=helpers.material(0x666b6c,{map:noiseTexture(THREE,181,15),side:THREE.DoubleSide});
 const grass=helpers.material(config.theme==='dunes'?0xa4a579:0x6c8550,{side:THREE.DoubleSide});
 const gravel=helpers.material(0xc6b68b,{map:noiseTexture(THREE,218,23),side:THREE.DoubleSide});
 const shoulder=helpers.material(0x6a726c,{side:THREE.DoubleSide}),white=new THREE.MeshBasicMaterial({color:0xf2f0dd,side:THREE.DoubleSide});
 const sideLimit=(u,side)=>side*curvatureAt(u).sign<0?Math.max(halfWidthAt(u)+.8,curvatureAt(u).radius*.78):200;
 const runoffAt=(u,side)=>{
  if(config.theme==='city'||config.theme==='island')return halfWidthAt(u)+1.6;
  let amount=0;for(const number of config.runoffs||[]){const t=config.turns['T'+number],outside=curvatureAt(t.u).sign>0?1:-1;
   if(outside!==side)continue;const d=delta(wrap(u)*length,t.station,length);amount=Math.max(amount,24*smooth((d+75)/45)*(1-smooth((d-30)/75)));}
  return Math.min(sideLimit(u,side),halfWidthAt(u)+2+amount);
 };
 const surfaces=new THREE.Group();surfaces.name=config.name+' road and safety surfaces';group.add(surfaces);
 const road=createRibbon(THREE,surfaces,config.name+' racing surface',geometry,0,length,u=>-halfWidthAt(u),halfWidthAt,asphalt,{step:2});
 for(const side of [-1,1]){
  const exclude=(x,z,u)=>{const n=geometry.nearest(x,z);return isWater(x,z)||(Math.abs(delta(n.u*length,u*length,length))>25&&n.distance<halfWidthAt(n.u)+1);};
  createRibbon(THREE,surfaces,'Road edge paint '+side,geometry,0,length,u=>side*(halfWidthAt(u)-.22),u=>side*(halfWidthAt(u)-.07),white,{lift:.028,step:2});
  createRibbon(THREE,surfaces,'Paved shoulder '+side,geometry,0,length,u=>side*halfWidthAt(u),u=>side*Math.min(sideLimit(u,side),halfWidthAt(u)+.85),shoulder,{lift:-.018,exclude});
  if(config.theme!=='city'&&config.theme!=='island')createRibbon(THREE,surfaces,'Corner gravel and grass margin '+side,geometry,0,length,u=>side*(halfWidthAt(u)+1),u=>side*runoffAt(u,side),gravel,{lift:-.045,exclude:(x,z,u)=>runoffAt(u,side)<halfWidthAt(u)+3||exclude(x,z,u)});
  createRibbon(THREE,surfaces,'Track bed verge '+side,geometry,0,length,u=>side*Math.min(sideLimit(u,side),halfWidthAt(u)+.9),u=>side*Math.min(sideLimit(u,side),Math.max(halfWidthAt(u)+2,runoffAt(u,side)+.5)),grass,{lift:-.065,exclude});
 }
 // Curbs use vertex colours, producing two draw submissions for the full lap.
 const curbMeshes=[],curbColors=[helpers.material(0xe5e5d6,{side:THREE.DoubleSide}),helpers.material(config.theme==='city'?0xc52229:0xbe3035,{side:THREE.DoubleSide})];
 for(const turn of Object.values(config.turns)){
  const inside=curvatureAt(turn.u).sign>0?-1:1;
  for(let s=-22,k=0;s<25;s+=3,k++)curbMeshes.push(createRibbon(THREE,surfaces,turn.name+' curb',geometry,turn.station+s,turn.station+s+2.95,u=>inside*(halfWidthAt(u)+.04),u=>inside*Math.min(sideLimit(u,inside),halfWidthAt(u)+.75),curbColors[k%2],{lift:.045,step:2}));
 }
 for(const material of curbColors){const meshes=curbMeshes.filter(m=>m.material===material),positions=[],indices=[];let offset=0;
  for(const mesh of meshes){positions.push(...mesh.geometry.attributes.position.array);for(const i of mesh.geometry.index.array)indices.push(i+offset);offset+=mesh.geometry.attributes.position.count;surfaces.remove(mesh);mesh.geometry.dispose();}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.name='Batched circuit curbs';surfaces.add(mesh);
 }
 // High-resolution ground is capped underneath every nearby road segment.
 // In urban/water venues it stays close to the road and leaves the geographic water open.
 const vertices=[],colors=[],indices=[],vertexValid=[];
 for(let z=0;z<=res;z++)for(let x=0;x<=res;x++){
  const px=minX+x*dx,pz=minZ+z*dz;vertices.push(px,terrainHeightAt(px,pz),pz);
  const valid=!isWater(px,pz);vertexValid.push(valid);
  const color=new THREE.Color(config.theme==='dunes'?0xb7ae83:0x72864e).multiplyScalar(.92+.08*Math.sin(px*.017)*Math.cos(pz*.021));colors.push(color.r,color.g,color.b);
 }
 for(let z=0;z<res;z++)for(let x=0;x<res;x++){const a=z*(res+1)+x,b=a+1,c=a+res+1,d=c+1;
  for(const triangle of [[a,c,b],[b,c,d]])if(triangle.every(i=>vertexValid[i]))indices.push(...triangle);}
 const terrainGeometry=new THREE.BufferGeometry();terrainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));terrainGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeometry.setIndex(indices);terrainGeometry.computeVertexNormals();
 const terrain=new THREE.Mesh(terrainGeometry,helpers.material(0xffffff,{vertexColors:true,side:THREE.DoubleSide}));terrain.name=config.name+' terrain beneath racing surface';terrain.receiveShadow=true;scene.add(terrain);
 const horizon=new THREE.Mesh(new THREE.PlaneGeometry(40000,40000),helpers.material(config.theme==='dunes'?0xb7ae83:0x72864e,{side:THREE.DoubleSide}));horizon.name='Distant ground below geographic water';horizon.rotation.x=-Math.PI/2;horizon.position.y=-5;scene.add(horizon);
 // Vertical retaining skirts make the street bed meet the terrain, including Monaco's slopes.
 for(const side of [-1,1]){
  const skirt=[],idx=[];
  for(let i=0;i<=geometry.count;i++){const u=i/geometry.count,f=frameAt(u),off=side*(halfWidthAt(u)+.82),p=f.point.clone().addScaledVector(f.across,off);
   skirt.push(p.x,p.y-.08,p.z,p.x,Math.min(p.y-.1,terrainHeightAt(p.x,p.z)),p.z);if(i){const k=(i-1)*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(skirt,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,helpers.material(config.theme==='city'?0x92948b:0x7c8055,{side:THREE.DoubleSide}));mesh.name='Road retaining bed '+side;group.add(mesh);
 }
 const walls=[],posts=[],wallSegments=[],wallMat=helpers.material(config.theme==='city'||config.theme==='island'?0xc7c9bd:0xb2bbb6,{metalness:.2});
 const boundary=(s,side)=>{const u=wrap(s/length),f=frameAt(u);let off=Math.min(sideLimit(u,side),runoffAt(u,side)+2.1);
  if(config.theme==='city'||config.theme==='island')off=halfWidthAt(u)+1.5;
  const p=f.point.clone().addScaledVector(f.across,side*off);p.y-=.10;return p;};
 for(let s=0;s<length;s+=3.5)for(const side of [-1,1]){
  const signed=s>length/2?s-length:s;if(side===config.pit.side&&signed>config.pit.entry-15&&signed<config.pit.exit+15)continue;
  const a=boundary(s,side),b=boundary(Math.min(length,s+3.5),side),mid=a.clone().add(b).multiplyScalar(.5),near=geometry.nearest(mid.x,mid.z);
  if(near.distance<halfWidthAt(near.u)+.65||pit.pitDistance(mid.x,mid.z)<4||isWater(mid.x,mid.z))continue;
  const run=a.distanceTo(b),angle=Math.atan2(b.x-a.x,b.z-a.z),height=(config.theme==='city'||config.theme==='island'?1.15:.82)+Math.abs(a.y-b.y);
  walls.push({position:[mid.x,mid.y+height/2,mid.z],rotation:[0,angle,0],scale:[.34,height,run+.025]});
  if(Math.floor(s/3.5)%2===0)posts.push({position:[a.x,a.y+1.9,a.z],scale:[.07,3.8,.07]});wallSegments.push({a,b,station:s,side});
 }
 helpers.instances(group,'Continuous circuit safety barriers',new THREE.BoxGeometry(1,1,1),wallMat,walls);
 helpers.instances(group,'Circuit debris fence posts',new THREE.BoxGeometry(1,1,1),helpers.material(0x566665),posts);
 if(!config.pitGeographic){const separator=[];
  for(let s=config.pit.entry+95;s<config.pit.exit-95;s+=3.5){const f=frameAt(s/length),p=f.point.clone().addScaledVector(f.across,config.pit.side*(halfWidthAt(f.u)+1.4));
   if(pit.pitDistance(p.x,p.z)<3.65)continue;const yaw=Math.atan2(f.forward.x,f.forward.z);separator.push({position:[p.x,p.y+.45,p.z],rotation:[0,yaw,0],scale:[.3,1.05,3.55]});}
  helpers.instances(group,'Pit wall separating fast lane and race track',new THREE.BoxGeometry(1,1,1),wallMat,separator);
 }
 const fenceVertices=[],fenceIndices=[];
 for(const segment of wallSegments){const k=fenceVertices.length/3;for(const p of [segment.a,segment.b])fenceVertices.push(p.x,p.y+1,p.z,p.x,p.y+3.5,p.z);fenceIndices.push(k,k+2,k+1,k+1,k+2,k+3);}
 const fenceGeometry=new THREE.BufferGeometry();fenceGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fenceVertices,3));fenceGeometry.setIndex(fenceIndices);fenceGeometry.computeVertexNormals();
 const fence=new THREE.Mesh(fenceGeometry,new THREE.MeshBasicMaterial({color:0x82948a,wireframe:true,transparent:true,opacity:.22,side:THREE.DoubleSide}));fence.name='Continuous debris fence mesh';group.add(fence);
 // Illustrative grid, explicitly separate from historical race starting positions.
 const markings=[];for(let i=0;i<22;i++){const s=-14-i*8.2,side=i%2?-1:1,c=side*2.1;
  for(const [a,b,x0,x1] of [[s-5.8,s,c-1.2,c-1.08],[s-5.8,s,c+1.08,c+1.2],[s-.12,s+.12,c-1.2,c+1.2]])markings.push(createRibbon(THREE,group,'Illustrative starting grid marking',geometry,a,b,x0,x1,white,{lift:.038,step:3}));}
 const start=createRibbon(THREE,group,'Start and control reference line',geometry,-.18,.18,u=>-halfWidthAt(u),halfWidthAt,white,{lift:.04,step:1});
 const markingPositions=[],markingIndices=[];let markingOffset=0;
 for(const mesh of markings){markingPositions.push(...mesh.geometry.attributes.position.array);for(const i of mesh.geometry.index.array)markingIndices.push(i+markingOffset);markingOffset+=mesh.geometry.attributes.position.count;group.remove(mesh);mesh.geometry.dispose();}
 const markingGeometry=new THREE.BufferGeometry();markingGeometry.setAttribute('position',new THREE.Float32BufferAttribute(markingPositions,3));markingGeometry.setIndex(markingIndices);markingGeometry.computeVertexNormals();
 const gridMarkings=new THREE.Mesh(markingGeometry,white);gridMarkings.name='Batched illustrative starting grid';group.add(gridMarkings);
 const pitBatching=batchStaticPrimitives(THREE,pit.group,{namePrefix:config.name+' paddock'});
 for(const landmark of environment.landmarks||[]){const box=new THREE.Box3().setFromObject(landmark);if(!box.isEmpty())landmark.userData.cameraBounds={center:box.getCenter(new THREE.Vector3()).toArray(),size:box.getSize(new THREE.Vector3()).toArray()};}
 const batching=batchStaticPrimitives(THREE,environment.group||new THREE.Group(),{namePrefix:config.name+' venue'});
 return {...context,road,terrain,terrainHeightAt,pit,environment,wallSegments,runoffAt,bounds:bounds.clone().expandByScalar(80),batching,trackMaterial:asphalt};
}
