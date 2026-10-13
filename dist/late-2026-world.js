import { sculptPlaneToTrack } from './terrain-follow.js';

const wrap01 = value => ((value % 1) + 1) % 1;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value, 1664525) + 1013904223 >>> 0) / 4294967296);
}

function asphaltTexture(THREE, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(256, 256);
  const random = seededRandom(seed);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - .5) * 20;
    pixels.data[i] = 72 + grain;
    pixels.data[i + 1] = 75 + grain;
    pixels.data[i + 2] = 78 + grain;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createRibbon(THREE, parent, name, frames, from, to, material, height = 0) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = frames.length;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const offset = positions.length / 3;
    for (const [frame, across, v] of [
      [frames[i], from, 0], [frames[i], to, 1],
      [frames[next], from, 0], [frames[next], to, 1],
    ]) {
      positions.push(frame.point.x + frame.across.x * across,
        frame.point.y + height,
        frame.point.z + frame.across.z * across);
      uvs.push(i / 8, v);
    }
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createSegmentRibbon(THREE, parent, name, curve, centreU, halfLength,
  from, to, material, height = .025) {
  const segments = 14;
  const frames = [];
  for (let i = 0; i <= segments; i++) {
    const u = wrap01(centreU + (i / segments * 2 - 1) * halfLength);
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    frames.push({ point, across: new THREE.Vector3(forward.z, 0, -forward.x) });
  }
  return createRibbon(THREE, parent, name, frames, from, to, material, height);
}

function addGrid(THREE, group, curve, gridU, halfWidth, config) {
  const white = new THREE.MeshBasicMaterial({ color: 0xf6f4e9, side: THREE.DoubleSide });
  const line = createSegmentRibbon(THREE, group, `${config.name} start line`, curve,
    gridU, 2.2 / config.length, -halfWidth + .25, halfWidth - .25, white, .045);
  line.renderOrder = 4;
  const paint = new THREE.Group();
  paint.name = `${config.name} starting grid`;
  group.add(paint);
  for (let slot = 0; slot < 22; slot++) {
    const station = 14.1 + slot * config.gridSpacing;
    const u = wrap01(gridU - station / config.length);
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const lane = slot % 2 ? config.gridLane : -config.gridLane;
    const box = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.35), white);
    box.name = `Grid box ${slot + 1}`;
    box.rotation.x = -Math.PI / 2;
    box.rotation.z = Math.atan2(forward.x, forward.z);
    box.position.copy(point).addScaledVector(across, lane);
    box.position.y += .04;
    paint.add(box);
  }
  const pit = createSegmentRibbon(THREE, group, `${config.name} pit lane`, curve,
    gridU, Math.min(.055, 360 / config.length),
    config.pitSide * (halfWidth + 9.2), config.pitSide * (halfWidth + 5.4),
    new THREE.MeshStandardMaterial({ color: 0x4c5155, roughness: .94, side: THREE.DoubleSide }), .005);
  pit.receiveShadow = true;
}

function addBarriers(THREE, group, curve, length, halfWidth, urban) {
  const material = new THREE.MeshStandardMaterial({
    color: urban ? 0xb9b8b1 : 0xb8bcc0, roughness: .62, metalness: .35,
  });
  const geometry = new THREE.BoxGeometry(.16, 1.15, 5.8);
  const count = Math.floor(length / 18) * 2;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const helper = new THREE.Object3D();
  let instance = 0;
  for (const side of [-1, 1]) for (let station = 0; station < length; station += 18) {
    const u = station / length;
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    helper.position.copy(point).addScaledVector(across, side * (halfWidth + (urban ? 2.1 : 5.8)));
    helper.position.y += .54;
    helper.rotation.y = Math.atan2(forward.x, forward.z);
    helper.updateMatrix();
    mesh.setMatrixAt(instance++, helper.matrix);
  }
  mesh.count = instance;
  mesh.name = urban ? 'Street-circuit safety barriers' : 'Circuit guardrails';
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

function addGrandstand(THREE, group, position, rotation, length, color = 0xd8d8d4) {
  const stand = new THREE.Group();
  stand.position.copy(position);
  stand.rotation.y = rotation;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x85898a, roughness: .86 });
  const seats = new THREE.MeshStandardMaterial({ color, roughness: .72 });
  for (let level = 0; level < 7; level++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(length, .75, 1.8), concrete);
    step.position.set(0, level * .72, level * 1.12);
    step.castShadow = step.receiveShadow = true;
    stand.add(step);
    const row = new THREE.Mesh(new THREE.BoxGeometry(length - 1, .22, .78), seats);
    row.position.set(0, level * .72 + .55, level * 1.12 - .15);
    stand.add(row);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 3, .35, 10),
    new THREE.MeshStandardMaterial({ color: 0xe4e5df, metalness: .38, roughness: .43 }));
  roof.position.set(0, 8.5, 5.6);
  roof.castShadow = true;
  stand.add(roof);
  group.add(stand);
  return stand;
}

