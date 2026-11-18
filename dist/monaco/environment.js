// Coordinates: OpenStreetMap contributors (ODbL1.0), checked against the
// ACM/FIA2026 plans. Architecture is a deliberately simplified reconstruction.
export const MONACO_HARBOUR_POLYGON = [
  [7.42258,43.73662],[7.42562,43.73694],[7.42885,43.73758],
  [7.42978,43.73635],[7.42662,43.73374],[7.42403,43.73298],
  [7.42305,43.73335],[7.42270,43.73420],[7.42265,43.73530],
  [7.42238,43.73585],
];
// Simplified coastal interpretation around Monaco-Ville, PortHercule,
// Fairmont and the Mareterra extension. This is a visual land/sea mask,
// not a hydrographic survey. It extends far beyond the scene to the south
// and east while leaving the city/upper slopes on the landward side.
export const MONACO_MEDITERRANEAN_WATER_POLYGON = [
  [7.405,43.7215],[7.4170,43.7286],[7.4249,43.7300],
  [7.4262,43.7312],[7.4268,43.7326],[7.4232,43.7332],
  [7.42270,43.73420],[7.42265,43.73530],[7.42238,43.73585],
  [7.42258,43.73662],[7.42562,43.73694],[7.42885,43.73758],
  [7.42995,43.73865],[7.43095,43.74015],[7.4330,43.7414],
  [7.4360,43.7418],[7.4380,43.7440],
  [7.8,43.9],[7.8,43.5],[7.0,43.5],
];
const TUNNEL_ENTRY=[7.4303262,43.7403619];
const TUNNEL_EXIT=[7.4279727,43.7377783];

