import { LANDMARKS, TRACK_LENGTH_METERS } from './track-data.js';
import { frameAt, instanceBatch, signTexture } from './scene-utils.js';

export function addAlbertParkTrackside(THREE,scene,curve,ground,halfWidthAt){
 const group=new THREE.Group();group.name='Albert Park barriers fencing and braking boards';scene.add(group);
 const walls=[],posts=[],fences=[],boards=[];
 const length=TRACK_LENGTH_METERS;
 for(let s=0;s<length;s+=8){
  const u=s/length,f=frameAt(THREE,curve,u),angle=Math.atan2(f.forward.x,f.forward.z);
  const station=s>length/2?s-length:s;
  for(const side of [-1,1]){
   // The pit entry, separation wall and exit are built by grid-details.
   if(side<0&&station>-385&&station<300)continue;
   const offset=side*(halfWidthAt(u)+4.1),x=f.point.x+f.across.x*offset,z=f.point.z+f.across.z*offset;
   if(ground.nearest(x,z).distance<9.4||[-4,4].some(along=>ground.nearest(x+f.forward.x*along,z+f.forward.z*along).distance<8.8))continue;
   walls.push({position:[x,f.point.y+.58,z],rotation:[0,angle,0],color:Math.floor(s/80)%2?0xc1c7bf:0x738a74});
   posts.push({position:[x,f.point.y+2.05,z],rotation:[0,angle,0]});
   fences.push({position:[x,f.point.y+2.45,z],rotation:[0,angle,0]});
  }
 }
 instanceBatch(THREE,group,'Albert Park continuous concrete safety walls',new THREE.BoxGeometry(.45,1.15,8.07),
  new THREE.MeshStandardMaterial({color:0xb8c3b9,roughness:.9}),walls);
 instanceBatch(THREE,group,'Albert Park catch-fence steel posts',new THREE.BoxGeometry(.09,3.8,.09),
  new THREE.MeshStandardMaterial({color:0x596864,roughness:.65,metalness:.42}),posts);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,64,64);ctx.strokeStyle='rgba(80,96,90,.7)';ctx.lineWidth=1.1;
 for(let n=-64;n<=128;n+=16){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n+64,64);ctx.moveTo(n,64);ctx.lineTo(n+64,0);ctx.stroke();}
 const wire=new THREE.CanvasTexture(canvas);wire.colorSpace=THREE.SRGBColorSpace;wire.wrapS=wire.wrapT=THREE.RepeatWrapping;wire.repeat.set(2.8,1);
 instanceBatch(THREE,group,'Albert Park transparent catch-fence mesh',new THREE.PlaneGeometry(8.05,2.55),
  new THREE.MeshBasicMaterial({map:wire,transparent:true,alphaTest:.15,side:THREE.DoubleSide,depthWrite:false}),
  fences.map(p=>({...p,rotation:[0,p.rotation[1]+Math.PI/2,0]})));
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
 return{group,updateLighting(){},setWetLighting(){}};
}
