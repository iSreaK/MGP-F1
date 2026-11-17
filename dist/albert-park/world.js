import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { prepareAlbertParkCurve } from './geometry-smoothing.js';
import { addAlbertParkGridDetails } from './grid-details.js';
import { addAlbertParkEnvironment } from './environment.js';
import { addAlbertParkTrackside } from './trackside-details.js';
import { ribbon, makeGroundSampler, smooth, seededRandom } from './scene-utils.js';

function roadTexture(THREE){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d'),image=ctx.createImageData(256,256),random=seededRandom(20260308);
 for(let i=0;i<image.data.length;i+=4){const v=89+(random()-.5)*25;image.data[i]=v-2;image.data[i+1]=v;image.data[i+2]=v+2;image.data[i+3]=255;}
 ctx.putImageData(image,0,0);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;return map;
}
export function roadHalfWidthAt(u){
 let half=6;
 for(const id of ['T1','T3','T6','T11']){
  const centre=LANDMARKS.turns[id].distanceMeters/TRACK_LENGTH_METERS;
  const delta=Math.min(Math.abs(u-centre),1-Math.abs(u-centre))*TRACK_LENGTH_METERS;
  half+=1.2*(1-smooth((delta-25)/55));
 }
 return half;
}
export function createAlbertParkWorld(THREE,scene){
 const {curve,sourcePoints}=prepareAlbertParkCurve(THREE,TRACK_POINTS,TRACK_LENGTH_METERS);
 const ground=makeGroundSampler(curve);const samples=ground.samples;
 const surfaces=new THREE.Group();surfaces.name='Albert Park track surfaces';scene.add(surfaces);
 const asphalt=new THREE.MeshStandardMaterial({map:roadTexture(THREE),color:0xe3e5e5,roughness:.94,side:THREE.DoubleSide});
 const shoulder=new THREE.MeshStandardMaterial({color:0x555f5b,roughness:.98,side:THREE.DoubleSide});
 const grass=new THREE.MeshStandardMaterial({color:0x63834d,roughness:.98,side:THREE.DoubleSide});
 const white=new THREE.MeshBasicMaterial({color:0xf0f0de,side:THREE.DoubleSide});
 const green=new THREE.MeshStandardMaterial({color:0x238373,roughness:.92,side:THREE.DoubleSide});
 const curbWhite=new THREE.MeshStandardMaterial({color:0xdfe3dd,roughness:.87,side:THREE.DoubleSide});
 const curbGreen=new THREE.MeshStandardMaterial({color:0x266d55,roughness:.87,side:THREE.DoubleSide});
 const overviewAccent=new THREE.MeshBasicMaterial({color:0xcbd4c1,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
 for(const side of [-1,1]){
  const near=u=>side*(roadHalfWidthAt(u)+2.1),far=u=>side*(roadHalfWidthAt(u)+10);
  ribbon(THREE,surfaces,'Albert Park graded grass verge '+side,curve,0,1,
   side<0?far:near,side<0?near:far,grass,{height:(frame,offset)=>-.06-.18*smooth((Math.abs(offset)-8)/8)});
  for(let band=0;band<7;band++){
   const near=t=>side*(roadHalfWidthAt(t)+10+band*8),far=t=>side*(roadHalfWidthAt(t)+18+band*8);
   ribbon(THREE,surfaces,'Albert Park earth shoulder '+side+' '+band,curve,0,1,
    side<0?far:near,side<0?near:far,grass,{step:4,clipWater:true,height:(f,offset)=>{
     const blend=smooth((Math.abs(offset)-16)/56);
     return -.24*(1-blend)+(1.65-f.point.y)*blend;
    }});
  }
 }
 ribbon(THREE,surfaces,'Albert Park paved road shoulder',curve,0,1,u=>-roadHalfWidthAt(u)-2.1,u=>roadHalfWidthAt(u)+2.1,shoulder,{height:-.045});
 ribbon(THREE,surfaces,'Albert Park overview silhouette',curve,0,1,u=>-roadHalfWidthAt(u)-4.2,u=>roadHalfWidthAt(u)+4.2,overviewAccent,{height:.012});
 const road=ribbon(THREE,surfaces,'Albert Park racing surface',curve,0,1,u=>-roadHalfWidthAt(u),roadHalfWidthAt,asphalt,{height:0,step:2.5});
 ribbon(THREE,surfaces,'Albert Park left track-limit line',curve,0,1,u=>-roadHalfWidthAt(u)+.08,u=>-roadHalfWidthAt(u)+.22,white,{height:.025,step:2.5});
 ribbon(THREE,surfaces,'Albert Park right track-limit line',curve,0,1,u=>roadHalfWidthAt(u)-.22,u=>roadHalfWidthAt(u)-.08,white,{height:.025,step:2.5});
 for(const [id,turn] of Object.entries(LANDMARKS.turns)){
  const u=turn.distanceMeters/TRACK_LENGTH_METERS;
  const a=curve.getTangentAt((u-.007+1)%1),b=curve.getTangentAt((u+.007)%1);
  const inside=a.x*b.z-a.z*b.x<0?1:-1;
  // Short green-white kerbs and green exit paint. Corner width changes are
  // estimates; the longitudinal station and 14-corner sequence are FIA based.
  for(let s=-25;s<27;s+=3.2){
   const from=(turn.distanceMeters+s)/TRACK_LENGTH_METERS,to=(turn.distanceMeters+s+3.18)/TRACK_LENGTH_METERS;
   ribbon(THREE,surfaces,`${id} green-white kerb ${s}`,curve,from,to,
    t=>inside*(roadHalfWidthAt(t)+.04),t=>inside*(roadHalfWidthAt(t)+.92),
    Math.round((s+25)/3.2)%2?curbWhite:curbGreen,{height:.043,step:2});
  }
  const side=-inside,span=['T1','T3','T6','T11'].includes(id)?42:24;
  const near=t=>side*(roadHalfWidthAt(t)+.3),far=t=>side*(roadHalfWidthAt(t)+span);
  ribbon(THREE,surfaces,`${id} outer safety runoff`,curve,u-40/TRACK_LENGTH_METERS,u+60/TRACK_LENGTH_METERS,
    side<0?far:near,side<0?near:far,green,{height:-.025});
 }
 // Batch the repeated small kerbs and earth strips by material, retaining
 // the continuous racing surface as its own testable mesh.
 for(const material of [curbWhite,curbGreen,grass,green]){
  const meshes=surfaces.children.filter(mesh=>mesh.material===material);
  if(meshes.length<2)continue;
  const positions=[],uvs=[],indices=[];let vertexOffset=0;
  for(const mesh of meshes){
   positions.push(...mesh.geometry.getAttribute('position').array);
   uvs.push(...mesh.geometry.getAttribute('uv').array);
   for(const index of mesh.geometry.index.array)indices.push(index+vertexOffset);
   vertexOffset+=mesh.geometry.getAttribute('position').count;
   surfaces.remove(mesh);mesh.geometry.dispose();
  }
  const merged=new THREE.BufferGeometry();merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  merged.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));merged.setIndex(indices);merged.computeVertexNormals();
  const mesh=new THREE.Mesh(merged,material);mesh.name='Albert Park batched '+(material===grass?'graded earth and verges':material===green?'corner runoff':'green-white kerbs');mesh.receiveShadow=true;surfaces.add(mesh);
 }
 const grid=addAlbertParkGridDetails(THREE,scene,curve,sourcePoints,LANDMARKS,0,TRACK_WIDTH_METERS/2);
 const environment=addAlbertParkEnvironment(THREE,scene,curve,ground,grid);
 const trackside=addAlbertParkTrackside(THREE,scene,curve,ground,roadHalfWidthAt);
 const bounds=new THREE.Box3().setFromPoints(samples).expandByScalar(180);
 const trackHeightAt=(u,x,z)=>{
  const point=curve.getPointAt(((u%1)+1)%1);if(!Number.isFinite(x)||!Number.isFinite(z))return point.y;
  const tangent=curve.getTangentAt(((u%1)+1)%1),horizontal=Math.max(.01,Math.hypot(tangent.x,tangent.z));
  return point.y+((x-point.x)*tangent.x+(z-point.z)*tangent.z)*tangent.y/horizontal;
 };
 return{curve,samples,bounds,sourcePoints,road,trackHeightAt,gridU:grid.gridU,gridPoint:grid.gridPoint,gridTangent:grid.gridTangent,
  trackMaterial:asphalt,overviewAccent,environment,trackside};
}
