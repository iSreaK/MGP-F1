import { SCENERY_ANCHORS, TRACK_LENGTH_METERS } from './track-data.js';

const wrap=u=>((u%1)+1)%1;
function mat(THREE,color,extra={}) { return new THREE.MeshStandardMaterial({color,roughness:.75,...extra}); }
function box(THREE,parent,name,w,h,d,x,y,z,material) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.name=name;mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
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
  const delta=b.clone().sub(a);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),5),material);
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
  const samples=Array.from({length:1804},(_,i)=>curve.getPointAt(i/1804));
  const nearest=(x,z)=>Math.sqrt(Math.min(...samples.map(p=>(p.x-x)**2+(p.z-z)**2)));
  const frame=u=>{const p=curve.getPointAt(wrap(u)),f=curve.getTangentAt(wrap(u)).setY(0).normalize();return{p,f,a:new THREE.Vector3(f.z,0,-f.x)};};
  const structures=[];
  function register(mesh,type) {mesh.userData.clearanceStructure=type;structures.push(mesh);return mesh;}

  // Broad dimensions follow the real stadium's distinctive rectangular bowl,
  // enormous white open canopy and four cable-supported corner masts. Facades
  // and paddock marquees are stylized volumes rather than CAD/survey replicas.
  const stadium=new THREE.Group();stadium.name='Hard Rock Stadium open canopy and four masts';
  stadium.position.set(SCENERY_ANCHORS.stadium[0],-.55,SCENERY_ANCHORS.stadium[1]);group.add(stadium);
  register(ring(THREE,stadium,'Stadium concrete outer bowl',282,222,122,70,43,1,12,concrete),'stadium');
  for(let tier=0;tier<13;tier++) {
    const outerW=142+tier*10,outerD=89+tier*8;
    ring(THREE,stadium,`Dolphins aqua seating tier ${tier+1}`,outerW,outerD,outerW-9,outerD-7,24+tier*.8,12+tier*2.15,1.7,tier%5===0?pink:aqua);
  }
  const field=new THREE.Mesh(new THREE.PlaneGeometry(110,50),grass);field.rotation.x=-Math.PI/2;field.position.y=12.05;field.name='Hard Rock Stadium football field and race paddock';stadium.add(field);
  for(let yard=-45;yard<=45;yard+=10)box(THREE,stadium,'Football yard stripe',.3,.03,48,yard,12.06,0,white);
  for(const side of [-1,1]) for(let i=0;i<6;i++) {
    const tent=box(THREE,stadium,'Infield race paddock hospitality',10,3.6,6,-44+i*17.5,12.2,side*31,white);
    box(THREE,tent,'Paddock shade canopy',11,.18,8,0,2,0,white);
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

  // The Miami marina is an artificial fan-zone installation with yachts.
  const marina=new THREE.Group();marina.name='Artificial Miami marina and moored yachts';
  marina.position.set(SCENERY_ANCHORS.marina[0]+20,-.1,SCENERY_ANCHORS.marina[1]+15);group.add(marina);
  const waterShape=roundRect(THREE,80,62,14),waterGeometry=new THREE.ShapeGeometry(waterShape,24);waterGeometry.rotateX(-Math.PI/2);
  const water=new THREE.Mesh(waterGeometry,mat(THREE,0x19a1b6,{roughness:.24,metalness:.2}));water.name='Artificial marina turquoise basin';water.position.y=.12;marina.add(water);
  for(const sx of [-1,1])box(THREE,marina,'Marina boardwalk',4,.24,65,sx*42,0,0,concrete);
  for(const sz of [-1,1])box(THREE,marina,'Marina boardwalk',84,.24,4,0,0,sz*33,concrete);
  const hullShape=new THREE.Shape();hullShape.moveTo(-4,-11);hullShape.lineTo(4,-11);hullShape.lineTo(4,5);hullShape.quadraticCurveTo(4,12,0,14);hullShape.quadraticCurveTo(-4,12,-4,5);hullShape.closePath();
  const hullGeo=new THREE.ExtrudeGeometry(hullShape,{depth:2.6,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.5,bevelThickness:.35});hullGeo.rotateX(-Math.PI/2);
  for(let boat=0;boat<6;boat++) {
    const yacht=new THREE.Group();yacht.name=`Miami marina yacht ${boat+1}`;yacht.position.set(-27+boat*11,1.1,boat%2?7:-8);yacht.rotation.y=Math.PI*(boat%2);marina.add(yacht);
    const hull=new THREE.Mesh(hullGeo,white);hull.name='Yacht sculpted bow hull';hull.castShadow=true;yacht.add(hull);
    box(THREE,yacht,'Yacht teak deck',6.2,.3,17,0,2.6,-1,mat(THREE,0xb8a386));
    box(THREE,yacht,'Yacht cabin windows',5,2.8,8,0,2.9,-2,dark);
    box(THREE,yacht,'Yacht flybridge roof',6.5,.3,9,0,5.7,-2,white);
    box(THREE,yacht,'Yacht flybridge seats',4.5,.9,3,0,6,-3,aqua);
  }
  for(let i=0;i<9;i++) {
    const umbrella=new THREE.Mesh(new THREE.ConeGeometry(2.6,.7,8),i%2?white:pink);umbrella.position.set(-34+i*8.5,3.8,38);umbrella.name='Marina parasol';marina.add(umbrella);
    beam(THREE,marina,'Parasol pole',new THREE.Vector3(-34+i*8.5,0,38),new THREE.Vector3(-34+i*8.5,3.6,38),.09,steel);
  }
  label(THREE,marina,'MIAMI MARINA',0,7,36,43,4.7);

  // Two Turnpike flyover decks cross above the technical sector. Each deck
  // is placed relative to the actual road height; piers are rejected wherever
  // they would enter the racing corridor, including the returning straight.
  const bridges=[];
  for(const [station,yaw] of [[3430,.72],[3535,.72]]) {
    const f=frame(station/TRACK_LENGTH_METERS),g=new THREE.Group();g.name='Florida Turnpike elevated highway';
    g.position.copy(f.p);g.rotation.y=yaw;group.add(g);
    const deckY=10.3;
    const deck=box(THREE,g,'Turnpike highway deck',215,1.5,18,0,deckY,0,concrete);register(deck,'overpass');bridges.push(deck);
    box(THREE,g,'Turnpike asphalt surface',215,.12,16,0,deckY+1.5,0,dark);
    for(const side of [-1,1])box(THREE,g,'Turnpike parapet',215,1.1,.45,0,deckY+1.5,side*8.9,concrete);
    for(let lane=-1;lane<=1;lane+=2)for(let x=-96;x<105;x+=13)box(THREE,g,'Highway dashed lane marking',6,.035,.18,x,deckY+1.64,lane*3,white);
    g.updateMatrixWorld(true);
    for(const x of [-90,-58,58,90]) {
      const p=g.localToWorld(new THREE.Vector3(x,0,0));
      if(nearest(p.x,p.z)<17)continue;
      const pier=box(THREE,g,'Turnpike clear road pier',3,deckY+2,10,x,-2,0,concrete);register(pier,'pier');
      box(THREE,g,'Turnpike pier cap',8,1.0,14,x,deckY-.8,0,concrete);
    }
  }

  function grandstand(u,side,width) {
    const f=frame(u),stand=new THREE.Group();stand.name='Miami covered fan grandstand';
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
    if(Math.abs(p.x-stadium.position.x)<172&&Math.abs(p.z-stadium.position.z)<145)continue;
    if(Math.abs(p.x-marina.position.x)<57&&Math.abs(p.z-marina.position.z)<52)continue;
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
  return {group,stadium,marina,bridges,structures,palmCount:palmSites.length};
}
