// Original procedural reconstruction of the 2025–2026 renewed Hungaroring.
// Architectural references: DVM/S.A.M.O., Market, Hungaroring; see scripts/hungaroring/README.md.
// Building location reference © OpenStreetMap contributors, ODbL 1.0.
const BUILDING_CENTRES={paddock:[19.248041,47.579491],grandstand:[19.247381,47.579152]};
const CORNER_NAMES=['Piquet','Hamilton','Spring','Mansell','Mogyoród','Driving Center','Driving Center','Buda','Pest','Danube','Alesi','Schumacher','Senna','Szisz'];

export function addEnvironment(THREE,ctx) {
  const {scene,config,length,frameAt,groundHeightAt}=ctx,group=new THREE.Group();group.name='Hungaroring — amphithéâtre et installations 2026';scene.add(group);
  const landmarks=[],stats={garageBays:40,mainRoofSections:21,grandstands:0,trees:0,promenadeSections:0,cornerSigns:0,hospitalitySuites:0};
  const g=config.geography,project=([lon,lat])=>[(lon-g.origin[0])*g.metresPerDegree[0]*g.scale,-(lat-g.origin[1])*g.metresPerDegree[1]*g.scale];
  const clearance=config.width/2+4,drivingDistance=(x,z)=>ctx.drivingDistance(x,z),unit=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.86,...options});
  const materials={concrete:material(0xbcbcb1),white:material(0xe4e5dd),dark:material(0x292f33),glass:material(0x416371,{metalness:.35,roughness:.28}),metal:material(0x9ca5a4,{metalness:.48,roughness:.43}),roof:material(0xc5c9c6,{metalness:.34,roughness:.52}),red:material(0xa9333c),green:material(0x476b4b),seat:material(0x83a09a),timber:material(0x8b7956)};
  function landmark(name,kind='architecture'){const p=new THREE.Group();p.name=name;p.userData.kind=kind;group.add(p);landmarks.push(p);return p;}
  function box(parent,name,size,position,mat,rotation=[0,0,0]){const m=new THREE.Mesh(unit,mat);m.name=name;m.scale.set(...size);m.position.set(...position);m.rotation.set(...rotation);m.castShadow=m.receiveShadow=true;m.userData.staticPrimitive='box';parent.add(m);return m;}
  function batch(parent,name,geometry,mat,poses){const m=new THREE.InstancedMesh(geometry,mat,poses.length);m.name=name;poses.forEach((p,i)=>{if(p.matrix)matrix.copy(p.matrix);else{dummy.position.set(...p.position);dummy.rotation.set(...(p.rotation??[0,0,0]));dummy.scale.set(...(p.scale??[1,1,1]));dummy.updateMatrix();matrix.copy(dummy.matrix);}m.setMatrixAt(i,matrix);});m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  function beam(a,b,radius=.18){const delta=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());dummy.scale.set(radius,delta.length(),radius);dummy.updateMatrix();return{matrix:dummy.matrix.clone()};}
  const labelMaterials=new Map();
  function sign(parent,text,width,height,position,yaw=0) {
    if(!labelMaterials.has(text)) {
      if(typeof document==='undefined')labelMaterials.set(text,materials.white);
      else {const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#20352f';c.fillRect(0,0,1024,128);c.fillStyle='#f4f5e9';c.textAlign='center';c.textBaseline='middle';c.font='bold 64px sans-serif';c.fillText(text,512,66,995);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;labelMaterials.set(text,new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide,roughness:.9}));}
    }
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),labelMaterials.get(text));mesh.name=text;mesh.position.set(...position);mesh.rotation.y=yaw;parent.add(mesh);return mesh;
  }
  const occupied=[];
  function coordinates(x,z,yaw,lx,lz){return[x+Math.cos(yaw)*lx+Math.sin(yaw)*lz,z-Math.sin(yaw)*lx+Math.cos(yaw)*lz];}
  function areaClear(x,z,width,depth,yaw,reserve=clearance){for(let i=0;i<=Math.ceil(width/4);i++)for(let j=0;j<=Math.ceil(depth/4);j++){const p=coordinates(x,z,yaw,width*(i/Math.ceil(width/4)-.5),depth*(j/Math.ceil(depth/4)-.5));if(drivingDistance(...p)<reserve)return false;}return true;}
  function overlaps(x,z,width,depth,yaw){const axes=[[Math.cos(yaw),-Math.sin(yaw)],[Math.sin(yaw),Math.cos(yaw)]];return occupied.some(o=>{const b=[[Math.cos(o.yaw),-Math.sin(o.yaw)],[Math.sin(o.yaw),Math.cos(o.yaw)]];return[...axes,...b].every(axis=>Math.abs((x-o.x)*axis[0]+(z-o.z)*axis[1])<width/2*Math.abs(axis[0]*axes[0][0]+axis[1]*axes[0][1])+depth/2*Math.abs(axis[0]*axes[1][0]+axis[1]*axes[1][1])+o.width/2*Math.abs(axis[0]*b[0][0]+axis[1]*b[0][1])+o.depth/2*Math.abs(axis[0]*b[1][0]+axis[1]*b[1][1])+3);});}
  function remember(x,z,width,depth,yaw){occupied.push({x,z,width,depth,yaw});}
  function nearestStation(coordinate){const[x,z]=project(coordinate);let best=Infinity,s=0;for(let i=0;i<2400;i++){const f=frameAt(i/2400),d=(f.point.x-x)**2+(f.point.z-z)**2;if(d<best){best=d;s=i/2400*length;}}return s;}
  function levelAt(x,z,width,depth,yaw){let y=-Infinity;for(let i=0;i<=Math.ceil(width/8);i++)for(let j=0;j<=Math.ceil(depth/8);j++){const p=coordinates(x,z,yaw,width*(i/Math.ceil(width/8)-.5),depth*(j/Math.ceil(depth/8)-.5));y=Math.max(y,groundHeightAt(...p));}return y+.05;}
  function localGround(root,lx,lz){const p=coordinates(root.position.x,root.position.z,root.rotation.y,lx,lz);return groundHeightAt(...p)-root.position.y;}
  function foundation(root,width,depth,step=9){for(let z=-depth/2;z<depth/2;z+=step){const end=Math.min(z+step,depth/2),bottom=Math.min(...[-1,0,1].flatMap(i=>[z,end].map(j=>localGround(root,i*width/2,j))))-.3;box(root,'Fondation continue au terrain',[width,-bottom+.3,end-z+.02],[0,(bottom+.3)/2,(z+end)/2],materials.concrete);}}
  function trackRoot(parent,name,station,lateral,width,depth){const f=frameAt(((station/length)%1+1)%1),p=f.point.clone().addScaledVector(f.across,lateral),yaw=Math.atan2(f.forward.x,f.forward.z);if(!areaClear(p.x,p.z,width,depth,yaw))return null;const root=new THREE.Group();root.name=name;root.position.set(p.x,levelAt(p.x,p.z,width,depth,yaw),p.z);root.rotation.y=yaw;parent.add(root);root.userData.footprint={x:p.x,z:p.z,width,depth,yaw};remember(p.x,p.z,width,depth,yaw);return root;}

  // Match the shared terrain's exact rectangular edge, then continue through
  // low rural hills to the horizon. The apron has a real hole over the circuit.
  const landscape=landmark('Mogyoród — amphithéâtre naturel et horizon rural','landscape');
  const bounds=new THREE.Box3().setFromPoints(ctx.samples),pad=360,minX=bounds.min.x-pad,maxX=bounds.max.x+pad,minZ=bounds.min.z-pad,maxZ=bounds.max.z+pad;
  const edge=[];for(let side=0;side<4;side++)for(let i=0;i<160;i++){const t=i/160;edge.push(side===0?[minX+(maxX-minX)*t,minZ]:side===1?[maxX,minZ+(maxZ-minZ)*t]:side===2?[maxX-(maxX-minX)*t,maxZ]:[minX,maxZ-(maxZ-minZ)*t]);}
  const positions=[],indices=[],offsets=[0,25,80,180,400,850,1600,3500,8000,16000],cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  for(const offset of offsets)for(const p of edge){const direction=new THREE.Vector2(p[0]-cx,p[1]-cz).normalize(),x=p[0]+direction.x*offset,z=p[1]+direction.y*offset,t=Math.min(1,offset/800),near=groundHeightAt(...p)-.06,hill=18+7*Math.sin(x*.0013)+6*Math.cos(z*.0011),far=offset>3500?Math.max(0,1-(offset-3500)/12500):1;positions.push(x,(near*(1-t)+hill*t)*far-5*(1-far),z);}
  for(let row=0;row<offsets.length-1;row++)for(let i=0;i<edge.length;i++){const a=row*edge.length+i,b=row*edge.length+(i+1)%edge.length,c=a+edge.length,d=b+edge.length;indices.push(a,c,b,b,c,d);}
  const apronGeometry=new THREE.BufferGeometry();apronGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));apronGeometry.setIndex(indices);apronGeometry.computeVertexNormals();const apron=new THREE.Mesh(apronGeometry,material(0x72864e,{side:THREE.DoubleSide}));apron.name='Terrain continu hors emprise — coteaux de Mogyoród';landscape.add(apron);

  // Main building replaces the obsolete Millennium Tower and old pit block.
  const paddock=landmark('Nouveau paddock 2025–2026 — DVM / S.A.M.O.');
  const mainStation=nearestStation(BUILDING_CENTRES.paddock);let building=null;
  for(const lateral of [-35,-38,-41,-44]){building=trackRoot(paddock,'Paddock — bâtiment de 338,5 m',mainStation,lateral,24,341);if(building)break;}
  if(building){foundation(building,21.5,338.5);box(building,'Paddock — plancher bas',[21.5,.55,338.5],[0,.28,0],materials.concrete);
    const bayLength=338.5/40,doors=[],piers=[],fins=[],glazing=[],railings=[];
    for(let i=0;i<40;i++){const z=-169.25+(i+.5)*bayLength;doors.push({position:[10.82,2.55,z],scale:[.18,4.1,bayLength-.8]});piers.push({position:[10.5,2.6,z-bayLength/2],scale:[1,5.2,.7]});for(const x of [-10.8,10.8])fins.push({position:[x,10.8,z],scale:[.45,10.4,.45]});}
    batch(building,'Paddock — 36 garages numérotés et quatre baies de service',unit,materials.dark,doors);batch(building,'Paddock — portiques béton des garages',unit,materials.concrete,piers);batch(building,'Paddock — trame verticale des façades',unit,materials.metal,fins);
    box(building,'Paddock — façade arrière du rez-de-chaussée',[.3,4.8,338.5],[-10.6,2.5,0],materials.dark);
    for(const [level,y,depth] of [[1,5.2,21.5],[2,9.1,21.5],[3,13,18.5]]){box(building,`Paddock — terrasse blanche niveau ${level}`,[depth,.55,340],[0,y,0],materials.white);for(const x of [-depth/2+.2,depth/2-.2]){glazing.push({position:[x,y+1.9,0],scale:[.18,3.3,333]});railings.push({position:[x,y+3.6,0],scale:[.16,.16,338]});}}
    batch(building,'Paddock — vitrages panoramiques',unit,materials.glass,glazing);batch(building,'Paddock — lisses horizontales',unit,materials.white,railings);
    box(building,'Paddock — toiture filante asymétrique',[23.5,.48,342.5],[0,16.9,0],materials.roof,[0,0,.018]);
    box(building,'Paddock Club — pavillon de toiture',[11.5,3.3,108],[-2,18.7,14],materials.glass);box(building,'Paddock Club — auvent de toiture',[16,.38,116],[-1,20.6,14],materials.white);
    for(const z of [-168,168]){box(building,'Paddock — noyau de circulation vitré',[16.8,14.8,4],[0,8.4,z],materials.glass);box(building,'Paddock — lame terminale inclinée',[22,1.4,4.5],[0,15.6,z],materials.white,[0,0,z>0?.08:-.08]);}
    sign(building,'HUNGARORING',74,3.1,[11.85,15,0],Math.PI/2);sign(building,'PADDOCK CLUB',45,2.1,[6.1,18.8,14],Math.PI/2);building.userData.garageBays=40;
  }else stats.garageBays=0;

  // The 21-part steel roof is the defining new main-grandstand silhouette.
  const grandstands=landmark('Tribunes — nouvelle grande tribune et amphithéâtre','grandstands');
  const rootStation=nearestStation(BUILDING_CENTRES.grandstand);
  function stand(name,station,side,offset,width,depth,rows,roof=false){
    const f=frameAt(((station/length)%1+1)%1),toward=f.across.clone().multiplyScalar(side),yaw=Math.atan2(toward.x,toward.z);let p,ok=false;
    for(let extra=0;extra<=50;extra+=5){p=f.point.clone().addScaledVector(toward,offset+extra);if(areaClear(p.x,p.z,width+3,depth+3,yaw)&&!overlaps(p.x,p.z,width+3,depth+3,yaw)){ok=true;break;}}
    if(!ok)return null;const root=new THREE.Group();root.name=name;root.rotation.y=yaw;root.position.set(p.x,levelAt(p.x,p.z,width,depth,yaw),p.z);grandstands.add(root);root.userData.footprint={x:p.x,z:p.z,width,depth,yaw};remember(p.x,p.z,width,depth,yaw);
    const slabs=[],seats=[[],[],[]],legs=[],frames=[];
    for(let row=0;row<rows;row++){const y=1+row*.47,z=-depth/2+(row+.5)*depth/rows;slabs.push({position:[0,y-.2,z],scale:[width,.4,depth/rows]});
      for(let block=0;block<12;block++)seats[Math.floor(block/4)].push({position:[-width/2+width*(block+.5)/12,y+.15,z],scale:[width/12-.55,.16,.5]});
      if(row%4===0)for(let column=0;column<=Math.ceil(width/12);column++){const x=-width/2+width*column/Math.ceil(width/12),bottom=localGround(root,x,z);legs.push({position:[x,(y+bottom)/2,z],scale:[.55,y-bottom,.55]});}
    }
    batch(root,`${name} — gradins béton`,unit,materials.concrete,slabs);batch(root,`${name} — supports fondés`,unit,materials.concrete,legs);
    for(let i=0;i<3;i++)batch(root,`${name} — assises secteur ${i+1}`,unit,[materials.red,materials.white,materials.green][i],seats[i]);
    const rear=1+(rows-1)*.47;box(root,`${name} — garde-corps`,[width,1,.13],[0,rear+.65,depth/2],materials.metal);
    if(roof){const roofs=[],ribs=[];for(let i=0;i<21;i++){const x=-width/2+width*(i+.5)/21,h=rear+7.1+.7*Math.cos(x/width*Math.PI);roofs.push({position:[x,h,0],rotation:[-.045,0,0],scale:[width/21+.13,.4,depth+5]});
      const ground=localGround(root,x,depth/2),back=new THREE.Vector3(x,h+1,depth/2),front=new THREE.Vector3(x,h-1,-depth/2-1);frames.push(beam(new THREE.Vector3(x,ground,depth/2),back,.55));ribs.push(beam(back,front,.42));for(let bay=0;bay<6;bay++){const a=back.clone().lerp(front,bay/6),b=back.clone().lerp(front,(bay+1)/6);ribs.push(beam(a.clone().add(new THREE.Vector3(0,-1,0)),b,.13));}}
      batch(root,'Grande tribune — 21 modules de toiture',unit,materials.roof,roofs);batch(root,'Grande tribune — portiques arrière',new THREE.CylinderGeometry(1,1,1,6),materials.concrete,frames);batch(root,'Grande tribune — treillis de la couverture',new THREE.CylinderGeometry(1,1,1,5),materials.metal,ribs);sign(root,'HUNGARORING',85,3.5,[0,rear+4,-depth/2-1.3],Math.PI);
    }else sign(root,name,Math.min(35,width*.7),2.4,[0,rear+1,-depth/2-.2],Math.PI);
    stats.grandstands++;return root;
  }
  stand('Grande tribune Hungaroring 2025–2026',rootStation,1,44,294,40,27,true);
  for(const[name,turn,delta,side,offset,width,depth,rows]of[
    ['Apex — Piquet T1','T1',-75,1,57,110,22,24],['Pit Exit — Piquet T1','T1',95,1,72,90,20,22],['Panorama — Hamilton T2','T2',20,-1,56,75,18,20],
    ['Chicane — Driving Center T6','T6',-35,1,47,85,18,19],['Chicane — Driving Center T7','T7',30,-1,49,72,16,18],['Buda / Pest — T8–9','T8',15,1,55,76,18,20],
    ['Alesi — T11','T11',25,1,57,80,19,21],['Schumacher — T12','T12',15,1,59,95,20,22],['Senna — T13','T13',10,-1,50,72,17,19],['Grand Prix — Szisz T14','T14',5,1,58,112,22,24]])stand(name,config.turns[turn].station+delta,side,offset,width,depth,rows);

  // New fan area and promenade behind the main grandstand, following actual terrain.
  const campus=landmark('Promenades, place événementielle et hospitalités du paddock','campus');
  const centreFrame=frameAt(rootStation/length),plazaCentre=centreFrame.point.clone().addScaledVector(centreFrame.across,105),plazaYaw=Math.atan2(centreFrame.forward.x,centreFrame.forward.z),paving=[],pavingIndices=[];
  for(let x=-24;x<24;x+=6)for(let z=-150;z<150;z+=6){const corners=[coordinates(plazaCentre.x,plazaCentre.z,plazaYaw,x,z),coordinates(plazaCentre.x,plazaCentre.z,plazaYaw,x+5.7,z),coordinates(plazaCentre.x,plazaCentre.z,plazaYaw,x,z+5.7),coordinates(plazaCentre.x,plazaCentre.z,plazaYaw,x+5.7,z+5.7)];if(corners.some(p=>drivingDistance(...p)<clearance))continue;const n=paving.length/3;for(const p of corners)paving.push(p[0],groundHeightAt(...p)+.045,p[1]);pavingIndices.push(n,n+2,n+1,n+1,n+2,n+3);}
  const pavingGeometry=new THREE.BufferGeometry();pavingGeometry.setAttribute('position',new THREE.Float32BufferAttribute(paving,3));pavingGeometry.setIndex(pavingIndices);pavingGeometry.computeVertexNormals();const pavingMesh=new THREE.Mesh(pavingGeometry,material(0x99998a));pavingMesh.name='Place rénovée — pavés au terrain';campus.add(pavingMesh);
  for(let i=0;i<11;i++){const station=mainStation-145+i*29,suite=trackRoot(campus,`Hospitalité équipe ${i+1}`,station,-77,21,23);if(!suite)continue;foundation(suite,20,22);box(suite,'Hospitalité — volume blanc',[20,4.2,22],[0,2.25,0],materials.white);box(suite,'Hospitalité — salon vitré',[18,3.2,18],[0,6,0],materials.glass);box(suite,'Hospitalité — terrasse supérieure',[22,.3,24],[0,7.8,0],materials.white);stats.hospitalitySuites++;}
  const kiosks=[];for(let z=-135;z<=135;z+=30){const p=coordinates(plazaCentre.x,plazaCentre.z,plazaYaw,29,z);if(!areaClear(...p,8,12,plazaYaw))continue;kiosks.push({position:[p[0],groundHeightAt(...p)+1.7,p[1]],rotation:[0,plazaYaw,0],scale:[8,3.4,12]});}batch(campus,'Village public — pavillons de restauration',unit,materials.white,kiosks);

  const walks=landmark('Promenades panoramiques des coteaux','walkways'),walkPositions=[],walkIndices=[];
  for(const[start,end,side,offset]of[[1620,2150,1,90],[2260,2600,1,85],[2780,3210,1,88],[3450,3950,1,93]])for(let s=start;s<end;s+=5){const quad=[];for(const[station,lateral]of[[s,side*(offset-1.7)],[s,side*(offset+1.7)],[s+5,side*(offset-1.7)],[s+5,side*(offset+1.7)]]){const f=frameAt(station/length),p=f.point.clone().addScaledVector(f.across,lateral);quad.push(p);}if(quad.some(p=>drivingDistance(p.x,p.z)<clearance+2))continue;const n=walkPositions.length/3;for(const p of quad)walkPositions.push(p.x,groundHeightAt(p.x,p.z)+.035,p.z);walkIndices.push(n,n+2,n+1,n+1,n+2,n+3);stats.promenadeSections++;}
  const walkGeometry=new THREE.BufferGeometry();walkGeometry.setAttribute('position',new THREE.Float32BufferAttribute(walkPositions,3));walkGeometry.setIndex(walkIndices);walkGeometry.computeVertexNormals();const pathMesh=new THREE.Mesh(walkGeometry,material(0xa39578));pathMesh.name='Chemins de spectateurs suivant les talus';walks.add(pathMesh);

  // Current 2026 corner identities, with screens and marshal structures set back.
  const signs=landmark('Repères des quatorze virages — dénomination juillet 2026','trackside');
  for(let i=1;i<=14;i++){const station=config.turns['T'+i].station,f=frameAt(station/length);let p;
    for(const side of [1,-1]){const candidate=f.point.clone().addScaledVector(f.across,side*37);if(areaClear(candidate.x,candidate.z,9,3,Math.atan2(f.forward.x,f.forward.z))){p=candidate;break;}}
    if(!p)continue;const y=groundHeightAt(p.x,p.z),normal=f.point.clone().sub(p).setY(0).normalize(),yaw=Math.atan2(normal.x,normal.z);box(signs,`T${i} — support au sol`,[.35,4,.35],[p.x,y+2,p.z],materials.metal);sign(signs,`T${i}  ${CORNER_NAMES[i-1]}`,10,1.8,[p.x,y+4.3,p.z],yaw);stats.cornerSigns++;
  }
  for(const turn of ['T1','T6','T12','T14']){const f=frameAt(config.turns[turn].u),p=f.point.clone().addScaledVector(f.across,turn==='T6'?72:87);if(!areaClear(p.x,p.z,18,8,0))continue;const y=groundHeightAt(p.x,p.z);box(signs,'Écran géant — support',[1.5,9,1.5],[p.x,y+4.5,p.z],materials.metal);box(signs,'Écran géant — panneau',[17,9,.8],[p.x,y+12,p.z],materials.dark);sign(signs,'HUNGARORING 2026',15,2.6,[p.x,y+12,p.z+.45]);}

  // Warm, dry summer grass and deciduous woodland around the bowl, instanced.
  const forest=landmark('Boisements et talus de la vallée des Trois Sources','vegetation');let seed=19862026;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},trunks=[],crowns=[[],[],[]];
  for(let trial=0;trial<28000&&trunks.length<1900;trial++){const x=bounds.min.x-240+random()*(bounds.max.x-bounds.min.x+480),z=bounds.min.z-240+random()*(bounds.max.z-bounds.min.z+480),radius=3.5+random()*3.2,height=8+random()*11;
    if(drivingDistance(x,z)<clearance+radius+2||occupied.some(o=>{const c=Math.cos(o.yaw),s=Math.sin(o.yaw),dx=x-o.x,dz=z-o.z;return Math.abs(dx*c-dz*s)<o.width/2+radius+7&&Math.abs(dx*s+dz*c)<o.depth/2+radius+7;}))continue;
    const y=groundHeightAt(x,z);trunks.push({position:[x,y+height*.36,z],scale:[.35,height*.72,.35]});const palette=Math.floor(random()*3);for(let lobe=0;lobe<3;lobe++)crowns[palette].push({position:[x+(lobe-1)*radius*.35,y+height*.72+(lobe===1?height*.12:0),z+(lobe===1?radius*.2:0)],scale:[radius*.72,height*.25,radius*.73]});
  }
  batch(forest,'Vallée — troncs enracinés',new THREE.CylinderGeometry(1,1.25,1,6),materials.timber,trunks);for(let i=0;i<3;i++)batch(forest,`Vallée — feuillages ${i+1}`,new THREE.IcosahedronGeometry(1,1),material([0x5f7743,0x6d8248,0x4f6d3e][i]),crowns[i]);stats.trees=trunks.length;
  group.userData={stats,geographicAttribution:'© OpenStreetMap contributors, ODbL 1.0',architecturalReconstruction:true,clearanceMetres:4};
  return{group,landmarks,stats};
}
