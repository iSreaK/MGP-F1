/**
 * Small trackside elements, kept separate from the terrain and circuit mesh.
 * Distances are metres; the centreline uses arc-length-normalised curve values.
 */
export function addTracksideDetails(THREE, scene, curve, polyline, landmarks, trackY = .30, terrainHeightAt = () => 0) {
  const group = new THREE.Group();
  group.name = 'Monza trackside details';
  scene.add(group);

  const length = curve.getLength();
  const up = new THREE.Vector3(0, 1, 0);
  const local = new THREE.Object3D();
  const dark = new THREE.MeshStandardMaterial({ color: 0x18211f, roughness: .79, metalness: .16 });
  const paintedSteel = new THREE.MeshStandardMaterial({ color: 0xdbded8, roughness: .55, metalness: .31 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb42128, roughness: .66 });
  const green = new THREE.MeshStandardMaterial({ color: 0x238044, roughness: .8 });

  const pointAt = (u) => {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    const forward = curve.getTangentAt(wrapped).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    return { point, forward, across };
  };
  const indexToU = (index) => {
    let travelled = 0;
    let total = 0;
    for (let i = 0; i < polyline.length; i++) {
      const segment = polyline[i].distanceTo(polyline[(i + 1) % polyline.length]);
      total += segment;
      if (i < index) travelled += segment;
    }
    return total ? travelled / total : 0;
  };
  const turnU = (key) => indexToU(landmarks.turns[key].index);

  // Low-contrast rubber marks sit just above the asphalt. Two slender ribbons
  // convey the racing line without turning the circuit into a dark stripe.
  const rubberPositions = [];
  const rubberIndices = [];
  for (const [key, before, after] of [
    ['T1', 175, 28], ['T4', 130, 22], ['T6', 105, 18],
    ['T8', 130, 25], ['T11', 170, 28],
  ]) {
    const apex = turnU(key);
    const start = apex - before / length;
    const end = apex + after / length;
    const count = Math.ceil((before + after) / 4);
    for (const wheelLine of [-.74, .74]) {
      for (let i = 0; i < count; i++) {
        const a = pointAt(start + (end - start) * i / count);
        const b = pointAt(start + (end - start) * (i + 1) / count);
        const swayA = Math.sin(i * .17 + wheelLine) * .09;
        const swayB = Math.sin((i + 1) * .17 + wheelLine) * .09;
        const base = rubberPositions.length / 3;
        for (const [sample, center, width] of [
          [a, wheelLine + swayA, -.11], [a, wheelLine + swayA, .11],
          [b, wheelLine + swayB, -.11], [b, wheelLine + swayB, .11],
        ]) {
          const p = sample.point.clone().addScaledVector(sample.across, center + width);
          rubberPositions.push(p.x, sample.point.y + .042, p.z);
        }
        rubberIndices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  const rubberGeometry = new THREE.BufferGeometry();
  rubberGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rubberPositions, 3));
  rubberGeometry.setIndex(rubberIndices);
  rubberGeometry.computeVertexNormals();
  const rubber = new THREE.Mesh(rubberGeometry, new THREE.MeshBasicMaterial({
    color: 0x111715, transparent: true, opacity: .24,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  }));
  rubber.name = 'Rubber laid down in braking zones';
  rubber.renderOrder = 2;
  group.add(rubber);

  // White braking boards are readable from the driver's approach. Their
  // locations are approximate visual cues, not timing or telemetry data.
  const markerMaterials = new Map();
  const markerGeometry = new THREE.PlaneGeometry(1.9, 2.45);
  const postGeometry = new THREE.BoxGeometry(.13, 2.7, .16);
  for (const [key, side, distances] of [
    ['T1', -1, [200, 150, 100, 50]],
    ['T4', 1, [150, 100, 50]],
    ['T8', 1, [150, 100, 50]],
    ['T11', -1, [150, 100, 50]],
  ]) {
    const apex = turnU(key);
    for (const metres of distances) {
      const frame = pointAt(apex - metres / length);
      const position = frame.point.clone().addScaledVector(frame.across, side * 15.9);
      position.y = terrainHeightAt(position.x, position.z);
      const boardGroup = new THREE.Group();
      boardGroup.position.copy(position);
      const boardBasis = new THREE.Matrix4().makeBasis(frame.across.clone().negate(), up, frame.forward.clone().negate());
      boardGroup.quaternion.setFromRotationMatrix(boardBasis);
      const post = new THREE.Mesh(postGeometry, paintedSteel);
      post.position.y = 1.35;
      boardGroup.add(post);
      if (!markerMaterials.has(metres)) {
        markerMaterials.set(metres, new THREE.MeshBasicMaterial({
          map: boardTexture(THREE, metres), side: THREE.DoubleSide,
        }));
      }
      const board = new THREE.Mesh(markerGeometry, markerMaterials.get(metres));
      board.position.set(0, 2.72, -.11);
      board.name = `${metres} m braking marker`;
      boardGroup.add(board);
      group.add(boardGroup);
    }
  }

  // The 1955 oval survives above the straight between Serraglio and Ascari.
  // It is a weathered concrete road, not a billboard portal. Its piers are
  // well outside the current 11 m racing surface and its soffit clears cars.
  const ovalAt = pointAt(turnU('T7') + 155 / length);
  const ovalBridge = new THREE.Group();
  ovalBridge.name = 'Historic high-speed oval overpass before Ascari';
  ovalBridge.position.copy(ovalAt.point);
  ovalBridge.position.y = terrainHeightAt(ovalBridge.position.x, ovalBridge.position.z);
  ovalBridge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ovalAt.across, up, ovalAt.forward));
  group.add(ovalBridge);
  addHistoricOvalBridge(THREE, ovalBridge, terrainHeightAt);

  // A short remnant of the steep southern banking sits beyond the outside of
  // Alboreto. It frames the exit in the aerial and TV cameras without joining
  // the active Grand Prix road.
  const southAt = pointAt(turnU('T11') + 125 / length);
  const southBank = new THREE.Group();
  southBank.name = 'Historic southern banking beyond Alboreto';
  southBank.position.copy(southAt.point).addScaledVector(southAt.across, -110);
  southBank.position.y = terrainHeightAt(southBank.position.x, southBank.position.z);
  southBank.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(southAt.across, up, southAt.forward));
  group.add(southBank);
  addHistoricSouthBanking(THREE, southBank, terrainHeightAt);

  // A few compact tyre walls protect selected corner exits. Instancing keeps
  // the visual detail cheap even in the aerial view.
  const tyreLayout = [];
  for (const [key, side, stacks] of [
    ['T1', 1, 10], ['T4', -1, 7], ['T6', 1, 7],
    ['T8', -1, 9], ['T11', 1, 11],
  ]) {
    const apex = turnU(key);
    for (let i = 0; i < stacks; i++) {
      const frame = pointAt(apex + ((i - (stacks - 1) / 2) * 1.28) / length);
      const center = frame.point.clone().addScaledVector(frame.across, side * 24.1);
      const ground = terrainHeightAt(center.x, center.z);
      for (let tier = 0; tier < 4; tier++) tyreLayout.push([center.x, ground + .25 + tier * .31, center.z, i, tier]);
    }
  }
  const tyres = new THREE.InstancedMesh(
    new THREE.TorusGeometry(.47, .15, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x232a29, roughness: 1, metalness: .03 }),
    tyreLayout.length,
  );
  const tyreColor = new THREE.Color();
  local.rotation.set(-Math.PI / 2, 0, 0);
  for (let i = 0; i < tyreLayout.length; i++) {
    const [x, y, z, stack, tier] = tyreLayout[i];
    local.position.set(x, y, z);
    local.scale.setScalar(.94 + ((stack + tier) % 4) * .025);
    local.updateMatrix();
    tyres.setMatrixAt(i, local.matrix);
    tyreColor.setHex((stack + tier) % 5 === 0 ? 0x303534 : 0x1c2221);
    tyres.setColorAt(i, tyreColor);
  }
  tyres.instanceMatrix.needsUpdate = true;
  tyres.instanceColor.needsUpdate = true;
  tyres.frustumCulled = false;
  tyres.name = 'Corner tyre barriers';
  group.add(tyres);

  // Catch fencing follows the outside of the main braking areas. All wires
  // share one geometry and the posts one instanced draw call.
  const fenceLines = [];
  const fencePosts = [];
  const fenceZones = [
    ['T1', -1, -145, 75], ['T4', 1, -105, 65],
    ['T8', 1, -115, 92], ['T11', -1, -150, 115],
  ];
  for (const [key, side, startMetres, endMetres] of fenceZones) {
    const apex = turnU(key);
    const count = Math.ceil((endMetres - startMetres) / 3);
    let previous = null;
    for (let i = 0; i <= count; i++) {
      const offsetMetres = startMetres + (endMetres - startMetres) * i / count;
      const frame = pointAt(apex + offsetMetres / length);
      const p = frame.point.clone().addScaledVector(frame.across, side * 31.3);
      const ground = terrainHeightAt(p.x, p.z);
      if (i % 2 === 0) fencePosts.push([p.x, ground, p.z]);
      fenceLines.push(p.x, ground + .34, p.z, p.x, ground + 4.15, p.z);
      if (previous) {
        for (const offsetY of [.38, 1.15, 1.92, 2.69, 3.46, 4.13]) {
          fenceLines.push(previous.x, previous.y + offsetY, previous.z, p.x, ground + offsetY, p.z);
        }
      }
      previous = { x: p.x, y: ground, z: p.z };
    }
  }
  const wiresGeometry = new THREE.BufferGeometry();
  wiresGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fenceLines, 3));
  const wires = new THREE.LineSegments(wiresGeometry, new THREE.LineBasicMaterial({
    color: 0x9ca8a4, transparent: true, opacity: .58, depthWrite: false,
  }));
  wires.name = 'Catch fencing at braking zones';
  group.add(wires);
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(.12, 4.28, .12), paintedSteel, fencePosts.length,
  );
  for (let i = 0; i < fencePosts.length; i++) {
    local.position.set(fencePosts[i][0], fencePosts[i][1] + 2.14, fencePosts[i][2]);
    local.rotation.set(0, 0, 0);
    local.scale.setScalar(1);
    local.updateMatrix();
    posts.setMatrixAt(i, local.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.frustumCulled = false;
  posts.name = 'Catch fence posts';
  group.add(posts);

  // Small coloured panels along the outer wall give each section a familiar
  // Grand Prix rhythm, with legible lettering at low camera angles.
  const panelMaterials = [
    new THREE.MeshBasicMaterial({ map: panelTexture(THREE, 'MONZA', '#a42128'), side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ map: panelTexture(THREE, 'ITALIA', '#197044'), side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ map: panelTexture(THREE, 'AUTODROMO', '#1a2422'), side: THREE.DoubleSide }),
  ];
  const panelGeometry = new THREE.PlaneGeometry(6, 1.42);
  let panelIndex = 0;
  for (const [key, side, startMetres, endMetres] of fenceZones) {
    const apex = turnU(key);
    for (let offsetMetres = startMetres + 18; offsetMetres < endMetres - 12; offsetMetres += 27) {
      const frame = pointAt(apex + offsetMetres / length);
      const board = new THREE.Mesh(panelGeometry, panelMaterials[panelIndex++ % panelMaterials.length]);
      board.position.copy(frame.point).addScaledVector(frame.across, side * 27.5);
      board.position.y = terrainHeightAt(board.position.x, board.position.z) + 1.8;
      board.lookAt(frame.point.x, board.position.y, frame.point.z);
      board.name = 'Trackside Monza panel';
      group.add(board);
    }
  }

  // A compact timing tower gives the start area a clear vertical silhouette.
  const grid = pointAt(indexToU(landmarks.gridIndex || 0));
  const tower = new THREE.Group();
  tower.name = 'Start straight timing tower';
  tower.position.copy(grid.point).addScaledVector(grid.across, 67);
  tower.position.y = terrainHeightAt(tower.position.x, tower.position.z);
  tower.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(grid.across, up, grid.forward));
  group.add(tower);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(7.2, 26, 4.2), dark);
  shaft.position.y = 13;
  shaft.castShadow = true;
  tower.add(shaft);
  const towerFace = new THREE.Mesh(
    new THREE.PlaneGeometry(6.25, 19),
    new THREE.MeshBasicMaterial({ map: towerTexture(THREE), side: THREE.DoubleSide }),
  );
  towerFace.position.set(0, 14.4, -2.15);
  towerFace.rotation.y = Math.PI;
  tower.add(towerFace);
  for (const [i, material] of [red, paintedSteel, green].entries()) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.05, 4.35), material);
    band.position.y = 24.7 + i * 1.05;
    tower.add(band);
  }

  return group;
}

