import {CROSSOVER} from './track-data.js';
import {batchSuzukaPrimitives,addSuzukaSpectatorLOD} from './static-batches.js';

/** Suzuka venue, March daylight. Building dimensions and positions are
 * stylised from the official course map; these are not survey measurements. */
export function addSuzukaEnvironment(THREE,scene,curve,frames,landmarks,options={}){
 const group=new THREE.Group();group.name='Suzuka Honda venue, Motopia and wooded Mie hills';scene.add(group);
 const terrainHeightAt=options.terrainHeightAt||((x,z,fallback)=>fallback);
 const sourceFractions=options.sourceFractions||[],L=curve.getLength(),reserved=[];
 const mats={white:new THREE.MeshStandardMaterial({color:0xe8e7de,roughness:.75}),red:new THREE.MeshStandardMaterial({color:0xc92736,roughness:.65}),steel:new THREE.MeshStandardMaterial({color:0x677780,metalness:.6,roughness:.4}),concrete:new THREE.MeshStandardMaterial({color:0xa9a79d,roughness:.94}),glass:new THREE.MeshStandardMaterial({color:0x668b9c,roughness:.24,metalness:.38}),dark:new THREE.MeshStandardMaterial({color:0x263137,roughness:.8}),blue:new THREE.MeshStandardMaterial({color:0x326b99,roughness:.7}),green:new THREE.MeshStandardMaterial({color:0x38593e,roughness:1})};
 const up=new THREE.Vector3(0,1,0),helper=new THREE.Object3D();
 let seed=0x20260329;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 function frameAt(u){u=((u%1)+1)%1;const point=curve.getPointAt(u),forward=curve.getTangentAt(u).setY(0).normalize(),across=new THREE.Vector3(forward.z,0,-forward.x);return{point,forward,across,quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,up,forward))};}
 const turn=n=>sourceFractions[landmarks.turns['T'+n].index];
 const pitPoints=[];
 const pitSurface=scene.getObjectByName('Suzuka pit entry, fast lane, working lane and exit');
 const pitVertices=pitSurface?.geometry?.getAttribute('position');
 if(pitVertices)for(let i=0;i<pitVertices.count;i+=2)pitPoints.push({x:pitVertices.getX(i),z:pitVertices.getZ(i),margin:3.5});
 const pitGarages=scene.getObjectByName('Suzuka pit garage concrete bays');
 if(pitGarages){const matrix=new THREE.Matrix4();for(let i=0;i<pitGarages.count;i++){pitGarages.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);pitPoints.push({x:p.x,z:p.z,margin:12});}}
 const roadDistance=(x,z)=>{let d=Infinity;for(let i=0;i<frames.length;i+=5)d=Math.min(d,Math.hypot(x-frames[i].point.x,z-frames[i].point.z));return d;};
 function safe(position,f,hx,hz){
  for(let i=0;i<frames.length;i+=3){const p=frames[i].point,dx=p.x-position.x,dz=p.z-position.z;if(Math.abs(dx*f.across.x+dz*f.across.z)<hx+17&&Math.abs(dx*f.forward.x+dz*f.forward.z)<hz+17)return false;}
  for(const p of pitPoints){const dx=p.x-position.x,dz=p.z-position.z;if(Math.abs(dx*f.across.x+dz*f.across.z)<hx+p.margin&&Math.abs(dx*f.forward.x+dz*f.forward.z)<hz+p.margin)return false;}
  for(const r of reserved){const dx=position.x-r.position.x,dz=position.z-r.position.z;const axes=[f.across,f.forward,r.frame.across,r.frame.forward];const separated=axes.some(axis=>Math.abs(dx*axis.x+dz*axis.z)>hx*Math.abs(f.across.dot(axis))+hz*Math.abs(f.forward.dot(axis))+r.hx*Math.abs(r.frame.across.dot(axis))+r.hz*Math.abs(r.frame.forward.dot(axis))+6);if(!separated)return false;}
  return true;
 }
 function place(name,u,side,hx,hz,lateral){
  for(let offset=lateral;offset<350;offset+=15){
   const f=frameAt(u),p=f.point.clone().addScaledVector(f.across,side*offset);if(!safe(p,f,hx,hz))continue;
   const localGround=(x,z)=>terrainHeightAt(p.x+f.across.x*x+f.forward.x*z,p.z+f.across.z*x+f.forward.z*z,p.y-.45);
   let ground=-Infinity;const gx=Math.ceil(hx*2/10),gz=Math.ceil(hz*2/10);for(let ix=0;ix<=gx;ix++)for(let iz=0;iz<=gz;iz++)ground=Math.max(ground,localGround(-hx+ix/gx*hx*2,-hz+iz/gz*hz*2));
   p.y=ground;const site=new THREE.Group();site.name=name;site.position.copy(p);site.quaternion.copy(f.quaternion);group.add(site);
   // A skirt meets the actual sloping ground around the entire footprint.
   // Previously the highest corner lifted the whole building above a void.
   const verts=[],idx=[];const edges=[[[-hx,-hz],[hx,-hz]],[[hx,-hz],[hx,hz]],[[hx,hz],[-hx,hz]],[[-hx,hz],[-hx,-hz]]];
   for(const[a,b]of edges){const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/6);for(let i=0;i<count;i++){const t=i/count,v=(i+1)/count,x0=a[0]+(b[0]-a[0])*t,z0=a[1]+(b[1]-a[1])*t,x1=a[0]+(b[0]-a[0])*v,z1=a[1]+(b[1]-a[1])*v,base=verts.length/3;verts.push(x0,localGround(x0,z0)-ground-.08,z0,x0,.03,z0,x1,localGround(x1,z1)-ground-.08,z1,x1,.03,z1);idx.push(base,base+2,base+1,base+1,base+2,base+3);}}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();const skirt=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x77796d,roughness:1,side:THREE.DoubleSide}));skirt.name='Terrain-following foundation skirt';site.add(skirt);
   reserved.push({name,position:p.clone(),radius:Math.hypot(hx,hz),frame:f,hx,hz});return{group:site,frame:f,position:p};
  }return null;
 }
 const unitBox=new THREE.BoxGeometry(1,1,1),unitBeam=new THREE.CylinderGeometry(1,1,1,8);
 function box(parent,name,x,y,z,w,h,d,mat){const mesh=new THREE.Mesh(unitBox,mat);mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=h>3;mesh.receiveShadow=true;mesh.userData.suzukaStaticPrimitive='box';parent.add(mesh);return mesh;}
 function beam(parent,name,a,b,r,mat){const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),dir=v2.clone().sub(v1);const m=new THREE.Mesh(unitBeam,mat);m.name=name;m.scale.set(r,dir.length(),r);m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(up,dir.normalize());m.userData.suzukaStaticPrimitive='beam';parent.add(m);return m;}
 function sign(parent,text,x,y,z,w,h,bg='#ffffff',fg='#c92934'){const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,128);ctx.fillStyle=fg;ctx.font='900 78px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,70);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));m.name=text+' venue sign';m.position.set(x,y,z);parent.add(m);return m;}
 // The upper back straight crosses the Degner-to-hairpin leg. Only this deck
 // carries the upper ribbon; the terrain stays below the lower road.
 const bridge=new THREE.Group();bridge.name='Suzuka figure-eight road bridge';bridge.userData.suzukaBatchRoot=true;group.add(bridge);
 const upperU=CROSSOVER.upperStation/5807;
 for(let s=-45;s<45;s+=1.5){const u=upperU+s/L,p=curve.getPointAt(u),slope=curve.getTangentAt(u).normalize(),across=new THREE.Vector3(slope.z,0,-slope.x).normalize(),normal=new THREE.Vector3().crossVectors(slope,across).normalize();const deck=box(bridge,'Figure-eight reinforced bridge deck',p.x,p.y-.62,p.z,14.65,1.0,1.56,mats.concrete);deck.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,normal,slope));for(const side of [-1,1]){const rail=box(bridge,'Bridge steel parapet',p.x+across.x*side*7.13,p.y+.64,p.z+across.z*side*7.13,.18,.45,1.58,mats.steel);rail.quaternion.copy(deck.quaternion);}}
 for(const s of [-35,35]){const f=frameAt(upperU+s/L);for(const side of [-1,1]){const p=f.point.clone().addScaledVector(f.across,side*8.8),ground=terrainHeightAt(p.x,p.z,p.y-10),top=f.point.y-1.1;const pier=box(bridge,'Off-track bridge pier',p.x,(ground+top)/2,p.z,2.1,Math.max(.5,top-ground),4.2,mats.concrete);pier.quaternion.copy(f.quaternion);}}
 // Compact catch screens are carried by the deck edge itself. Generic
 // fencing farther out would float outside the narrow bridge structure.
 const bridgeWires=[];
 for(const side of [-1,1])for(let station=-44;station<44;station+=4){const a=frameAt(upperU+station/L),b=frameAt(upperU+(station+4)/L);const p=a.point.clone().addScaledVector(a.across,side*7.13),q=b.point.clone().addScaledVector(b.across,side*7.13);beam(bridge,'Bridge edge catch-screen post',[p.x,p.y+.45,p.z],[p.x,p.y+2.7,p.z],.06,mats.steel);for(const height of [.9,1.5,2.1,2.7])bridgeWires.push(p.x,p.y+height,p.z,q.x,q.y+height,q.z);bridgeWires.push(p.x,p.y+.9,p.z,q.x,q.y+2.7,q.z);}
 const netGeometry=new THREE.BufferGeometry();netGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bridgeWires,3));const net=new THREE.LineSegments(netGeometry,new THREE.LineBasicMaterial({color:0x89928b,transparent:true,opacity:.55}));net.name='Suzuka crossover deck-supported catch screens';bridge.add(net);
 bridge.userData={suzukaBatchRoot:true,upperStation:CROSSOVER.upperStation,lowerStation:CROSSOVER.lowerStation,estimatedPhysicalRoadSeparationMeters:8,deckThicknessMeters:1};
 // V1/V2 main stand with a long silver cantilever roof and coloured seating.
 const standSites=[];
 function stand(name,u,side,length=110,depth=25,roof=true){const site=place(name,u,side,depth/2,length/2,55);if(!site)return;const p=new THREE.Group();p.name=name+' seating structure';site.group.add(p);if(side<0)p.rotateY(Math.PI);box(p,name+' stepped concrete foundation',0,1.4,0,depth+2,2.8,length+3,mats.concrete);const rows=14;for(let row=0;row<rows;row++){const x=-depth/2+(row+.5)*depth/rows;box(p,name+' seating row '+row,x,3+row*.54,0,depth/rows+.08,.5,length,row%5<2?mats.blue:mats.white);}
 const audience=new THREE.InstancedMesh(new THREE.BoxGeometry(.55,.95,.48),mats.red,rows*Math.floor(length/1.7));let index=0;for(let row=0;row<rows;row++)for(let j=0;j<Math.floor(length/1.7);j++){helper.position.set(-depth/2+(row+.5)*depth/rows,3.72+row*.54,-length/2+1.1+j*1.7);helper.quaternion.identity();helper.scale.set(1,1,1);helper.updateMatrix();audience.setMatrixAt(index,helper.matrix);audience.setColorAt(index++,new THREE.Color().setHSL(rand(),.3+rand()*.3,.32+rand()*.4));}audience.name=name+' spectators';addSuzukaSpectatorLOD(THREE,p,audience);
 if(roof){const roofMesh=box(p,name+' silver cantilever roof',1,13.4,0,depth+8,.5,length+6,mats.white);roofMesh.rotation.z=.06;for(let z=-length/2;z<=length/2;z+=22){box(p,name+' rear support',depth/2+1,7,z,.7,14,.7,mats.steel);beam(p,'Roof diagonal cantilever',[depth/2+1,12,z],[-depth/2-2,13.6,z],.17,mats.steel);}}
 for(const z of [-length/2-.65,length/2+.65]){for(let row=0;row<14;row++)box(p,'Grandstand end stair tread',-depth/2+(row+.5)*depth/14,3+row*.54,z,depth/14+.04,.5,1.2,mats.concrete);beam(p,'Grandstand stair handrail',[-depth/2,4.25,z],[depth/2,11.8,z],.065,mats.steel);}
 sign(p,name.startsWith('V')?'SUZUKA CIRCUIT':'HONDA',-depth/2-.12,4.6,0,Math.min(length*.65,50),2.7).rotateY(-Math.PI/2);standSites.push(site);}
 stand('V2 main grandstand',.02,1,280,31,true);stand('V1 start grandstand',.075,1,100,22,false);stand('B First Curve grandstand',turn(2),1,145,25,true);stand('D S-Curves terraces',turn(4),1,95,21,false);stand('E Dunlop hillside',turn(7),1,100,23,false);stand('I Hairpin grandstand',turn(11),-1,100,25,false);stand('J Spoon spectator terraces',turn(14),-1,110,20,false);stand('G 130R grandstand',turn(15),1,100,25,false);stand('Q Casio Triangle grandstand',turn(17),1,120,27,true);
 // Motopia's Circuit Wheel, the unmistakable landmark over the final sector.
 const wheelSite=place('Motopia Circuit Wheel plaza',turn(18),1,49,44,165);let wheel=null;
 if(wheelSite){const p=wheelSite.group;box(p,'Motopia paved plaza',0,.12,0,95,.24,85,mats.concrete);const radius=22,cy=27.5;wheel=new THREE.Group();wheel.name='Circuit Wheel 50m high Ferris wheel';wheel.position.y=cy;p.add(wheel);
 for(const z of [-1.6,1.6]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.42,8,96),mats.white);ring.position.z=z;wheel.add(ring);for(let i=0;i<32;i++){const a=i/32*Math.PI*2;beam(wheel,'Ferris wheel radial spoke',[0,0,z],[Math.cos(a)*radius,Math.sin(a)*radius,z],.13,mats.white);}}
 const palette=[0xc42f44,0xf3b435,0x3b8fa2,0x5c79b4,0xe5e2d5,0x6caa65];for(let i=0;i<32;i++){const a=i/32*Math.PI*2,x=Math.cos(a)*radius,y=Math.sin(a)*radius;beam(wheel,'Gondola axle',[x,y,-1.8],[x,y,1.8],.17,mats.steel);const gondola=new THREE.Group();gondola.name='Coloured Circuit Wheel gondola';gondola.position.set(x,y-1.2,0);wheel.add(gondola);box(gondola,'Gondola cabin',0,0,0,1.8,1.7,2.2,new THREE.MeshStandardMaterial({color:palette[i%palette.length],roughness:.7}));box(gondola,'Gondola windows',0,.45,0,1.85,.63,2.24,mats.glass);box(gondola,'Gondola roof',0,1.03,0,2.05,.2,2.4,mats.white);}
 for(const z of [-5,5])for(const x of [-13,13])beam(p,'Ferris wheel A-frame leg',[x,0,z],[0,cy,z*.2],.72,mats.steel);beam(p,'Ferris wheel central axle',[0,cy,-4],[0,cy,4],1.1,mats.white);box(p,'Wheel boarding station',0,2,-5,22,4,9,mats.white);sign(p,'CIRCUIT WHEEL',0,5,-9.6,20,2);sign(p,'MOTOPIA',0,3.1,32,27,4,'#b82b34','#ffffff');
 for(let i=0;i<9;i++){const x=-35+i*8;box(p,'Motopia park pavilion',x,1.6,25,5.4,3.2,7,mats.white);const roof=new THREE.Mesh(new THREE.ConeGeometry(4.8,2.4,4),i%2?mats.red:mats.blue);roof.position.set(x,4.4,25);roof.rotateY(Math.PI/4);p.add(roof);}}
 // Honda's permanent race-control tower sits on the pit side. It has real
 // floor volumes, balcony rails and a glazed control room rather than a slab.
 const controlTower=place('Suzuka pit-side race control tower',.006,-1,8,13,57);
 if(controlTower){const p=new THREE.Group();p.name='Track-facing race control rooms';controlTower.group.add(p);p.rotateY(Math.PI);box(p,'Control tower concrete core',0,9,0,13,18,20,mats.white);for(let level=1;level<=4;level++){box(p,'Control tower floor slab',0,level*4.1,0,16,.35,25,mats.concrete);box(p,'Race control panoramic glazing',-6.65,level*4.1-1.5,0,.22,2.25,18,mats.glass);box(p,'Control tower balcony railing',-8,level*4.1+.65,0,.13,.13,25,mats.steel);}box(p,'Control tower roof',0,18.7,0,17,.5,26,mats.white);sign(p,'HONDA',-7,17.2,0,18,2.6).rotateY(-Math.PI/2);}
 const gallery=place('Honda Racing Gallery fan district',.985,1,19,27,270);
 if(gallery){const p=gallery.group;box(p,'Honda Racing Gallery white exhibition volume',0,4.3,0,36,8.6,50,mats.white);box(p,'Honda Racing Gallery glass entrance',-18.1,3.6,0,.2,6.2,35,mats.glass);box(p,'Honda Racing Gallery silver roof',0,8.9,0,39,.45,53,mats.steel);sign(p,'Honda RACING Gallery',-18.3,7.5,0,38,2.6).rotateY(-Math.PI/2);}
 // Inside main straight: paddock hospitality buildings and service village.
 const paddock=place('Honda Suzuka paddock hospitality',.025,-1,35,157,92);if(paddock){const p=new THREE.Group();p.name='Track-facing paddock hospitality';paddock.group.add(p);p.rotateY(Math.PI);box(p,'Paddock asphalt apron',0,.15,0,68,.3,310,mats.dark);for(let i=0;i<10;i++){const z=-130+i*28;box(p,'Paddock hospitality block',0,3.2,z,24,6.4,21,mats.white);box(p,'Hospitality glazing',-12.1,4.1,z,.2,2.5,18,mats.glass);box(p,'Hospitality canopy',-15,7,z,8,.3,23,mats.white);}sign(p,'HONDA RACING',0,9,-146,42,4);}
 // Low service buildings are deliberately separated from all racing surfaces.
 for(const [u,side]of [[turn(8),-1],[turn(13),1],[turn(16),-1]]){const site=place('Suzuka marshal and medical support',u,side,10,17,60);if(site){box(site.group,'Circuit service building',0,2,0,20,4,30,mats.white);box(site.group,'Service building roof',0,4.2,0,21,.4,31,mats.red);}}
 // Planted Mie woodland and a few spring sakura along the fan concourse.
 const bounds=new THREE.Box3().setFromPoints(frames.map(f=>f.point)).expandByScalar(170),trees=[];
 for(let tries=0;trees.length<660&&tries<5000;tries++){const x=bounds.min.x+rand()*(bounds.max.x-bounds.min.x),z=bounds.min.z+rand()*(bounds.max.z-bounds.min.z);if(roadDistance(x,z)<38)continue;if(reserved.some(s=>Math.hypot(s.position.x-x,s.position.z-z)<s.radius+10))continue;const near=frameAt(.025);const dx=x-near.point.x,dz=z-near.point.z;if(Math.abs(dx*near.forward.x+dz*near.forward.z)<270&&dx*near.across.x+dz*near.across.z<0&&Math.abs(dx*near.across.x+dz*near.across.z)<100)continue;const nearest=frames.reduce((a,b)=>Math.hypot(b.point.x-x,b.point.z-z)<Math.hypot(a.point.x-x,a.point.z-z)?b:a);trees.push({x,z,y:terrainHeightAt(x,z,nearest.point.y-1.3),h:7+rand()*8,pink:rand()<.07});}
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.26,.42,1,6),new THREE.MeshStandardMaterial({color:0x6b5945,roughness:1}),trees.length),crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mats.green,trees.length*2);trunks.name='Suzuka woodland trunks';crowns.name='Mie woodland and spring cherry blossoms';trees.forEach((t,i)=>{helper.position.set(t.x,t.y+t.h*.33,t.z);helper.scale.set(1,t.h*.66,1);helper.quaternion.identity();helper.updateMatrix();trunks.setMatrixAt(i,helper.matrix);for(let layer=0;layer<2;layer++){helper.position.set(t.x,t.y+t.h*(.63+layer*.18),t.z);helper.scale.set(t.h*(.32-layer*.06),t.h*.34,t.h*(.32-layer*.06));helper.updateMatrix();crowns.setMatrixAt(i*2+layer,helper.matrix);crowns.setColorAt(i*2+layer,new THREE.Color(t.pink?0xd7a8b6:0x416946).multiplyScalar(.8+rand()*.4));}});trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;group.add(trunks,crowns);
 const cedars=trees.filter((t,i)=>!t.pink&&i%4===0),cedarMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),new THREE.MeshStandardMaterial({color:0x2c5239,roughness:1}),cedars.length*2);
 cedarMesh.name='Suzuka Japanese cedar woodland silhouettes';cedars.forEach((t,i)=>{for(let layer=0;layer<2;layer++){helper.position.set(t.x,t.y+t.h*(.62+layer*.18),t.z);helper.quaternion.identity();helper.scale.set(t.h*(.3-layer*.09),t.h*.65,t.h*(.3-layer*.09));helper.updateMatrix();cedarMesh.setMatrixAt(i*2+layer,helper.matrix);}});cedarMesh.instanceMatrix.needsUpdate=true;group.add(cedarMesh);
 const batching=batchSuzukaPrimitives(THREE,group);
 return{group,grandstandCount:standSites.length,landmarks:{wheel,wheelSite,bridge,paddock,controlTower,gallery,stands:standSites},reservedSites:reserved,treeCount:trees.length,batching};
}