export function addEnvironment(THREE,ctx) {
  const {scene,curve,samples,length,config}=ctx;
  const group=new THREE.Group();group.name='Monaco Mediterranean city, port and landmarks';
  scene.add(group);
  const landmarks=[],diagnostics={sites:[],skipped:[],tunnel:[],buildingCount:0};
  const geography=config.geography;
  const scale=geography.scale??1;
  const project=([lon,lat])=>new THREE.Vector3(
    (lon-geography.origin[0])*geography.metresPerDegree[0]*scale,0,
    -(lat-geography.origin[1])*geography.metresPerDegree[1]*scale);
  const points=samples.map(sample=>sample.point??sample);
  const up=new THREE.Vector3(0,1,0),helper=new THREE.Object3D();
  const halfWidth=(config.width??config.trackWidth??config.widthMeters??8.6)/2;
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
    for(const factor of [1,.88,.76,.64])for(const [dx,dz]of shifts){
      const x=anchor.x+dx,z=anchor.z+dz,fw=w*factor,fd=d*factor;
      const footprintPoints=footprint(x,z,fw+1.2,fd+1.2,angle);
      if(footprintPoints.some(p=>drivingDistance(p.x,p.z)<halfWidth+5.6))continue;
      if(!options.allowOverlap&&occupied.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+Math.min(fw,fd)*.33))continue;
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
      const skirt=new THREE.Mesh(geometry,mats.foundation);skirt.name='Monaco terrain-following foundation skirt';skirt.material.side=THREE.DoubleSide;root.add(skirt);
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

  // Casino square: the paired towers, central clock and copper domes make
  // the Garnier frontage readable without a photogrammetry-sized asset.
  const casino=site('Casino de Monte-Carlo and Garnier facade',[7.42810,43.73915],62,37,.03);
  if(casino){const p=casino.content;
    box(p,'Casino main Belle Epoque volume',[58,13.8,32],[0,6.9,0],mats.stone);
    box(p,'Casino central entrance pavilion',[22,17,12],[0,8.5,-10],mats.cream);
    for(const x of [-23,23]){
      box(p,'Casino twin clock tower',[12,21,12],[x,10.5,-8],mats.stone);
      addInstance(p,'Casino copper tower dome',domeGeometry,mats.green,[x,21,-8],[6.2,5.5,6.2]);
      cylinder(p,'Casino tower finial',.25,3,[x,27,-8],mats.gold);
    }
    facade(p,58,32,3,3.7);
    for(let x=-8;x<=8;x+=4)cylinder(p,'Casino entrance column',.58,7,[x,3.5,-16.6],mats.cream);
    addInstance(p,'Casino central pediment',coneGeometry,mats.stone,[0,19,-13],[11,5,5]);
    const clock=new THREE.Mesh(new THREE.CircleGeometry(1.35,20),new THREE.MeshBasicMaterial({color:0xf0e9d7}));clock.name='Casino facade clock';clock.position.set(0,16,-16.05);clock.rotation.y=Math.PI;p.add(clock);
    box(p,'Casino clock minute hand',[.10,1.0,.06],[0,16.35,-16.12],mats.dark);box(p,'Casino clock hour hand',[.68,.10,.06],[.26,16,-16.13],mats.dark);
    sign(p,'CASINO MONTE-CARLO',[0,10.1,-16.7],20,1.6);
  }
  const paris=site('Hotel de Paris Monte-Carlo',[7.42698,43.73905],41,42,.06);
  if(paris){const p=paris.content;
    box(p,'Hotel de Paris cream palace',[36,21,36],[0,10.5,0],mats.cream);
    box(p,'Hotel de Paris slate mansard roof',[39,3.8,39],[0,22.4,0],mats.slate);
    facade(p,36,36,6,3.05);
    for(const x of [-15,15])for(const z of [-15,15]){
      cylinder(p,'Hotel de Paris corner rotunda',4.6,23,[x,11.5,z],mats.stone);
      addInstance(p,'Hotel de Paris corner roof dome',domeGeometry,mats.slate,[x,23,z],[5.0,4.4,5.0]);
    }
    sign(p,'HOTEL DE PARIS',[0,4.1,-18.5],22,1.9);
  }
  const fairmont=site('Fairmont Grand Hotel hairpin terraces',[7.42985,43.73986],42,59,.13,{shifts:[[0,0],[-8,0],[-16,0],[0,8],[-8,8]]});
  if(fairmont){const p=fairmont.content;
    box(p,'Fairmont modern hotel stepped block',[37,22,53],[0,11,0],mats.cream);
    for(let floor=0;floor<7;floor++){
      box(p,'Fairmont continuous white balcony slab',[41,.28,57],[0,1.3+floor*3.2,0],mats.white);
      for(const side of [-1,1])box(p,'Fairmont dark balcony glazing',[37,1.35,.12],[0,2.2+floor*3.2,side*27],mats.glass);
    }
    box(p,'Fairmont rooftop pool white surround',[21,.3,13],[0,23.5,5],mats.white);
    box(p,'Fairmont rooftop pool',[18.5,.10,10.5],[0,23.72,5],material(0x46aeba));
    sign(p,'FAIRMONT MONTE CARLO',[0,20.8,-28.7],33,2.2);
  }
  const rascasse=site('La Rascasse renovated 2026 red white bar',[7.423194,43.7325614],17,12,-.10,{shifts:[[0,0],[-4,-3],[-8,-4],[0,-6]]});
  if(rascasse){const p=rascasse.content;
    box(p,'La Rascasse white harbour bar',[15,5.7,10],[0,2.85,0],mats.cream);
    box(p,'La Rascasse red upper parapet',[16,.7,11],[0,6.0,0],mats.red);
    for(let x=-6;x<=6;x+=3)box(p,'Rascasse dark terrace glazing',[2.3,2.4,.12],[x,2.6,-5.08],mats.glass);
    box(p,'Rascasse motorsport red white canopy',[16,.25,3.5],[0,3.8,-3.9],mats.red);
    sign(p,'LA RASCASSE',[0,4.9,-5.2],13,1.35);
  }
  const devote=site('Sainte Devote chapel beside the first corner',[7.42086,43.73703],17,26,-.1,{shifts:[[0,0],[-10,0],[-15,-5]]});
  if(devote){const p=devote.content;
    box(p,'Sainte Devote chapel nave',[13,10,22],[0,5,0],mats.stone);
    addInstance(p,'Sainte Devote terracotta roof',coneGeometry,mats.terracotta,[0,11,0],[8,4,12]);
    box(p,'Sainte Devote bell tower',[4,17,4],[5,8.5,-6],mats.cream);
    box(p,'Sainte Devote cross upright',[.22,2.2,.22],[5,18.6,-6],mats.dark);box(p,'Sainte Devote cross arm',[1.3,.22,.22],[5,19,-6],mats.dark);
  }

  // Boulevard LouisII tunnel endpoints come from OSM way4230891 and its
  // short exit continuation1230247123, not arbitrary fractions of the lap.
  const tunnel=landmark('Monaco Boulevard Louis II tunnel beneath Fairmont');
  const start=nearestU(TUNNEL_ENTRY),finish=nearestU(TUNNEL_EXIT);
  const span=(finish-start+1)%1,steps=Math.ceil(span*length/3.2);
  const tunnelVertices=[],tunnelIndices=[];
  const tunnelLightMaterial=new THREE.MeshBasicMaterial({color:0xffecd2});
  function quad(a,b,c,d){const i=tunnelVertices.length/3;tunnelVertices.push(...a,...b,...c,...d);tunnelIndices.push(i,i+2,i+1,i+1,i+2,i+3);}
  for(let i=0;i<steps;i++){
    const a=frameAt((start+span*i/steps)%1),b=frameAt((start+span*(i+1)/steps)%1);
    const w=halfWidth+1.15,roofRise=7.2;
    const edge=(f,l,y)=>[f.point.x+f.across.x*l,f.point.y+y,f.point.z+f.across.z*l];
    // Flat soffit: its lowest point is7.2m above the same road curve.
    quad(edge(a,-w,roofRise),edge(a,w,roofRise),edge(b,-w,roofRise),edge(b,w,roofRise));
    quad(edge(a,-w,roofRise+.65),edge(b,-w,roofRise+.65),edge(a,w,roofRise+.65),edge(b,w,roofRise+.65));
    // Land-side wall is continuous. The sea side is an open arcade, as on
    // the real coastal gallery; there are no pillars in the driving lane.
    for(const f of [a,b])f.quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.across,up,f.forward.clone().setY(0).normalize()));
    quad(edge(a,-w,0),edge(a,-w,roofRise),edge(b,-w,0),edge(b,-w,roofRise));
    if(i%4===0){
      const lateral=halfWidth+5.5,p=a.point.clone().addScaledVector(a.across,lateral),bottom=ground(p.x,p.z),top=a.point.y+roofRise;
      if(drivingDistance(p.x,p.z)>halfWidth+4.8){
        box(tunnel,'Tunnel sea-side arcade support',[.65,Math.max(.5,top-bottom),.65],[p.x,(top+bottom)/2,p.z],mats.grey);
        box(tunnel,'Tunnel arcade roof cantilever',[lateral-w+.7,.5,.55],edge(a,(lateral+w)/2,roofRise+.25),mats.grey,a.quaternion);
      }
    }
    if(i%3===0)for(const side of [-1,1]){
      const p=edge(a,side*(w-.65),roofRise-.10);
      box(tunnel,'Tunnel warm overhead strip light',[.22,.05,1.55],p,tunnelLightMaterial,a.quaternion);
    }
    diagnostics.tunnel.push({u:a.u??(start+span*i/steps)%1,road:a.point.clone(),width:w,soffitRise:roofRise});
  }
  const tunnelGeometry=new THREE.BufferGeometry();tunnelGeometry.setAttribute('position',new THREE.Float32BufferAttribute(tunnelVertices,3));tunnelGeometry.setIndex(tunnelIndices);tunnelGeometry.computeVertexNormals();
  const tunnelMesh=new THREE.Mesh(tunnelGeometry,material(0x8c8e84,{side:THREE.DoubleSide}));tunnelMesh.name='Monaco tunnel full-width soffit and land-side wall';tunnel.add(tunnelMesh);
  tunnel.userData={entryStation:start*length,exitStation:finish*length,length:span*length,minimumRoadClearanceMeters:7.2,source:'OSM way4230891 +1230247123; geometric clearance is a modelling dimension'};

  const seaLevel=config.seaLevel??Math.min(...points.map(p=>p.y))-1.8;
  const harbour=landmark('Port Hercule water, quays and moored superyachts');
  const harbourShape=new THREE.Shape();MONACO_MEDITERRANEAN_WATER_POLYGON.forEach((coordinate,i)=>{const p=project(coordinate);if(i)harbourShape.lineTo(p.x,-p.z);else harbourShape.moveTo(p.x,-p.z);});harbourShape.closePath();
  const waterGeometry=new THREE.ShapeGeometry(harbourShape);waterGeometry.rotateX(-Math.PI/2);
  const water=new THREE.Mesh(waterGeometry,material(0x287d92,{roughness:.30,metalness:.22,side:THREE.DoubleSide}));water.name='Port Hercule constant-level Mediterranean water';water.position.y=seaLevel;harbour.add(water);
  const harbourVertices=MONACO_MEDITERRANEAN_WATER_POLYGON.map(project);
  const isWater=(x,z)=>{
    let inside=false;
    for(let i=0,j=harbourVertices.length-1;i<harbourVertices.length;j=i++){
      const a=harbourVertices[i],b=harbourVertices[j];
      if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    if(!inside)return false;
    // Preserve the road/pit bed and built quays even where this deliberately
    // coarse coast contour approaches their geographic footprint.
    if(drivingDistance(x,z)<halfWidth+4.5)return false;
    if(occupied.some(p=>{const dx=x-p.x,dz=z-p.z,c=Math.cos(p.angle),s=Math.sin(p.angle);return Math.abs(dx*c-dz*s)<p.w/2+2&&Math.abs(dx*s+dz*c)<p.d/2+2;}))return false;
    return true;
  };
  const yachtHull=new THREE.CylinderGeometry(1,1,1,7,1,false,0,Math.PI*2);yachtHull.rotateX(Math.PI/2);
  const yachtSites=[[7.42315,43.73565,35,.03],[7.42348,43.73548,31,.03],[7.42383,43.73532,41,.03],[7.42424,43.73513,37,.03],[7.42460,43.73491,47,.03],[7.42498,43.73473,42,.03],[7.42544,43.73498,55,-.2],[7.42588,43.73523,46,-.2],[7.42635,43.73549,36,-.2],[7.42677,43.73573,40,-.2],[7.42715,43.73608,48,-.5],[7.4253,43.7363,34,-.25],[7.4247,43.73625,30,-.25],[7.4241,43.73620,38,-.25]];
  let yachtCount=0;
  for(const [lon,lat,size,angle]of yachtSites){const p=project([lon,lat]);if(drivingDistance(p.x,p.z)<size*.55+halfWidth+5)continue;
    const yacht=new THREE.Group();yacht.name='Monaco moored superyacht '+(++yachtCount);yacht.position.set(p.x,seaLevel,p.z);yacht.rotation.y=angle;harbour.add(yacht);
    addInstance(yacht,'White sculpted yacht hull',yachtHull,mats.white,[0,1.2,0],[size*.15,1.1,size*.48]);
    box(yacht,'Yacht teak deck',[size*.25,.20,size*.82],[0,2.3,-size*.025],mats.teak);
    box(yacht,'Yacht main white lounge',[size*.22,2.5,size*.43],[0,3.65,-size*.08],mats.white);
    for(const side of [-1,1])box(yacht,'Yacht panoramic dark windows',[.10,1.2,size*.40],[side*size*.112,4,-size*.08],mats.glass);
    box(yacht,'Yacht flybridge roof',[size*.24,.25,size*.48],[0,5.1,-size*.08],mats.white);
    cylinder(yacht,'Yacht radar mast',.10,4,[0,6,-size*.21],mats.white);
  }
  harbour.userData={seaLevel,yachtCount,coastline:MONACO_MEDITERRANEAN_WATER_POLYGON,harbourReference:MONACO_HARBOUR_POLYGON,attribution:'© OpenStreetMap contributors — ODbL1.0; coastline is a simplified visual interpretation'};

  const pool=site('Stade Nautique Rainier III swimming pool',[7.42205,43.73461],31,67,.20,{shifts:[[0,0],[4,0],[-4,0],[0,-8]]});
  if(pool){const p=pool.content;
    box(p,'Rainier III stone pool surround',[30,.25,66],[0,.125,0],mats.cream);
    // The surrounding site may shrink to clear the streets. The sourced
    // basin dimensions remain50by20m in world space regardless of that fit.
    box(p,'Rainier III Olympic 50 by20 metre swimming pool',[20/pool.factor,.08,50/pool.factor],[0,.31,0],material(0x51b8c7,{roughness:.34}));
    for(let lane=-8;lane<=8;lane+=2)box(p,'Rainier III pool lane markings',[.13,.015,46/pool.factor],[lane/pool.factor,.36,0],mats.blue);
    for(const height of [1,3,5]){box(p,'Rainier III diving platform',[3,.22,2.8],[0,height,-28],mats.white);box(p,'Rainier III diving platform support',[.35,height,.35],[1,height/2,-29],mats.grey);}
    sign(p,'STADE NAUTIQUE RAINIER III',[0,2.5,-32.8],27,1.5);
  }

  // Monaco's actual garage frontage bends gently along the harbour side of
  // the fast lane. Each small bay is checked independently against BOTH
  // driving corridors; there is no long slab bridging the Piscine bends.
  const pits=landmark('Monaco compact harbour-side pit garages and hospitality');
  let garageBays=0,lastGaragePoint=null;
  if(ctx.pitSamples?.length){const pitPoints=ctx.pitSamples.map(p=>p.point??p);
    for(let i=2;i<pitPoints.length-2;i+=3){const p=pitPoints[i],geoLat=geography.origin[1]-p.z/(geography.metresPerDegree[1]*scale);if(geoLat<43.73304||geoLat>43.73456||(lastGaragePoint&&p.distanceTo(lastGaragePoint)<7.5))continue;
      const f=pitPoints[i+1].clone().sub(pitPoints[i-1]).setY(0).normalize(),right=new THREE.Vector3(-f.z,0,f.x);
      for(const side of [1,-1]){const centre=p.clone().addScaledVector(right,side*14.5),angle=Math.atan2(f.x,f.z);
        if(footprint(centre.x,centre.z,8.1,6.5,angle,1.8).some(v=>drivingDistance(v.x,v.z)<halfWidth+4.7))continue;
        const grounds=footprint(centre.x,centre.z,8.5,6.8,angle,2).map(v=>ground(v.x,v.z));
        const terrain=Math.max(...grounds),bottom=Math.min(...grounds)-.1;
        const q=new THREE.Quaternion().setFromAxisAngle(up,angle);
        box(pits,'Monaco garage grounded foundation',[8.5,terrain-bottom+.04,6.8],[centre.x,(terrain+bottom)/2,centre.z],mats.foundation,q);
        box(pits,'Monaco garage concrete bay',[8,5.4,6.3],[centre.x,terrain+2.7,centre.z],mats.white,q);
        box(pits,'Monaco garage hospitality upper floor',[8.2,2.8,6.5],[centre.x,terrain+6.8,centre.z],mats.glass,q);
        box(pits,'Monaco garage upper canopy',[8.5,.23,6.8],[centre.x,terrain+8.4,centre.z],mats.white,q);
        garageBays++;lastGaragePoint=p;break;
      }
    }
  }
  pits.userData={garageBays,stylised:true};

  for(const [name,coordinate,depth]of [
    ['K harbour grandstand',[7.42162,43.73610],62],
    ['Piscine N P harbour terraces',[7.42275,43.73470],52],
    ['T Rascasse hospitality grandstand',[7.42280,43.73358],56],
  ]){
    const stand=site('Monaco '+name,coordinate,14,depth,0,{shifts:[[0,0],[5,0],[-5,0]]});if(!stand)continue;
    const p=stand.content;
    for(let row=0;row<9;row++){
      const x=-6+(row+.5)*1.35,y=1.6+row*.61;
      box(p,'Monaco grandstand concrete tier',[1.42,.57,depth-1],[x,y,0],mats.grey);
      box(p,'Monaco harbour grandstand blue seating',[1.15,.22,depth-2],[x-.08,y+.42,0],mats.blue);
    }
    sign(p,name.toUpperCase(),[0,1.8,-depth/2+.05],Math.min(26,depth*.6),1.7);
  }

  // Tight, colourful apartment blocks climbing away from the race corridor.
  // Each plot is geographically placed, then rejected if its entire rotated
  // footprint cannot clear the race road and pit lane by the required margin.
  const cityPlots=[[7.4206,43.7359,25,24,31],[7.4204,43.7349,27,23,35],[7.4208,43.7339,23,27,25],[7.4213,43.7327,25,25,27],[7.4220,43.7320,24,25,30],[7.4214,43.7378,28,25,36],[7.4222,43.7382,25,27,40],[7.4230,43.7386,24,26,44],[7.4238,43.7389,26,25,38],[7.4246,43.7392,28,26,38],[7.4254,43.7398,26,28,44],[7.4263,43.7402,28,28,34],[7.4274,43.7415,29,25,37],[7.4284,43.7418,25,27,40],[7.4294,43.7420,26,25,35],[7.4304,43.7418,24,26,42],[7.4310,43.7409,25,26,38],[7.4280,43.7321,28,28,23]];
  const cityMaterials=[material(0xdac4a7),material(0xe7d9c6),material(0xd6b7a2),material(0xc1ccc8)];
  for(let i=0;i<cityPlots.length;i++){
    const[lon,lat,w,d,height]=cityPlots[i],location=project([lon,lat]);if(isWater(location.x,location.z))continue;
    const s=site('Monaco stepped hillside apartment '+(i+1),[lon,lat],w,d,(i%4-1.5)*.06,{shifts:[[0,0]]});if(!s)continue;
    const p=s.content;box(p,'Monaco residential volume',[w-1,height,d-1],[0,height/2,0],cityMaterials[i%4]);
    box(p,'Monaco residential flat roof',[w,.35,d],[0,height+.2,0],mats.cream);
    facade(p,w-1,d-1,Math.min(12,Math.floor(height/3.3)),3.3);
    for(const side of [-1,1])for(let y=5;y<height;y+=6.6)box(p,'Monaco long apartment balcony',[w,.22,1.1],[0,y,side*(d/2-.1)],mats.cream);
  }
  // Pine and palm silhouettes at gardens and planted quays; all trunks avoid
  // the road/pit and their canopy footprint is reserved before instancing.
  const gardens=landmark('Monaco Mediterranean pines palms and garden terraces');
  const gardenSites=[[7.4261,43.7391],[7.4264,43.7397],[7.4277,43.7398],[7.4282,43.7400],[7.4240,43.7380],[7.4207,43.7367],[7.4288,43.7365],[7.4269,43.7337]];
  let treeCount=0;
  for(let k=0;k<gardenSites.length;k++){const centre=project(gardenSites[k]);for(let i=0;i<14;i++){
    const angle=i*2.39996,r=8+Math.sqrt(i)*6,x=centre.x+Math.cos(angle)*r,z=centre.z+Math.sin(angle)*r;
    if(isWater(x,z)||drivingDistance(x,z)<halfWidth+10||occupied.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+4))continue;
    const y=ground(x,z),h=6+(i%5)*.7;cylinder(gardens,'Monaco Mediterranean tree trunk',.3,h*.72,[x,y+h*.36,z],mats.bark);
    addInstance(gardens,'Monaco umbrella pine canopy',crownGeometry,mats.green,[x,y+h,z],[h*.57,h*.28,h*.57]);treeCount++;
  }}
  gardens.userData={treeCount};
  let instanceCount=0;
  for(const {parent,geometry,mat,poses,names}of batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,mat,poses.length);mesh.name=parent.name+' instanced '+(geometry===boxGeometry?'architectural details':'landmark primitives');
    poses.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;
    mesh.userData.sourceNames=names;mesh.castShadow=false;mesh.receiveShadow=true;
    mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);instanceCount+=poses.length;
  }
  group.userData={attribution:'© OpenStreetMap contributors — ODbL1.0',
    primitiveInstances:instanceCount,instanceBatches:batches.size,
    model:'Monaco2026 geographic venue reconstruction; no replay'};
  return{group,landmarks,diagnostics,isWater};
}
