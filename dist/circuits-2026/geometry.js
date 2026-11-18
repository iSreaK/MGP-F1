export const wrap=u=>((u%1)+1)%1;
export const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const delta=(a,b,length)=>((a-b+length*1.5)%length)-length*.5;

export function createCircuitGeometry(THREE,points,config){
 const source=points.slice(0,-1).map(p=>new THREE.Vector3(...p));
 const curve=new THREE.CatmullRomCurve3(source,true,'centripetal');curve.arcLengthDivisions=16000;curve.updateArcLengths();
 const length=config.length,count=Math.ceil(length/3),samples=Array.from({length:count},(_,i)=>curve.getPointAt(i/count));
 const bankAt=u=>(config.banking||[]).reduce((value,bank)=>{
  const d=Math.abs(delta(wrap(u)*length,config.turns[bank.turn].station,length));
  return value+bank.degrees*Math.PI/180*(1-smooth((d-bank.span*.32)/(bank.span*.68)));
 },0);
 const frameAt=u=>{u=wrap(u);const point=curve.getPointAt(u),forward=curve.getTangentAt(u).normalize();
  const across=new THREE.Vector3(forward.z,0,-forward.x).normalize();across.y=Math.tan(bankAt(u));across.normalize();
  const normal=new THREE.Vector3().crossVectors(forward,across).normalize();
  return {point,forward,across,normal,u};};
 const at=(s,lateral=0,lift=0)=>{const f=frameAt(s/length);return f.point.addScaledVector(f.across,lateral).addScaledVector(f.normal,lift);};
 const curvature=Array.from({length:count},(_,i)=>{
  const a=curve.getPointAt(wrap((i/count)-6/length)),b=samples[i],c=curve.getPointAt(wrap(i/count+6/length));
  const cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
  const radius=Math.abs(cross)>1e-7?a.distanceTo(b)*b.distanceTo(c)*a.distanceTo(c)/(2*Math.abs(cross)):1e6;
  return {radius,sign:Math.sign(cross)};
 });
 const curvatureAt=u=>curvature[Math.round(wrap(u)*count)%count];
 const halfWidthAt=u=>Math.min(config.width/2,Math.max(3,curvatureAt(u).radius*.68));
 const cellSize=32,cells=new Map(),key=(x,z)=>x+','+z;
 for(let i=0;i<count;i++){const a=samples[i],b=samples[(i+1)%count];
  for(let x=Math.floor(Math.min(a.x,b.x)/cellSize);x<=Math.floor(Math.max(a.x,b.x)/cellSize);x++)
   for(let z=Math.floor(Math.min(a.z,b.z)/cellSize);z<=Math.floor(Math.max(a.z,b.z)/cellSize);z++){
    const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);
   }
 }
 const nearest=(x,z)=>{
  let best=Infinity,index=0,fraction=0;const cx=Math.floor(x/cellSize),cz=Math.floor(z/cellSize),seen=new Set();
  const inspect=i=>{if(seen.has(i))return;seen.add(i);const a=samples[i],b=samples[(i+1)%count],dx=b.x-a.x,dz=b.z-a.z;
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),d=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;
   if(d<best){best=d;index=i;fraction=t;}};
  for(let r=0;r<30;r++){
   for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
    if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;
    for(const i of cells.get(key(cx+dx,cz+dz))||[])inspect(i);
   }
   if(best<(Math.max(0,r-1)*cellSize)**2)break;
  }
  if(!Number.isFinite(best))for(let i=0;i<count;i++)inspect(i);
  const point=samples[index].clone().lerp(samples[(index+1)%count],fraction);
  return {distance:Math.sqrt(best),u:(index+fraction)/count,point,index};
 };
 const nearbyIndices=(x,z,radius)=>{
  const found=new Set();for(let gx=Math.floor((x-radius)/cellSize);gx<=Math.floor((x+radius)/cellSize);gx++)
   for(let gz=Math.floor((z-radius)/cellSize);gz<=Math.floor((z+radius)/cellSize);gz++)
    for(const i of cells.get(key(gx,gz))||[]){found.add(i);found.add((i+1)%count);}
  return found;
 };
 const groundHeightAt=(x,z,n=nearest(x,z))=>{
  const f=frameAt(n.u),side=Math.sign((x-n.point.x)*f.across.x+(z-n.point.z)*f.across.z)||1;
  const bankEdge=n.point.y+side*Math.min(n.distance,halfWidthAt(n.u))*Math.sin(bankAt(n.u));
  return bankEdge-.65+Math.min(9,Math.max(0,n.distance-35)*.025);
 };
 return {curve,length,count,samples,frameAt,at,nearest,nearbyIndices,curvatureAt,halfWidthAt,bankAt,groundHeightAt,
  roadDistance:(x,z)=>nearest(x,z).distance};
}

export function createRibbon(THREE,parent,name,geometry,start,end,from,to,material,{step=3,lift=0,exclude=null}={}){
 const {length,frameAt}=geometry,n=Math.max(1,Math.ceil((end-start)/step)),vertices=[],indices=[],uv=[];
 for(let i=0;i<=n;i++){
  const station=start+(end-start)*i/n,u=wrap(station/length),frame=frameAt(u);
  const edges=[typeof from==='function'?from(u):from,typeof to==='function'?to(u):to].sort((a,b)=>a-b);
  for(const offset of edges){const p=frame.point.clone().addScaledVector(frame.across,offset).addScaledVector(frame.normal,typeof lift==='function'?lift(u,offset):lift);
   vertices.push(p.x,p.y,p.z);uv.push(offset/8,station/12);}
  if(i){const k=(i-1)*2;for(const tri of [[k,k+2,k+1],[k+1,k+2,k+3]]){
   const [a,b,c]=tri.map(id=>new THREE.Vector3(...vertices.slice(id*3,id*3+3)));
   const normal=b.clone().sub(a).cross(c.clone().sub(a));
   if(normal.y<-.0001)continue;
   if(exclude&&[a,b,c,a.clone().add(b).add(c).multiplyScalar(1/3)].some(p=>exclude(p.x,p.z,u)))continue;
   indices.push(...tri);
  }}
 }
 const meshGeometry=new THREE.BufferGeometry();meshGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 meshGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));meshGeometry.setIndex(indices);meshGeometry.computeVertexNormals();
 const mesh=new THREE.Mesh(meshGeometry,material);mesh.name=name;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
