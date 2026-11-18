// Reusable construction tools; positions and distinctive architecture stay in each venue.
export function createVenue(THREE,ctx){
 const {config,helpers,frameAt,length}=ctx,group=new THREE.Group(),landmarks=[],occupied=[];group.name=config.title+' environment';ctx.scene.add(group);
 const palette={concrete:helpers.material(0xaaa99b),steel:helpers.material(0x777d7c),glass:helpers.material(0x416572,{metalness:.3,roughness:.3}),roof:helpers.material(0xdfdfd1),red:helpers.material(0xb82431),orange:helpers.material(0xe37924)};
 function landmark(name,station,offset=0){const f=frameAt(station/length),root=new THREE.Group();root.name=name;root.userData.staticBatchRoot=true;root.position.copy(f.point).addScaledVector(f.across,offset);root.rotation.y=Math.atan2(f.forward.x,f.forward.z);group.add(root);landmarks.push(root);return root;}
 function ground(root,x,z){const p=root.localToWorld(new THREE.Vector3(x,0,z));return ctx.groundHeightAt(p.x,p.z)-root.position.y;}
 function solid(root,name,dimensions,position,mat){return helpers.box(root,name,dimensions,position,mat);}
 function foundation(root,x,z,w,d,top,mat=palette.concrete){const bottom=ground(root,x,z)-.12;return solid(root,'Terrain-reaching foundation',[w,Math.max(.2,top-bottom),d],[x,(top+bottom)/2,z],mat);}
 function clear(station,offset,depth,span){const f=frameAt(station/length);for(const x of [-depth/2,0,depth/2])for(const z of [-span/2,0,span/2]){
  const p=f.point.clone().addScaledVector(f.across,offset+x).addScaledVector(f.forward,z);if(ctx.drivingDistance(p.x,p.z)<config.width/2+5)return false;
 }return true;}
 function stand(name,station,side,offset,span=95,rows=13,{covered=false,color=0xa4433e}={}){
  const depth=rows*1.05;let distance=offset;
  for(let i=0;i<8&&!clear(station,side*distance,depth,span);i++)distance+=8;
  if(!clear(station,side*distance,depth,span))return null;
  const root=landmark(name,station,side*distance),seats=helpers.material(color),base=Math.max(ground(root,0,-span/2),ground(root,0,span/2),ground(root,0,0))+.2;
  for(let r=0;r<rows;r++){const x=side*(r-(rows-1)/2)*1.05,y=base+.65+r*.52;solid(root,'Grandstand seating step',[1.08,.48,span],[x,y,0],seats);}
  for(const z of [-span/2+2,0,span/2-2])for(const x of [-depth/2+1,depth/2-1])foundation(root,x,z,.5,.5,base+rows*.52,palette.steel);
  if(covered){const top=base+rows*.52+3.8;solid(root,'Grandstand canopy',[depth+5,.32,span+3],[0,top,0],palette.roof);for(const z of [-span/2+2,0,span/2-2])foundation(root,side*(depth/2-1),z,.4,.4,top,palette.steel);}
  root.userData.footprint={depth,span};occupied.push({root,depth:depth+5,span:span+5});return root;
 }
 function forest(count,{seed=68,pad=220,colour=0x4d6943,height=9}={}){
  let state=seed;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const bounds=new THREE.Box3().setFromPoints(ctx.samples),trunks=[],crowns=[];
  for(let tries=0;tries<count*20&&trunks.length<count;tries++){
   const x=bounds.min.x-pad+random()*(bounds.max.x-bounds.min.x+pad*2),z=bounds.min.z-pad+random()*(bounds.max.z-bounds.min.z+pad*2);
   if(ctx.drivingDistance(x,z)<39)continue;
   let blocked=false;for(const o of occupied){const p=o.root.worldToLocal(new THREE.Vector3(x,0,z));if(Math.abs(p.x)<o.depth/2+7&&Math.abs(p.z)<o.span/2+7){blocked=true;break;}}if(blocked)continue;
   const y=ctx.groundHeightAt(x,z),h=height*(.7+random()*.6),r=1.8+random()*1.8;
   trunks.push({position:[x,y+h*.28,z],scale:[.24,h*.56,.24]});crowns.push({position:[x,y+h*.7,z],scale:[r,h*.68,r],color:new THREE.Color(colour).multiplyScalar(.8+random()*.35)});
  }
  helpers.instances(group,'Grounded tree trunks',new THREE.CylinderGeometry(1,1,1,5),helpers.material(0x665746),trunks);
  helpers.instances(group,'Instanced tree crowns',new THREE.ConeGeometry(1,1,7),helpers.material(0xffffff),crowns);return trunks.length;
 }
 function banner(name,station,text,color='#214b40'){
  const root=landmark(name,station),f=frameAt(station/length),top=9.4;
  const ends=[];for(const side of [-1,1]){let x=side*(config.width/2+6);
   for(let i=0;i<16;i++){const q=f.point.clone().addScaledVector(f.across,x);if(ctx.roadDistance(q.x,q.z)>config.width/2+4.5&&ctx.pitDistance(q.x,q.z)>7.8)break;x+=side*2;}
   ends.push(x);foundation(root,x,0,.8,.8,top,palette.steel);
  }
  const material=helpers.material(0xffffff,{map:helpers.label(THREE,text,{background:color})});solid(root,'Overhead banner with clear span',[ends[1]-ends[0]+1,1.6,.35],[(ends[0]+ends[1])/2,top,0],material);return root;
 }
 return {group,landmarks,occupied,palette,landmark,solid,foundation,ground,stand,forest,banner,clear};
}