function addTrees(THREE, group, bounds, count, seed) {
  const random = seededRandom(seed);
  const trunkGeometry = new THREE.CylinderGeometry(.35, .52, 4.2, 5);
  const crownGeometry = new THREE.IcosahedronGeometry(2.8, 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry,
    new THREE.MeshStandardMaterial({ color: 0x55402b, roughness: 1 }), count);
  const crowns = new THREE.InstancedMesh(crownGeometry,
    new THREE.MeshStandardMaterial({ color: 0x2f6738, roughness: .95 }), count);
  const helper = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const x = bounds.min.x + random() * (bounds.max.x - bounds.min.x);
    const z = bounds.min.z + random() * (bounds.max.z - bounds.min.z);
    const scale = .7 + random() * 1.15;
    helper.position.set(x, 1.7 * scale, z);
    helper.scale.set(scale, scale, scale);
    helper.rotation.y = random() * Math.PI;
    helper.updateMatrix();
    trunks.setMatrixAt(i, helper.matrix);
    helper.position.y = 5.1 * scale;
    helper.rotation.y += .4;
    helper.updateMatrix();
    crowns.setMatrixAt(i, helper.matrix);
  }
  trunks.castShadow = crowns.castShadow = false;
  trunks.name = 'Venue trees trunks';
  crowns.name = 'Venue tree canopy';
  group.add(trunks, crowns);
}

function addMadridScene(THREE, group, bounds) {
  const glass = new THREE.MeshStandardMaterial({ color: 0xb8d3dc, metalness: .38, roughness: .27 });
  const halls = new THREE.Group();
  halls.name = 'IFEMA exhibition halls and paddock';
  const edge = bounds.max.x + 170;
  for (let i = 0; i < 5; i++) {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(105, 18 + i % 2 * 5, 58), glass);
    hall.position.set(edge + (i % 2) * 115, 9, bounds.min.z + 120 + Math.floor(i / 2) * 95);
    hall.castShadow = hall.receiveShadow = true;
    halls.add(hall);
  }
  group.add(halls);
  addGrandstand(THREE, group, new THREE.Vector3(bounds.min.x + 80, 1, bounds.min.z - 55), .18, 105, 0xd8373e);
  addTrees(THREE, group, bounds.clone().expandByScalar(240), 80, 20260913);
}

function addBakuScene(THREE, group, bounds) {
  const city = new THREE.Group();
  city.name = 'Baku old city, boulevard and skyline';
  const random = seededRandom(20260926);
  const stone = new THREE.MeshStandardMaterial({ color: 0xbba681, roughness: .91 });
  const modern = new THREE.MeshStandardMaterial({ color: 0xb8c7cc, metalness: .24, roughness: .38 });
  for (let i = 0; i < 70; i++) {
    const w = 18 + random() * 46, d = 16 + random() * 38, h = 12 + random() * 48;
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i < 28 ? stone : modern);
    const side = i % 2 ? -1 : 1;
    building.position.set(side * (Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) + 65 + random() * 260),
      h / 2, bounds.min.z + random() * (bounds.max.z - bounds.min.z));
    building.castShadow = building.receiveShadow = true;
    city.add(building);
  }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(380, 10, 7), stone);
  wall.position.set(bounds.min.x - 75, 5, bounds.max.z * .28);
  wall.rotation.y = -.28;
  city.add(wall);
  for (let i = 0; i < 3; i++) {
    const tower = new THREE.Mesh(new THREE.CapsuleGeometry(17, 82 + i * 8, 8, 14), modern);
    tower.position.set(bounds.max.x + 230 + i * 32, 54 + i * 4, bounds.max.z + 130);
    tower.rotation.z = -.12 + i * .12;
    tower.castShadow = true;
    city.add(tower);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1500, 2600),
    new THREE.MeshStandardMaterial({ color: 0x2c7891, roughness: .28, metalness: .12 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(bounds.max.x + 820, -.2, 0);
  water.name = 'Caspian Sea waterfront';
  group.add(city, water);
  addGrandstand(THREE, group, new THREE.Vector3(bounds.min.x + 150, 1, bounds.min.z - 45), .12, 92, 0x356b9c);
}

function addSepangScene(THREE, group, bounds) {
  addTrees(THREE, group, bounds.clone().expandByScalar(310), 150, 20261004);
  addGrandstand(THREE, group, new THREE.Vector3(bounds.min.x - 30, 1, bounds.min.z - 75), .07, 145, 0x42734e);
  addGrandstand(THREE, group, new THREE.Vector3(bounds.max.x + 30, 1, bounds.max.z + 80), Math.PI + .2, 118, 0xc93d35);
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xd7e1de, metalness: .46, roughness: .32 });
  const landmark = new THREE.Group();
  landmark.name = 'Sepang paddock towers';
  for (const x of [-13, 13]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 58, 8), towerMaterial);
    tower.position.set(x, 29, 0);
    tower.castShadow = true;
    landmark.add(tower);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(32, 5, 7), towerMaterial);
  bridge.position.y = 42;
  landmark.add(bridge);
  landmark.position.set(bounds.max.x + 125, 0, bounds.min.z + 110);
  group.add(landmark);
}

