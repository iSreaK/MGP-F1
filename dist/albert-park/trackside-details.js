import { LANDMARKS, TRACK_LENGTH_METERS } from './track-data.js';
import { frameAt, instanceBatch, signTexture, isWater } from './scene-utils.js';

export function addAlbertParkTrackside(THREE,scene,curve,ground,halfWidthAt,roadside){
 const group=new THREE.Group();group.name='Albert Park barriers fencing and braking boards';scene.add(group);
 const walls=[],posts=[],fences=[],tecpro=[],wallSegments=[];
 const length=TRACK_LENGTH_METERS;
 const boundary=(s,side)=>{
  const u=((s/length)%1+1)%1,f=frameAt(THREE,curve,u);
  let offset=roadside.wallOffsetAt(u,side);
  // The lake is a real geographic cutout, not space available for a wall.
  for(let distance=halfWidthAt(u)+3.6;distance<offset;distance+=.75){
   if(isWater(f.point.x+f.across.x*side*distance,f.point.z+f.across.z*side*distance)){
    offset=Math.max(halfWidthAt(u)+3.5,distance-1.2);break;
   }
  }
  const x=f.point.x+f.across.x*side*offset,z=f.point.z+f.across.z*side*offset;
  return{x,z,y:roadside.heightAtOffset(u,side,offset),u,offset};
 };
 for(let s=0;s<length;s+=4){
  const next=Math.min(length,s+4),u=s/length;
  const station=s>length/2?s-length:s;
  for(const side of [-1,1]){
   // The pit entry, separation wall and exit are built by grid-details.
   if(side<0&&station>-385&&station<300)continue;
   const a=boundary(s,side),b=boundary(next,side),x=(a.x+b.x)/2,z=(a.z+b.z)/2;
   const nearest=ground.nearest(x,z);
   if(nearest.distance<halfWidthAt(nearest.u)+2.7||isWater(x,z))continue;
   const run=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(b.x-a.x,b.z-a.z),base=(a.y+b.y)/2;
   const wallHeight=1.15+Math.abs(a.y-b.y);
   walls.push({position:[x,base+wallHeight/2,z],rotation:[0,angle,0],scale:[.45,wallHeight,run+.035],color:Math.floor(s/64)%2?0xd5d8cb:0x3f795f});
   posts.push({position:[a.x,a.y+2.05,a.z],rotation:[0,angle,0]});
   fences.push({position:[x,base+2.45,z],rotation:[0,angle+Math.PI/2,0],scale:[run,1,1]});
   wallSegments.push({a,b,side,station:s});
   if(roadside.safetyEdgeAt(u,side)>halfWidthAt(u)+16&&Math.floor(s/4)%2===0){
    const f=frameAt(THREE,curve,u),off=side*(Math.min(a.offset,b.offset)-1.0);
    tecpro.push({position:[f.point.x+f.across.x*off,base+.48,f.point.z+f.across.z*off],rotation:[0,angle,0],scale:[1,1,run*1.9]});
   }
  }
 }
 instanceBatch(THREE,group,'Albert Park continuous concrete safety walls',new THREE.BoxGeometry(1,1,1),
  new THREE.MeshStandardMaterial({color:0xb8c3b9,roughness:.9}),walls);
 instanceBatch(THREE,group,'Albert Park catch-fence steel posts',new THREE.BoxGeometry(.09,3.8,.09),
  new THREE.MeshStandardMaterial({color:0x596864,roughness:.65,metalness:.42}),posts);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,64,64);ctx.strokeStyle='rgba(80,96,90,.7)';ctx.lineWidth=1.1;
 for(let n=-64;n<=128;n+=16){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n+64,64);ctx.moveTo(n,64);ctx.lineTo(n+64,0);ctx.stroke();}
 const wire=new THREE.CanvasTexture(canvas);wire.colorSpace=THREE.SRGBColorSpace;wire.wrapS=wire.wrapT=THREE.RepeatWrapping;wire.repeat.set(2.8,1);
 instanceBatch(THREE,group,'Albert Park transparent catch-fence mesh',new THREE.PlaneGeometry(1,2.55),
  new THREE.MeshBasicMaterial({map:wire,transparent:true,alphaTest:.15,side:THREE.DoubleSide,depthWrite:false}),
  fences);
 instanceBatch(THREE,group,'Albert Park corner energy absorbing barrier modules',new THREE.BoxGeometry(.9,.95,1),
  new THREE.MeshStandardMaterial({color:0x315f46,roughness:.94}),tecpro);
 for(const id of ['T1','T3','T6','T9','T11','T13']){
  const turn=LANDMARKS.turns[id];
  for(const distance of [150,100,50]){
   const u=(turn.distanceMeters-distance)/length,f=frameAt(THREE,curve,u);
   const side=id==='T9'||id==='T13'?-1:1;
   const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.05),new THREE.MeshBasicMaterial({
    map:signTexture(THREE,String(distance),{background:'#e4e8df',foreground:'#233732',width:256,height:128}),side:THREE.DoubleSide}));
   sign.name=`${distance} m braking board before ${id}`;sign.position.copy(f.point).addScaledVector(f.across,side*(halfWidthAt(u)+5.4));
   sign.position.y+=2.0;sign.rotation.y=Math.atan2(f.forward.x,f.forward.z)+Math.PI;group.add(sign);
  }
 }
 return{group,wallSegments,updateLighting(){},setWetLighting(){}};
}
