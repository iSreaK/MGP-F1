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
  // The FIA centreline loops close to itself here. A landmark offset from one
  // corner can still cover another stretch of road, so reserve its full ground
  // footprint against every centreline segment and against the city blocks.
  const esplanadeU = turnU(14) ?? .62;
  const esplanadeFrame = frameAt(esplanadeU);
  const esplanadeSite = worldAt(esplanadeU, -115, 20);
  esplanadeSite.x += 45;
  const grandstandSpecs = [
    [1, 1, -120, 70], [2, -1, 35, 65], [7, 1, -65, 80],
    [10, -1, 48, 72], [18, -1, -55, 100], [19, 1, -95, 85],
  ];
  const grandstandSites = grandstandSpecs.flatMap(([corner, side, shift, width]) => {
    const u = turnU(corner);
    if (!Number.isFinite(u)) return [];
    const frame = frameAt(u + shift / length);
    const position = frame.point.clone().addScaledVector(frame.across,
      side * (halfWidth + 29));
    // The original T2 stand cut across the returning T3 section. Place it
    // farther along the same straight, behind its barrier and aligned with it.
    if (corner === 2) position.addScaledVector(frame.across, -50)
      .addScaledVector(frame.forward, 60);
    position.y = 0;
    return [{ corner, side, shift, width, frame, position }];
  });
  const flyerU = turnU(18) ?? .94;
  const flyerFrame = frameAt(flyerU);
  const flyerSite = worldAt(flyerU, 150, 18);
  const sandsU = turnU(16) ?? .79;
  const helixStart = worldAt(sandsU, 300, -80);
  const helixEnd = worldAt(flyerU, 140, -130);
  const segmentDistance = (point, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1,
      ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
  };
  const overlapsLandmark = (point, radius) => {
    const esplanadeDelta = point.clone().sub(esplanadeSite);
    if (Math.abs(esplanadeDelta.dot(esplanadeFrame.across)) < 59 + radius
      && Math.abs(esplanadeDelta.dot(esplanadeFrame.forward)) < 29 + radius) return true;
    const flyerDelta = point.clone().sub(flyerSite);
    if (Math.abs(flyerDelta.dot(flyerFrame.across)) < 79 + radius
      && Math.abs(flyerDelta.dot(flyerFrame.forward)) < 9 + radius) return true;
    if (segmentDistance(point, helixStart, helixEnd) < 9 + radius) return true;
    for (const site of grandstandSites) {
      const delta = point.clone().sub(site.position);
      if (Math.abs(delta.dot(site.frame.across) - site.side * 12) < 18 + radius
        && Math.abs(delta.dot(site.frame.forward)) < (site.width + 5) / 2 + radius) {
        return true;
      }
    }
    return false;
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
    if (overlapsLandmark(point, Math.hypot(width, depth) * .5 + 3)) continue;
    const bayDelta = point.clone().sub(waterPosition);
    const bayLateral = bayDelta.dot(waterFrame.across);
    const bayAlong = bayDelta.dot(waterFrame.forward);
    if (Math.abs(bayLateral) < 195 && Math.abs(bayAlong) < 365) continue;
    if (Math.abs(u - gridU) < .11 && side < 0) continue;
    const style = height > 80 ? 0 : height > 38 ? 1 : 2;
    buildings.push({ point, width, depth, height, quaternion: frame.quaternion,
      style, colour: style === 0
        ? random() < .5 ? 0x9fbbc6 : 0x819aa5
        : style === 1 ? random() < .5 ? 0xbab5a8 : 0x8f9a9b
          : random() < .5 ? 0xaaa69b : 0x879090 });
  }
  const facadeTextures = [0, 1, 2].map(style => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ['#374a59', '#4d5354', '#6b6e6d'][style];
    ctx.fillRect(0, 0, 128, 256);
    const rows = [21, 15, 8][style];
    const cols = [10, 8, 6][style];
    const cellW = 128 / cols, cellH = 256 / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const lit = random() > [.32, .52, .66][style];
      ctx.fillStyle = lit
        ? (random() < [.78, .28, .35][style] ? '#b7d6e2' : '#ddc497')
        : ['#1b303c', '#2d3335', '#434a48'][style];
      ctx.fillRect(col * cellW + cellW * .19, row * cellH + cellH * .25,
        cellW * .61, cellH * .43);
    }
    if (style === 2) {
      ctx.fillStyle = '#7d8581';
      for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 128, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  const facadeTexture = facadeTextures[0];
  const instanceColour = new THREE.Color();
  for (let style = 0; style < facadeTextures.length; style++) {
    const sameStyle = buildings.filter(building => building.style === style);
    if (!sameStyle.length) continue;
    const texture = facadeTextures[style];
    const material = new THREE.MeshStandardMaterial({ map: texture,
      color: 0xffffff, vertexColors: true,
      metalness: style === 0 ? .32 : .13,
      roughness: style === 0 ? .48 : .78,
      emissiveMap: texture,
      emissive: style === 0 ? 0x9bbbc6 : 0xe0bd8e,
      emissiveIntensity: style === 0 ? .52 : .37 });
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      material, sameStyle.length);
    blocks.name = ['Marina Bay glass office towers',
      'Marina Bay hotels and apartments', 'Marina Bay civic low rises'][style];
    for (let i = 0; i < sameStyle.length; i++) {
      const building = sameStyle[i];
      helper.position.copy(building.point);
      helper.position.y = building.height / 2;
      helper.quaternion.copy(building.quaternion);
      helper.scale.set(building.width, building.height, building.depth);
      helper.updateMatrix();
      blocks.setMatrixAt(i, helper.matrix);
      blocks.setColorAt(i, instanceColour.setHex(building.colour));
    }
    blocks.instanceMatrix.needsUpdate = true;
    blocks.instanceColor.needsUpdate = true;
    blocks.frustumCulled = false;
    group.add(blocks);
  }
  const crownBuildings = buildings.filter((_, index) => index % 2 === 0);
  const crowns = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true,
      transparent: true, opacity: .72, depthWrite: false,
      toneMapped: false }), crownBuildings.length);
  crowns.name = 'Illuminated hotel and office rooflines';
  for (let i = 0; i < crownBuildings.length; i++) {
    const building = crownBuildings[i];
    helper.position.copy(building.point);
    helper.position.y = building.height + .18;
    helper.quaternion.copy(building.quaternion);
    helper.scale.set(building.width + .8, .35, building.depth + .8);
    helper.updateMatrix();
    crowns.setMatrixAt(i, helper.matrix);
    crowns.setColorAt(i, instanceColour.setHex(building.style === 0
      ? 0x729eac : building.style === 1 ? 0xbaa485 : 0x9da9a0));
  }
  crowns.instanceMatrix.needsUpdate = true;
  crowns.instanceColor.needsUpdate = true;
  crowns.frustumCulled = false;
  group.add(crowns);

  // Singapore Flyer: the 165 m observation wheel lies beside the T18/T19
  // section and serves as a strong location cue during helicopter shots.
  const flyer = new THREE.Group();
  flyer.name = 'Singapore Flyer observation wheel, stylised';
  flyer.position.copy(flyerSite);
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

  // The lotus-shaped ArtScience Museum and the Helix Bridge make the Marina
  // Bay side recognisable from a race camera. Their offsets follow the 2025
  // circuit-park map's relative arrangement, not surveyed building footprints.
  const museum = new THREE.Group();
  museum.name = 'ArtScience Museum illuminated lotus';
  museum.position.copy(worldAt(sandsU, 250, -110));
  museum.quaternion.copy(sandsFrame.quaternion);
  group.add(museum);
  const museumStone = new THREE.MeshStandardMaterial({ color: 0xd8d9cf,
    roughness: .73, emissive: 0x728597, emissiveIntensity: .26,
    side: THREE.DoubleSide });
  const museumBase = new THREE.Mesh(new THREE.CylinderGeometry(33, 36, 5, 20),
    museumStone);
  museumBase.position.y = 2.5;
  museum.add(museumBase);
  const museumRim = new THREE.Mesh(new THREE.TorusGeometry(34.5, .34, 5, 48),
    new THREE.MeshBasicMaterial({ color: 0xd5e2df, toneMapped: false }));
  museumRim.rotation.x = Math.PI / 2;
  museumRim.position.y = 5.1;
  museum.add(museumRim);
  const museumGlass = new THREE.Mesh(new THREE.CylinderGeometry(13, 22, 31, 12),
    glass);
  museumGlass.position.y = 20;
  museum.add(museumGlass);
  const petalShape = new THREE.Shape();
  petalShape.moveTo(-2.2, 5);
  petalShape.quadraticCurveTo(4, 15, 8, 36);
  petalShape.quadraticCurveTo(12, 51, 18, 55);
  petalShape.quadraticCurveTo(12, 60, 7, 50);
  petalShape.quadraticCurveTo(1, 30, -2.2, 5);
  const petalGeometry = new THREE.ExtrudeGeometry(petalShape, {
    depth: 2.4, bevelEnabled: true, bevelThickness: .45,
    bevelSize: .5, bevelSegments: 2, curveSegments: 9,
  });
  const petals = new THREE.InstancedMesh(petalGeometry, museumStone, 10);
  petals.name = 'Ten ArtScience lotus petals';
  for (let i = 0; i < 10; i++) {
    helper.position.set(0, 0, 0);
    helper.quaternion.setFromAxisAngle(up, i * Math.PI / 5);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    petals.setMatrixAt(i, helper.matrix);
  }
  petals.instanceMatrix.needsUpdate = true;
  museum.add(petals);

  const bridgeStart = helixStart;
  const bridgeEnd = helixEnd;
  const bridgeForward = bridgeEnd.clone().sub(bridgeStart).setY(0);
  const bridgeLength = bridgeForward.length();
  bridgeForward.normalize();
  const bridgeAcross = new THREE.Vector3(bridgeForward.z, 0, -bridgeForward.x);
  const helix = new THREE.Group();
  helix.name = 'Helix Bridge over Marina Bay';
  helix.position.copy(bridgeStart).add(bridgeEnd).multiplyScalar(.5);
  helix.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    bridgeAcross, up, bridgeForward));
  group.add(helix);
  const bridgeSteel = new THREE.MeshStandardMaterial({ color: 0xaabcc2,
    metalness: .55, roughness: .4, emissive: 0x6e9aad, emissiveIntensity: .36 });
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(12.5, .72, bridgeLength),
    new THREE.MeshStandardMaterial({ color: 0x5b686d, roughness: .83 }));
  bridgeDeck.position.y = 6.8;
  helix.add(bridgeDeck);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.32, 1.15, bridgeLength),
      bridgeSteel);
    rail.position.set(side * 6.2, 8, 0);
    helix.add(rail);
    const litEdge = new THREE.Mesh(new THREE.BoxGeometry(.48, .16, bridgeLength),
      new THREE.MeshBasicMaterial({ color: 0x9bbfc4, toneMapped: false }));
    litEdge.position.set(side * 5.8, 7.7, 0);
    helix.add(litEdge);
    for (const phaseOffset of [0, Math.PI]) {
      const points = [];
      for (let i = 0; i <= 128; i++) {
        const t = i / 128;
        const phase = t * Math.PI * 14 + phaseOffset;
        points.push(new THREE.Vector3(side * (7.2 + Math.cos(phase) * 1.5),
          12 + Math.sin(phase) * 3.4, (t - .5) * bridgeLength));
      }
      const rib = new THREE.Mesh(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points), 256, .27, 6, false), bridgeSteel);
      rib.name = 'Illuminated Helix Bridge rib';
      helix.add(rib);
    }
  }

  // Twin Esplanade domes are low across the bay from the tall hotel skyline.
  const esplanade = new THREE.Group();
  esplanade.name = 'Esplanade theatres, twin domes';
  esplanade.position.copy(esplanadeSite);
  esplanade.quaternion.copy(esplanadeFrame.quaternion);
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
  // Each stand is a temporary scaffold, rather than five floating rows of
  // seats. One instanced draw call per stand keeps the uprights and bracing
  // visible from track level without multiplying the scene's draw calls.
  // A little wider and lighter than scale scaffold tubing: from a moving
  // camera tens of metres away, true-size tubes disappear into the night.
  const scaffoldSection = new THREE.BoxGeometry(.5, 1, .5);
  const scaffoldMetal = new THREE.MeshStandardMaterial({ color: 0x9db6bc,
    metalness: .45, roughness: .56, emissive: 0x263b40,
    emissiveIntensity: .58 });
  const scaffoldHelper = new THREE.Object3D();
  const scaffoldDirection = new THREE.Vector3();
  const scaffoldMidpoint = new THREE.Vector3();
  const scaffoldStart = new THREE.Vector3();
  const scaffoldEnd = new THREE.Vector3();
  const addScaffoldBeam = (mesh, index, x1, y1, z1, x2, y2, z2, width = .5) => {
    scaffoldStart.set(x1, y1, z1);
    scaffoldEnd.set(x2, y2, z2);
    scaffoldDirection.subVectors(scaffoldEnd, scaffoldStart);
    scaffoldMidpoint.addVectors(scaffoldStart, scaffoldEnd).multiplyScalar(.5);
    scaffoldHelper.position.copy(scaffoldMidpoint);
    scaffoldHelper.quaternion.setFromUnitVectors(up, scaffoldDirection.clone().normalize());
    scaffoldHelper.scale.set(width / .5, scaffoldDirection.length(), width / .5);
    scaffoldHelper.updateMatrix();
    mesh.setMatrixAt(index, scaffoldHelper.matrix);
  };
  for (const { corner, side, width, frame, position } of grandstandSites) {
    const stand = new THREE.Group();
    stand.name = `Singapore spectator grandstand near turn ${corner}`;
    stand.position.copy(position);
    stand.quaternion.copy(frame.quaternion);
    group.add(stand);
    const stationCount = Math.max(4, Math.ceil(width / 13));
    const stations = Array.from({ length: stationCount }, (_, index) =>
      -width / 2 + 3 + index * (width - 6) / (stationCount - 1));
    // Two legs and a transverse bearer below each tier at every station;
    // a diagonal on alternating stations stiffens the frame visibly.
    const diagonalCount = Math.ceil(stationCount / 2);
    const scaffold = new THREE.InstancedMesh(scaffoldSection, scaffoldMetal,
      5 * (stationCount * 3 + diagonalCount) + 2 * diagonalCount
      + stationCount * 3);
    scaffold.name = 'Grandstand steel legs and diagonal scaffold bracing';
    let beam = 0;
    for (let tier = 0; tier < 5; tier++) {
      const centre = side * tier * 5.7;
      const underside = 2.29 + tier * 2.5;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.2, .42, width),
        tier % 2 ? dark : roof);
      deck.position.set(centre, 2.5 + tier * 2.5, 0);
      stand.add(deck);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(4.5, .25, width - 2),
        tier % 3 === 0 ? pale : new THREE.MeshStandardMaterial({
          color: 0xb12832, roughness: .85 }));
      seats.position.set(centre, 2.85 + tier * 2.5, 0);
      stand.add(seats);
      for (let station = 0; station < stations.length; station++) {
        const z = stations[station];
        const front = centre - side * 2.3;
        const back = centre + side * 2.3;
        addScaffoldBeam(scaffold, beam++, front, .04, z,
          front, underside, z);
        addScaffoldBeam(scaffold, beam++, back, .04, z,
          back, underside, z);
        addScaffoldBeam(scaffold, beam++, front, underside - .12, z,
          back, underside - .12, z, .36);
        if (station % 2 === 0) {
          addScaffoldBeam(scaffold, beam++, front, .12, z,
            back, underside - .16, z, .4);
        }
      }
    }
    // Open triangular frames, rather than a solid skirt, make the support
    // legible even from the opposite side of the straight.
    for (const z of stations) {
      addScaffoldBeam(scaffold, beam++, -side * 2.3, .12, z,
        side * 25.1, 12.29, z, .66);
      addScaffoldBeam(scaffold, beam++, -side * 2.3, .025, z,
        -side * 2.3, .17, z, .95);
      addScaffoldBeam(scaffold, beam++, side * 25.1, .025, z,
        side * 25.1, .17, z, .95);
    }
    for (let station = 0; station < stations.length; station += 2) {
      const z = stations[station];
      // Rear columns meet the roof, and a shallow raker carries its
      // cantilevered edge without poles obscuring the first seating tier.
      addScaffoldBeam(scaffold, beam++, side * 24.8, 12.72, z,
        side * 24.8, 16.1, z, .55);
      addScaffoldBeam(scaffold, beam++, side * 24.8, 14.1, z,
        side * .4, 16.05, z, .42);
    }
    scaffold.instanceMatrix.needsUpdate = true;
    stand.add(scaffold);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(35, .8, width + 5),
      roof);
    canopy.position.set(side * 12, 16.5, 0);
    stand.add(canopy);
    stands.push(stand);
  }

  return { group, buildingCount: buildings.length, grandstandCount: stands.length,
    landmarks: { flyer, sands, museum, helix, esplanade, water } };
}
