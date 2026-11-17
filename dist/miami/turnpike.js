import { TURNPIKE_ROADS } from './highway-data.js';

export function addMiamiTurnpike(THREE,parent,curve) {
  const group=new THREE.Group();group.name='Florida Turnpike elevated highway';parent.add(group);
  group.userData.attribution='© OpenStreetMap contributors — ODbL 1.0';
  const asphalt=new THREE.MeshStandardMaterial({color:0x41484a,roughness:.92,side:THREE.DoubleSide});
  const concrete=new THREE.MeshStandardMaterial({color:0xb6b9b3,roughness:.85});
  const white=new THREE.LineBasicMaterial({color:0xe6e7dc});
  const samples=Array.from({length:1200},(_,i)=>curve.getPointAt(i/1200));
  const near=p=>{let best=Infinity,height=0;for(const q of samples){const d=(p.x-q.x)**2+(p.z-q.z)**2;if(d<best){best=d;height=q.y;}}return{distance:Math.sqrt(best),height};};
  const triangles=[],indices=[],lines=[],parapets=[],piers=[],slabs=[],bridges=[];
  const up=new THREE.Vector3(0,1,0),matrix=new THREE.Matrix4();
  let segments=0;
  for(const road of TURNPIKE_ROADS) {
    for(let i=1;i<road.points.length;i++) {
      const a=new THREE.Vector3(...road.points[i-1]),b=new THREE.Vector3(...road.points[i]);
      const middle=a.clone().add(b).multiplyScalar(.5),closest=near(middle);
      if(middle.x<100||middle.x>1550||middle.z< -900||middle.z>600)continue;
      // Some existing access roads form the race course during the GP. Do
      // not draw a second ground road across it or through a driving lane.
      if(closest.distance<road.width/2+12&&Math.min(a.y,b.y)<closest.height+9)continue;
      const f=b.clone().sub(a),horizontal=f.clone().setY(0).normalize(),across=new THREE.Vector3(horizontal.z,0,-horizontal.x);
      const base=triangles.length/3,w=road.width/2;
      slabs.push({a,b,width:road.width});
      for(const [p,side] of [[a,-1],[a,1],[b,-1],[b,1]])triangles.push(p.x+across.x*w*side,p.y,p.z+across.z*w*side);
      indices.push(base,base+2,base+1,base+1,base+2,base+3);
      for(const side of [-1,1]) {
        lines.push(a.x+across.x*(w-.8)*side,a.y+.04,a.z+across.z*(w-.8)*side,b.x+across.x*(w-.8)*side,b.y+.04,b.z+across.z*(w-.8)*side);
        if(Math.min(a.y,b.y)>2)parapets.push({a:a.clone().addScaledVector(across,side*w),b:b.clone().addScaledVector(across,side*w)});
      }
      if(i%3===0)lines.push(a.x,a.y+.04,a.z,b.x,b.y+.04,b.z);
      if(Math.min(a.y,b.y)>10&&i%8===0&&closest.distance>road.width/2+17)piers.push({point:middle,height:middle.y-.7});
      segments++;
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const deck=new THREE.Mesh(geometry,asphalt);deck.name='Turnpike connected geographic highway and ramps';deck.receiveShadow=true;group.add(deck);bridges.push(deck);
  const slabMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.75,1),concrete,slabs.length);slabMesh.name='Turnpike concrete deck soffits';
  slabs.forEach((slab,i)=>{const delta=slab.b.clone().sub(slab.a),f=delta.clone().normalize(),side=new THREE.Vector3(f.z,0,-f.x).normalize(),normal=new THREE.Vector3().crossVectors(f,side).normalize();matrix.makeBasis(side,normal,f);matrix.scale(new THREE.Vector3(slab.width,1,delta.length()+.04));matrix.setPosition(slab.a.clone().add(slab.b).multiplyScalar(.5).addScaledVector(up,-.43));slabMesh.setMatrixAt(i,matrix);});slabMesh.castShadow=slabMesh.receiveShadow=true;group.add(slabMesh);
  const strip=new THREE.BufferGeometry();strip.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));const markings=new THREE.LineSegments(strip,white);markings.name='Turnpike shoulder and dashed lane markings';group.add(markings);
  const railMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.4,1.15,1),concrete,parapets.length);
  railMesh.name='Turnpike connected highway parapets';
  parapets.forEach((rail,i)=>{const delta=rail.b.clone().sub(rail.a),f=delta.clone().normalize(),side=new THREE.Vector3(f.z,0,-f.x).normalize(),normal=new THREE.Vector3().crossVectors(f,side).normalize();matrix.makeBasis(side,normal,f);matrix.scale(new THREE.Vector3(1,1,delta.length()+.06));matrix.setPosition(rail.a.clone().add(rail.b).multiplyScalar(.5).addScaledVector(up,.6));railMesh.setMatrixAt(i,matrix);});group.add(railMesh);
  const columns=new THREE.InstancedMesh(new THREE.BoxGeometry(2,1,5),concrete,piers.length);columns.name='Turnpike geographic flyover piers';
  piers.forEach((pier,i)=>{matrix.makeScale(1,pier.height+.6,1);matrix.setPosition(pier.point.x,(pier.height-.6)/2,pier.point.z);columns.setMatrixAt(i,matrix);});group.add(columns);
  return{group,bridges,wayCount:TURNPIKE_ROADS.length,segmentCount:segments,pierCount:piers.length};
}
