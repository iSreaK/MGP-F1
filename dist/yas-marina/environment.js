/** Yas Marina landmarks: W Abu Dhabi hotel, marina, main/West/North/South stands.
 * Positions follow the 2025 FIA corner order. Structures are kept outside the
 * driving envelope; the real hotel's overhead shell clears the road by 22 m.
 * https://www.formula1.com/en/racing/2025/united-arab-emirates
 */
export function addYasMarinaEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const group = new THREE.Group();
  group.name = 'Yas Marina hotel, marina, grandstands and island landscape';
  scene.add(group);
  const length = 5281;
  const fractions = options.sourceFractions || [];
  const turnU = n => fractions[landmarks.turns[`T${n}`].index]
    ?? landmarks.turns[`T${n}`].index / 1320;
  const wrap = u => ((u % 1) + 1) % 1;
  const frameAt = u => {
    const point = curve.getPointAt(wrap(u));
    const forward = curve.getTangentAt(wrap(u)).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, new THREE.Vector3(0, 1, 0), forward));
    return { point, forward, across, quaternion };
  };
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...extra });
  const concrete = mat(0xd6d4c9);
  const brightConcrete = mat(0xf0eee6);
  const dark = mat(0x25313c, { metalness: .18 });
  const glass = mat(0x183d52, { metalness: .48, roughness: .23, emissive: 0x082839, emissiveIntensity: .55 });
  const teal = new THREE.MeshBasicMaterial({ color: 0x89e8e4 });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffdca1 });
  const seats = [0xf2e4c7, 0x48849a, 0xa73c3a, 0xe1c577].map(color => mat(color));
  const red = mat(0xc32329, { metalness: .18, roughness: .52 });
  const steel = mat(0x627986, { metalness: .52, roughness: .5 });
  const helper = new THREE.Object3D();
  const obstacleSamples = frames.filter((_, index) => index % 6 === 0);
  function distanceToRoad(x, z) {
    let best = Infinity;
    for (const sample of obstacleSamples) {
      const d = (sample.point.x - x) ** 2 + (sample.point.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  function box(parent, name, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = size[0] * size[1] * size[2] > 25;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function instance(name, geometry, material, placements) {
    if (!placements.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = name;
    placements.forEach((item, index) => {
      helper.position.set(...item.position);
      helper.rotation.set(...(item.rotation || [0, 0, 0]));
      helper.scale.set(...(item.scale || [1, 1, 1]));
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = placements.length < 100;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Covered stands have individual tiers, rear support legs and a roof that
  // stays entirely outside the catch-fence envelope. They face the racing line.
  const standSpecs = [
    ['Main Grandstand', options.gridU + 12 / length, -1, 302, 17],
    ['North Grandstand', turnU(5) - 28 / length, 1, 154, 15],
    ['West Grandstand', turnU(6) - 230 / length, -1, 120, 16],
    ['South Grandstand', turnU(9) - 105 / length, 1, 145, 14],
  ];
  const stands = [];
  for (const [name, station, side, span, rows] of standSpecs) {
    const frame = frameAt(station);
    const stand = new THREE.Group();
    stand.name = name;
    stand.position.copy(frame.point);
    stand.quaternion.copy(frame.quaternion);
    group.add(stand);
    const near = 43;
    box(stand, `${name} lower concrete plinth`, [rows * 2.15 + 6, 1.2, span],
      [side * (near + rows * 1.075), -.42, 0], concrete);
    const crowd = [];
    for (let row = 0; row < rows; row++) {
      const across = side * (near + row * 2.15);
      const y = 1.15 + row * .72;
      box(stand, `${name} tier ${row + 1}`, [2.14, .44, span - 2],
        [across, y - .45, 0], concrete);
      box(stand, `${name} seat band ${row + 1}`, [1.48, .13, span - 4],
        [across - side * .12, y, 0], seats[row % seats.length]);
      for (let z = -span / 2 + 3; z < span / 2 - 2; z += 3.4) {
        if (((row * 13 + Math.round(z)) % 8 + 8) % 8 < 6)
          crowd.push([across, y + .72, z]);
      }
    }
    for (const z of [-span / 2 + 8, -span / 6, span / 6, span / 2 - 8]) {
      box(stand, `${name} rear support`, [.9, 17.4, .9],
        [side * (near + rows * 2.15 + 1), 7.4, z], steel);
      box(stand, `${name} roof beam`, [rows * 2.15 + 13, .56, .75],
        [side * (near + rows * 1.075), 17.5, z], steel);
    }
    box(stand, `${name} cantilevered shade roof`, [rows * 2.15 + 13, .72, span + 5],
      [side * (near + rows * 1.075), 18.15, 0], brightConcrete);
    box(stand, `${name} roof dark edge`, [rows * 2.15 + 13, .37, 1.3],
      [side * (near + rows * 1.075), 18.4, -span / 2 - 2], dark);
    const people = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .3, 1.15, 5),
      mat(0x7493a0), crowd.length);
    crowd.forEach(([x, y, z], index) => {
      helper.position.set(x, y, z);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      people.setMatrixAt(index, helper.matrix);
    });
    people.name = `${name} seated spectators`;
    people.instanceMatrix.needsUpdate = true;
    people.frustumCulled = false;
    stand.add(people);
    stands.push(stand);
  }

  // A protected basin within the marina loop, with a road-clearance cutout.
  // The water is generated as one indexed mesh, avoiding per-tile draw calls.
  const basin = { x: 205, z: -435, rx: 124, rz: 100 };
  const waterY = -.18;
  const waterPositions = [], waterIndices = [];
  const nx = 55, nz = 45;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = basin.x + (ix / nx * 2 - 1) * basin.rx;
    const z = basin.z + (iz / nz * 2 - 1) * basin.rz;
    const x2 = basin.x + ((ix + 1) / nx * 2 - 1) * basin.rx;
    const z2 = basin.z + ((iz + 1) / nz * 2 - 1) * basin.rz;
    const inside = [[x,z],[x2,z],[x,z2],[x2,z2]].every(([px,pz]) =>
      ((px-basin.x)/basin.rx)**2 + ((pz-basin.z)/basin.rz)**2 < .97
      && distanceToRoad(px,pz) > 29);
    if (!inside) continue;
    const first = waterPositions.length / 3;
    waterPositions.push(x,waterY,z, x2,waterY,z, x,waterY,z2, x2,waterY,z2);
    waterIndices.push(first,first+1,first+2,first+1,first+3,first+2);
  }
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position',new THREE.Float32BufferAttribute(waterPositions,3));
  waterGeometry.setIndex(waterIndices);
  waterGeometry.computeVertexNormals();
  const water = new THREE.Mesh(waterGeometry,new THREE.MeshStandardMaterial({
    color:0x164f65,roughness:.25,metalness:.59,side:THREE.DoubleSide,
    emissive:0x0b2b3c,emissiveIntensity:.26}));
  water.name = 'Yas Marina protected yacht basin';
  water.receiveShadow = true;
  group.add(water);
  // Narrow piers and yachts follow the water instead of decorating asphalt.
  const hulls=[], decks=[], cabins=[], masts=[];
  for(let i=0;i<25;i++){
    const a=i*2.399963;
    const r=Math.sqrt((i+.5)/25)*.78;
    const x=basin.x+Math.cos(a)*basin.rx*r;
    const z=basin.z+Math.sin(a)*basin.rz*r;
    if(distanceToRoad(x,z)<43)continue;
    const yaw=(i%3)*.34+.22;
    hulls.push({position:[x,waterY+.64,z],rotation:[0,yaw,0],scale:[1,1,1]});
    decks.push({position:[x,waterY+1.17,z],rotation:[0,yaw,0],scale:[1,1,1]});
    cabins.push({position:[x,waterY+2.15,z],rotation:[0,yaw,0],scale:[1,1,1]});
    masts.push({position:[x,waterY+4.75,z],rotation:[0,yaw,0],scale:[1,1,1]});
  }
  instance('Moored white yacht hulls',new THREE.BoxGeometry(3.2,1.25,11.5),brightConcrete,hulls);
  instance('Yacht teak decks',new THREE.BoxGeometry(2.7,.35,8.2),mat(0xb5a58a),decks);
  instance('Yacht white wheelhouses',new THREE.BoxGeometry(2.2,1.65,3.9),brightConcrete,cabins);
  instance('Yacht masts',new THREE.CylinderGeometry(.045,.07,5.0,5),steel,masts);
  for(const z of [-465,-410]){
    const x=basin.x+20;
    if([-23,23].every(dx=>distanceToRoad(x+dx,z)>35))
      box(group,'Marina floating pontoon',[45,.32,2.4],
        [x,waterY+.26,z],mat(0x9ba9a9));
  }
  // W Abu Dhabi / Yas Hotel: two glazed wings and a luminous curved shell
  // spanning the T15 section. All overhead geometry is >=22 m above the road.
  const hotelFrame = frameAt(turnU(15));
  const hotel = new THREE.Group();
  hotel.name = 'W Abu Dhabi Yas Island hotel over Turn 15';
  hotel.position.copy(hotelFrame.point);
  hotel.quaternion.copy(hotelFrame.quaternion);
  group.add(hotel);
  for(const side of [-1,1]){
    const wing = new THREE.Group();
    wing.position.set(side*78,0,side*9);
    hotel.add(wing);
    box(wing,'Hotel wing glass floors',[61,29,105],[0,15.5,0],glass);
    for(let floor=1;floor<=6;floor++)
      box(wing,'Hotel illuminated floor band',[61,.19,105],[0,3.4+floor*3.75,0],warm);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1,34,17),
      new THREE.MeshStandardMaterial({color:0xc7eaed,transparent:true,opacity:.5,
        metalness:.34,roughness:.3,side:THREE.DoubleSide,depthWrite:false}));
    shell.name='Yas Hotel flowing glazed roof shell';
    shell.position.set(0,26,0);
    shell.scale.set(41,17,66);
    wing.add(shell);
    const lattice = new THREE.LineSegments(new THREE.WireframeGeometry(shell.geometry),
      new THREE.LineBasicMaterial({color:0x8fdde2,transparent:true,opacity:.72}));
    lattice.name='Yas Hotel illuminated diamond lattice';
    lattice.position.copy(shell.position);
    lattice.scale.copy(shell.scale).multiplyScalar(1.006);
    wing.add(lattice);
  }
  const canopyPositions=[],canopyIndices=[],canopyLines=[];
  const cross=28,along=18,halfSpan=48,halfLength=51;
  const canopyPoint=(i,j)=>{
    const x=(i/cross*2-1)*halfSpan,z=(j/along*2-1)*halfLength;
    const y=23.3+9.2*Math.sqrt(Math.max(0,1-(x/halfSpan)**2))
      -1.8*(z/halfLength)**2;
    return [x,y,z];
  };
  for(let j=0;j<=along;j++)for(let i=0;i<=cross;i++)canopyPositions.push(...canopyPoint(i,j));
  for(let j=0;j<along;j++)for(let i=0;i<cross;i++){
    const k=j*(cross+1)+i;
    canopyIndices.push(k,k+cross+1,k+1,k+1,k+cross+1,k+cross+2);
  }
  for(let j=0;j<=along;j+=2)for(let i=0;i<cross;i++)
    canopyLines.push(...canopyPoint(i,j),...canopyPoint(i+1,j));
  for(let i=0;i<=cross;i+=2)for(let j=0;j<along;j++)
    canopyLines.push(...canopyPoint(i,j),...canopyPoint(i,j+1));
  const canopyGeometry=new THREE.BufferGeometry();
  canopyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(canopyPositions,3));
  canopyGeometry.setIndex(canopyIndices);canopyGeometry.computeVertexNormals();
  const canopy=new THREE.Mesh(canopyGeometry,new THREE.MeshStandardMaterial({
    color:0x72b9cd,metalness:.38,roughness:.26,transparent:true,opacity:.68,
    side:THREE.DoubleSide,depthWrite:false}));
  canopy.name='Yas Hotel overhead shell, 22 m minimum clearance';
  hotel.add(canopy);
  const canopyGrid=new THREE.LineSegments(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({color:0xb3f0e9,transparent:true,opacity:.75}));
  canopyGrid.geometry.setAttribute('position',new THREE.Float32BufferAttribute(canopyLines,3));
  canopyGrid.name='Yas Hotel luminous roof lattice';
  hotel.add(canopyGrid);

  // Island palms, floodlights and low campus blocks are batched by material.
  const trunks=[],fronds=[],lampPoles=[],lampHeads=[];
  for(let i=0;i<120;i++){
    const u=i/120;
    const frame=frameAt(u);
    for(const side of [-1,1]){
      const offset=side*(47+((i*17)%4)*14);
      const x=frame.point.x+frame.across.x*offset;
      const z=frame.point.z+frame.across.z*offset;
      if(distanceToRoad(x,z)<36 || Math.hypot(x-basin.x,z-basin.z)<150)continue;
      if((i+Math.max(0,side))%3!==0){
        const height=6.3+((i*7)%5)*.5;
        trunks.push({position:[x,height/2-.5,z],scale:[1,height/7,1]});
        for(let leaf=0;leaf<7;leaf++){
          const theta=leaf*Math.PI*2/7;
          fronds.push({position:[x+Math.cos(theta)*2.0,height+Math.sin(theta*3)*.22-.5,z+Math.sin(theta)*2.0],
            rotation:[.35,theta,Math.PI/2-.35],scale:[1,1.3,1]});
        }
      }
      if(i%2===0 && Math.abs(offset)>58){
        lampPoles.push({position:[x,12.4,z]});
        lampHeads.push({position:[x,24.8,z]});
      }
    }
  }
  instance('Yas Island palm trunks',new THREE.CylinderGeometry(.22,.38,7,6),mat(0x8c765f),trunks);
  instance('Palm fronds',new THREE.ConeGeometry(.85,6.1,4),mat(0x3d6b58,{side:THREE.DoubleSide}),fronds);
  instance('Yas Marina circuit floodlight masts',new THREE.CylinderGeometry(.19,.28,24.8,6),steel,lampPoles);
  instance('Bright floodlight heads',new THREE.BoxGeometry(5.3,.45,1.3),
    new THREE.MeshBasicMaterial({color:0xe9f6f6}),lampHeads);

  // Ferrari World is an off-circuit landmark on Yas Island, distant from T2.
  const ferrari=new THREE.Group();
  ferrari.name='Ferrari World distant red roof';
  ferrari.position.set(825,-.55,385);
  group.add(ferrari);
  box(ferrari,'Ferrari World low pavilion',[132,16,123],[0,8,0],concrete);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(92,24,3),red);
  roof.name='Ferrari World triangular red roof';
  roof.position.y=27;roof.rotation.y=Math.PI/5;
  ferrari.add(roof);
  const resort = [
    [-475,25,78,15,47],[-515,40,54,20,34],[650,-135,58,16,78],
    [715,-205,65,13,46],[490,-155,53,15,68],[-320,-520,72,17,46],
  ];
  for(const [x,z,w,h,d] of resort){
    if(distanceToRoad(x,z)<85)continue;
    box(group,'Yas Island low resort block',[w,h,d],[x,h/2-.5,z],brightConcrete);
    box(group,'Resort window belt',[w+.2,3.2,d+.2],[x,h*.67,z],glass);
  }
  // Planted access roads and grandstand plazas give the island a developed edge.
  // Their polygons are outside the road envelope, and all road-side objects
  // are checked against the nearest racing surface before placement.
  const accessMaterial = mat(0x5f6565, { roughness: .98 });
  const lanePaint = new THREE.MeshBasicMaterial({ color: 0xd1d2c8 });
  const accessRanges = [
    [380, 600, 1], [705, 900, -1], [1035, 1165, 1], [1250, 1300, -1],
  ];
  let accessSegments = 0;
  for (const [first, last, side] of accessRanges) {
    const position = [], paint = [];
    for (let index = first; index < last; index += 2) {
      const ends = [index / 1320, (index + 2) / 1320].map(frameAt);
      const vertices = ends.map(frame => {
        const centreX = frame.point.x + frame.across.x * side * 89;
        const centreZ = frame.point.z + frame.across.z * side * 89;
        return { frame, x: centreX, z: centreZ };
      });
      if (vertices.some(vertex => distanceToRoad(vertex.x, vertex.z) < 37
        || Math.hypot(vertex.x - basin.x, vertex.z - basin.z) < 145)) continue;
      const quad = vertices.map(({frame, x, z}) => {
        const ground = options.terrainHeightAt?.(x, z, -1.1) ?? -1.1;
        return [
          [x - frame.across.x * 5.5, ground + .15, z - frame.across.z * 5.5],
          [x + frame.across.x * 5.5, ground + .15, z + frame.across.z * 5.5],
          [x - frame.across.x * .14, ground + .17, z - frame.across.z * .14],
          [x + frame.across.x * .14, ground + .17, z + frame.across.z * .14],
        ];
      });
      for (const [a, b, c] of [[quad[0][0], quad[1][0], quad[0][1]],
        [quad[0][1], quad[1][0], quad[1][1]]]) position.push(...a, ...b, ...c);
      if (index % 8 < 3) for (const [a, b, c] of [
        [quad[0][2], quad[1][2], quad[0][3]],
        [quad[0][3], quad[1][2], quad[1][3]],
      ]) paint.push(...a, ...b, ...c);
      accessSegments++;
    }
    const makeRibbon = (name, vertices, material) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    if (position.length) makeRibbon('Yas Island perimeter access road', position, accessMaterial);
    if (paint.length) makeRibbon('Access road dashed centre lines', paint, lanePaint);
  }
  // Parking and low hospitality blocks are grouped behind the stands.
  // A pad is accepted only if every corner remains clear of the circuit.
  const pads = [
    [turnU(5) - 85 / length, 1, 138, 74, 108],
    [turnU(6) - 90 / length, -1, 143, 70, 100],
    [turnU(9) - 95 / length, 1, 136, 63, 100],
    [options.gridU + 25 / length, -1, 143, 68, 112],
  ];
  let parkingCount = 0;
  const parked = [];
  for (const [u, side, offset, width, depth] of pads) {
    const frame = frameAt(u);
    const x = frame.point.x + frame.across.x * side * offset;
    const z = frame.point.z + frame.across.z * side * offset;
    const corners = [-1,1].flatMap(sx => [-1,1].map(sz => [
      x + frame.across.x * sx * width / 2 + frame.forward.x * sz * depth / 2,
      z + frame.across.z * sx * width / 2 + frame.forward.z * sz * depth / 2,
    ]));
    if (corners.some(([px,pz]) => distanceToRoad(px,pz) < 48
      || Math.hypot(px-basin.x,pz-basin.z) < 155)) continue;
    const area = new THREE.Group();
    area.name = 'Yas Marina grandstand parking and hospitality';
    area.position.set(x, options.terrainHeightAt?.(x,z,-1.1) ?? -1.1, z);
    area.quaternion.copy(frame.quaternion);
    group.add(area);
    box(area, 'Paved parking court', [width,.13,depth], [0,.1,0], accessMaterial);
    const markerTransforms = [], vehicleTransforms = [];
    for (let row=-depth/2+8; row<depth/2-18; row+=7.7)
      for (let bay=-width/2+6; bay<width/2-4; bay+=4.2) {
        if (Math.abs(bay) < 5.5) continue;
        helper.position.set(bay,.19,row);
        helper.rotation.set(0,0,0);
        helper.scale.set(1,1,1);
        helper.updateMatrix();
        markerTransforms.push(helper.matrix.clone());
        if ((Math.round(bay * 3 + row * 5) % 5 + 5) % 5 < 2) {
          helper.position.set(bay+1.5,.72,row);
          helper.scale.set(1,1,1);
          helper.updateMatrix();
          vehicleTransforms.push(helper.matrix.clone());
        }
      }
    const addLotInstances = (name, geometry, material, transforms) => {
      if (!transforms.length) return;
      const mesh = new THREE.InstancedMesh(geometry,material,transforms.length);
      mesh.name = name;
      transforms.forEach((matrix,index) => mesh.setMatrixAt(index,matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      area.add(mesh);
    };
    addLotInstances('Parking bay paint',new THREE.BoxGeometry(.09,.026,3.8),
      lanePaint,markerTransforms);
    addLotInstances('Parked service vehicles',new THREE.BoxGeometry(2.0,1.15,4.2),
      mat(0xb5c3c5),vehicleTransforms);
    box(area,'Hospitality pavilion',[width*.55,8,13],[0,4,depth/2-8],brightConcrete);
    box(area,'Hospitality glazed frontage',[width*.5,4.1,.25],[0,4.1,depth/2-14.5],glass);
    box(area,'Hospitality shade roof',[width*.64,.48,17],[0,8.3,depth/2-8],concrete);
    parkingCount++;
  }
  const bushes=[];
  for (let i=0;i<360;i++) {
    const u=i/360;
    const frame=frameAt(u);
    const side=i%2 ? 1 : -1;
    const offset=side*(37+(i%5)*6);
    const x=frame.point.x+frame.across.x*offset;
    const z=frame.point.z+frame.across.z*offset;
    if(distanceToRoad(x,z)<29 || Math.hypot(x-basin.x,z-basin.z)<145) continue;
    bushes.push({position:[x,options.terrainHeightAt?.(x,z,-1.1)+.55 ?? -.55,z],
      scale:[.7+(i%4)*.16,.52+(i%3)*.11,.7+(i%4)*.16]});
  }
  instance('Yas Island landscaped low shrubs',new THREE.IcosahedronGeometry(.85,0),
    mat(0x58725e),bushes);
  return {group,grandstandCount:stands.length,palmCount:trunks.length,
    floodlightCount:lampPoles.length,yachtCount:hulls.length,
    landmarks:{stands,hotel,marina:water,ferrariWorld:ferrari},
    updateLighting(){},setWetLighting(){}};
}
