import { LAKE_OUTLINES, LAKE_ISLANDS, GEO_ORIGIN, GEO_SCALE, MSAC_PARCEL } from './venue-data.js';
import { frameAt, isWater, seededRandom, instanceBatch, box, signTexture } from './scene-utils.js';

const WATER_Y=.12,GROUND_Y=1.65;
const makeShape=(THREE,ring)=>new THREE.Shape(ring.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,-z)));
const geographic=([lon,lat])=>[(lon-GEO_ORIGIN[0])*Math.PI/180*6371008.8*Math.cos(GEO_ORIGIN[1]*Math.PI/180)*GEO_SCALE,
 -(lat-GEO_ORIGIN[1])*Math.PI/180*6371008.8*GEO_SCALE];

function addLandscape(THREE,group,ground){
 const earth=new THREE.Shape([[-16000,-16000],[16000,-16000],[16000,16000],[-16000,16000]].map(p=>new THREE.Vector2(...p)));
 for(const ring of LAKE_OUTLINES)earth.holes.push(new THREE.Path(ring.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,-z))));
 const grass=new THREE.MeshStandardMaterial({color:0x667f4a,roughness:1,side:THREE.DoubleSide});
 let geometry=new THREE.ShapeGeometry(earth);geometry.rotateX(-Math.PI/2);
 // Subdivide the geographic land polygon, retaining its exact shoreline hole.
 // Extend the same flat park ground to the horizon; graded road-side earth
 // supplies the subtle local relief without changing the geographic lake.
 let triangles=geometry.toNonIndexed().getAttribute('position').array;
 for(let pass=0;pass<3;pass++){
  const next=[];
  for(let i=0;i<triangles.length;i+=9){
   const a=[triangles[i],triangles[i+2]],b=[triangles[i+3],triangles[i+5]],c=[triangles[i+6],triangles[i+8]];
   const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];
   for(const p of [a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca])next.push(p[0],0,p[1]);
  }triangles=next;
 }
 geometry.dispose();geometry=new THREE.BufferGeometry();
 // Road-side earth is generated densely by world.js. Keep the broad park
 // base below the lowest road rather than interpolating long triangles
 // across unrelated track sections, which can bury the start straight.
 for(let i=0;i<triangles.length;i+=3)triangles[i+1]=GROUND_Y;
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));geometry.computeVertexNormals();
 const terrain=new THREE.Mesh(geometry,grass);terrain.name='Albert Park continuous ground with lake cutout';terrain.receiveShadow=true;group.add(terrain);
 for(let i=0;i<LAKE_ISLANDS.length;i++){
  const geometry=new THREE.ShapeGeometry(makeShape(THREE,LAKE_ISLANDS[i]));geometry.rotateX(-Math.PI/2);
  const island=new THREE.Mesh(geometry,grass);island.name=i===0?'Gunn Island wooded ground':i===1?'Mud Island bird sanctuary':'Albert Lake small islet';island.position.y=GROUND_Y+.14;group.add(island);
 }
 const bankPositions=[],bankIndices=[];
 for(const ring of [...LAKE_OUTLINES,...LAKE_ISLANDS]){
  const island=LAKE_ISLANDS.includes(ring),offset=island?-4.5:5;
  const centre=ring.reduce((p,q)=>[p[0]+q[0]/ring.length,p[1]+q[1]/ring.length],[0,0]);
  for(let i=0;i<ring.length-1;i++){
   const k=bankPositions.length/3;
   for(const p of [ring[i],ring[i+1]]){
    const distance=Math.hypot(p[0]-centre[0],p[1]-centre[1]);
    bankPositions.push(p[0],WATER_Y+.025,p[1],p[0]+(p[0]-centre[0])/distance*offset,GROUND_Y+.01,p[1]+(p[1]-centre[1])/distance*offset);
   }
   bankIndices.push(k,k+2,k+1,k+1,k+2,k+3);
  }
 }
 const bankGeometry=new THREE.BufferGeometry();bankGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bankPositions,3));bankGeometry.setIndex(bankIndices);bankGeometry.computeVertexNormals();
 const banks=new THREE.Mesh(bankGeometry,new THREE.MeshStandardMaterial({color:0x8a9670,roughness:.99,side:THREE.DoubleSide}));banks.name='Albert Lake sloped planted shoreline';group.add(banks);
 const waterShape=makeShape(THREE,LAKE_OUTLINES[0]);
 for(const ring of LAKE_ISLANDS)waterShape.holes.push(new THREE.Path(ring.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,-z))));
 const waterGeometry=new THREE.ShapeGeometry(waterShape);waterGeometry.rotateX(-Math.PI/2);
 const waterMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`
   varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`precision highp float;uniform float time;varying vec3 p;
   void main(){float warp=sin(p.x*.043-p.z*.027-time*.12);
    float ripple=sin(p.x*.23+p.z*.13+warp*.9+time*.65);
    float drift=sin(p.x*.017+p.z*.024+warp*.3);
    vec3 water=vec3(.115,.295,.275)+vec3(.009,.016,.012)*drift;
    float glint=smoothstep(.985,1.,ripple)*.035;
    gl_FragColor=vec4(water+vec3(.36,.48,.42)*glint,1.);}`,
  side:THREE.DoubleSide});
 const water=new THREE.Mesh(waterGeometry,waterMaterial);water.name='Albert Lake water with three island cutouts';water.position.y=WATER_Y;water.receiveShadow=false;group.add(water);
 return{water,waterMaterial};
}

function addGrandstand(THREE,group,curve,u,side,length,seatColor,caption){
 const frame=frameAt(THREE,curve,u);const stand=new THREE.Group();stand.name=caption;
 stand.position.copy(frame.point).addScaledVector(frame.across,side*42);
 stand.position.y-=.2;stand.rotation.y=Math.atan2(frame.forward.x,frame.forward.z)+(side<0?Math.PI:0);
 const steel=new THREE.MeshStandardMaterial({color:0x8f9999,roughness:.7,metalness:.35});
 const seating=new THREE.MeshStandardMaterial({color:seatColor,roughness:.8});
 const steps=[],seats=[],posts=[],braces=[],foundations=[];
 const groundLocal=GROUND_Y-stand.position.y;
 for(let row=0;row<11;row++){
  const x=9+row*1.12,y=.4+row*.65;
  steps.push({position:[x,y,0]});seats.push({position:[x-.35,y+.48,0]});
 }
 instanceBatch(THREE,stand,caption+' stepped terraces',new THREE.BoxGeometry(1.2,.45,length),steel,steps);
 instanceBatch(THREE,stand,caption+' seat rows',new THREE.BoxGeometry(.62,.25,length-.8),seating,seats);
 for(let z=-length/2+4;z<length/2;z+=10){
  const rearHeight=10-groundLocal;
  posts.push({position:[20,groundLocal+rearHeight/2,z],scale:[1,rearHeight/10,1]});
  braces.push({position:[15,3.8,z],rotation:[0,0,-.54]});
  const height=.18-groundLocal;
  for(const x of [9,14])foundations.push({position:[x,groundLocal+height/2,z],scale:[.36,height,.36]});
 }
 instanceBatch(THREE,stand,caption+' rear load-bearing columns',new THREE.BoxGeometry(.28,10,.28),steel,posts);
 instanceBatch(THREE,stand,caption+' diagonal supports',new THREE.BoxGeometry(.24,8.2,.24),steel,braces);
 instanceBatch(THREE,stand,caption+' grounded front foundations',new THREE.BoxGeometry(1,1,1),steel,foundations);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(17,.32,length+3),new THREE.MeshStandardMaterial({color:0xdadfd6,metalness:.24,roughness:.7}));
 roof.name=caption+' supported canopy';roof.position.set(15,10.2,0);roof.rotation.z=-.07;stand.add(roof);
 const banner=new THREE.Mesh(new THREE.PlaneGeometry(length*.75,1.3),new THREE.MeshBasicMaterial({map:signTexture(THREE,caption.toUpperCase()),side:THREE.DoubleSide}));
 banner.position.set(6.42,7.6,0);banner.rotation.y=-Math.PI/2;stand.add(banner);group.add(stand);return stand;
}

function addBridge(THREE,group,curve,u,caption,width=4.5){
 const f=frameAt(THREE,curve,u),bridge=new THREE.Group();bridge.name=caption;
 bridge.position.copy(f.point);bridge.rotation.y=Math.atan2(f.forward.x,f.forward.z);
 const steel=new THREE.MeshStandardMaterial({color:0xd0d5cf,metalness:.45,roughness:.58});
 const deck=new THREE.Mesh(new THREE.BoxGeometry(43,.6,width),steel);deck.name='Bridge deck above 7.4 m clearance';deck.position.y=8.0;bridge.add(deck);
 const groundLocal=GROUND_Y-f.point.y;
 const treads=[],stairPosts=[];
 const link=(name,a,b,thickness)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(thickness,start.distanceTo(end),thickness),steel);
  mesh.name=name;mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());bridge.add(mesh);
 };
 for(const side of [-1,1]){
  const pierHeight=7.7-groundLocal;
  box(THREE,bridge,'Bridge pier',[1.2,pierHeight,width-1],[side*20,groundLocal+pierHeight/2,0],steel);
  box(THREE,bridge,'Bridge parapet',[43,1.8,.14],[0,9.15,side*(width/2-.08)],steel);
  const count=Math.ceil((8.3-groundLocal)/.20),rise=(8.3-groundLocal)/count;
  for(let i=0;i<count;i++){
   const x=side*(21.5+(i+.5)*.32),y=8.3-(i+1)*rise;
   treads.push({position:[x,y-.08,0]});
   if(i%4===0)for(const z of [-width/2+.25,width/2-.25])stairPosts.push({position:[x,y+.5,z]});
  }
  for(const z of [-width/2+.25,width/2-.25]){
   link('Bridge grounded stair stringer',[side*21.5,8.08,z],[side*(21.5+count*.32),groundLocal+.08,z],.24);
   link('Bridge stair handrail',[side*21.5,9.3,z],[side*(21.5+count*.32),groundLocal+1,z],.10);
  }
 }
 instanceBatch(THREE,bridge,'Bridge stair treads down to park level',new THREE.BoxGeometry(.34,.16,width-.45),steel,treads);
 instanceBatch(THREE,bridge,'Bridge stair handrail uprights',new THREE.BoxGeometry(.07,1,.07),steel,stairPosts);
 const braces=[];
 for(let x=-20;x<=20;x+=4){for(const z of [-width/2,width/2])braces.push({position:[x,9.1,z],rotation:[0,0,Math.PI/4]});}
 instanceBatch(THREE,bridge,'Bridge truss braces',new THREE.BoxGeometry(.15,2.3,.15),steel,braces);
 group.add(bridge);return bridge;
}

function addMsac(THREE,group){
 const xmin=Math.min(...MSAC_PARCEL.map(p=>p[0])),xmax=Math.max(...MSAC_PARCEL.map(p=>p[0]));
 const zmin=Math.min(...MSAC_PARCEL.map(p=>p[1])),zmax=Math.max(...MSAC_PARCEL.map(p=>p[1]));
 const x=(xmin+xmax)/2,z=(zmin+zmax)/2;
 const msac=new THREE.Group();msac.name='Melbourne Sports and Aquatic Centre';msac.position.set(x,GROUND_Y,z);msac.rotation.y=-.25;
 const wall=new THREE.MeshStandardMaterial({color:0xcac8b8,roughness:.78});
 const glass=new THREE.MeshStandardMaterial({color:0x477c86,roughness:.25,metalness:.35});
 const roof=new THREE.MeshStandardMaterial({color:0xa6b8b7,roughness:.5,metalness:.4});
 box(THREE,msac,'MSAC aquatic hall',[92,14,120],[0,7,0],wall);
 box(THREE,msac,'MSAC glazing belt',[.25,9,118],[46.2,8,0],glass);
 for(let i=0;i<3;i++){
  const vertices=[],indices=[];
  for(let j=0;j<=24;j++){const angle=j/24*Math.PI;
   for(const end of [-1,1])vertices.push(Math.cos(angle)*16,Math.sin(angle)*9,end*62.5);
   if(j<24){const k=j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const barrel=new THREE.Mesh(geometry,roof);barrel.material.side=THREE.DoubleSide;
  barrel.name='MSAC curved aquatic roof';
  barrel.position.set(-29+i*29,14,0);msac.add(barrel);
 }
 box(THREE,msac,'MSAC indoor sports pavilion',[75,10,62],[-16,5,96],wall);
 box(THREE,msac,'MSAC outdoor pool deck',[64,.2,39],[77,.1,-23],wall);
 box(THREE,msac,'MSAC external competition pool basin',[50,.10,25],[77,.26,-23],new THREE.MeshStandardMaterial({color:0x61bec9,roughness:.26,metalness:.2}));
 const ropes=[];for(let i=1;i<10;i++)ropes.push({position:[77,.33,-35.5+i*2.5]});
 instanceBatch(THREE,msac,'MSAC outdoor competition pool lane ropes',new THREE.BoxGeometry(49,.045,.045),
  new THREE.MeshStandardMaterial({color:0xf0d7a2,roughness:.65}),ropes);
 group.add(msac);return msac;
}

function addStadium(THREE,group){
 const [x,z]=geographic([144.9656,-37.8405]);const stadium=new THREE.Group();stadium.name='Lakeside Stadium athletics oval';stadium.position.set(x,GROUND_Y+.1,z);stadium.rotation.y=.25;
 const lane=new THREE.Mesh(new THREE.RingGeometry(42,57,72),new THREE.MeshStandardMaterial({color:0xa85344,roughness:1,side:THREE.DoubleSide}));
 lane.rotation.x=-Math.PI/2;lane.scale.y=1.48;stadium.add(lane);
 const infield=new THREE.Mesh(new THREE.CircleGeometry(42,64),new THREE.MeshStandardMaterial({color:0x7b9b4d,roughness:1,side:THREE.DoubleSide}));
 infield.rotation.x=-Math.PI/2;infield.scale.y=1.48;infield.position.y=.01;stadium.add(infield);
 const white=new THREE.LineBasicMaterial({color:0xd4c5b6});
 for(let r=44;r<57;r+=2){const pts=Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return new THREE.Vector3(Math.cos(a)*r,.035,Math.sin(a)*r*1.48)});
  stadium.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),white));}
 box(THREE,stadium,'Lakeside Stadium covered west stand',[15,9,110],[-70,4.5,0],new THREE.MeshStandardMaterial({color:0xb7bfbc,roughness:.8}));group.add(stadium);return stadium;
}

function addGolf(THREE,group,ground){
 const golf=new THREE.Group();golf.name='Albert Park golf fairways and 2026 elevated Clubhouse';
 const fairway=new THREE.MeshStandardMaterial({color:0x749747,roughness:1,side:THREE.DoubleSide});
 const bunker=new THREE.MeshStandardMaterial({color:0xd8cf9e,roughness:1,side:THREE.DoubleSide});
 const locations=[[144.9741,-37.8426],[144.9762,-37.8450],[144.9753,-37.8398],[144.9787,-37.8470]];
 for(let i=0;i<locations.length;i++){
  const [x,z]=geographic(locations[i]);
  const green=new THREE.Mesh(new THREE.CircleGeometry(55,36),fairway);green.name='Golf green '+i;green.rotation.x=-Math.PI/2;green.scale.set(.65,1.7,1);green.position.set(x,GROUND_Y+.035,z);golf.add(green);
  const sand=new THREE.Mesh(new THREE.CircleGeometry(16,28),bunker);sand.rotation.x=-Math.PI/2;sand.scale.x=1.55;sand.position.set(x+48,GROUND_Y+.045,z+23);golf.add(sand);
 }
 const [x,z]=geographic([144.9729,-37.8416]);
 const club=new THREE.Group();club.name='2026 Clubhouse elevated hospitality opposite T8';club.position.set(x,GROUND_Y,z);
 const pale=new THREE.MeshStandardMaterial({color:0xe0dfd1,roughness:.7});
 const glass=new THREE.MeshStandardMaterial({color:0x3b6768,metalness:.3,roughness:.26});
 box(THREE,club,'Elevated clubhouse floor',[44,.7,20],[0,4.5,0],pale);
 box(THREE,club,'Clubhouse glazed pavilion',[38,5,15],[0,7.3,0],glass);
 box(THREE,club,'Clubhouse pale overhanging roof',[47,.4,23],[0,10.1,0],pale);
 for(const dx of [-18,0,18])for(const dz of [-7,7])box(THREE,club,'Clubhouse supporting column',[.45,4.5,.45],[dx,2.25,dz],pale);
 golf.add(club);group.add(golf);return golf;
}

function addVegetation(THREE,group,curve,ground,roadside,exclusions){
 const random=seededRandom(19962026),trunks=[],canopies=[],palmTrunks=[],palmLeaves=[];
 const reserved=exclusions.map(object=>{object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object).expandByScalar(5);});
 const placeTree=(x,z,scale,palm=false)=>{
  const nearest=ground.nearest(x,z);if(nearest.distance<27||isWater(x,z))return false;
  if(reserved.some(bounds=>x>bounds.min.x&&x<bounds.max.x&&z>bounds.min.z&&z<bounds.max.z))return false;
  const frame=frameAt(THREE,curve,nearest.u);
  const side=Math.sign((x-nearest.point.x)*frame.across.x+(z-nearest.point.z)*frame.across.z)||1;
  if(nearest.distance<roadside.wallOffsetAt(nearest.u,side)+7)return false;
  // Keep buildings, pit forecourt and primary grandstands free of trees.
  if(nearest.distance<85&&(x<0&&z>0))return false;
  const y=roadside.heightAtOffset(nearest.u,side,nearest.distance);
  if(palm){palmTrunks.push({position:[x,y+5.3*scale,z],scale:[scale,scale,scale]});
   for(let leaf=0;leaf<7;leaf++)palmLeaves.push({position:[x,y+10.7*scale,z],rotation:[0,leaf/7*Math.PI*2,.52],scale:[scale,scale,scale]});
  }else{trunks.push({position:[x,y+2.7*scale,z],scale:[scale,scale,scale]});
   canopies.push({position:[x,y+7.0*scale,z],scale:[scale*.95,scale*1.2,scale],color:random()<.45?0x466b3b:0x52794a});}
  return true;
 };
 for(let i=0;i<1900;i++){if(trunks.length>=520)break;const x=(random()-.5)*2700,z=(random()-.5)*3100;placeTree(x,z,.65+random()*1.1);}
 // A few thick island clusters are visible from the entire-circuit camera.
 for(const ring of LAKE_ISLANDS){const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cz=ring.reduce((s,p)=>s+p[1],0)/ring.length;
  for(let i=0;i<30;i++)placeTree(cx+(random()-.5)*38,cz+(random()-.5)*55,.9+random()*.6);}
 for(let i=0;i<90;i++){const angle=i/90*Math.PI*2;placeTree(Math.cos(angle)*1080,Math.sin(angle)*1080,.9+random()*.3,true);}
 instanceBatch(THREE,group,'Albert Park eucalyptus trunks',new THREE.CylinderGeometry(.42,.65,5.4,6),new THREE.MeshStandardMaterial({color:0x797a63,roughness:1}),trunks);
 instanceBatch(THREE,group,'Albert Park eucalyptus crowns',new THREE.IcosahedronGeometry(4.4,1),new THREE.MeshStandardMaterial({color:0x537449,roughness:1}),canopies);
 instanceBatch(THREE,group,'Albert Park palm trunks',new THREE.CylinderGeometry(.34,.5,10.6,7),new THREE.MeshStandardMaterial({color:0x806e48,roughness:1}),palmTrunks);
 instanceBatch(THREE,group,'Albert Park palm fronds',new THREE.SphereGeometry(1,7,4),new THREE.MeshStandardMaterial({color:0x3b673a,roughness:1}),palmLeaves.map(p=>({...p,scale:[p.scale[0]*5.8,p.scale[1]*.28,p.scale[2]*.65]})));
 return{treeCount:trunks.length,palmCount:palmTrunks.length};
}

function addWaterfront(THREE,group){
 const deckMaterial=new THREE.MeshStandardMaterial({color:0xb1a684,roughness:.9});
 const boatMaterial=new THREE.MeshStandardMaterial({color:0xe9e7d9,roughness:.55});
 const piers=new THREE.Group();piers.name='Albert Lake rowing club pontoons and dinghies';
 for(const [i,coordinate] of [[0,[144.9692,-37.8430]],[1,[144.9702,-37.8487]]]){
  const [x,z]=geographic(coordinate);box(THREE,piers,'Timber rowing pontoon '+i,[26,.38,4],[x,.55,z],deckMaterial,.48);
  const supports=[];for(let k=0;k<7;k++)supports.push({position:[x-11+k*3.5,.25,z]});
  instanceBatch(THREE,piers,'Pontoon supporting piles '+i,new THREE.CylinderGeometry(.14,.14,2,5),deckMaterial,supports);
 }
 const boats=[];const random=seededRandom(202603);
 for(let i=0;i<24;i++){
  const x=(random()-.5)*760,z=(random()-.5)*970;
  if(!isWater(x,z))continue;boats.push({position:[x,WATER_Y+.24,z],rotation:[0,random()*Math.PI,0],scale:[.8,.4,3.8]});
 }
 instanceBatch(THREE,piers,'Rowing shells and sailing dinghies',new THREE.SphereGeometry(1,10,6),boatMaterial,boats);
 group.add(piers);return piers;
}

function addSkyline(THREE,group){
 const skyline=new THREE.Group();skyline.name='Melbourne CBD skyline north of Albert Park';
 const dark=new THREE.MeshStandardMaterial({color:0x637a83,roughness:.47,metalness:.32});
 const silver=new THREE.MeshStandardMaterial({color:0x82949a,roughness:.4,metalness:.4});
 const random=seededRandom(3000);
 const towers=[];for(let i=0;i<44;i++){const h=40+random()*120;
  towers.push({position:[-900+random()*1900,GROUND_Y+h/2,-2000-random()*1000],scale:[24+random()*30,h,23+random()*30]});}
 instanceBatch(THREE,skyline,'Distant Melbourne city towers',new THREE.BoxGeometry(1,1,1),dark,towers);
 const eureka=box(THREE,skyline,'Eureka Tower silhouette',[43,285,38],[160,GROUND_Y+142.5,-2400],dark);
 box(THREE,skyline,'Eureka golden crown',[44,22,39],[160,GROUND_Y+279,-2400],new THREE.MeshStandardMaterial({color:0xbbaa62,roughness:.45,metalness:.45}));
 box(THREE,skyline,'Australia 108 silhouette',[55,310,48],[65,GROUND_Y+155,-2520],silver);
 box(THREE,skyline,'Australia 108 starburst',[72,15,64],[65,GROUND_Y+210,-2520],new THREE.MeshStandardMaterial({color:0xb7ac75,roughness:.55,metalness:.35}));
 const spire=new THREE.Mesh(new THREE.ConeGeometry(16,53,4),silver);spire.name='Arts Centre Melbourne spire';spire.position.set(280,GROUND_Y+100,-2300);skyline.add(spire);
 group.add(skyline);return skyline;
}

export function addAlbertParkEnvironment(THREE,scene,curve,ground,grid,roadside){
 const group=new THREE.Group();group.name='Albert Park geographic venue';scene.add(group);
 const landscape=addLandscape(THREE,group,ground);
 const stands=[
  addGrandstand(THREE,group,curve,.987,1,150,0x31554b,'Fangio main grandstand'),
  addGrandstand(THREE,group,curve,.055,1,100,0xc9bb8c,'Brabham Turn 1 grandstand'),
  addGrandstand(THREE,group,curve,.195,1,80,0x446b65,'Turn 3 grandstand'),
  addGrandstand(THREE,group,curve,.785,1,105,0x376959,'Lakeside Turn 11 grandstand'),
  addGrandstand(THREE,group,curve,.88,-1,66,0xb1a976,'Turn 13 grandstand'),
 ];
 const bridges=[
  // Approximate the entrance bridge on the T1 approach, beyond the garages;
  // placing it alongside the pit building put a support in the fast lane.
  addBridge(THREE,group,curve,.05,'Gate 1 wide pedestrian bridge 2026',9),
  addBridge(THREE,group,curve,.244,'Northern Albert Park pedestrian bridge'),
  addBridge(THREE,group,curve,.62,'Lakeside Drive pedestrian bridge'),
 ];
 const msac=addMsac(THREE,group),stadium=addStadium(THREE,group),golf=addGolf(THREE,group,ground);
 const waterfront=addWaterfront(THREE,group),skyline=addSkyline(THREE,group);
 // Three-level administration / race-control building beside the pit exit.
 const f=frameAt(THREE,curve,200/5278),raceControl=new THREE.Group();raceControl.name='Albert Park three-level race control';
 raceControl.position.copy(f.point).addScaledVector(f.across,-35);raceControl.rotation.y=Math.atan2(f.forward.x,f.forward.z);
 const concrete=new THREE.MeshStandardMaterial({color:0xd3d7cf,roughness:.75});
 const glass=new THREE.MeshStandardMaterial({color:0x426d76,metalness:.4,roughness:.24});
 box(THREE,raceControl,'Administration three storeys',[16,11,22],[0,5.5,0],concrete);
 box(THREE,raceControl,'Race control grounded foundation',[16,1.5,22],[0,-.73,0],concrete);
 for(const y of [2.8,6.1,9.4])box(THREE,raceControl,'Race control observation windows',[.2,2.1,20],[8.15,y,0],glass);
 group.add(raceControl);
 const vegetation=addVegetation(THREE,group,curve,ground,roadside,
  [...stands,...bridges,msac,stadium,...golf.children,grid.group,raceControl]);
 return{group,water:landscape.water,grandstandCount:stands.length,bridgeCount:bridges.length,...vegetation,
  landmarks:{stands,bridges,msac,stadium,golf,waterfront,skyline,raceControl},
  update(time){landscape.waterMaterial.uniforms.time.value=time;}};
}
