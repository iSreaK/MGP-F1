import { SCENERY_ANCHORS, SCENERY_LAYOUT_ROTATION_Y, TRACK_LENGTH_METERS } from './track-data.js';

import { addMiamiTurnpike } from './turnpike.js';
import { batchStaticPrimitives } from '../suzuka/static-batches.js';

const wrap=u=>((u%1)+1)%1;
const primitiveGeometry=new WeakMap();
function primitive(THREE,type){let geometries=primitiveGeometry.get(THREE);if(!geometries){geometries={box:new THREE.BoxGeometry(1,1,1),beam:new THREE.CylinderGeometry(1,1,1,5)};primitiveGeometry.set(THREE,geometries);}return geometries[type];}
function mat(THREE,color,extra={}) { return new THREE.MeshStandardMaterial({color,roughness:.75,...extra}); }
function box(THREE,parent,name,w,h,d,x,y,z,material) {
  const mesh=new THREE.Mesh(primitive(THREE,'box'),material);
  mesh.name=name;mesh.scale.set(w,h,d);mesh.userData.staticPrimitive='box';mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function roundRect(THREE,w,d,r) {
  const s=new THREE.Shape(),x=-w/2,z=-d/2;
  s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);
  s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);
  s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);
  s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;
}
function ring(THREE,parent,name,w,d,iw,id,r,y,thickness,material) {
  const shape=roundRect(THREE,w,d,r),inner=roundRect(THREE,iw,id,Math.max(2,r*.55));
  const hole=new THREE.Path(inner.getPoints(48).reverse());shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:8});g.rotateX(Math.PI/2);
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.position.y=y+thickness;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function beam(THREE,parent,name,a,b,r,material) {
  const delta=b.clone().sub(a);const mesh=new THREE.Mesh(primitive(THREE,'beam'),material);mesh.scale.set(r,delta.length(),r);mesh.userData.staticPrimitive='beam';
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.name=name;parent.add(mesh);return mesh;
}
function label(THREE,parent,text,x,y,z,w=75,h=10) {
  const c=document.createElement('canvas');c.width=1024;c.height=128;
  const ctx=c.getContext('2d');ctx.fillStyle='#0d343c';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f2e9d4';ctx.font='700 76px Arial';ctx.textAlign='center';ctx.fillText(text,512,92);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  mesh.name=text+' sign';mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}

export function addMiamiEnvironment(THREE,scene,curve,frames,landmarks,options={}) {
  const group=new THREE.Group();group.name='Miami Hard Rock Stadium marina palms and Turnpike';scene.add(group);
  const concrete=mat(THREE,0xc8c7be),white=mat(THREE,0xf3f0df),steel=mat(THREE,0x637878,{metalness:.5,roughness:.4});
  const aqua=mat(THREE,0x248f95),dark=mat(THREE,0x182c37),pink=mat(THREE,0xe45c9c),grass=mat(THREE,0x3e8555);
  const orange=mat(THREE,0xe87934);
  const samples=Array.from({length:1804},(_,i)=>curve.getPointAt(i/1804));
  const nearest=(x,z)=>Math.sqrt(Math.min(...samples.map(p=>(p.x-x)**2+(p.z-z)**2)));
  const frame=u=>{const p=curve.getPointAt(wrap(u)),f=curve.getTangentAt(wrap(u)).setY(0).normalize();return{p,f,a:new THREE.Vector3(f.z,0,-f.x)};};
  const structures=[];
  function register(mesh,type) {mesh.userData.clearanceStructure=type;structures.push(mesh);return mesh;}

  // Broad dimensions follow the real stadium's distinctive rectangular bowl,
  // enormous white open canopy and four cable-supported corner masts. Facades
  // and paddock marquees are stylized volumes rather than CAD/survey replicas.
  const stadium=new THREE.Group();stadium.name='Hard Rock Stadium open canopy and four masts';stadium.userData.staticBatchRoot=true;
  stadium.position.set(SCENERY_ANCHORS.stadium[0],-.55,SCENERY_ANCHORS.stadium[1]);group.add(stadium);
  stadium.rotation.y=SCENERY_LAYOUT_ROTATION_Y;
  register(ring(THREE,stadium,'Stadium concrete outer bowl',282,222,122,70,43,1,12,concrete),'stadium');
  for(let tier=0;tier<13;tier++) {
    const outerW=142+tier*10,outerD=89+tier*8;
    ring(THREE,stadium,`Dolphins aqua seating tier ${tier+1}`,outerW,outerD,outerW-9,outerD-7,24+tier*.8,12+tier*2.15,1.7,tier%5===0?orange:aqua);
  }
  const field=new THREE.Mesh(new THREE.PlaneGeometry(110,50),grass);field.rotation.x=-Math.PI/2;field.position.y=12.05;field.name='Hard Rock Stadium football field and race paddock';stadium.add(field);
  for(let yard=-45;yard<=45;yard+=10)box(THREE,stadium,'Football yard stripe',.3,.03,48,yard,12.06,0,white);
  // During the Grand Prix the football pitch becomes the team's actual
  // hospitality paddock. Eleven distinct suites frame a central avenue.
  box(THREE,stadium,'Stadium field F1 paddock event floor',103,.05,46,0,12.11,0,concrete);
  const teamNames=['MCLAREN','MERCEDES','RED BULL','FERRARI','WILLIAMS','RACING BULLS','ASTON MARTIN','HAAS','AUDI','ALPINE','CADILLAC'];
  for(let i=0;i<11;i++) {
    const side=i<6?-1:1,column=i<6?i:i-6,x=-43+column*17.2,z=side*14;
    const suite=new THREE.Group();suite.name='Miami infield team hospitality '+teamNames[i];suite.position.set(x,12.2,z);stadium.add(suite);
    box(THREE,suite,'Team hospitality white lower suite',14,3.3,11,0,0,0,white);
    box(THREE,suite,'Team hospitality glazing',12.5,1.7,.10,0,1.0,-side*5.56,dark);
    box(THREE,suite,'Team hospitality upper terrace',14.8,.2,12,0,3.35,0,white);
    for(const x of [-6,6])box(THREE,suite,'Team terrace pergola post',.15,2.2,.15,x,3.55,side*4.5,steel);
    box(THREE,suite,'Team hospitality shade sail',14.8,.18,11,0,5.75,0,white);
    const sign=label(THREE,suite,teamNames[i],0,2.8,-side*5.64,12,1.0);if(side===1)sign.rotation.y=Math.PI;
  }
  register(ring(THREE,stadium,'Hard Rock Stadium white open roof canopy',308,249,192,121,33,49,3.4,white),'stadium');
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    const base=new THREE.Vector3(sx*145,0,sz*113),top=new THREE.Vector3(sx*154,92,sz*122);
    register(beam(THREE,stadium,'Stadium corner mast',base,top,1.8,white),'stadium');
    for(let i=0;i<5;i++) {
      beam(THREE,stadium,'Stadium roof support cable',top,new THREE.Vector3(sx*(142-i*12),51,sz*118),.18,steel);
      beam(THREE,stadium,'Stadium roof support cable',top,new THREE.Vector3(sx*147,51,sz*(105-i*12)),.18,steel);
    }
    box(THREE,stadium,'Stadium corner glazed circulation tower',12,42,12,sx*135,0,sz*101,dark);
  }
  label(THREE,stadium,'HARD ROCK STADIUM',0,38,112,116,10);
  for(const sz of [-1,1])for(let i=-5;i<=5;i++)box(THREE,stadium,'Stadium facade vertical fins',2,34,2,i*22,9,sz*108,white);
  for(const sx of [-1,1])for(let i=-3;i<=3;i++)box(THREE,stadium,'Stadium facade vertical fins',2,34,2,sx*139,9,i*25,white);
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    const screen=box(THREE,stadium,'Hard Rock corner video scoreboard',28,12,1.2,sx*101,32,sz*78,dark);
    const sign=label(THREE,stadium,'MIAMI / GP',sx*101,38,sz*77.3,24,8);if(sz<0)sign.rotation.y=Math.PI;
    for(let bay=0;bay<4;bay++)beam(THREE,stadium,'Stadium roof underside diagonal truss',new THREE.Vector3(sx*(105+bay*10),46,sz*95),new THREE.Vector3(sx*(115+bay*10),51,sz*115),.3,steel);
  }

  // The Miami marina is an artificial fan-zone installation with yachts.
  const marina=new THREE.Group();marina.name='Artificial Miami marina and moored yachts';marina.userData.staticBatchRoot=true;
  const marinaShift=new THREE.Vector3(20,0,15).applyAxisAngle(new THREE.Vector3(0,1,0),SCENERY_LAYOUT_ROTATION_Y);
  marina.position.set(SCENERY_ANCHORS.marina[0]+marinaShift.x,-.1,SCENERY_ANCHORS.marina[1]+marinaShift.z);marina.rotation.y=SCENERY_LAYOUT_ROTATION_Y;group.add(marina);
  const waterShape=roundRect(THREE,80,62,14),waterGeometry=new THREE.ShapeGeometry(waterShape,24);waterGeometry.rotateX(-Math.PI/2);
  const water=new THREE.Mesh(waterGeometry,mat(THREE,0x19a1b6,{roughness:.85,metalness:0}));water.name='Miami marina painted turquoise deck';water.position.y=.12;marina.add(water);
  for(const sx of [-1,1])box(THREE,marina,'Marina boardwalk',4,.24,65,sx*42,0,0,concrete);
  for(const sz of [-1,1])box(THREE,marina,'Marina boardwalk',84,.24,4,0,0,sz*33,concrete);
  const hullShape=new THREE.Shape();hullShape.moveTo(-4,-11);hullShape.lineTo(4,-11);hullShape.lineTo(4,5);hullShape.quadraticCurveTo(4,12,0,14);hullShape.quadraticCurveTo(-4,12,-4,5);hullShape.closePath();
  const hullGeo=new THREE.ExtrudeGeometry(hullShape,{depth:2.6,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.5,bevelThickness:.35});hullGeo.rotateX(-Math.PI/2);
  // Two small tenders preserve human scale around the 2026 hospitality ship.
  for(let boat=0;boat<2;boat++) {
    const yacht=new THREE.Group();yacht.name=`Miami marina display tender ${boat+1}`;yacht.position.set(25-boat*15,1.1,boat%2?26:-26);yacht.rotation.y=Math.PI/2;yacht.scale.setScalar(.42);marina.add(yacht);
    const hull=new THREE.Mesh(hullGeo,white);hull.name='Yacht sculpted bow hull';hull.castShadow=true;yacht.add(hull);
    box(THREE,yacht,'Yacht teak deck',6.2,.3,17,0,2.6,-1,mat(THREE,0xb8a386));
    box(THREE,yacht,'Yacht cabin windows',5,2.8,8,0,2.9,-2,dark);
    box(THREE,yacht,'Yacht flybridge roof',6.5,.3,9,0,5.7,-2,white);
    box(THREE,yacht,'Yacht flybridge seats',4.5,.9,3,0,6,-3,aqua);
  }
  // Official promoter dimensions: 264 × 96 × 50 ft, five hospitality decks.
  // A sculpted white bow and stepped glass terraces replace the old generic
  // six-yacht layout, which missed Miami's defining new 2026 landmark.
  const yachtClub=new THREE.Group();yachtClub.name='MSC Yacht Club five-deck 2026 superyacht';marina.add(yachtClub);
  const ship=new THREE.Shape();ship.moveTo(-40.235,-14.63);ship.lineTo(25,-14.63);ship.quadraticCurveTo(40.235,-10,40.235,0);ship.quadraticCurveTo(40.235,10,25,14.63);ship.lineTo(-40.235,14.63);ship.closePath();
  const shipGeo=new THREE.ExtrudeGeometry(ship,{depth:2.8,bevelEnabled:false,curveSegments:18});shipGeo.rotateX(-Math.PI/2);
  const hull=new THREE.Mesh(shipGeo,white);hull.name='MSC Yacht Club full size sculpted hull';hull.position.y=.2;hull.castShadow=true;yachtClub.add(hull);
  for(let deck=0;deck<5;deck++) {
    const w=[76,67,57,43,25][deck],d=[27,25,23,21,17][deck],y=3+deck*2.55,x=deck*1.7;
    box(THREE,yachtClub,'MSC Yacht Club terrace deck '+(deck+1),w,.28,d,x,y,0,white);
    if(deck<4)box(THREE,yachtClub,'MSC Yacht Club dark panoramic lounge',w-9,2.1,d-6,x+1.5,y+.3,0,dark);
    for(const side of [-1,1]) {
      box(THREE,yachtClub,'MSC Yacht Club balcony top rail',w-2,.10,.12,x,y+1.15,side*(d/2-.4),steel);
      for(let post=-w/2+3;post<w/2;post+=5)box(THREE,yachtClub,'MSC Yacht Club rail stanchion',.08,.9,.08,x+post,y+.3,side*(d/2-.4),white);
    }
  }
  for(let i=0;i<9;i++) {
    box(THREE,yachtClub,'MSC Yacht Club ground level cabana',5.1,1.5,3,-30+i*7.3,3.35,-10.6,white);
    box(THREE,yachtClub,'MSC Yacht Club cabana shade',5.6,.16,4,-30+i*7.3,5.2,-10.6,white);
  }
  box(THREE,yachtClub,'MSC Yacht Club pool white surround',13,.25,8,-25,3.35,5.5,white);
  box(THREE,yachtClub,'MSC Yacht Club pool',11.6,.08,6.6,-25,3.61,5.5,mat(THREE,0x42bed2,{roughness:.25}));
  box(THREE,yachtClub,'MSC Yacht Club captain deck canopy',24,.24,17,6.8,14.3,0,white);
  beam(THREE,yachtClub,'MSC Yacht Club mast',new THREE.Vector3(13,13.5,0),new THREE.Vector3(13,15.24,0),.15,steel);
  for(const side of [-1,1]){const sign=label(THREE,yachtClub,'MSC YACHT CLUB',3,7,side*12.4,49,2.4);if(side<0)sign.rotation.y=Math.PI;}
  for(let i=0;i<9;i++) {
    const umbrella=new THREE.Mesh(new THREE.ConeGeometry(2.6,.7,8),i%2?white:pink);umbrella.position.set(-34+i*8.5,3.8,38);umbrella.name='Marina parasol';marina.add(umbrella);
    beam(THREE,marina,'Parasol pole',new THREE.Vector3(-34+i*8.5,0,38),new THREE.Vector3(-34+i*8.5,3.6,38),.09,steel);
  }
  label(THREE,marina,'MIAMI MARINA',0,7,36,43,4.7);

  // Geographic Turnpike and connected ramps, not isolated floating slabs.
  const turnpike=addMiamiTurnpike(THREE,group,curve);
  const bridges=turnpike.bridges;

  function grandstand(u,side,width) {
    const f=frame(u),stand=new THREE.Group();stand.name='Miami covered fan grandstand';stand.userData.staticBatchRoot=true;
    stand.position.copy(f.p).addScaledVector(f.a,side*30);stand.position.y-=.7;
    stand.rotation.y=Math.atan2(f.f.x,f.f.z)+Math.PI/2;
    group.add(stand);
    for(let row=0;row<9;row++) {
      box(THREE,stand,'Grandstand concrete tier',width,.62,1.4,0,row*.6,side*row*1.18,concrete);
      box(THREE,stand,'Grandstand aqua seats',width-1,.33,.65,0,row*.6+.62,side*row*1.18,aqua);
    }
    register(box(THREE,stand,'Grandstand shade roof',width+3,.38,15,0,9,side*5,white),'grandstand');
    for(const x of [-width/2,width/2])register(box(THREE,stand,'Grandstand support',.55,9,.55,x,0,side*11,steel),'grandstand');
  }
  for(const item of [[.025,1,120],[.070,1,80],[.265,-1,65],[.30,-1,55],[.57,-1,60],[.90,-1,95]])grandstand(...item);

  // Instancing keeps the many tropical palms inexpensive. Every trunk is
  // outside the road corridor and the stadium/marina footprints.
  let seed=20260503;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const palmSites=[];
  for(let i=0;i<900&&palmSites.length<200;i++) {
    const u=random(),side=random()<.5?-1:1,f=frame(u),offset=side*(32+random()*60);
    const p=f.p.clone().addScaledVector(f.a,offset);
    if(nearest(p.x,p.z)<25)continue;
    const stadiumLocal=p.clone().sub(stadium.position).applyAxisAngle(new THREE.Vector3(0,1,0),-stadium.rotation.y);
    const marinaLocal=p.clone().sub(marina.position).applyAxisAngle(new THREE.Vector3(0,1,0),-marina.rotation.y);
    if(Math.abs(stadiumLocal.x)<172&&Math.abs(stadiumLocal.z)<145)continue;
    if(Math.abs(marinaLocal.x)<57&&Math.abs(marinaLocal.z)<52)continue;
    if(u<.13||u>.93||(u>.62&&u<.69))continue;
    p.y=-.5;palmSites.push([p,8+random()*4,random()*Math.PI*2]);
  }
  const helper=new THREE.Object3D();
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.33,.60,1,6),mat(THREE,0x74664a),palmSites.length);trunks.name='Miami palm trunks';
  const frondGeo=new THREE.BufferGeometry();
  frondGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, 1.5,1.0,-.66, 4.5,.6,0, 1.5,1,.66, 6,-.5,0],3));
  frondGeo.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);frondGeo.computeVertexNormals();
  const leaves=new THREE.InstancedMesh(frondGeo,mat(THREE,0x307842,{side:THREE.DoubleSide}),palmSites.length*8);leaves.name='Miami palm arching fronds';
  palmSites.forEach(([p,h,yaw],i)=>{
    helper.position.copy(p);helper.position.y+=h/2;helper.rotation.set(0,yaw,.04);helper.scale.set(1,h,1);helper.updateMatrix();trunks.setMatrixAt(i,helper.matrix);
    for(let j=0;j<8;j++) {helper.position.copy(p);helper.position.y+=h;helper.rotation.set(0,yaw+j*Math.PI/4,0);helper.scale.setScalar(.8+(j%3)*.12);helper.updateMatrix();leaves.setMatrixAt(i*8+j,helper.matrix);}
  });group.add(trunks,leaves);trunks.castShadow=leaves.castShadow=true;
  const batching=batchStaticPrimitives(THREE,group,{namePrefix:'Miami static',exclude:mesh=>Boolean(mesh.userData.clearanceStructure)||/^MSC Yacht Club (terrace deck |ground level cabana$)/.test(mesh.name)});
  return {group,stadium,marina,yachtClub,turnpike,bridges,structures,palmCount:palmSites.length,batching};
}
