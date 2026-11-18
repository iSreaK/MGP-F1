// Current Spa venue: Raidillon 2022, Endurance 2023 and Uhoda Tower 2026.
// The demolished Raidillon chalet and former Uniroyal tower are deliberately
// absent. Building footprints and stations are procedural approximations;
// see scripts/spa/README.md for primary references and survey limitations.
export function addEnvironment(THREE, ctx) {
  const group = new THREE.Group();
  group.name = 'Spa-Francorchamps · Ardennes and current landmark architecture';
  ctx.scene.add(group);
  const landmarks = [], footprints = [], geometries = new Map();
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color,
    roughness: .85, ...options });
  const mats = {
    concrete: material(0xa6a59d), stone: material(0xb4ad97), white: material(0xe4e3d9),
    roof: material(0x363f42, { metalness: .32, roughness: .55 }),
    steel: material(0x676e70, { metalness: .58, roughness: .45 }),
    glass: material(0x688a91, { metalness: .38, roughness: .27 }),
    red: material(0xa43a3d), gold: material(0xc2a44c), dark: material(0x333c40),
    water: material(0x536b61, { roughness: .34, metalness: .1 }),
    timber: material(0x72614a), foliage: material(0x36523b),
  };
  const up = new THREE.Vector3(0, 1, 0), helper = new THREE.Object3D();
  const wrap = value => ((value % 1) + 1) % 1;
  // The source GeoJSON reference began near the F1 line, while the shared
  // viewer is phased to the MultiViewer control line. Anchor this local
  // station sketch to the registered La Source station, not a guessed zero.
  const phaseOffset = (ctx.config.turns?.T1?.station ?? 383.95) - 255;
  const frame = station => {
    const result = ctx.frameAt(wrap((station + phaseOffset) / ctx.length));
    const forward = result.forward.clone().setY(0).normalize();
    return { point: result.point, forward,
      across: new THREE.Vector3(forward.z, 0, -forward.x) };
  };
  function box(parent, name, size, position, mat) {
    if (ctx.helpers?.box) {
      const mesh = ctx.helpers.box(parent, name, size, position, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
    const key = size.join(',');
    if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(...size));
    const mesh = new THREE.Mesh(geometries.get(key), mat);
    mesh.name = name; mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  function register(name) {
    const result = new THREE.Group(); result.name = name;
    result.userData.staticBatchRoot = true;
    group.add(result); landmarks.push(result);
    return result;
  }
  function localPoint(parent, x, z) {
    parent.updateWorldMatrix(true, false);
    return parent.localToWorld(new THREE.Vector3(x, 0, z));
  }
  function orient(parent, station, lateral) {
    const { point, forward, across } = frame(station);
    parent.position.copy(point).addScaledVector(across, lateral);
    parent.position.y = ctx.groundHeightAt(parent.position.x, parent.position.z);
    // x points backwards along the road; z is the driver's left. This basis
    // has determinant +1 and never introduces a geographic reflection.
    parent.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      forward.clone().negate(), up, across));
    parent.updateWorldMatrix(true, true);
  }
  function safePlace(parent, station, lateral, width, depth, clearance = 14) {
    const side = Math.sign(lateral) || 1;
    let minimum = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      orient(parent, station, lateral + attempt * side * 6);
      minimum = Infinity;
      const nx = Math.max(2, Math.ceil(width / 7)), nz = Math.max(2, Math.ceil(depth / 7));
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
        const p = localPoint(parent, (i / nx - .5) * width, (j / nz - .5) * depth);
        minimum = Math.min(minimum, ctx.roadDistance(p.x, p.z), ctx.pitDistance?.(p.x, p.z) ?? Infinity);
      }
      if (minimum >= clearance) break;
    }
    parent.userData = { ...parent.userData, stationMeters: station + phaseOffset,
      lateralApproximationMeters: lateral, minimumRoadDistance: minimum,
      footprint: { width, depth }, proceduralApproximation: true };
    const bounds = new THREE.Box3();
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2])
      bounds.expandByPoint(localPoint(parent, x, z));
    footprints.push(bounds.expandByScalar(7));
    return parent;
  }
  function foundation(parent, width, depth, floorLift = .25) {
    const supports = [];
    let floor = -Infinity;
    const nx = Math.max(2, Math.ceil(width / 14)), nz = Math.max(1, Math.ceil(depth / 14));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = (i / nx - .5) * width, z = (j / nz - .5) * depth;
      const p = localPoint(parent, x, z);
      const ground = ctx.groundHeightAt(p.x, p.z) - parent.position.y;
      floor = Math.max(floor, ground + floorLift); supports.push({ x, z, ground });
    }
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(.8, 1, .8), mats.concrete, supports.length);
    pillars.name = `${parent.name} terrain-reaching foundations`;
    supports.forEach((support, i) => {
      const height = Math.max(.3, floor - support.ground + .12);
      helper.position.set(support.x, floor - height / 2, support.z);
      helper.quaternion.identity(); helper.scale.set(1, height, 1); helper.updateMatrix();
      pillars.setMatrixAt(i, helper.matrix);
    });
    pillars.castShadow = pillars.receiveShadow = true; parent.add(pillars);
    box(parent, `${parent.name} foundation deck`, [width, .4, depth], [0, floor, 0], mats.concrete);
    parent.userData.floorY = floor;
    return floor;
  }
  function label(parent, text, width, height, position, facing = 1) {
    let texture;
    if (ctx.helpers?.label) texture = ctx.helpers.label(THREE, text, {
      width: 1024, height: 128, background: '#303a3c', foreground: '#f4f0e4',
    });
    else {
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
      const context = canvas.getContext('2d'); context.fillStyle = '#303a3c'; context.fillRect(0, 0, 1024, 128);
      context.fillStyle = '#f4f0e4'; context.font = 'bold 57px sans-serif'; context.textAlign = 'center';
      context.fillText(text, 512, 84); texture = new THREE.CanvasTexture(canvas);
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.name = `${text} architectural lettering`; mesh.position.set(...position);
    if (facing < 0) mesh.rotation.y = Math.PI;
    parent.add(mesh); return mesh;
  }
  function stand(name, station, lateral, width, rows, seatColor, roofed = true) {
    const side = Math.sign(lateral), depth = rows * 1.6 + 7;
    const result = safePlace(register(name), station, lateral, width + 14, depth + 12);
    const floor = foundation(result, width, depth, .3);
    const concrete = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.concrete, rows);
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .26, 1.05), material(seatColor), rows);
    concrete.name = `${name} solid stepped terraces`; seats.name = `${name} seating rows`;
    for (let row = 0; row < rows; row++) {
      const y = .8 + row * .68, z = side * ((row - (rows - 1) / 2) * 1.6);
      helper.position.set(0, floor + y / 2 + .2, z); helper.quaternion.identity();
      helper.scale.set(width, y, 1.72); helper.updateMatrix(); concrete.setMatrixAt(row, helper.matrix);
      helper.position.y = floor + y + .44; helper.scale.set(width - 1, 1, 1);
      helper.updateMatrix(); seats.setMatrixAt(row, helper.matrix);
    }
    result.add(concrete, seats); concrete.receiveShadow = seats.receiveShadow = true;
    if (roofed) {
      const roofY = floor + rows * .68 + 5.6;
      const roof = box(result, `${name} broad cantilever roof`, [width + 12, .65, depth + 9], [0, roofY, 0], mats.roof);
      roof.rotation.x = -side * .075;
      const count = Math.ceil(width / 18) + 1;
      const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, .9, depth + 3), mats.steel, count);
      beams.name = `${name} roof girders`;
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1) - .5) * (width - 4);
        const bottom = localPoint(result, x, side * (depth / 2 - 1));
        const foot = ctx.groundHeightAt(bottom.x, bottom.z) - result.position.y;
        box(result, `${name} roof support column`, [.8, roofY - foot, .8],
          [x, (roofY + foot) / 2, side * (depth / 2 - 1)], mats.steel);
        helper.position.set(x, roofY - .7, 0); helper.quaternion.identity(); helper.scale.set(1, 1, 1);
        helper.rotation.x = -side * .075; helper.updateMatrix(); beams.setMatrixAt(i, helper.matrix);
      }
      result.add(beams);
      box(result, `${name} front roof fascia`, [width + 12, 1.3, .45],
        [0, roofY + .45, -side * (depth / 2 + 4.5)], mats.dark);
      label(result, name.startsWith('Raidillon') ? 'RAIDILLON · SPA-FRANCORCHAMPS' : 'SPA-FRANCORCHAMPS',
        Math.min(88, width - 12), 2.2, [0, roofY + .5, -side * (depth / 2 + 4.8)], -side);
    }
    return result;
  }

  stand('Raidillon 2022 · summit grandstand', 1115, 104, 154, 18, 0x9a393d);
  stand('Endurance 2023 · descending grandstand', 630, 86, 235, 16, 0x6d7782);
  stand('La Source · grandstand and hillside terraces', 235, -91, 116, 12, 0xaa8f45);
  stand('Les Combes · wooded braking-zone stand', 2235, 86, 105, 10, 0x76816c, false);
  stand('Pouhon · double-left spectator terrace',
    (ctx.config.turns?.T10?.station ?? 3824) + 100 - phaseOffset, -85, 106, 9, 0x778775, false);

  // The second pit building descends with the landscape. Separate short bays
  // have terrain-reaching foundations rather than one long floating block.
  const endurance = register('Spa Endurance garages · historic downhill pit complex');
  for (let i = 0; i < 13; i++) {
    const bay = new THREE.Group(); bay.name = `Endurance garage bay ${i + 1}`;
    endurance.add(bay);
    const station = 450 + i * 25;
    safePlace(bay, station, -34, 25.5, 19.4);
    const floor = foundation(bay, 24.4, 18, .2);
    box(bay, 'Endurance concrete garage volume', [24.4, 5.2, 18], [0, floor + 2.8, 0], mats.white);
    box(bay, 'Endurance glazed hospitality', [23.2, 2.6, 17.5], [0, floor + 6.5, 0], mats.glass);
    box(bay, 'Endurance flat roof parapet', [25.5, .55, 19.4], [0, floor + 8.2, 0], mats.roof);
    for (const x of [-8, 0, 8]) box(bay, 'Endurance garage shutter', [6.5, 3.6, .14],
      [x, floor + 2.1, 9.12], mats.dark);
  }

  // Lacomble/Point B-ar describe curved terrace rings around a rounded prow.
  // The current tower opened in June 2026; do not restore the old Uniroyal.
  const tower = safePlace(register('Uhoda Tower 2026 · five levels and panoramic rooftop'), 825, -42, 25, 25);
  const towerFloor = foundation(tower, 20, 18, .35);
  const rounded = (width, depth, radius, height) => {
    const shape = new THREE.Shape(), x = -width / 2, y = -depth / 2;
    shape.moveTo(x + radius, y); shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + depth - radius);
    shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    shape.lineTo(x + radius, y + depth); shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 10 });
    geometry.rotateX(-Math.PI / 2); return geometry;
  };
  for (let level = 0; level < 6; level++) {
    const slab = new THREE.Mesh(rounded(22 + level % 2 * 1.2, 18, 6.5, .38), mats.white);
    slab.name = `Uhoda Tower curved terrace ring ${level}`;
    slab.position.y = towerFloor + level * 4.9; slab.castShadow = slab.receiveShadow = true; tower.add(slab);
    if (level < 5) {
      const volume = new THREE.Mesh(rounded(15.5, 12.5, 5.1, 4.5), mats.glass);
      volume.name = `Uhoda Tower glazed level ${level + 1}`;
      volume.position.set(-1.2, towerFloor + level * 4.9 + .4, 0);
      volume.castShadow = true; tower.add(volume);
    }
  }
  box(tower, 'Uhoda Tower vertical concrete prow', [5, 26, 5], [4.7, towerFloor + 13, -2.3], mats.concrete);
  label(tower, 'UHODA TOWER', 15, 1.8, [0, towerFloor + 25.3, 9.05]);

  const bridge = register('Uhoda Tower 2026 · elevated pedestrian connection');
  const bridgeFrame = frame(825); bridge.position.copy(bridgeFrame.point);
  bridge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bridgeFrame.forward.clone().negate(), up, bridgeFrame.across));
  bridge.userData.allowOverTrack = true;
  const deckHeight = Math.max(9.5, tower.position.y + towerFloor + 10 - bridge.position.y);
  box(bridge, 'Uhoda pedestrian bridge elevated deck', [4.8, .65, 105], [0, deckHeight, 3], mats.concrete);
  for (const x of [-2.3, 2.3]) box(bridge, 'Pedestrian bridge protective parapet', [.25, 1.35, 105],
    [x, deckHeight + .9, 3], mats.steel);
  for (const z of [-45, 48]) {
    const foot = localPoint(bridge, 0, z), bottom = ctx.groundHeightAt(foot.x, foot.z) - bridge.position.y;
    box(bridge, 'Uhoda bridge terrain-reaching pier', [2.5, deckHeight - bottom, 3],
      [0, (deckHeight + bottom) / 2, z], mats.concrete);
  }
  const stairsEnd = localPoint(bridge, 0, 77);
  const stairBottom = ctx.groundHeightAt(stairsEnd.x, stairsEnd.z) - bridge.position.y + .35;
  const steps = 26;
  const stairMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(4.8, .32, 1.15), mats.concrete, steps);
  stairMesh.name = 'Uhoda bridge fanzone stair descent';
  for (let i = 0; i < steps; i++) {
    helper.position.set(0, deckHeight + (stairBottom - deckHeight) * i / (steps - 1), 55 + i * .86);
    helper.quaternion.identity(); helper.scale.set(1, 1, 1); helper.updateMatrix();
    stairMesh.setMatrixAt(i, helper.matrix);
  }
  bridge.add(stairMesh);
  bridge.updateWorldMatrix(true, true);
  footprints.push(new THREE.Box3().setFromObject(bridge).expandByScalar(7));

  const farm = safePlace(register('Ferme Foguenne · restored regional entrance architecture'), 790, -112, 58, 29);
  const farmFloor = foundation(farm, 54, 23, .2);
  box(farm, 'Foguenne pale stone farmhouse walls', [54, 7.5, 23], [0, farmFloor + 3.95, 0], mats.stone);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-13.5, 0); roofShape.lineTo(0, 7);
  roofShape.lineTo(13.5, 0); roofShape.closePath();
  const farmRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape,
    { depth: 57, bevelEnabled: false }), mats.roof);
  farmRoof.name = 'Foguenne pitched Ardennes slate roof';
  farmRoof.rotation.y = Math.PI / 2; farmRoof.position.set(-28.5, farmFloor + 7.7, 0); farm.add(farmRoof);
  for (let x = -22; x <= 22; x += 8.8) for (const z of [-11.6, 11.6])
    box(farm, 'Foguenne farmhouse window', [1.8, 2.5, .12], [x, farmFloor + 4.5, z], mats.glass);

  // Eau Rouge is a small stream crossing beneath the raceway. The visible
  // water stops outside the road envelope; the culverted crossing is hidden.
  const stream = register('Eau Rouge · wooded stream and culvert approaches');
  const streamFrame = frame((ctx.config.turns?.T2?.station ?? 1065) - phaseOffset), positions = [], indices = [];
  for (let i = 0; i < 44; i++) {
    const a = -130 + i * 6, b = a + 6;
    const points = [a, b].map(d => streamFrame.point.clone()
      .addScaledVector(streamFrame.across, d).addScaledVector(streamFrame.forward, Math.sin(d / 28) * 12));
    if (points.some(p => ctx.roadDistance(p.x, p.z) < 17)) continue;
    const start = positions.length / 3;
    for (const p of points) for (const side of [-1, 1]) {
      const x = p.x + streamFrame.forward.x * side * 1.1, z = p.z + streamFrame.forward.z * side * 1.1;
      positions.push(x, ctx.groundHeightAt(x, z) + .03, z);
    }
    indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
  }
  const streamGeometry = new THREE.BufferGeometry();
  streamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  streamGeometry.setIndex(indices); streamGeometry.computeVertexNormals();
  const water = new THREE.Mesh(streamGeometry, mats.water); water.name = 'Eau Rouge small stream visible banks';
  stream.add(water);

  // Mixed Ardennes woodland: broadleaf crowns and two conifer silhouettes,
  // batched into a few meshes. Ground levels are sampled for every trunk.
  const forest = register('Ardennes · dense mixed woodland following the terrain');
  const bounds = new THREE.Box3().setFromPoints(ctx.samples.map(sample => sample.point || sample));
  // Keep the woodland inside the shared high-resolution terrain footprint,
  // including implementations with only a 220 m pad. The outer trees must
  // never stand on the
  // low, flat horizon plane beneath the relief model.
  bounds.expandByScalar(185);
  let seed = 70042026;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  group.updateMatrixWorld(true);
  const trees = [[], [], []], all = [];
  for (let attempt = 0; attempt < 30000 && all.length < 3400; attempt++) {
    const x = bounds.min.x + random() * (bounds.max.x - bounds.min.x);
    const z = bounds.min.z + random() * (bounds.max.z - bounds.min.z);
    const distance = Math.min(ctx.roadDistance(x, z), ctx.pitDistance?.(x, z) ?? Infinity);
    if (distance < 39 || distance > 410) continue;
    if (footprints.some(bound => x >= bound.min.x && x <= bound.max.x && z >= bound.min.z && z <= bound.max.z)) continue;
    // Keep the working paddock between the F1 straight and Endurance clear.
    const tree = { x, z, y: ctx.groundHeightAt(x, z), scale: .85 + random() * .85, yaw: random() * Math.PI * 2 };
    const species = random() < .54 ? 0 : random() < .5 ? 1 : 2;
    trees[species].push(tree); all.push(tree);
  }
  const trunkGeometry = new THREE.CylinderGeometry(.28, .49, 5, 5);
  for (let species = 0; species < trees.length; species++) {
    const list = trees[species], trunks = new THREE.InstancedMesh(trunkGeometry, mats.timber, list.length);
    const foliage = new THREE.InstancedMesh(species === 0 ? new THREE.IcosahedronGeometry(4.2, 0)
      : new THREE.ConeGeometry(species === 1 ? 3.8 : 3.1, species === 1 ? 12.5 : 14, 7),
    material([0x3c6040, 0x304c36, 0x36583e][species]), list.length);
    trunks.name = `Ardennes grounded tree trunks ${species}`;
    foliage.name = species === 0 ? 'Ardennes broadleaf woodland canopy' : `Ardennes evergreen canopy ${species}`;
    list.forEach((tree, i) => {
      helper.position.set(tree.x, tree.y + 2.5 * tree.scale, tree.z);
      helper.rotation.set(0, tree.yaw, 0); helper.scale.setScalar(tree.scale); helper.updateMatrix();
      trunks.setMatrixAt(i, helper.matrix);
      helper.position.y = tree.y + (species === 0 ? 7.5 : 8.3) * tree.scale;
      helper.scale.set(tree.scale, tree.scale * (species === 0 ? 1.18 : 1), tree.scale);
      helper.updateMatrix(); foliage.setMatrixAt(i, helper.matrix);
    });
    forest.add(trunks, foliage);
  }
  forest.userData.treeCount = all.length;
  forest.userData.treeBases = all;
  group.updateMatrixWorld(true);
  return { group, landmarks };
}
