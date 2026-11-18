// Silverstone2026 geographic venue. OSM contributors, ODbL1.0.
// Sources, measured dimensions and reconstruction limits: scripts/silverstone/README.md.
export function addEnvironment(THREE,ctx) {
  const {scene,curve,samples,length,config}=ctx;
  const group=new THREE.Group();group.name='Silverstone Wing, airfield heritage and grandstands';
  scene.add(group);
  const landmarks=[],diagnostics={sites:[],skipped:[],bridge:[],buildingCount:0};
  const geography=config.geography;
  const scale=geography.scale??1;
  const project=([lon,lat])=>new THREE.Vector3(
    (lon-geography.origin[0])*geography.metresPerDegree[0]*scale,0,
    -(lat-geography.origin[1])*geography.metresPerDegree[1]*scale);
  const points=samples.map(sample=>sample.point??sample);
  const up=new THREE.Vector3(0,1,0),helper=new THREE.Object3D();
  const halfWidth=(config.width??config.trackWidth??config.widthMeters??14)/2;
  const drivingDistance=ctx.drivingDistance??((x,z)=>Math.min(ctx.roadDistance(x,z),ctx.pitDistance?.(x,z)??Infinity));
  const ground=(x,z)=>ctx.groundHeightAt(x,z);
  const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.84,...options});
  const mats={stone:material(0xe4d8bf),cream:material(0xf2ead7),white:material(0xf3f0e7),
    grey:material(0x9caaab),dark:material(0x253d46),glass:material(0x416675,{roughness:.32,metalness:.24}),
    terracotta:material(0xaf7054),slate:material(0x465861),red:material(0xb5313a),
    green:material(0x456848),bark:material(0x786045),gold:material(0xb99a54,{metalness:.4,roughness:.5}),
    blue:material(0x386b94),foundation:material(0xa69e8c),teak:material(0xaa8b63)};
  const boxGeometry=new THREE.BoxGeometry(1,1,1);
  const cylinderGeometry=new THREE.CylinderGeometry(1,1,1,10);
  const domeGeometry=new THREE.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI/2);
  const coneGeometry=new THREE.ConeGeometry(1,1,4);
  const crownGeometry=new THREE.IcosahedronGeometry(1,0);
  const batches=new Map();
  function addInstance(parent,name,geometry,mat,position,dimensions,quaternion) {
    const key=parent.id+'/'+geometry.id+'/'+mat.id;
    if(!batches.has(key))batches.set(key,{parent,geometry,mat,poses:[],names:[]});
    helper.position.set(...position);helper.scale.set(...dimensions);
    helper.quaternion.copy(quaternion??new THREE.Quaternion());helper.updateMatrix();
    const batch=batches.get(key);batch.poses.push(helper.matrix.clone());batch.names.push(name);
  }
  function box(parent,name,size,position,mat,quaternion) {
    addInstance(parent,name,boxGeometry,mat,position,size,quaternion);
  }
  function cylinder(parent,name,radius,height,position,mat) {
    addInstance(parent,name,cylinderGeometry,mat,position,[radius,height,radius]);
  }
  function landmark(name) {
    const object=new THREE.Group();object.name=name;group.add(object);landmarks.push(object);return object;
  }
  function frameAt(u) {
    if(ctx.frameAt)return ctx.frameAt(((u%1)+1)%1);
    const point=curve.getPointAt(u),forward=curve.getTangentAt(u).normalize();
    return{point,forward,across:new THREE.Vector3(forward.z,0,-forward.x).normalize(),normal:up,u};
  }
  function nearestU(coordinate) {
    const p=project(coordinate);let best=Infinity,index=0;
    for(let i=0;i<points.length;i++){
      const d=(points[i].x-p.x)**2+(points[i].z-p.z)**2;
      if(d<best){best=d;index=i;}
    }
    // Refine the sample station, preserving the race/control-line phase.
    let bestU=index/points.length;
    for(let j=-20;j<=20;j++){
      const u=((index+j/20)/points.length+1)%1,q=curve.getPointAt(u);
      const d=(q.x-p.x)**2+(q.z-p.z)**2;if(d<best){best=d;bestU=u;}
    }
    return bestU;
  }
  function footprint(x,z,w,d,angle,spacing=2.4) {
    const result=[],nx=Math.ceil(w/spacing),nz=Math.ceil(d/spacing),c=Math.cos(angle),s=Math.sin(angle);
    for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
      const a=-w/2+ix/nx*w,b=-d/2+iz/nz*d;
      result.push({x:x+c*a+s*b,z:z-s*a+c*b,localX:a,localZ:b});
    }
    return result;
  }
  const occupied=[];
  function site(name,coordinate,w,d,angle=0,options={}) {
    const anchor=project(coordinate),shifts=options.shifts??[[0,0],[8,0],[-8,0],[0,8],[0,-8]];
    for(const factor of (options.factors??[1,.88,.76,.64]))for(const [dx,dz]of shifts){
      const x=anchor.x+dx,z=anchor.z+dz,fw=w*factor,fd=d*factor;
      const footprintPoints=footprint(x,z,fw+1.2,fd+1.2,angle);
      if(footprintPoints.some(p=>drivingDistance(p.x,p.z)<halfWidth+5.6))continue;
      if(!options.allowOverlap&&occupied.some(p=>{
        const a={x:Math.cos(angle),z:-Math.sin(angle)},b={x:Math.sin(angle),z:Math.cos(angle)},
          c={x:Math.cos(p.angle),z:-Math.sin(p.angle)},e={x:Math.sin(p.angle),z:Math.cos(p.angle)};
        const dot=(u,v)=>u.x*v.x+u.z*v.z;
        return ![a,b,c,e].some(axis=>Math.abs((x-p.x)*axis.x+(z-p.z)*axis.z)>
          fw/2*Math.abs(dot(a,axis))+fd/2*Math.abs(dot(b,axis))+p.w/2*Math.abs(dot(c,axis))+p.d/2*Math.abs(dot(e,axis))+3);
      }))continue;
      const elevation=Math.max(...footprintPoints.map(p=>ground(p.x,p.z)));
      const root=landmark(name);root.position.set(x,elevation,z);root.rotation.y=angle;
      root.userData={geographicAnchor:coordinate,adjustmentMeters:Math.hypot(dx,dz),
        horizontalModelScale:factor,footprint:[fw,fd],grounded:true};
      const content=new THREE.Group();content.name=name+' architecture';content.scale.set(factor,1,factor);root.add(content);
      const positions=[],indices=[];
      const c=Math.cos(angle),s=Math.sin(angle);
      const terrainAt=(a,b)=>ground(x+c*a+s*b,z-s*a+c*b)-elevation;
      for(const [a,b]of [[[-fw/2,-fd/2],[fw/2,-fd/2]],[[fw/2,-fd/2],[fw/2,fd/2]],[[fw/2,fd/2],[-fw/2,fd/2]],[[-fw/2,fd/2],[-fw/2,-fd/2]]]){
        const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4);
        for(let i=0;i<count;i++){
          const f=i/count,t=(i+1)/count,x0=a[0]+(b[0]-a[0])*f,z0=a[1]+(b[1]-a[1])*f,x1=a[0]+(b[0]-a[0])*t,z1=a[1]+(b[1]-a[1])*t,n=positions.length/3;
          positions.push(x0,terrainAt(x0,z0)-.07,z0,x0,.04,z0,x1,terrainAt(x1,z1)-.07,z1,x1,.04,z1);
          indices.push(n,n+2,n+1,n+1,n+2,n+3);
        }
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const skirt=new THREE.Mesh(geometry,mats.foundation);skirt.name='Silverstone terrain-following foundation skirt';skirt.material.side=THREE.DoubleSide;root.add(skirt);
      occupied.push({x,z,w:fw,d:fd,angle,radius:Math.hypot(fw,fd)*.42});diagnostics.sites.push(root);diagnostics.buildingCount++;
      return{root,content,w,d,factor};
    }
    diagnostics.skipped.push(name);return null;
  }
  function sign(parent,text,position,width,height=2.1,rotation=Math.PI) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const context=canvas.getContext('2d');context.fillStyle='#263940';context.fillRect(0,0,1024,128);
    context.fillStyle='#f5e8ca';context.font='700 68px Arial';context.textAlign='center';context.textBaseline='middle';context.fillText(text,512,68);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    mesh.name=text+' landmark sign';mesh.position.set(...position);mesh.rotation.y=rotation;parent.add(mesh);
  }
  function facade(parent,w,d,levels,floor=3.35,windows=true) {
    for(let level=0;level<levels;level++){
      const y=2.4+level*floor;
      for(const side of [-1,1]){
        box(parent,'Mediterranean facade string course',[w+.2,.19,.24],[0,y+1.7,side*d/2],mats.cream);
        if(windows)for(let x=-w/2+2.5;x<w/2-1.5;x+=4.2){
          box(parent,'Recessed facade window',[1.3,2.1,.12],[x,y,side*(d/2+.025)],mats.glass);
          if(level>0)box(parent,'Balcony top rail',[2,.12,.55],[x,y-.4,side*(d/2+.18)],mats.grey);
        }
      }
    }
  }

  const silver=material(0xd0d5d6,{metalness:.48,roughness:.53});
  const charcoal=material(0x30424b),solar=new THREE.MeshStandardMaterial({color:0x1e3443,roughness:.46,metalness:.32,side:THREE.DoubleSide});
  const brick=material(0xa88a72),apronMaterial=material(0x737b79);
  // The390m/41-bay dimensions and30m blade are published by the BRDC.
  // Orientation/centre are fitted to OSM building227332429, not a guessed
  // rotation of the racing line. Small clearance shifts affect the building.
  const wing=site('Silverstone Wing 390m pit and paddock complex',[-1.0217844,52.06904757],40,390,-.64227,
    {factors:[1],shifts:[[0,0],[8,6],[12,9],[16,12],[20,15]]});
  let solarPanelCount=0;
  if(wing){const p=wing.content;
    for(let i=0;i<41;i++){
      const z=-195+(i+.5)*390/41;
      box(p,'Wing garage concrete bay '+(i+1),[34,6.2,9.48],[0,3.1,z],mats.grey);
      box(p,'Wing pit garage roller shutter '+(i+1),[.12,4.5,7.6],[-17.06,2.45,z],charcoal);
      box(p,'Wing pit garage red number fascia',[.14,.30,8.3],[-17.15,5.7,z],mats.red);
      box(p,'Wing upper glazed hospitality',[34,4.8,9.48],[0,8.65,z],mats.glass);
      box(p,'Wing cantilever hospitality balcony',[37,.28,9.50],[-.5,6.45,z],silver);
      box(p,'Wing rear paddock structural pier',[.55,10.8,.55],[16.4,5.4,z],silver);
    }
    const roofProfile=[[-195,26],[-148,13],[-77,20],[-25,13],[44,24],[105,12],[159,20],[195,13]];
    function roofAt(z){let a=roofProfile[0],b=roofProfile[1];for(let i=1;i<roofProfile.length;i++){a=roofProfile[i-1];b=roofProfile[i];if(z<=b[0])break;}const slope=(b[1]-a[1])/(b[0]-a[0]);return{height:a[1]+(z-a[0])*slope,slope};}
    const vertices=[],indices=[],fascia=[],fasciaIndices=[];
    for(let i=1;i<roofProfile.length;i++){
      const [z0,h0]=roofProfile[i-1],[z1,h1]=roofProfile[i],k=vertices.length/3;
      vertices.push(-19,h0,z0,19,h0+1.5,z0,-19,h1,z1,19,h1+1.5,z1);indices.push(k,k+2,k+1,k+1,k+2,k+3);
      for(const side of [-1,1]){const n=fascia.length/3,x=side*19,rise=side>0?1.5:0;fascia.push(x,11.2,z0,x,h0+rise,z0,x,11.2,z1,x,h1+rise,z1);fasciaIndices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    function customMesh(name,positions,index,mat){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(index);g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat);mesh.name=name;p.add(mesh);return mesh;}
    const roofMaterial=silver.clone();roofMaterial.side=THREE.DoubleSide;
    customMesh('Wing continuous folded silver roof',vertices,indices,roofMaterial);
    customMesh('Wing angular roof fascias',fascia,fasciaIndices,roofMaterial);
    customMesh('Wing 30m architectural blade',[12,12,-195,18,30,-190,19,14,-183,12.5,12,-195,18.5,30,-190,19.5,14,-183],[0,2,1,3,4,5,0,1,3,1,4,3,1,2,4,2,5,4,2,0,5,0,3,5],roofMaterial);
    // Actual solar installation:2764 modules, documented by Silverstone in
    //2023. Thin plane instances follow the folded roof, rather than covering
    // it with one flat black rectangle. No individual panel draw calls.
    const panelGeometry=new THREE.PlaneGeometry(.99,1.58);
    for(let row=0;row<163&&solarPanelCount<2764;row++)for(let col=0;col<17&&solarPanelCount<2764;col++){
      const z=-187+(row+.5)*374/163,x=-16+(col+.5)*32/17,r=roofAt(z),slopeX=1.5/38;
      const axisX=new THREE.Vector3(1,slopeX,0).normalize(),normal=new THREE.Vector3(-slopeX,1,-r.slope).normalize(),axisY=new THREE.Vector3().crossVectors(normal,axisX).normalize();
      const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axisX,axisY,normal));
      addInstance(p,'Wing roof solar photovoltaic module',panelGeometry,solar,[x,r.height+(x+19)*slopeX+.3,z],[1,1,1],q);solarPanelCount++;
    }
    sign(p,'SILVERSTONE WING',[-17.3,9,0],77,3.7,-Math.PI/2);
    box(p,'Wing race control glazed tower',[13,15,20],[8,7.5,-179],mats.glass);
    wing.root.userData={...wing.root.userData,lengthMeters:390,garageBays:41,bladeHeightMeters:30,solarPanelCount};
  }

  const hilton=site('Hilton Garden Inn Silverstone trackside hotel',[-1.02287973,52.06944726],23,124,-.68805,
    {shifts:[[0,0],[-6,-5],[-12,-10]],factors:[1]});
  if(hilton){const p=hilton.content;
    box(p,'Hilton six-floor hotel volume',[21,19,121],[0,9.5,0],mats.cream);
    for(let level=0;level<6;level++){
      box(p,'Hilton floor shadow band',[21.5,.32,122],[0,1+level*3.0,0],charcoal);
      for(let z=-56;z<57;z+=4.2)for(const side of [-1,1])box(p,'Hilton hotel room glazing',[.12,1.8,2.6],[side*10.57,2.2+level*3.0,z],mats.glass);
    }
    sign(p,'Hilton Garden Inn',[11,16.5,0],45,3.2,Math.PI/2);
  }
  // The current steel/glass hotel bridge is confirmed by Silverstone's
  //6April2022 release (80m overall); OSM1412628538 gives its central span.
  const bridge=landmark('Hilton Wing enclosed pedestrian bridge over Hamilton Straight');
  const endpointA=project([-1.0227446,52.0694472]),endpointB=project([-1.0219256,52.0690759]);
  const bridgeDirection=endpointB.clone().sub(endpointA).setY(0).normalize(),bridgeCentre=endpointA.clone().add(endpointB).multiplyScalar(.5).addScaledVector(bridgeDirection,2);
  const bridgeLength=80,bridgeAngle=Math.atan2(bridgeDirection.x,bridgeDirection.z),bridgeQ=new THREE.Quaternion().setFromAxisAngle(up,bridgeAngle);
  let highestRoad=-Infinity;
  for(const point of points){const relative=point.clone().sub(bridgeCentre),along=relative.dot(bridgeDirection),across=Math.abs(relative.x*bridgeDirection.z-relative.z*bridgeDirection.x);if(Math.abs(along)<bridgeLength/2+halfWidth&&across<halfWidth+5)highestRoad=Math.max(highestRoad,point.y);}
  if(!Number.isFinite(highestRoad))highestRoad=ground(bridgeCentre.x,bridgeCentre.z)+.65;
  const floorY=highestRoad+8.45;
  box(bridge,'Hilton bridge full-width steel floor',[4.4,.42,bridgeLength],[bridgeCentre.x,floorY,bridgeCentre.z],silver,bridgeQ);
  box(bridge,'Hilton bridge covered steel roof',[4.6,.25,bridgeLength+.6],[bridgeCentre.x,floorY+3.5,bridgeCentre.z],silver,bridgeQ);
  const acrossBridge=new THREE.Vector3(bridgeDirection.z,0,-bridgeDirection.x);
  for(const side of [-1,1]){
    const p=bridgeCentre.clone().addScaledVector(acrossBridge,side*2.1);
    box(bridge,'Hilton enclosed walkway glazing',[.12,3.0,bridgeLength],[p.x,floorY+1.8,p.z],mats.glass,bridgeQ);
  }
  for(let s=-38;s<39;s+=4){const p=bridgeCentre.clone().addScaledVector(bridgeDirection,s);for(const side of [-1,1]){const q=p.clone().addScaledVector(acrossBridge,side*2.1);box(bridge,'Hilton bridge steel glazing mullion',[.13,3.45,.13],[q.x,floorY+1.8,q.z],silver);}}
  const supportPoints=[];
  for(const side of [-1,1]){
    const p=bridgeCentre.clone().addScaledVector(bridgeDirection,side*38);
    if(footprint(p.x,p.z,2.1,2.1,0,1).some(v=>drivingDistance(v.x,v.z)<halfWidth+4.7))continue;
    const terrain=ground(p.x,p.z),h=floorY-terrain;
    box(bridge,'Hilton bridge grounded end pier',[1.8,h,1.8],[p.x,terrain+h/2,p.z],silver);supportPoints.push(p);
  }
  bridge.userData={lengthMeters:80,minimumRoadClearanceMeters:8.24,soffitY:floorY-.21,supportPoints};
  diagnostics.bridge.push(bridge);

  const brdc=site('BRDC Clubhouse and Brooklands garden terrace',[-1.01916458,52.07783008],21,41,.76648);
  if(brdc){const p=brdc.content;
    box(p,'BRDC two-storey clubhouse',[17,7.3,36],[0,3.65,0],mats.cream);
    box(p,'BRDC panoramic restaurant glazing',[17.5,2.4,36.5],[0,5.3,0],mats.glass);
    box(p,'BRDC cantilever roof terrace',[20,.34,40],[0,8,0],silver);
    for(const x of [-9,9])box(p,'BRDC roof terrace railing',[.12,.9,39],[x,8.6,0],mats.grey);
    sign(p,'BRDC',[0,6.8,-18.5],10,2.1);
  }
  const farm=site('BRDC Farm historic infield buildings',[-1.01897212,52.07300867],18,26,.09873);
  if(farm){box(farm.content,'BRDC brick farmhouse',[15,5.2,23],[0,2.6,0],brick);addInstance(farm.content,'BRDC farmhouse pitched roof',coneGeometry,mats.slate,[0,6.4,0],[8.3,3.1,12.5]);}

  const museum=site('Silverstone Museum restored RAF hangar',[-1.02180511,52.07440815],45,104,.04485,
    {shifts:[[0,0],[-8,0]],factors:[1]});
  if(museum){const p=museum.content;
    box(p,'Museum iridescent hangar lower walls',[43,8.5,102],[0,4.25,0],material(0x748c91,{metalness:.3,roughness:.58}));
    const vertices=[],indices=[];
    for(let i=0;i<=18;i++){const a=i/18*Math.PI,x=Math.cos(a)*21.5,y=8.5+Math.sin(a)*6.5;vertices.push(x,y,-51,x,y,51);if(i){const k=(i-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
    const roof=new THREE.Mesh(g,material(0xa2b4b8,{side:THREE.DoubleSide,metalness:.25}));roof.name='Museum restored curved RAF hangar roof';p.add(roof);
    box(p,'Museum glazed visitor entrance',[30,6,.15],[0,3.3,-51.1],mats.glass);
    sign(p,'SILVERSTONE MUSEUM',[0,9,-51.2],36,3.2);
  }
  for(const [name,coordinate,w,d,angle]of [
    ['National old pit garages west',[-1.01583912,52.07848668],20,120,-1.477],
    ['National old pit garages east',[-1.01400396,52.07857878],20,124,-1.495],
  ]){
    const old=site(name,coordinate,w,d,angle,{shifts:[[0,0],[0,6],[0,12]],factors:[1]});if(!old)continue;
    const p=old.content;box(p,'National pits low garage building',[18,4.8,d-2],[0,2.4,0],mats.cream);
    box(p,'National pits white flat roof',[20,.35,d],[0,5,0],silver);
    for(let z=-d/2+4;z<d/2-3;z+=7.5)box(p,'National old garage door',[.12,3.8,6.2],[-9.06,2,z],charcoal);
    sign(p,'NATIONAL PITS',[-9.2,4.4,0],34,1.6,-Math.PI/2);
  }

  // Named stands follow the OSM footprints, with proportions retained and
  // clearance fits reported. These are 2026 venue references, not every
  // temporary seating block or an invented replacement racing layout.
  const stands=[
    ['Abbey',[-1.02080186,52.07101678],21,141,-.723],
    ['Hamilton Straight A',[-1.02382875,52.06861025],21,95,-.689],
    ['Becketts',[-1.00842022,52.07171948],21,208,.125],
    ['Copse A',[-1.01158432,52.07935870],15,72,-1.617],
    ['Copse B',[-1.010379,52.07915148],14,57,-2.323],
    ['Woodcote A',[-1.02102477,52.0779555],25,128,-.570],
    ['National Pit Straight',[-1.01755065,52.07926970],15,94,-1.488],
    ['Luffield',[-1.02201547,52.07688519],23,172,-.434],
    ['Village B',[-1.01331022,52.07316798],19,73,-.886],
    ['Chapel',[-1.0095785,52.06974798],16,86,-1.302],
  ];
  let grandstandCount=0;
  for(const [name,coordinate,w,d,angle]of stands){
    const stand=site('Silverstone '+name+' grandstand',coordinate,w,d,angle);if(!stand)continue;grandstandCount++;
    const p=stand.content,centre=stand.root.position,nearest=ctx.nearest(centre.x,centre.z).point;
    const local=stand.root.worldToLocal(nearest.clone());
    // Row0 faces the nearest circuit edge; mirror only the seating rake
    // within its geographic footprint, never the circuit or world axes.
    const face=local.x>0?1:-1;
    for(let row=0;row<13;row++){
      const x=face*(w/2-1-(row+.5)*(w-2)/13),y=2.0+row*.54;
      box(p,'Grandstand concrete seating tier',[(w-2)/13+.06,.5,d-1],[x,y,0],mats.grey);
      box(p,'Silverstone blue seat row',[(w-2)/13-.1,.28,d-2],[x,y+.41,0],row%5<2?mats.blue:mats.white);
    }
    const roof=box(p,'Silverstone grandstand white canopy',[w,.33,d],[0,11.5,0],mats.white);
    for(let z=-d/2+3;z<d/2;z+=22)box(p,'Grandstand rear support',[.45,11.6,.45],[-face*(w/2-.5),5.8,z],silver);
  }
  const vale=site('The Vale new 2026 paddock hospitality',[-1.02180,52.06657],29,42,-.2);
  if(vale){const p=vale.content;box(p,'The Vale dark ground-floor dining room',[25,4.8,37],[0,2.4,0],charcoal);box(p,'The Vale panoramic upper lounge',[27,3.2,38],[0,6.5,0],mats.glass);box(p,'The Vale broad cantilever roof',[29,.35,42],[0,8.4,0],silver);sign(p,'THE VALE 2026',[0,6.7,-19.1],20,2.1);}

  // Old concrete strips: only surviving service/airfield fragments remain
  // visible outside the racing corridor. No obsolete triangle is made into
  // an additional driveable Grand Prix course.
  const airfield=landmark('RAF Silverstone former airfield concrete and grass infield');
  const concreteVertices=[],concreteIndices=[];
  function groundStrip(a,b,width){a=project(a);b=project(b);const f=b.clone().sub(a).normalize(),ac=new THREE.Vector3(f.z,0,-f.x),span=a.distanceTo(b),steps=Math.ceil(span/8);
    for(let i=0;i<steps;i++){
      const p=a.clone().lerp(b,i/steps),q=a.clone().lerp(b,(i+1)/steps),corners=[p.clone().addScaledVector(ac,-width/2),p.clone().addScaledVector(ac,width/2),q.clone().addScaledVector(ac,-width/2),q.clone().addScaledVector(ac,width/2)];
      if(corners.some(v=>drivingDistance(v.x,v.z)<halfWidth+12))continue;
      const k=concreteVertices.length/3;for(const v of corners)concreteVertices.push(v.x,ground(v.x,v.z)+.035,v.z);concreteIndices.push(k,k+2,k+1,k+1,k+2,k+3);
    }
  }
  const survivingRunway=[[-1.0119268,52.0777195],[-1.0121515,52.0771913],[-1.0122177,52.0770358],[-1.012485,52.0764075],[-1.0127255,52.0758421],[-1.0128873,52.0754618],[-1.0131338,52.0748825],[-1.013244,52.0746237]];
  for(let i=1;i<survivingRunway.length;i++)groundStrip(survivingRunway[i-1],survivingRunway[i],14);
  const concreteGeometry=new THREE.BufferGeometry();concreteGeometry.setAttribute('position',new THREE.Float32BufferAttribute(concreteVertices,3));concreteGeometry.setIndex(concreteIndices);concreteGeometry.computeVertexNormals();
  const concrete=new THREE.Mesh(concreteGeometry,apronMaterial);concrete.name='Clipped former runway and service concrete fragments';airfield.add(concrete);

  // Green open airfield character, with low English broadleaf shelter belts.
  // Each tree is kept away from track, pit, building plots and gravel traps.
  const trees=landmark('Silverstone English woodland shelter belts');let treeCount=0,seed=20260705;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const bounds=new THREE.Box3().setFromPoints(points).expandByScalar(190);
  for(let attempts=0;treeCount<480&&attempts<5000;attempts++){
    const x=bounds.min.x+random()*(bounds.max.x-bounds.min.x),z=bounds.min.z+random()*(bounds.max.z-bounds.min.z),distance=drivingDistance(x,z);
    if(distance<54||distance>210||occupied.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+12))continue;
    const h=5+random()*6,y=ground(x,z);cylinder(trees,'Silverstone broadleaf tree trunk',.3,h*.70,[x,y+h*.35,z],mats.bark);
    addInstance(trees,'Silverstone broadleaf tree crown',crownGeometry,mats.green,[x,y+h*.80,z],[h*.39,h*.36,h*.39]);treeCount++;
  }
  // Paddock service vehicles use the same cheap shared primitives.
  if(wing){const p=wing.content;wing.root.updateMatrixWorld(true);for(let i=0;i<16;i++){
    const z=-161+i*21,localX=48,worldPoint=new THREE.Vector3(localX,0,z).applyMatrix4(wing.root.matrixWorld);
    if(drivingDistance(worldPoint.x,worldPoint.z)<halfWidth+18)continue;
    const y=ground(worldPoint.x,worldPoint.z)-wing.root.position.y;
    box(p,'Silverstone paddock team transport trailer',[5,4.2,15],[localX,y+2.3,z],i%3?mats.white:charcoal);
    box(p,'Silverstone paddock truck cab',[5,3.2,4],[localX,y+1.8,z-9],mats.red);
  }}

  let instanceCount=0;
  for(const {parent,geometry,mat,poses,names}of batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,mat,poses.length);mesh.name=parent.name+' instanced landmark details';poses.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate=true;mesh.userData.sourceNames=names;mesh.receiveShadow=true;mesh.castShadow=false;mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);instanceCount+=poses.length;
  }
  group.userData={attribution:'© OpenStreetMap contributors — ODbL1.0',primitiveInstances:instanceCount,instanceBatches:batches.size,grandstandCount,treeCount,solarPanelCount};
  return{group,landmarks,diagnostics};
}
