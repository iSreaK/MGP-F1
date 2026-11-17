import { LAKE_OUTLINES, LAKE_ISLANDS } from './venue-data.js';

export const wrap = value=>((value%1)+1)%1;
export const smooth = value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export function seededRandom(seed){let n=seed>>>0;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);}
export function insidePolygon(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
export const isWater=(x,z)=>LAKE_OUTLINES.some(ring=>insidePolygon(x,z,ring))
  &&!LAKE_ISLANDS.some(ring=>insidePolygon(x,z,ring));
export function frameAt(THREE,curve,u){const point=curve.getPointAt(wrap(u));
 const forward=curve.getTangentAt(wrap(u)).normalize();
 const across=new THREE.Vector3(forward.z,0,-forward.x).normalize();
 const normal=new THREE.Vector3().crossVectors(forward,across).normalize();
 return{point,forward,across,normal,u:wrap(u)};}
export function makeGroundSampler(curve,count=1320){
 const samples=Array.from({length:count},(_,i)=>curve.getPointAt(i/count));
 const nearest=(x,z)=>{let best=samples[0],distanceSquared=Infinity;for(const point of samples){
  const d=(point.x-x)**2+(point.z-z)**2;if(d<distanceSquared){distanceSquared=d;best=point;}}
  return {point:best,distance:Math.sqrt(distanceSquared)};};
 return {samples,nearest,heightAt(x,z){const {point,distance}=nearest(x,z);
  return (point.y-.24)*(1-smooth((distance-45)/650))+1.65*smooth((distance-45)/650);}};
}
export function ribbon(THREE,parent,name,curve,start,end,from,to,material,{height=.01,step=3,closed=false,clipWater=false}={}){
 const length=curve.getLength();const count=Math.max(1,Math.ceil(Math.abs(end-start)*length/step));
 const positions=[],uvs=[],indices=[];
 for(let i=0;i<=count;i++){
  const u=start+(end-start)*i/count;const f=frameAt(THREE,curve,u);
  for(const offset of [typeof from==='function'?from(wrap(u)):from,typeof to==='function'?to(wrap(u)):to]){
   positions.push(f.point.x+f.across.x*offset,f.point.y+(typeof height==='function'?height(f,offset):height),f.point.z+f.across.z*offset);
   uvs.push(offset/12,(u-start)*length/12);
  }
  if(i<count){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
 }
 if(clipWater){for(let i=indices.length-3;i>=0;i-=3){const ids=indices.slice(i,i+3),points=ids.map(id=>[positions[id*3],positions[id*3+2]]);
  const centre=[points.reduce((s,p)=>s+p[0]/3,0),points.reduce((s,p)=>s+p[1]/3,0)];
  if(points.some(p=>isWater(...p))||isWater(...centre))indices.splice(i,3);
 }}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function instanceBatch(THREE,parent,name,geometry,material,poses){
 const mesh=new THREE.InstancedMesh(geometry,material,poses.length);mesh.name=name;
 const helper=new THREE.Object3D();
 for(let i=0;i<poses.length;i++){const p=poses[i];helper.position.set(...p.position);
  helper.rotation.set(...(p.rotation||[0,0,0]));helper.scale.set(...(p.scale||[1,1,1]));helper.updateMatrix();mesh.setMatrixAt(i,helper.matrix);
  if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));}
 mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function box(THREE,parent,name,size,position,material,rotation=0){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.name=name;mesh.position.set(...position);mesh.rotation.y=rotation;
 mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function signTexture(THREE,text,{background='#173c36',foreground='#fff3d5',width=1024,height=128}={}){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
 ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.fillStyle=foreground;ctx.font='italic 800 70px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