function addHistoricOvalBridge(THREE, parent, terrainHeightAt) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc0bdb3, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const underside = new THREE.MeshStandardMaterial({ color: 0x757a75, roughness: 1, side: THREE.DoubleSide });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x535c59, metalness: .34, roughness: .76 });
  const deckZ = x => .068 * x + .00155 * x * x;
  const deckY = (x, w) => 8.25 + .012 * x + .00025 * x * x + .037 * w;
  const width = 11.6;
  const divisions = 42;
  const vertices = [];
  const colours = [];
  const indices = [];
  for (let i = 0; i <= divisions; i++) {
    const x = -43 + 86 * i / divisions;
    for (let j = 0; j <= 6; j++) {
      const w = width * (j / 6 - .5);
      vertices.push(x, deckY(x, w), deckZ(x) + w);
      const stain = .81 + .09 * Math.sin(x * .19 + j * 2.8) + .05 * Math.cos(x * .58 - j);
      colours.push(stain, stain * .99, stain * .96);
      if (i < divisions && j < 6) {
        const a = i * 7 + j;
        indices.push(a, a + 1, a + 7, a + 1, a + 8, a + 7);
      }
    }
  }
  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  roadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  roadGeometry.setIndex(indices);
  roadGeometry.computeVertexNormals();
  const road = new THREE.Mesh(roadGeometry, concrete);
  road.name = 'Aged concrete deck of former Monza oval';
  road.castShadow = true;
  road.receiveShadow = true;
  parent.add(road);

  const slabVertices = [];
  const slabIndices = [];
  const pushSlab = (a, b, c, d) => {
    const k = slabVertices.length / 3;
    slabVertices.push(...a, ...b, ...c, ...d);
    slabIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  };
  for (let i = 0; i < divisions; i++) {
    const x0 = -43 + 86 * i / divisions;
    const x1 = -43 + 86 * (i + 1) / divisions;
    for (let j = 0; j < 2; j++) {
      const w0 = width * (j - .5), w1 = width * (j + .5);
      pushSlab(
        [x0, deckY(x0, w0) - 1.0, deckZ(x0) + w0],
        [x1, deckY(x1, w0) - 1.0, deckZ(x1) + w0],
        [x0, deckY(x0, w1) - 1.0, deckZ(x0) + w1],
        [x1, deckY(x1, w1) - 1.0, deckZ(x1) + w1],
      );
    }
    for (const w of [-width / 2, width / 2]) {
      pushSlab(
        [x0, deckY(x0, w), deckZ(x0) + w],
        [x1, deckY(x1, w), deckZ(x1) + w],
        [x0, deckY(x0, w) - 1, deckZ(x0) + w],
        [x1, deckY(x1, w) - 1, deckZ(x1) + w],
      );
    }
  }
  const slabGeometry = new THREE.BufferGeometry();
  slabGeometry.setAttribute('position', new THREE.Float32BufferAttribute(slabVertices, 3));
  slabGeometry.setIndex(slabIndices);
  slabGeometry.computeVertexNormals();
  const slab = new THREE.Mesh(slabGeometry, underside);
  slab.name = 'Deep weathered concrete overpass soffit';
  slab.castShadow = true;
  parent.add(slab);

  // Two pairs of piers leave more than 18 m from the modern centreline.
  parent.updateWorldMatrix(true, false);
  for (const x of [-33, -19.5, 19.5, 33]) {
    const z = deckZ(x);
    for (const w of [-3.9, 3.9]) {
      const worldFoot = parent.localToWorld(new THREE.Vector3(x, 0, z + w));
      const base = terrainHeightAt(worldFoot.x, worldFoot.z) - parent.position.y - .25;
      const height = deckY(x, w) - 1.15 - base;
      if (height < 2) continue;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.25, height, 1.35), underside);
      pier.position.set(x, base + height / 2, z + w);
      pier.castShadow = true;
      pier.receiveShadow = true;
      parent.add(pier);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.25, .35, 2.25), underside);
      pad.position.set(x, base + .13, z + w);
      parent.add(pad);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.15, .52, width - .35), underside);
    cap.position.set(x, deckY(x, 0) - 1.27, z);
    cap.castShadow = true;
    parent.add(cap);
  }

  const railPoints = [];
  const crackPoints = [];
  const postTransforms = [];
  for (const side of [-1, 1]) {
    const w = side * (width / 2 + .15);
    for (let i = 0; i < 29; i++) {
      const x0 = -42 + 84 * i / 28;
      if (i < 28) {
        const x1 = -42 + 84 * (i + 1) / 28;
        for (const h of [.65, 1.2]) railPoints.push(
          x0, deckY(x0, w) + h, deckZ(x0) + w,
          x1, deckY(x1, w) + h, deckZ(x1) + w,
        );
      }
      postTransforms.push([x0, deckY(x0, w) + .62, deckZ(x0) + w]);
    }
  }
  for (const x of [-37, -30, -19, -7, 5, 17, 28, 38]) {
    const w0 = -width * .38, w1 = width * .31;
    crackPoints.push(x, deckY(x, w0) + .022, deckZ(x) + w0,
      x + 1.25, deckY(x + 1.25, w1) + .022, deckZ(x + 1.25) + w1);
  }
  const railsGeometry = new THREE.BufferGeometry();
  railsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(railPoints, 3));
  const rails = new THREE.LineSegments(railsGeometry, new THREE.LineBasicMaterial({ color: 0x626966, transparent: true, opacity: .85 }));
  rails.name = 'Guardrails on former oval bridge';
  parent.add(rails);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 1.3, .12), railMaterial, postTransforms.length);
  const dummy = new THREE.Object3D();
  postTransforms.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  posts.name = 'Old oval bridge rail posts';
  parent.add(posts);
  const cracksGeometry = new THREE.BufferGeometry();
  cracksGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crackPoints, 3));
  const cracks = new THREE.LineSegments(cracksGeometry, new THREE.LineBasicMaterial({ color: 0x535952, transparent: true, opacity: .34 }));
  cracks.name = 'Subtle age cracks in oval concrete';
  parent.add(cracks);
}

