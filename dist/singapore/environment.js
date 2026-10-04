/**
 * Marina Bay scenery. The circuit centreline is traced from the FIA drawing,
 * but that drawing is not georeferenced: skyline offsets and building shapes
 * below are recognisable visual reconstructions, not surveyed coordinates.
 */
export function addSingaporeEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const {
    trackY = .36,
    halfWidth = 5,
    gridU = 0,
    sourceFractions = [],
  } = options;
  const group = new THREE.Group();
  group.name = 'Marina Bay urban night environment';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const length = curve.getLength();

  function randomGenerator(seed) {
    let value = seed >>> 0;
    return () => ((value = Math.imul(value, 1664525) + 1013904223 >>> 0) / 4294967296);
  }
  const random = randomGenerator(5808);
  const turnU = number => sourceFractions[landmarks?.turns?.[`T${number}`]?.index] ?? null;
  const frameAt = u => {
    const t = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(t);
    const forward = curve.getTangentAt(t).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward));
    return { point, forward, across, quaternion };
  };
  const worldAt = (u, across, forward = 0) => {
    const frame = frameAt(u);
    return frame.point.clone().addScaledVector(frame.across, across)
      .addScaledVector(frame.forward, forward).setY(0);
  };

  const plazaMaterial = new THREE.MeshStandardMaterial({ color: 0x384047,
    roughness: .93, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ca7ad,
    metalness: .46, roughness: .57 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x51748a,
    metalness: .54, roughness: .24, emissive: 0x142b39,
    emissiveIntensity: .95 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xb7bdc0,
    roughness: .78 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222e38,
    metalness: .2, roughness: .66 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x6d7980,
    metalness: .3, roughness: .62 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xdcefff });

  // Low paved strips and a soft quay edge suggest the real street course's
  // pavements without adding large green Monza-style run-off areas.
  const pavementPanels = [];
  for (let i = 0; i < frames.length; i += 2) {
    const a = frames[i], b = frames[(i + 2) % frames.length];
    for (const side of [-1, 1]) {
      const width = 8.2;
      const first = pavementPanels.length / 3;
      for (const [frame, offset] of [
        [a, side * (halfWidth + 2.9)], [a, side * (halfWidth + width)],
        [b, side * (halfWidth + 2.9)], [b, side * (halfWidth + width)],
      ]) {
        pavementPanels.push(frame.point.x + frame.across.x * offset,
          trackY - .12, frame.point.z + frame.across.z * offset);
      }
    }
  }
  const pavementIndices = [];
  for (let i = 0; i < pavementPanels.length / 12; i++) {
    const k = i * 4;
    pavementIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const pavementGeometry = new THREE.BufferGeometry();
  pavementGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pavementPanels, 3));
  pavementGeometry.setIndex(pavementIndices);
  pavementGeometry.computeVertexNormals();
  const pavements = new THREE.Mesh(pavementGeometry, plazaMaterial);
  pavements.name = 'Paved city streets behind the barriers';
  pavements.receiveShadow = true;
  group.add(pavements);

  // Shared spatial lookup for water and buildings. It protects the actual
  // mapped circuit from scenery placed by approximate visual landmarks.
  const cells = new Map();
  const cellSize = 85;
  const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  for (let i = 0; i < frames.length; i += 3) {
    const p = frames[i].point;
    const id = key(p.x, p.z);
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(p);
  }
  const trackClearance = (x, z) => {
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
    let best = Infinity;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const bucket = cells.get(`${cx + dx},${cz + dz}`);
      if (!bucket) continue;
      for (const p of bucket) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
    }
    return best;
  };

  const waterAnchor = turnU(15) ?? .67;
  const waterFrame = frameAt(waterAnchor);
  const waterPosition = worldAt(waterAnchor, 230, 15);
  const waterVertices = [];
  const waterIndices = [];
  const waterCell = 10;
  const inBay = (lateral, along, x, z) => {
    const taper = Math.max(0, (Math.abs(along) - 235) * .32);
    return Math.abs(lateral) < 164 - taper
      && Math.abs(along) < 335
      && trackClearance(x, z) > 48;
  };
  // A tessellated irregular shoreline, cut away wherever another section of
  // the circuit approaches. A single rectangular plane covered ~370 m of road.
  for (let across = -165; across < 165; across += waterCell) {
    for (let along = -335; along < 335; along += waterCell) {
      const x = across + waterCell / 2;
      const z = along + waterCell / 2;
      const p = waterPosition.clone().addScaledVector(waterFrame.across, x)
        .addScaledVector(waterFrame.forward, z);
      if (!inBay(x, z, p.x, p.z)) continue;
      const k = waterVertices.length / 3;
      for (const [lateral, station] of [
        [across, along], [across + waterCell, along],
        [across, along + waterCell], [across + waterCell, along + waterCell],
      ]) {
        const vertex = waterPosition.clone().addScaledVector(waterFrame.across, lateral)
          .addScaledVector(waterFrame.forward, station);
        waterVertices.push(vertex.x, -.014, vertex.z);
      }
      waterIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterVertices, 3));
  waterGeometry.setIndex(waterIndices);
  waterGeometry.computeVertexNormals();
  const water = new THREE.Mesh(waterGeometry,
    new THREE.MeshBasicMaterial({ color: 0x164458, side: THREE.DoubleSide }));
  water.name = 'Marina Bay dark water, approximate shoreline';
  group.add(water);
  const reflections = [];
  for (let i = 0; i < 560; i++) {
    const lateral = (random() - .5) * 290;
    const station = (random() - .5) * 640;
    const p = waterPosition.clone().addScaledVector(waterFrame.across, lateral)
      .addScaledVector(waterFrame.forward, station);
    if (!inBay(lateral, station, p.x, p.z)) continue;
    reflections.push(p.x - .5 - random() * 2, .002, p.z,
      p.x + .5 + random() * 2, .002, p.z);
  }
  const glintGeometry = new THREE.BufferGeometry();
  glintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(reflections, 3));
  const glints = new THREE.LineSegments(glintGeometry,
    new THREE.LineBasicMaterial({ color: 0x82b3c9, transparent: true,
      opacity: .37, depthWrite: false }));
  glints.name = 'Subtle waterfront reflections';
  group.add(glints);

  // A deterministic city skyline uses only a handful of instanced draw calls.
  // Buildings are kept clear of the racing surface and grandstands by the
  // spatial lookup against the sampled FIA centreline.
  const buildings = [];
  for (let i = 0; i < 220; i++) {
    const u = random();
    const side = random() < .5 ? -1 : 1;
    const range = 46 + random() * 115;
    const frame = frameAt(u);
    const point = frame.point.clone().addScaledVector(frame.across, side * range)
      .addScaledVector(frame.forward, (random() - .5) * 65);
    const width = 13 + random() * 24;
    const depth = 16 + random() * 32;
    const height = 17 + random() ** 2 * 110;
    const nearest = trackClearance(point.x, point.z);
    if (nearest < Math.max(width, depth) * .58 + 27) continue;
    const bayDelta = point.clone().sub(waterPosition);
    const bayLateral = bayDelta.dot(waterFrame.across);
    const bayAlong = bayDelta.dot(waterFrame.forward);
    if (Math.abs(bayLateral) < 195 && Math.abs(bayAlong) < 365) continue;
    if (Math.abs(u - gridU) < .11 && side < 0) continue;
    buildings.push({ point, width, depth, height, quaternion: frame.quaternion,
      colour: random() < .5 ? 0xb5c4ca : 0x9eabb1 });
  }
  const facadeTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#526976';
    ctx.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 20; row++) for (let col = 0; col < 8; col++) {
      const lit = random() > .39;
      ctx.fillStyle = lit ? (random() < .67 ? '#b8d8e5' : '#d9c7a1') : '#263e4b';
      ctx.fillRect(col * 16 + 3, row * 12 + 3, 9, 6);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const buildingMaterial = new THREE.MeshStandardMaterial({ map: facadeTexture,
    color: 0xffffff, vertexColors: true, metalness: .28, roughness: .62,
    emissiveMap: facadeTexture, emissive: 0xb4d9eb, emissiveIntensity: .72 });
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    buildingMaterial, buildings.length);
  blocks.name = 'Marina Bay office and hotel blocks';
  const instanceColour = new THREE.Color();
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    helper.position.copy(building.point);
    helper.position.y = building.height / 2;
    helper.quaternion.copy(building.quaternion);
    helper.scale.set(building.width, building.height, building.depth);
    helper.updateMatrix();
    blocks.setMatrixAt(i, helper.matrix);
    blocks.setColorAt(i, instanceColour.setHex(building.colour));
  }
  blocks.instanceMatrix.needsUpdate = true;
  if (buildings.length) blocks.instanceColor.needsUpdate = true;
  blocks.frustumCulled = false;
  group.add(blocks);
  const crownBuildings = buildings.filter((_, index) => index % 3 === 0);
  const crowns = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x729eac, transparent: true,
      opacity: .76, depthWrite: false }), crownBuildings.length);
  crowns.name = 'Subtle illuminated hotel and office rooflines';
  for (let i = 0; i < crownBuildings.length; i++) {
    const building = crownBuildings[i];
    helper.position.copy(building.point);
    helper.position.y = building.height + .18;
    helper.quaternion.copy(building.quaternion);
    helper.scale.set(building.width + .8, .35, building.depth + .8);
    helper.updateMatrix();
    crowns.setMatrixAt(i, helper.matrix);
  }
  crowns.instanceMatrix.needsUpdate = true;
  crowns.frustumCulled = false;
  group.add(crowns);

  // Singapore Flyer: the 165 m observation wheel lies beside the T18/T19
  // section and serves as a strong location cue during helicopter shots.
  const flyerU = turnU(18) ?? .94;
  const flyerFrame = frameAt(flyerU);
  const flyer = new THREE.Group();
  flyer.name = 'Singapore Flyer observation wheel, stylised';
  flyer.position.copy(worldAt(flyerU, 150, 18));
  flyer.quaternion.copy(flyerFrame.quaternion);
  group.add(flyer);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(74, 2.15, 9, 96), lamp);
  rim.position.y = 87;
  flyer.add(rim);
  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(70.2, .72, 7, 96), metal);
  innerRim.position.y = 87;
  flyer.add(innerRim);
  const spokes = [];
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    spokes.push(0, 87, 0, Math.cos(angle) * 73, 87 + Math.sin(angle) * 73, 0);
  }
  const spokesGeometry = new THREE.BufferGeometry();
  spokesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
  const radial = new THREE.LineSegments(spokesGeometry,
    new THREE.LineBasicMaterial({ color: 0x97b4c0, transparent: true, opacity: .7 }));
  flyer.add(radial);
  const capsules = new THREE.InstancedMesh(new THREE.SphereGeometry(3.1, 8, 5),
    glass, 28);
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    helper.position.set(Math.cos(angle) * 74, 87 + Math.sin(angle) * 74, 0);
    helper.quaternion.identity();
    helper.scale.set(1.1, .85, .72);
    helper.updateMatrix();
    capsules.setMatrixAt(i, helper.matrix);
  }
  capsules.instanceMatrix.needsUpdate = true;
  flyer.add(capsules);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 2.0, 93, 7), metal);
    leg.position.set(side * 14, 43, 0);
    leg.rotation.z = side * .31;
    flyer.add(leg);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 10, 12), metal);
  axle.position.y = 87;
  axle.rotation.x = Math.PI / 2;
  flyer.add(axle);

  // Marina Bay Sands appears across the water from the southern circuit arc.
  // The three towers and projecting skypark are dimensional approximations.
  const sandsU = turnU(16) ?? .79;
  const sandsFrame = frameAt(sandsU);
  const sands = new THREE.Group();
  sands.name = 'Marina Bay Sands hotel and skypark, stylised';
  sands.position.copy(worldAt(sandsU, 440, -90));
  sands.quaternion.copy(sandsFrame.quaternion);
  group.add(sands);
  for (let i = -1; i <= 1; i++) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(42, 190, 37),
      new THREE.MeshStandardMaterial({ map: facadeTexture, emissiveMap: facadeTexture,
        emissive: 0xc9e4ec, emissiveIntensity: .84, color: 0xc2cbd1,
        metalness: .3, roughness: .55 }));
    tower.position.set(i * 80, 95, 0);
    tower.rotation.z = i * -.035;
    sands.add(tower);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(48, 9, 47), pale);
    plinth.position.set(i * 80, 4.5, 0);
    sands.add(plinth);
  }
  const towerEdges = new THREE.InstancedMesh(new THREE.BoxGeometry(.72, 183, .72),
    new THREE.MeshBasicMaterial({ color: 0x86b8c9, transparent: true,
      opacity: .66 }), 6);
  for (let tower = 0; tower < 3; tower++) for (let side = 0; side < 2; side++) {
    helper.position.set((tower - 1) * 80 + (side ? 20.8 : -20.8), 96, 18.9);
    helper.quaternion.identity();
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    towerEdges.setMatrixAt(tower * 2 + side, helper.matrix);
  }
  towerEdges.instanceMatrix.needsUpdate = true;
  sands.add(towerEdges);
  const skypark = new THREE.Mesh(new THREE.BoxGeometry(280, 11, 55), roof);
  skypark.position.set(5, 197, 0);
  sands.add(skypark);
  for (const x of [-137, 147]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(27.5, 27.5, 11, 24), roof);
    cap.position.set(x, 197, 0);
    sands.add(cap);
  }
  const skyparkRim = new THREE.Mesh(new THREE.BoxGeometry(304, .42, 56),
    new THREE.MeshBasicMaterial({ color: 0x9ccbd9 }));
  skyparkRim.position.set(5, 202.9, 0);
  sands.add(skyparkRim);

  // Twin Esplanade domes are low across the bay from the tall hotel skyline.
  const esplanadeU = turnU(14) ?? .62;
  const esplanade = new THREE.Group();
  esplanade.name = 'Esplanade theatres, twin domes';
  esplanade.position.copy(worldAt(esplanadeU, -115, 20));
  esplanade.quaternion.copy(frameAt(esplanadeU).quaternion);
  group.add(esplanade);
  for (const x of [-31, 31]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(53, 8, 55), pale);
    base.position.set(x, 4, 0);
    esplanade.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(27, 18, 9, 0,
      Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({
      color: 0x9b9e91, metalness: .21, roughness: .73,
      wireframe: false }));
    dome.scale.set(1, .75, 1);
    dome.position.set(x, 8, 0);
    esplanade.add(dome);
  }

  // Six modest stands create sightline landmarks without implying that every
  // stretch of the street circuit is surrounded by permanent spectator seats.
  const stands = [];
  for (const [corner, side, shift, width] of [
    [1, 1, -120, 70], [2, -1, 35, 65], [7, 1, -65, 80],
    [10, -1, 48, 72], [18, -1, -55, 100], [19, 1, -95, 85],
  ]) {
    const u = turnU(corner);
    if (!Number.isFinite(u)) continue;
    const frame = frameAt(u + shift / length);
    const stand = new THREE.Group();
    stand.name = `Singapore spectator grandstand near turn ${corner}`;
    stand.position.copy(frame.point).addScaledVector(frame.across,
      side * (halfWidth + 29));
    stand.position.y = 0;
    stand.quaternion.copy(frame.quaternion);
    group.add(stand);
    for (let tier = 0; tier < 5; tier++) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.2, .42, width),
        tier % 2 ? dark : roof);
      deck.position.set(side * (tier * 5.7), 2.5 + tier * 2.5, 0);
      stand.add(deck);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(4.5, .25, width - 2),
        tier % 3 === 0 ? pale : new THREE.MeshStandardMaterial({
          color: 0xb12832, roughness: .85 }));
      seats.position.set(side * (tier * 5.7), 2.85 + tier * 2.5, 0);
      stand.add(seats);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(35, .8, width + 5),
      roof);
    canopy.position.set(side * 12, 16.5, 0);
    stand.add(canopy);
    stands.push(stand);
  }

  return { group, buildingCount: buildings.length, grandstandCount: stands.length,
    landmarks: { flyer, sands, esplanade, water } };
}
