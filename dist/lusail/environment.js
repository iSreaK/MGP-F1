/**
 * Lusail venue landmarks. Stand locations follow the official 2025 venue map
 * and F1 fan guide; dimensions and facades are visual reconstructions.
 * https://www.fia.com/sites/default/files/media_kit_-_2025_qatar_grand_prix_2.pdf
 * https://www.formula1.com/en/latest/article/speed-desert-and-doha-the-ultimate-fan-guide-to-the-qatar-grand-prix.7pVRowHi0gVBHEROf7d9B0
 * Repeated columns, seats and floodlights are instanced. No decorative base
 * is accepted unless its footprint clears every sampled branch of the track.
 */
export function addLusailEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const { halfWidth = 6, gridU = 0, sourceFractions = [], pitSide = 1,
    terrainHeightAt = (_x, _z, fallback) => fallback } = options;
  const group = new THREE.Group();
  group.name = 'Lusail grandstands, paddock and floodlight infrastructure';
  scene.add(group);
  const lapLength = curve.getLength();
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const turnU = n => sourceFractions[landmarks.turns[`T${n}`].index];
  const roadSamples = frames.filter((_, i) => i % 3 === 0).map(frame => frame.point);
  const pit = scene.getObjectByName('Lusail pit entry, fast lane, working lane and exit');
  const pitVertices = pit?.geometry?.getAttribute('position');
  if (pitVertices) for (let i = 0; i < pitVertices.count; i += 4) {
    roadSamples.push(new THREE.Vector3(pitVertices.getX(i), 0, pitVertices.getZ(i)));
  }
  const materials = {
    sand: new THREE.MeshStandardMaterial({ color: 0xbba17a, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x9faaa9, roughness: .91 }),
    pale: new THREE.MeshStandardMaterial({ color: 0xd7d9d1, roughness: .79 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x26343d, metalness: .45, roughness: .55 }),
    glazing: new THREE.MeshStandardMaterial({ color: 0x21445b, metalness: .4,
      roughness: .25, emissive: 0x102336, emissiveIntensity: .6 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1b8b92, roughness: .85 }),
    seatPale: new THREE.MeshStandardMaterial({ color: 0xddd4c1, roughness: .85 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x12517d, roughness: .78 }),
    bright: new THREE.MeshBasicMaterial({ color: 0xfff8da, toneMapped: false }),
    warm: new THREE.MeshBasicMaterial({ color: 0xf6be72, toneMapped: false }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x47484a, roughness: .99 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x5a7445, roughness: 1,
      side: THREE.DoubleSide }),
    dune: new THREE.MeshStandardMaterial({ color: 0xb3a078, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x476b42, roughness: .92,
      side: THREE.DoubleSide }),
    mashrabiya: new THREE.MeshStandardMaterial({ color: 0xbbad94, roughness: .84 }),
  };
  const geoCache = new Map();
  const box = (w, h, d) => {
    const key = `${w},${h},${d}`;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return geoCache.get(key);
  };
  function frameAt(u) {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    const forward = curve.getTangentAt(wrapped).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward));
    return { point, forward, across, quaternion };
  }
  function outsideSide(u) {
    const before = curve.getTangentAt((u - .006 + 1) % 1).setY(0).normalize();
    const after = curve.getTangentAt((u + .006) % 1).setY(0).normalize();
    return before.x * after.z - before.z * after.x < 0 ? -1 : 1;
  }
  function site(u, side, lateral, halfX, halfZ, along = 0) {
    const frame = frameAt(u);
    const centre = frame.point.clone().addScaledVector(frame.across, side * lateral)
      .addScaledVector(frame.forward, along);
    // Oriented footprint versus every centreline and pit-lane vertex.
    for (const point of roadSamples) {
      const dx = point.x - centre.x, dz = point.z - centre.z;
      const x = dx * frame.across.x + dz * frame.across.z;
      const z = dx * frame.forward.x + dz * frame.forward.z;
      if (Math.abs(x) < halfX + halfWidth + 7
        && Math.abs(z) < halfZ + halfWidth + 7) return null;
    }
    return { frame, position: centre };
  }
  function seek(u, side, lateral, halfX, halfZ, along = 0) {
    for (let extra = 0; extra <= 115; extra += 8) {
      const found = site(u, side, lateral + extra, halfX, halfZ, along);
      if (found) return found;
    }
    return null;
  }
  function addBox(parent, name, dimensions, material, xyz) {
    const mesh = new THREE.Mesh(box(...dimensions), material);
    mesh.name = name;
    mesh.position.set(...xyz);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function instancedBoxes(parent, name, dimensions, material, transforms) {
    const mesh = new THREE.InstancedMesh(box(...dimensions), material, transforms.length);
    mesh.name = name;
    transforms.forEach(([x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0], i) => {
      helper.position.set(x,y,z); helper.rotation.set(rx,ry,rz);
      helper.scale.set(sx,sy,sz); helper.updateMatrix();
      mesh.setMatrixAt(i, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Main, North, T2/T3 and final-corner spectator zones in the official plan.
  // The seat decks use distinct risers and visible steel legs, avoiding a
  // hovering slab when viewed from the low chase camera.
  const stands = [];
  const standSpecs = [
    { name: 'Main Grandstand', u: gridU, side: -pitSide, length: 150, rows: 10, offset: 65 },
    { name: 'North Grandstand', u: (gridU + 245 / lapLength) % 1, side: -pitSide,
      length: 92, rows: 9, offset: 63 },
    { name: 'T2 Grandstand', u: turnU(2), side: outsideSide(turnU(2)), length: 100, rows: 9, offset: 58 },
    { name: 'T3 Grandstand', u: turnU(3), side: outsideSide(turnU(3)), length: 70, rows: 8, offset: 60 },
    { name: 'T16 Grandstand', u: turnU(16), side: outsideSide(turnU(16)), length: 85, rows: 9, offset: 58 },
  ];
  for (const spec of standSpecs) {
    const centre = seek(spec.u, spec.side, spec.offset, 19, spec.length / 2);
    if (!centre) continue;
    const stand = new THREE.Group();
    stand.name = `Lusail ${spec.name}`;
    stand.position.copy(centre.position);
    stand.position.y = terrainHeightAt(centre.position.x, centre.position.z,
      centre.frame.point.y - 1.1);
    stand.quaternion.copy(centre.frame.quaternion);
    // The low front row is local -X. Rotate left-side stands so it faces
    // the road; the previous layout pointed most sections away from cars.
    if (spec.side < 0) stand.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(up, Math.PI));
    stand.userData.trackFacingSide = spec.side;
    stand.userData.trackTarget = centre.frame.point.toArray();
    group.add(stand); stands.push(stand);
    addBox(stand, 'spectator concourse', [30, .42, spec.length], materials.concrete,
      [0, .34, 0]);
    const deck = addBox(stand, 'raked grandstand structural deck',
      [31, .48, spec.length], materials.concrete, [0, 7.5, 0]);
    deck.rotation.z = Math.atan2((spec.rows - 1) * .9, (spec.rows - 1) * 2.65);
    const braces = [];
    for (let z = -spec.length / 2 + 7; z <= spec.length / 2 - 6; z += 13) {
      braces.push([-7.5, 3.1, z, 1, 1, 1, 0, 0, -.45]);
      braces.push([7.5, 4.9, z, 1, 1, 1, 0, 0, .45]);
    }
    instancedBoxes(stand, 'grandstand angled underside braces',
      [.42, 8.5, .42], materials.steel, braces);
    const supports = [];
    for (let z = -spec.length / 2 + 6; z <= spec.length / 2 - 5; z += 10) {
      supports.push([-13.5, 5, z], [0, 5, z], [13.5, 5, z]);
    }
    instancedBoxes(stand, 'grandstand visible support legs', [.7, 9.8, .7],
      materials.steel, supports);
    const aisles = [], seatTransforms = [], paleSeats = [];
    for (let row = 0; row < spec.rows; row++) {
      const x = -12 + row * 2.65;
      const height = 4.1 + row * .9;
      aisles.push([x, height - .4, 0, 1, 1, spec.length / 2.6]);
      const columns = Math.floor((spec.length - 8) / 2.35);
      for (let col = 0; col < columns; col++) {
        const z = -spec.length / 2 + 4.5 + col * (spec.length - 9) / columns;
        const target = (col + row * 3) % 7 === 0 ? paleSeats : seatTransforms;
        target.push([x, height + .1, z]);
      }
    }
    instancedBoxes(stand, 'stepped concrete risers', [2.64, .26, 2.6],
      materials.concrete, aisles);
    instancedBoxes(stand, 'teal spectator seats', [1.65, .3, 1.35],
      materials.seat, seatTransforms);
    instancedBoxes(stand, 'pale spectator seats', [1.65, .3, 1.35],
      materials.seatPale, paleSeats);
    // Single white canopy with ribs and clear roof supports. Position and
    // dimensions are reconstructed; all legs are behind the safety verge.
    addBox(stand, 'white tensile canopy', [37, .38, spec.length + 5],
      materials.pale, [0, 14.45, 0]);
    const roofRibs = [];
    for (let z = -spec.length / 2; z <= spec.length / 2; z += 10)
      roofRibs.push([0, 14.1, z]);
    instancedBoxes(stand, 'canopy steel ribs', [36, .42, .36],
      materials.steel, roofRibs);
    addBox(stand, 'front roof edge light', [.22, .15, spec.length + 4],
      materials.bright, [-18.3, 14.18, 0]);
    addBox(stand, 'back roof edge light', [.22, .15, spec.length + 4],
      materials.bright, [18.3, 14.18, 0]);
    const railPositions = [], aisleTreads = [];
    for (let z = -spec.length / 2 + 4; z <= spec.length / 2 - 3; z += 3.5)
      railPositions.push([-14.8, 4.8, z]);
    for (let row = 0; row < spec.rows; row++) {
      const x = -12 + row * 2.65;
      for (const z of [-spec.length / 3, spec.length / 3])
        aisleTreads.push([x, 4.32 + row * .9, z]);
    }
    instancedBoxes(stand, 'grandstand front safety rail', [.12, 1.1, .13],
      materials.steel, railPositions);
    instancedBoxes(stand, 'grandstand concrete aisle treads', [2.22, .1, 1.1],
      materials.pale, aisleTreads);
    addBox(stand, 'grandstand fascia LED', [.18, .3, spec.length + 4],
      materials.blue, [-18.38, 14.0, 0]);
  }

  // The 2025 venue map places the F1 paddock, media centre and fan area
  // behind the pit building. Their decorative volumes must clear both tracks.
  const paddock = seek(gridU, pitSide, 112, 36, 112);
  let paddockGroup = null;
  if (paddock) {
    paddockGroup = new THREE.Group();
    paddockGroup.name = 'Lusail paddock hospitality and media centre';
    paddockGroup.position.copy(paddock.position);
    paddockGroup.position.y = terrainHeightAt(paddock.position.x,
      paddock.position.z, paddock.frame.point.y - 1.1);
    paddockGroup.quaternion.copy(paddock.frame.quaternion);
    group.add(paddockGroup);
    addBox(paddockGroup, 'paddock paved apron', [79, .13, 240],
      materials.asphalt, [0, .13, 0]);
    addBox(paddockGroup, 'media centre plinth', [50, 6.8, 60],
      materials.pale, [0, 3.5, 64]);
    addBox(paddockGroup, 'media centre glazed floor', [51, 4.8, 59],
      materials.glazing, [0, 9.0, 64]);
    addBox(paddockGroup, 'media centre flat roof', [53, .65, 62],
      materials.pale, [0, 11.6, 64]);
    addBox(paddockGroup, 'hospitality wing', [53, 9, 105],
      materials.pale, [0, 4.6, -55]);
    const windows = [];
    for (let z = -103; z <= -7; z += 5.2)
      for (const x of [-26.7, 26.7]) windows.push([x, 5.0, z]);
    instancedBoxes(paddockGroup, 'lit hospitality glazing', [.1, 3.7, 3.8],
      materials.glazing, windows);
    addBox(paddockGroup, 'hospitality roofline', [56, .7, 108],
      materials.pale, [0, 9.5, -55]);
    // The renovated paddock uses shaded arcades, slit openings and screens.
    const shadePiers = [], lattices = [], roofUnits = [];
    for (let z = -104; z <= -6; z += 8.5) {
      shadePiers.push([-28.2, 5.9, z], [28.2, 5.9, z]);
      lattices.push([-28.35, 5.9, z + 2], [28.35, 5.9, z + 2]);
    }
    for (let z = -91; z <= -14; z += 19)
      roofUnits.push([0, 10.4, z]);
    instancedBoxes(paddockGroup, 'hospitality deep-shade pillars',
      [.38, 8.8, .48], materials.pale, shadePiers);
    instancedBoxes(paddockGroup, 'mashrabiya-inspired screen fins',
      [.22, 4.6, 3.2], materials.mashrabiya, lattices);
    instancedBoxes(paddockGroup, 'paddock rooftop plant housings',
      [5.4, 1.35, 6.5], materials.steel, roofUnits);
    addBox(paddockGroup, 'media centre shaded overhang', [57, .5, 66],
      materials.pale, [-1.8, 12.15, 64]);
    const mediaFins = [];
    for (let z = 38; z <= 91; z += 5.2) mediaFins.push([-26.2, 8.0, z]);
    instancedBoxes(paddockGroup, 'media centre decorative screen',
      [.24, 4.9, 2.1], materials.mashrabiya, mediaFins);
  }

  // Repeated floodlight masts make the entire permanent night circuit legible.
  // Emissive fixtures stand in for area lights; one scene key light illuminates
  // moving cars to avoid hundreds of shadow passes.
  const mastPositions = [];
  for (let metre = 0; metre < lapLength; metre += 74) {
    const u = metre / lapLength;
    const side = Math.floor(metre / 74) % 2 ? -1 : 1;
    const found = seek(u, side, halfWidth + 35, 3.2, 3.2);
    if (found) mastPositions.push(found);
  }
  const poleGeometry = new THREE.CylinderGeometry(.18, .35, 22, 6);
  const poles = new THREE.InstancedMesh(poleGeometry, materials.steel, mastPositions.length);
  const lamps = new THREE.InstancedMesh(box(5.7, .55, 1.45), materials.bright,
    mastPositions.length);
  poles.name = 'Lusail perimeter floodlight masts';
  lamps.name = 'Lusail brilliant floodlight heads';
  mastPositions.forEach(({ frame, position }, i) => {
    const footY = terrainHeightAt(position.x, position.z,
      frame.point.y - 1.1);
    helper.position.copy(position); helper.position.y = footY + 11;
    helper.quaternion.identity(); helper.scale.set(1, 1, 1); helper.updateMatrix();
    poles.setMatrixAt(i, helper.matrix);
    helper.position.y = footY + 22.1;
    helper.quaternion.copy(frame.quaternion); helper.updateMatrix();
    lamps.setMatrixAt(i, helper.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  poles.frustumCulled = false; lamps.frustumCulled = false;
  group.add(poles, lamps);

  // Fan-zone canopies behind the Main Grandstand, visible on the overview
  // without placing stalls in runoff or on top of another loop of asphalt.
  const fanSite = seek((gridU + 140 / lapLength) % 1, -pitSide, 125, 38, 32);
  let fanZone = null;
  if (fanSite) {
    fanZone = new THREE.Group();
    fanZone.name = 'Lusail spectator fanzone';
    fanZone.position.copy(fanSite.position);
    fanZone.position.y = terrainHeightAt(fanSite.position.x, fanSite.position.z,
      fanSite.frame.point.y - 1.1);
    fanZone.quaternion.copy(fanSite.frame.quaternion);
    group.add(fanZone);
    addBox(fanZone, 'fanzone pedestrian court', [90, .13, 76],
      materials.concrete, [0, .15, 0]);
    const tentTops = [], tentColumns = [];
    for (let row = -1; row <= 1; row++) for (let col = -2; col <= 2; col++) {
      const x = row * 26, z = col * 14;
      tentTops.push([x, 4.25, z]);
      for (const dx of [-5, 5]) for (const dz of [-4, 4])
        tentColumns.push([x + dx, 2.15, z + dz]);
    }
    instancedBoxes(fanZone, 'fanzone shade canopies', [12, .25, 10],
      materials.pale, tentTops);
    instancedBoxes(fanZone, 'fanzone canopy supports', [.2, 4.2, .2],
      materials.steel, tentColumns);
    addBox(fanZone, 'fanzone lit information strip', [66, .28, .2],
      materials.warm, [0, 5.6, -32]);
  }

  // Lusail Hill is the natural spectator bank introduced at Turn 1. Its edge
  // follows the same terrain sampler as the verge, and its crest rises away
  // from the racing surface rather than changing the surveyed track profile.
  const hillSite = seek(turnU(1), outsideSide(turnU(1)), 119, 49, 70);
  let hill = null;
  if (hillSite) {
    hill = new THREE.Group();
    hill.name = 'Lusail Hill at Turn 1';
    hill.position.copy(hillSite.position);
    hill.position.y = terrainHeightAt(hillSite.position.x, hillSite.position.z,
      hillSite.frame.point.y - 1.1);
    hill.quaternion.copy(hillSite.frame.quaternion);
    group.add(hill);
    const nx = 24, nz = 30, positions = [], colours = [], indices = [];
    const soil = new THREE.Color(0x9d8c63);
    const grass = new THREE.Color(0x647e4b);
    const local = new THREE.Vector3();
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = (ix / nx * 2 - 1) * 48;
      const z = (iz / nz * 2 - 1) * 68;
      const radial = Math.max(0, 1 - (x / 48) ** 2 - (z / 68) ** 2);
      local.set(x, 0, z).applyQuaternion(hill.quaternion).add(hill.position);
      const base = terrainHeightAt(local.x, local.z, hill.position.y);
      const rise = Math.pow(radial, 1.35) * 7.1;
      positions.push(x, base - hill.position.y + rise + .03, z);
      const tint = soil.clone().lerp(grass, .35 + .55 * radial);
      colours.push(tint.r, tint.g, tint.b);
      if (ix < nx && iz < nz) {
        const a = iz * (nx + 1) + ix;
        indices.push(a, a + nx + 1, a + 1,
          a + 1, a + nx + 1, a + nx + 2);
      }
    }
    const land = new THREE.BufferGeometry();
    land.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    land.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    land.setIndex(indices);
    land.computeVertexNormals();
    const bank = new THREE.Mesh(land, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    bank.name = 'landscaped spectator bank';
    bank.receiveShadow = true;
    hill.add(bank);
    addBox(hill, 'Lusail Hill viewing terrace', [18, .2, 32],
      materials.pale, [4, 7.28, 0]);
    const hillRails = [];
    for (let z = -15; z <= 15; z += 3)
      hillRails.push([-5.1, 8.0, z]);
    instancedBoxes(hill, 'Lusail Hill viewing rail', [.13, 1.3, .13],
      materials.steel, hillRails);
  }

  // The 2023 VVIP building has a distinctive roughly 60 m tree-like canopy.
  // The radial roof and its twelve branching columns are one mesh each.
  const vipSite = seek(turnU(1), outsideSide(turnU(1)), 240, 32, 32);
  let vip = null;
  if (vipSite) {
    vip = new THREE.Group();
    vip.name = 'Lusail Turn 1 VVIP tree canopy';
    vip.position.copy(vipSite.position);
    vip.position.y = terrainHeightAt(vipSite.position.x, vipSite.position.z,
      vipSite.frame.point.y - 1.1);
    vip.quaternion.copy(vipSite.frame.quaternion);
    group.add(vip);
    addBox(vip, 'VVIP pale podium', [38, .65, 30], materials.pale,
      [0, .45, 0]);
    addBox(vip, 'VVIP glazed hall', [31, 5.7, 24], materials.glazing,
      [0, 3.5, 0]);
    addBox(vip, 'VVIP deep horizontal shade', [39, .5, 32], materials.pale,
      [0, 6.7, 0]);
    const fins = [];
    for (let z = -11; z <= 11; z += 2.2)
      fins.push([-16, 3.7, z], [16, 3.7, z]);
    instancedBoxes(vip, 'VVIP mashrabiya screen', [.17, 5.3, .82],
      materials.mashrabiya, fins);
    const roofPoints = [], roofIndices = [];
    const sectors = 24;
    for (let i = 0; i < sectors; i++) {
      const a = i * Math.PI * 2 / sectors;
      const da = Math.PI * 2 / sectors;
      const inner = 5.8, outer = 29.5;
      roofPoints.push(
        Math.cos(a) * inner, 11.8, Math.sin(a) * inner,
        Math.cos(a) * outer, 14.8, Math.sin(a) * outer,
        Math.cos(a + da) * outer, 14.8, Math.sin(a + da) * outer,
        Math.cos(a + da) * inner, 11.8, Math.sin(a + da) * inner);
      const j = i * 4;
      roofIndices.push(j, j + 1, j + 3, j + 1, j + 2, j + 3);
    }
    const canopyGeometry = new THREE.BufferGeometry();
    canopyGeometry.setAttribute('position',
      new THREE.Float32BufferAttribute(roofPoints, 3));
    canopyGeometry.setIndex(roofIndices);
    canopyGeometry.computeVertexNormals();
    const canopy = new THREE.Mesh(canopyGeometry,
      new THREE.MeshStandardMaterial({ color: 0xd1c5ad, metalness: .12,
        roughness: .68, side: THREE.DoubleSide }));
    canopy.name = '60 m branching shade canopy';
    vip.add(canopy);
    const branch = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.15, .22, 1, 5),
      materials.steel, 12);
    branch.name = 'VVIP tree-like radial steel branches';
    const branchEnd = new THREE.Vector3();
    const branchStart = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      branchStart.set(Math.cos(a) * 3, 6.8, Math.sin(a) * 3);
      branchEnd.set(Math.cos(a) * 24, 14.2, Math.sin(a) * 24);
      const direction = branchEnd.clone().sub(branchStart);
      helper.position.copy(branchStart).add(branchEnd).multiplyScalar(.5);
      helper.quaternion.setFromUnitVectors(up, direction.clone().normalize());
      helper.scale.set(1, direction.length(), 1);
      helper.updateMatrix();
      branch.setMatrixAt(i, helper.matrix);
    }
    branch.instanceMatrix.needsUpdate = true;
    branch.frustumCulled = false;
    vip.add(branch);
  }

  // Satellite buildings are characteristic of the 2023 redevelopment.
  // Their exact footprints are illustrative, while road clearance is tested.
  const campus = [];
  for (const spec of [
    { name: 'Lusail medical and operations centre', turn: 5,
      size: [36, 8.4, 44], offset: 137 },
    { name: 'Qatar Motorsports Academy', turn: 9,
      size: [48, 7.6, 56], offset: 145 },
    { name: 'Lusail media and broadcast compound', turn: 13,
      size: [42, 9.2, 50], offset: 139 },
  ]) {
    const u = turnU(spec.turn);
    const [width, height, depth] = spec.size;
    const plot = seek(u, outsideSide(u), spec.offset,
      width / 2 + 9, depth / 2 + 9);
    if (!plot) continue;
    const building = new THREE.Group();
    building.name = spec.name;
    building.position.copy(plot.position);
    building.position.y = terrainHeightAt(plot.position.x, plot.position.z,
      plot.frame.point.y - 1.1);
    building.quaternion.copy(plot.frame.quaternion);
    group.add(building);
    addBox(building, 'landscaped building forecourt',
      [width + 16, .12, depth + 16], materials.concrete, [0, .12, 0]);
    addBox(building, 'pale desert architecture volume',
      [width, height, depth], materials.pale, [0, height / 2 + .22, 0]);
    addBox(building, 'deep roof overhang',
      [width + 3.2, .55, depth + 3.2], materials.pale,
      [0, height + .55, 0]);
    addBox(building, 'shaded central glass ribbon',
      [width + .12, 2.0, depth - 7], materials.glazing,
      [0, height * .59, 0]);
    const facadeFins = [], roofPlant = [];
    for (let z = -depth / 2 + 3; z < depth / 2 - 2; z += 5.2)
      facadeFins.push([-width / 2 - .18, height * .61, z],
        [width / 2 + .18, height * .61, z]);
    for (let z = -depth / 2 + 8; z < depth / 2 - 5; z += 16)
      roofPlant.push([0, height + 1.25, z]);
    instancedBoxes(building, 'screened facade fins',
      [.24, 3.2, 1.35], materials.mashrabiya, facadeFins);
    instancedBoxes(building, 'rooftop service enclosures',
      [6, 1.25, 7], materials.steel, roofPlant);
    campus.push(building);
  }

  // Ashghal reports roughly 15,000 parking places and 15 km of internal
  // roads. These graded spectator parking courts give the circuit the scale
  // of a real night-race venue without drawing individual lane polygons.
  const parking = [];
  for (const spec of [
    { u: (gridU + 92 / lapLength) % 1, side: -pitSide,
      offset: 255, width: 92, depth: 185 },
    { u: (gridU + 325 / lapLength) % 1, side: -pitSide,
      offset: 255, width: 94, depth: 176 },
    { u: turnU(8), side: outsideSide(turnU(8)),
      offset: 218, width: 76, depth: 142 },
    { u: turnU(13), side: outsideSide(turnU(13)),
      offset: 218, width: 80, depth: 148 },
  ]) {
    const plot = seek(spec.u, spec.side, spec.offset,
      spec.width / 2 + 8, spec.depth / 2 + 8);
    if (!plot) continue;
    const lot = new THREE.Group();
    lot.name = 'Lusail spectator parking and access court';
    lot.position.copy(plot.position);
    lot.position.y = terrainHeightAt(plot.position.x, plot.position.z,
      plot.frame.point.y - 1.1);
    lot.quaternion.copy(plot.frame.quaternion);
    group.add(lot);
    addBox(lot, 'graded parking foundation',
      [spec.width, 1.5, spec.depth], materials.dune, [0, -.42, 0]);
    addBox(lot, 'parking asphalt',
      [spec.width - 1.8, .14, spec.depth - 1.8], materials.asphalt,
      [0, .41, 0]);
    const lines = [], paleCars = [], blueCars = [];
    const places = Math.floor((spec.depth - 13) / 5.1);
    for (let row = -2; row <= 2; row++) {
      const x = row * 14.4;
      for (let col = 0; col < places; col++) {
        const z = -spec.depth / 2 + 7 + col * 5.1;
        lines.push([x - 5.2, .5, z], [x + 5.2, .5, z]);
        if ((col * 7 + row * 5 + parking.length * 11) % 4 === 0)
          (col % 3 ? paleCars : blueCars).push([x, 1.15, z + 1.9]);
      }
    }
    instancedBoxes(lot, 'parking stall line marks',
      [10.5, .025, .08], materials.pale, lines);
    instancedBoxes(lot, 'parked pale vehicles',
      [1.9, 1.1, 3.7], materials.pale, paleCars);
    instancedBoxes(lot, 'parked dark vehicles',
      [1.9, 1.1, 3.7], materials.blue, blueCars);
    const lamps = [];
    for (let z = -spec.depth / 2 + 12; z < spec.depth / 2 - 10; z += 31)
      lamps.push([-spec.width / 2 + 5, 5.7, z]);
    instancedBoxes(lot, 'parking light pillars',
      [.22, 10.4, .22], materials.steel, lamps);
    parking.push(lot);
  }
  const accessPlot = seek((gridU + 210 / lapLength) % 1,
    -pitSide, 371, 7, 205);
  let accessRoad = null;
  if (accessPlot) {
    accessRoad = new THREE.Group();
    accessRoad.name = 'Lusail outer service access road';
    accessRoad.position.copy(accessPlot.position);
    accessRoad.position.y = terrainHeightAt(accessPlot.position.x,
      accessPlot.position.z, accessPlot.frame.point.y - 1.1);
    accessRoad.quaternion.copy(accessPlot.frame.quaternion);
    group.add(accessRoad);
    addBox(accessRoad, 'service road graded shoulder',
      [13.5, .95, 405], materials.dune, [0, -.35, 0]);
    addBox(accessRoad, 'service access asphalt',
      [10.5, .1, 403], materials.asphalt, [0, .19, 0]);
    const roadMarks = [];
    for (let z = -195; z <= 195; z += 16)
      roadMarks.push([0, .27, z]);
    instancedBoxes(accessRoad, 'service access dashed centreline',
      [.12, .022, 5.8], materials.pale, roadMarks);
  }

  // Drought-tolerant planting and low clipped shrubs recall the real
  // landscaped circuit. Deliberately small compared with the night skyline.
  const reserved = [
    ...stands.map(item => ({ position: item.position, radius: 53 })),
    ...[paddockGroup, fanZone, hill, vip, accessRoad, ...campus, ...parking]
      .filter(Boolean).map(item => ({ position: item.position, radius: 70 })),
  ];
  let randomSeed = 184709;
  const random = () => ((randomSeed = (Math.imul(randomSeed, 1664525)
    + 1013904223) >>> 0) / 4294967296);
  const palms = [], shrubs = [];
  for (let metre = 27; metre < lapLength; metre += 54) {
    for (const side of [-1, 1]) {
      const u = metre / lapLength;
      const plot = site(u, side, 56 + random() * 87, 6, 6);
      if (!plot) continue;
      if (reserved.some(item => item.position.distanceToSquared(plot.position)
        < (item.radius + 8) ** 2)) continue;
      const y = terrainHeightAt(plot.position.x, plot.position.z,
        plot.frame.point.y - 1.1);
      const height = 4.0 + random() * 1.8;
      palms.push({ x: plot.position.x, y, z: plot.position.z, height,
        phase: random() * Math.PI * 2 });
      if (random() > .24) {
        const shrub = site(u, side, 65 + random() * 93, 2.1, 2.1,
          random() * 22 - 11);
        if (shrub) shrubs.push({
          x: shrub.position.x,
          y: terrainHeightAt(shrub.position.x, shrub.position.z,
            shrub.frame.point.y - 1.1),
          z: shrub.position.z, scale: .5 + random() * .75 });
      }
    }
  }
  if (palms.length) {
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.14, .31, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x7b6344, roughness: 1 }),
      palms.length);
    trunks.name = 'Lusail landscaped palm trunks';
    const frondGeometry = new THREE.BufferGeometry();
    frondGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -.55, .28, 1.65, 0, -.58, 4.0,
      0, 0, 0, 0, -.58, 4.0, .55, .28, 1.65,
    ], 3));
    frondGeometry.computeVertexNormals();
    const fronds = new THREE.InstancedMesh(frondGeometry,
      materials.leaf, palms.length * 7);
    fronds.name = 'Lusail seven-frond palm crowns';
    palms.forEach((palm, index) => {
      helper.position.set(palm.x, palm.y + palm.height / 2, palm.z);
      helper.quaternion.identity();
      helper.scale.set(1, palm.height, 1);
      helper.updateMatrix();
      trunks.setMatrixAt(index, helper.matrix);
      for (let leaf = 0; leaf < 7; leaf++) {
        helper.position.set(palm.x, palm.y + palm.height, palm.z);
        helper.rotation.set(0, palm.phase + leaf * Math.PI * 2 / 7, 0);
        helper.scale.set(.85 + palm.height * .05,
          .85 + palm.height * .05, .85 + palm.height * .05);
        helper.updateMatrix();
        fronds.setMatrixAt(index * 7 + leaf, helper.matrix);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    trunks.frustumCulled = false;
    fronds.frustumCulled = false;
    group.add(trunks, fronds);
  }
  if (shrubs.length) {
    const bushes = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0), materials.grass, shrubs.length);
    bushes.name = 'Lusail drought-tolerant low shrubs';
    shrubs.forEach((shrub, index) => {
      helper.position.set(shrub.x, shrub.y + shrub.scale * .54, shrub.z);
      helper.quaternion.identity();
      helper.scale.set(shrub.scale * 1.25, shrub.scale * .72,
        shrub.scale * 1.25);
      helper.updateMatrix();
      bushes.setMatrixAt(index, helper.matrix);
    });
    bushes.instanceMatrix.needsUpdate = true;
    bushes.frustumCulled = false;
    group.add(bushes);
  }
  return { group, grandstandCount: stands.length,
    floodlightCount: mastPositions.length, palmCount: palms.length,
    shrubCount: shrubs.length, campusBuildingCount: campus.length,
    parkingCount: parking.length,
    landmarks: { stands, paddock: paddockGroup, fanZone, hill, vip, campus,
      parking, accessRoad },
    updateLighting() {}, setWetLighting() {} };
}