function addHistoricSouthBanking(THREE, parent, terrainHeightAt) {
  const upper = new THREE.MeshStandardMaterial({ color: 0xb5b4a9, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const face = new THREE.MeshStandardMaterial({ color: 0x777d73, roughness: 1, side: THREE.DoubleSide });
  const positions = [];
  const colours = [];
  const indices = [];
  const retaining = [];
  const retainingIndices = [];
  parent.updateWorldMatrix(true, false);
  const centerZ = x => -.0025 * x * x;
  const ground = (x, z) => {
    const p = parent.localToWorld(new THREE.Vector3(x, 0, z));
    return terrainHeightAt(p.x, p.z) - parent.position.y;
  };
  const height = (x, w) => {
    const taper = Math.max(0, 1 - Math.pow(Math.abs(x) / 78, 2));
    return ground(x, centerZ(x) + w) + .48 + (w + 7.5) / 15 * 6.2 * Math.sqrt(taper);
  };
  const segments = 30;
  for (let i = 0; i <= segments; i++) {
    const x = -78 + 156 * i / segments;
    for (let j = 0; j <= 5; j++) {
      const w = -7.5 + 15 * j / 5;
      positions.push(x, height(x, w), centerZ(x) + w);
      const patina = .78 + .085 * Math.sin(x * .23 + j * 1.9) + .04 * Math.cos(x * .54 - j);
      colours.push(patina, patina * .99, patina * .96);
      if (i < segments && j < 5) {
        const a = i * 6 + j;
        indices.push(a, a + 1, a + 6, a + 1, a + 7, a + 6);
      }
    }
    const z = centerZ(x) + 7.5;
    retaining.push(x, height(x, 7.5), z, x, ground(x, z) - .1, z);
    if (i < segments) {
      const k = i * 2;
      retainingIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  roadGeometry.setIndex(indices);
  roadGeometry.computeVertexNormals();
  const oldRoad = new THREE.Mesh(roadGeometry, upper);
  oldRoad.name = 'Curved and steeply banked 1955 concrete roadway';
  oldRoad.receiveShadow = true;
  parent.add(oldRoad);
  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(retaining, 3));
  faceGeometry.setIndex(retainingIndices);
  faceGeometry.computeVertexNormals();
  const wall = new THREE.Mesh(faceGeometry, face);
  wall.name = 'Weathered edge of southern banking';
  wall.castShadow = true;
  parent.add(wall);
}

function boardTexture(THREE, metres) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f1e9';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#ba262c';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#17201e';
  ctx.font = '900 135px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(metres), 128, 179, 241);
  ctx.font = '700 26px Arial, sans-serif';
  ctx.fillText('METRI', 128, 276);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function towerTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#131c1a';
  ctx.fillRect(0, 0, 192, 512);
  ctx.fillStyle = '#cf3030';
  ctx.fillRect(0, 0, 192, 12);
  ctx.fillStyle = '#f5f4eb';
  ctx.textAlign = 'center';
  ctx.font = '900 42px Arial, sans-serif';
  ctx.fillText('MONZA', 96, 70, 180);
  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillText('RACE CONTROL', 96, 109, 181);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ddded4' : '#87918b';
    ctx.fillRect(28, 146 + i * 39, 136, 2);
    ctx.fillStyle = '#e7e9df';
    ctx.fillRect(38, 157 + i * 39, 15, 12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function panelTexture(THREE, label, background) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#e8e8db';
  ctx.fillRect(0, 0, 512, 7);
  ctx.fillRect(0, 121, 512, 7);
  ctx.font = `900 ${label.length > 8 ? 58 : 78}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64, 486);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