export function createLate2026World(THREE, scene, config) {
  const { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS,
    prepareCurve } = config;
  if (TRACK_POINTS.length < 100 || TRACK_POINTS[0][0] !== TRACK_POINTS.at(-1)[0]
    || TRACK_POINTS[0][1] !== TRACK_POINTS.at(-1)[1]) {
    throw new Error(`Le tracé de ${config.name} est incomplet.`);
  }
  // TRACK_POINTS already use the source chirality. Do not mirror this array.
  const { curve, sourcePoints } = prepareCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
  const sampleCount = Math.max(1400, Math.round(TRACK_LENGTH_METERS / 3.2));
  const samples = Array.from({ length: sampleCount }, (_, i) => curve.getPointAt(i / sampleCount));
  const frames = samples.map((point, i) => {
    const forward = curve.getTangentAt(i / sampleCount).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  });
  const half = TRACK_WIDTH_METERS / 2;
  const trackBounds = new THREE.Box3().setFromPoints(samples);
  const size = trackBounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  const venue = new THREE.Group();
  venue.name = `${config.name} 2026 venue`;
  scene.add(venue);

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: config.groundColor, roughness: .98, metalness: 0, vertexColors: false,
  });
  const groundGeometry = sculptPlaneToTrack(
    new THREE.PlaneGeometry(span + 1900, span + 1900, 76, 76), samples,
    { baseHeight: -.45, roadClearance: .62, innerRadius: 62, outerRadius: 760, sampleStep: 9 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.name = `${config.name} terrain following the measured relief`;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  venue.add(ground);

  const shoulder = new THREE.MeshStandardMaterial({ color: config.shoulderColor,
    roughness: .96, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE, config.seed),
    color: 0xd7dbdc, roughness: .92, metalness: .015, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xf0efe8, side: THREE.DoubleSide });
  const curbRed = new THREE.MeshStandardMaterial({ color: config.curbColor,
    roughness: .83, side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: config.accent,
    transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  createRibbon(THREE, venue, `${config.name} paved shoulders`, frames,
    -half - (config.urban ? 5 : 8), half + (config.urban ? 5 : 8), shoulder, -.075);
  createRibbon(THREE, venue, `${config.name} overview silhouette`, frames,
    -half - 4.6, half + 4.6, overviewAccent, .01);
  createRibbon(THREE, venue, `${config.name} racing surface`, frames, -half, half, asphalt, 0);
  createRibbon(THREE, venue, `${config.name} left edge line`, frames,
    -half + .08, -half + .22, white, .025);
  createRibbon(THREE, venue, `${config.name} right edge line`, frames,
    half - .22, half - .08, white, .025);

  const pointCount = TRACK_POINTS.length - 1;
  for (const [id, turn] of Object.entries(LANDMARKS.turns)) {
    const u = turn.index / pointCount;
    const before = curve.getTangentAt(wrap01(u - .006)).setY(0).normalize();
    const after = curve.getTangentAt(wrap01(u + .006)).setY(0).normalize();
    const side = before.x * after.z - before.z * after.x < 0 ? 1 : -1;
    createSegmentRibbon(THREE, venue, `${config.name} ${id} kerb`, curve, u,
      24 / TRACK_LENGTH_METERS, side * (half + .03), side * (half + .75), curbRed, .035);
  }

  const gridU = wrap01(1 - config.finishBeforeStart / TRACK_LENGTH_METERS);
  addGrid(THREE, venue, curve, gridU, half, { ...config, length: TRACK_LENGTH_METERS });
  addBarriers(THREE, venue, curve, TRACK_LENGTH_METERS, half, config.urban);
  if (config.slug === 'madrid') addMadridScene(THREE, venue, trackBounds);
  if (config.slug === 'baku') addBakuScene(THREE, venue, trackBounds);
  if (config.slug === 'sepang') addSepangScene(THREE, venue, trackBounds);

  const gridPoint = curve.getPointAt(gridU);
  const gridTangent = curve.getTangentAt(gridU).setY(0).normalize();
  const bounds = trackBounds.clone().expandByScalar(config.urban ? 320 : 240);
  const trackHeightAt = (u, x, z) => {
    const point = curve.getPointAt(wrap01(u));
    if (!Number.isFinite(x) || !Number.isFinite(z)) return point.y;
    const tangent = curve.getTangentAt(wrap01(u));
    const grade = tangent.y / Math.max(.01, Math.hypot(tangent.x, tangent.z));
    return point.y + ((x - point.x) * tangent.x + (z - point.z) * tangent.z) * grade;
  };
  return {
    curve, samples, trackHeightAt, bounds, gridU, gridPoint, gridTangent,
    trackMaterial: asphalt, overviewAccent,
    environment: { group: venue },
    trackside: { group: venue, updateLighting() {}, setWetLighting() {} },
    sourcePoints,
  };
}
