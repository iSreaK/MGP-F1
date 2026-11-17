import { roadHalfWidthAt, createWallOffsetSampler } from './road-layout.js';

/** Miami's temporary concrete street walls, debris fencing and braking boards.
 * Wall setbacks are reconstructed around the FIA plan's escape areas. Solid
 * barriers are audited against every other road loop and the pit-lane mesh.
 */
export function addMiamiTrackside(THREE,scene,curve,frames,landmarks,options={}) {
  const group=new THREE.Group();group.name='Miami concrete walls and debris fencing';scene.add(group);
  const length=curve.getLength(),gridU=options.gridU??158/5412;
  const offsetAt=createWallOffsetSampler(curve,landmarks);
  const wrap=u=>((u%1)+1)%1;
  const up=new THREE.Vector3(0,1,0),helper=new THREE.Object3D();
  const frameAt=u=>{
    u=wrap(u);const point=curve.getPointAt(u),forward=curve.getTangentAt(u).setY(0).normalize();
    return{u,point,forward,across:new THREE.Vector3(forward.z,0,-forward.x),quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(forward.z,0,-forward.x),up,forward))};
  };
  const signed=u=>{let d=wrap(u-gridU+.5)-.5;return d*length;};
  const fractions=options.sourceFractions??[];
  const entry=signed(fractions[landmarks.pitStraight.entryIndex]);
  const exit=signed(fractions[landmarks.pitStraight.exitIndex]);
  const pitOpening=(u,side)=>side===-1&&signed(u)>entry-5&&signed(u)<exit+5;
  const at=(f,lateral,rise=0)=>f.point.clone().addScaledVector(f.across,lateral).addScaledVector(up,rise);

  const size=24,cells=new Map();
  function add(point,radius){const key=Math.floor(point.x/size)+','+Math.floor(point.z/size);if(!cells.has(key))cells.set(key,[]);cells.get(key).push({point,radius});}
  for(let i=0;i<frames.length;i+=2)add(frames[i].point,roadHalfWidthAt(i/frames.length)+.65);
  const pit=scene.getObjectByName('Miami pit entry, fast lane, working lane and exit');
  const pv=pit?.geometry?.getAttribute('position');
  if(pv)for(let i=0;i<pv.count;i+=4){
    const a=new THREE.Vector3().fromBufferAttribute(pv,i),b=new THREE.Vector3().fromBufferAttribute(pv,i+1);
    add(a.clone().add(b).multiplyScalar(.5),a.distanceTo(b)/2+.65);
  }
  function clear(x,z){
    let d=Infinity;const cx=Math.floor(x/size),cz=Math.floor(z/size);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(const item of cells.get((cx+dx)+','+(cz+dz))??[])
      d=Math.min(d,Math.hypot(x-item.point.x,z-item.point.z)-item.radius);
    return d;
  }
  function allowed(a,b){return clear(a.x,a.z)>.5&&clear(b.x,b.z)>.5&&clear((a.x+b.x)/2,(a.z+b.z)/2)>.5;}

  const wallFrames=[],fenceFrames=[],wires=[];
  const count=Math.ceil(length/2.85);
  for(let i=0;i<count;i++)for(const side of [-1,1]){
    const f=frameAt((i+.5)/count);if(pitOpening(f.u,side))continue;
    const centre=at(f,side*offsetAt(f.u,side));
    const a=centre.clone().addScaledVector(f.forward,-1.48),b=centre.clone().addScaledVector(f.forward,1.48);
    if(!allowed(a,b))continue;
    wallFrames.push({point:centre,quaternion:f.quaternion,u:f.u,side});
  }
  const walls=new THREE.InstancedMesh(new THREE.BoxGeometry(.52,1.24,2.87),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:.83,metalness:.025}),wallFrames.length);
  walls.name='Miami continuous concrete safety barriers';
  const colours=[new THREE.Color(0xd5d5cd),new THREE.Color(0xf0ede3),new THREE.Color(0x267683)];
  wallFrames.forEach((f,i)=>{
    helper.position.copy(f.point);helper.position.y+=.50;helper.quaternion.copy(f.quaternion);helper.scale.setScalar(1);helper.updateMatrix();walls.setMatrixAt(i,helper.matrix);
    walls.setColorAt(i,colours[Math.floor(f.u*length/80)%7===0?2:i%2]);
  });
  walls.castShadow=walls.receiveShadow=true;walls.instanceMatrix.needsUpdate=true;group.add(walls);

  const fenceCount=Math.ceil(length/6.8);
  for(let i=0;i<fenceCount;i++)for(const side of [-1,1]){
    const u=i/fenceCount,v=(i+1)/fenceCount;if(pitOpening(u,side)||pitOpening(v,side))continue;
    const f=frameAt(u),g=frameAt(v),a=at(f,side*(offsetAt(u,side)+.48)),b=at(g,side*(offsetAt(v,side)+.48));
    if(!allowed(a,b))continue;
    fenceFrames.push({point:a,quaternion:f.quaternion});
    for(const h of [1.2,1.8,2.4,3,3.6,4.15])wires.push(a.x,a.y+h,a.z,b.x,b.y+h,b.z);
    for(const [lo,hi] of [[1.25,2.1],[2.15,3.0],[3.05,3.95]]){
      wires.push(a.x,a.y+lo,a.z,b.x,b.y+hi,b.z,a.x,a.y+hi,a.z,b.x,b.y+lo,b.z);
    }
    const topA=a.clone().addScaledVector(f.across,-side*.5),topB=b.clone().addScaledVector(g.across,-side*.5);
    wires.push(a.x,a.y+4.15,a.z,topA.x,a.y+4.55,topA.z,topA.x,a.y+4.55,topA.z,topB.x,b.y+4.55,topB.z);
  }
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,4.45,.11),
    new THREE.MeshStandardMaterial({color:0x717d7f,metalness:.48,roughness:.58}),fenceFrames.length);
  posts.name='MIAMI catch-fence uprights';
  fenceFrames.forEach((f,i)=>{helper.position.copy(f.point);helper.position.y+=2.1;helper.quaternion.copy(f.quaternion);helper.updateMatrix();posts.setMatrixAt(i,helper.matrix);});group.add(posts);
  const wireGeometry=new THREE.BufferGeometry();wireGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));
  const wireMesh=new THREE.LineSegments(wireGeometry,new THREE.LineBasicMaterial({color:0x9daaaa,transparent:true,opacity:.48,depthWrite:false}));
  wireMesh.name='MIAMI catch-fence diagonal wire mesh';group.add(wireMesh);

  // Boards are behind their local wall and face approaching cars, rather
  // than sitting seventeen metres away from the narrow street corridor.
  let boardCount=0;
  for(const number of [1,11,14,17])for(const distance of [150,100,50]){
    const u=wrap((landmarks.turns['T'+number].distanceMeters-distance)/length),f=frameAt(u),side=1;
    const point=at(f,side*(offsetAt(u,side)+2.0));if(clear(point.x,point.z)<.8)continue;
    const board=new THREE.Group();board.name=distance+' m braking board before Miami turn '+number;board.position.copy(point);board.quaternion.copy(f.quaternion);
    const pole=new THREE.Mesh(new THREE.BoxGeometry(.1,3.2,.1),new THREE.MeshStandardMaterial({color:0x767e80}));pole.position.y=1.6;board.add(pole);
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=112;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#f4f3e7';ctx.fillRect(0,0,96,112);ctx.fillStyle='#123e49';ctx.font='900 43px Arial';ctx.textAlign='center';ctx.fillText(String(distance),48,70);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const face=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.85),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));face.position.y=3.1;face.rotation.y=Math.PI;board.add(face);group.add(board);boardCount++;
  }
  return{group,barrierCount:wallFrames.length,fencePostCount:fenceFrames.length,brakingBoardCount:boardCount,wallFrames,wallOffsetAt:offsetAt,bridge:null,updateLighting(){},setWetLighting(){}};
}
