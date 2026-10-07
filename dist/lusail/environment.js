/**
 * Lusail venue landmarks. Stand locations follow the official 2025 venue map
 * and F1 fan guide; dimensions and facades are visual reconstructions.
 * https://www.fia.com/sites/default/files/media_kit_-_2025_qatar_grand_prix_2.pdf
 * https://www.formula1.com/en/latest/article/speed-desert-and-doha-the-ultimate-fan-guide-to-the-qatar-grand-prix.7pVRowHi0gVBHEROf7d9B0
 * Repeated columns, seats and floodlights are instanced. No decorative base
 * is accepted unless its footprint clears every sampled branch of the track.
 */
export function addLusailEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const { halfWidth = 6, gridU = 0, sourceFractions = [], pitSide = 1 } = options;
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
    transforms.forEach(([x,y,z,sx=1,sy=1,sz=1], i) => {
      helper.position.set(x,y,z); helper.quaternion.identity();
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
    { name: 'T2 Grandstand', u: turnU(2), side: -1, length: 100, rows: 9, offset: 58 },
    { name: 'T3 Grandstand', u: turnU(3), side: -1, length: 70, rows: 8, offset: 60 },
    { name: 'T16 Grandstand', u: turnU(16), side: -1, length: 85, rows: 9, offset: 58 },
  ];
  for (const spec of standSpecs) {
    const centre = seek(spec.u, spec.side, spec.offset, 19, spec.length / 2);
    if (!centre) continue;
    const stand = new THREE.Group();
    stand.name = `Lusail ${spec.name}`;
    stand.position.copy(centre.position); stand.position.y = centre.frame.point.y - 1.1;
    stand.quaternion.copy(centre.frame.quaternion);
    group.add(stand); stands.push(stand);
    addBox(stand, 'spectator concourse', [30, .42, spec.length], materials.concrete,
      [0, .34, 0]);
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
  }

  // The 2025 venue map places the F1 paddock, media centre and fan area
  // behind the pit building. Their decorative volumes must clear both tracks.
  const paddock = seek(gridU, pitSide, 112, 36, 112);
  let paddockGroup = null;
  if (paddock) {
    paddockGroup = new THREE.Group();
    paddockGroup.name = 'Lusail paddock hospitality and media centre';
    paddockGroup.position.copy(paddock.position);
    paddockGroup.position.y = paddock.frame.point.y - 1.1;
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
    helper.position.copy(position); helper.position.y = frame.point.y + 9.9;
    helper.quaternion.identity(); helper.scale.set(1, 1, 1); helper.updateMatrix();
    poles.setMatrixAt(i, helper.matrix);
    helper.position.y = frame.point.y + 21.0;
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
    fanZone.position.y = fanSite.frame.point.y - 1.1;
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
  return { group, grandstandCount: stands.length,
    floodlightCount: mastPositions.length,
    landmarks: { stands, paddock: paddockGroup, fanZone },
    updateLighting() {}, setWetLighting() {} };
}
