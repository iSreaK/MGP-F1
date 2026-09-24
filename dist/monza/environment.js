/**
 * Lightweight, deterministic Monza scenery for a Three.js circuit model.
 * Coordinates are metres; X/Z are horizontal and Y is up. The circuit itself
 * is supplied by the caller and should sit at groundY + 0.025 or higher.
 *
 * No Three.js import is used so the caller can share its existing THREE build.
 */

/** Add the environment directly to an existing scene. Returns the asset handle. */
export function addMonzaEnvironment(scene, THREE, trackSamples, options = {}) {
  if (!scene || typeof scene.add !== 'function') {
    throw new Error('addMonzaEnvironment requires a Three.js scene or group.');
  }
  const asset = createMonzaEnvironment(THREE, { trackPoints: trackSamples, ...options });
  scene.add(asset.group);
  return asset;
}

export function createMonzaEnvironment(THREE, options = {}) {
  const {
    trackPoints,
    trackWidth = 12,
    groundY = 0,
    seed = 1922,
    treeCount = 1250,
    margin = 240,
    landmarks = {},
    treeShadows = false,
  } = options;
  if (!THREE || !Array.isArray(trackPoints) || trackPoints.length < 3) {
    throw new Error('createMonzaEnvironment requires THREE and at least three trackPoints.');
  }

  const path = trackPoints.map((p) => ({
    x: Number(Array.isArray(p) ? p[0] : p.x),
    z: Number(Array.isArray(p) ? p[1] : p.z),
  }));
  if (path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) {
    throw new Error('trackPoints must contain finite x/z coordinates.');
  }
  if (distance(path[0], path[path.length - 1]) < 0.1) path.pop();
  if (path.length < 3) throw new Error('trackPoints must form a loop.');

  const rng = mulberry32(seed >>> 0);
  const group = new THREE.Group();
  group.name = 'Monza environment';
  const samples = sampleClosedPath(path, 5.5);
  const bbox = boundsOf(path, margin);
  const statistics = { trees: 0, guardrailPosts: 0, curbSegments: 0, gravelTraps: 0, grandstands: 0 };

  const materials = {
    grass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }),
    gravel: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }),
    curb: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: 0x9a9d9a, metalness: 0.58, roughness: 0.48, side: THREE.DoubleSide }),
    railPost: new THREE.MeshStandardMaterial({ color: 0x7d817f, metalness: 0.65, roughness: 0.43 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xc4c6be, roughness: 0.94 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x3c4040, roughness: 0.97 }),
    asphaltLine: new THREE.MeshBasicMaterial({ color: 0xf0eee5 }),
    building: new THREE.MeshStandardMaterial({ color: 0xd3d4cc, metalness: 0.12, roughness: 0.74 }),
    darkWall: new THREE.MeshStandardMaterial({ color: 0x3a3e3f, metalness: 0.3, roughness: 0.6 }),
    glazing: new THREE.MeshStandardMaterial({ color: 0x34515b, metalness: 0.55, roughness: 0.22 }),
    garageDoor: new THREE.MeshStandardMaterial({ color: 0x8c9496, metalness: 0.5, roughness: 0.52 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x9a9f9d, metalness: 0.35, roughness: 0.58 }),
    racingRed: new THREE.MeshStandardMaterial({ color: 0x9e2328, roughness: 0.74 }),
    seatRed: new THREE.MeshStandardMaterial({ color: 0x9d2930, roughness: 0.87 }),
    seatGrey: new THREE.MeshStandardMaterial({ color: 0x656d6d, roughness: 0.87 }),
    spectatorShirt: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    spectatorSkin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x635d4c, roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98 }),
  };

  addGround();
  const straight = normalizeStraight(landmarks.pitStraight) || findLongestStraight(samples);
  const gravelTraps = Array.isArray(landmarks.gravelTraps)
    ? landmarks.gravelTraps.map(normalizeTrap).filter(Boolean)
    : deriveGravelTraps(samples, trackWidth);
  for (const trap of gravelTraps) addGravelTrap(trap);
  addCurbs();
  addGuardrails(straight);
  if (straight) addPitComplex(straight);

  const stands = Array.isArray(landmarks.stands) ? landmarks.stands : defaultStands(straight, samples);
  for (const stand of stands) {
    const descriptor = normalizeStraight(stand);
    if (descriptor) addGrandstand(descriptor, stand);
  }
  addTrees(straight, stands, gravelTraps);

  return {
    group,
    bounds: bbox,
    statistics,
    dispose() {
      const geometries = new Set();
      const ownedMaterials = new Set();
      const textures = new Set();
      group.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          for (const mat of (Array.isArray(object.material) ? object.material : [object.material])) {
            ownedMaterials.add(mat);
            if (mat.map) textures.add(mat.map);
          }
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };

  function addGround() {
    // Extend the distant park past the camera frustum to avoid a rectangular
    // terrain edge in the opening aerial view.
    const width = bbox.maxX - bbox.minX + 4200;
    const depth = bbox.maxZ - bbox.minZ + 4200;
    const geo = new THREE.PlaneGeometry(width, depth, 48, 48);
    const color = new THREE.Color();
    const colors = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const x = geo.attributes.position.getX(i);
      const y = geo.attributes.position.getY(i);
      const variation = 0.88 + 0.12 * Math.sin(x * 0.013 + Math.cos(y * 0.008))
        + 0.07 * Math.sin(y * 0.019 - x * 0.006);
      color.setRGB(variation, variation * 0.98, variation * 0.88);
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const turf = grassTexture(THREE, rng);
    if (turf) {
      turf.repeat.set(width / 46, depth / 46);
      materials.grass.map = turf;
    }
    const mesh = new THREE.Mesh(geo, materials.grass);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((bbox.minX + bbox.maxX) / 2, groundY - 0.027, (bbox.minZ + bbox.maxZ) / 2);
    mesh.receiveShadow = true;
    mesh.name = 'Grass terrain';
    group.add(mesh);
    const gravel = gravelTexture(THREE, rng);
    if (gravel) {
      gravel.repeat.set(14, 9);
      materials.gravel.map = gravel;
    }
  }

  function addGravelTrap(trap) {
    const segments = 72;
    const vertices = [trap.x, groundY + 0.005, trap.z];
    const uvs = [0.5, 0.5];
    const indices = [];
    const ca = Math.cos(trap.rotation || 0);
    const sa = Math.sin(trap.rotation || 0);
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const waviness = 1 + 0.025 * Math.sin(5 * a + trap.x * 0.03)
        + 0.018 * Math.cos(9 * a + trap.z * 0.02);
      const u = Math.cos(a) * trap.rx * waviness;
      const v = Math.sin(a) * trap.rz * waviness;
      vertices.push(trap.x + u * ca - v * sa, groundY + 0.005, trap.z + u * sa + v * ca);
      uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      if (i < segments) indices.push(0, i + 1, i + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const patch = new THREE.Mesh(geo, materials.gravel);
    patch.receiveShadow = true;
    patch.name = 'Gravel run-off';
    group.add(patch);
    statistics.gravelTraps++;
  }

  function addCurbs() {
    const xyz = [];
    const rgb = [];
    const red = [0.72, 0.075, 0.075];
    const white = [0.91, 0.88, 0.79];
    for (let i = 0; i < samples.length; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % samples.length];
      if (Math.max(a.curvature, b.curvature) < 0.005) continue;
      const paint = Math.floor(a.s / 3.25) % 2 === 0 ? red : white;
      for (const side of [-1, 1]) {
        const edge = trackWidth / 2 + 0.025;
        const outer = edge + 1.05;
        const p0 = offset(a, edge * side);
        const p1 = offset(b, edge * side);
        const p2 = offset(b, outer * side);
        const p3 = offset(a, outer * side);
        pushQuad(xyz, rgb, p0, p1, p2, p3, groundY + 0.029, paint);
        statistics.curbSegments++;
      }
    }
    if (!xyz.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, materials.curb);
    mesh.name = 'Raised red and white curbs';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  function addGuardrails(pit) {
    const railPos = [];
    const postInstances = [];
    const skipPit = pit ? { a: pit.start, b: pit.end, side: pit.side || 1 } : null;
    for (const side of [-1, 1]) {
      for (let i = 0; i < samples.length; i++) {
        const a = samples[i];
        const b = samples[(i + 1) % samples.length];
        const distanceFromCircuit = Math.max(a.curvature, b.curvature) > 0.008 ? 37 : 28;
        if (skipPit && side === skipPit.side &&
            pointSegmentDistance(a, skipPit.a, skipPit.b) < 38) continue;
        const p0 = offset(a, side * distanceFromCircuit);
        const p1 = offset(b, side * distanceFromCircuit);
        for (const [low, high] of [[0.47, 0.63], [0.82, 0.99]]) {
          railPos.push(
            p0.x, groundY + low, p0.z, p1.x, groundY + low, p1.z,
            p1.x, groundY + high, p1.z, p0.x, groundY + low, p0.z,
            p1.x, groundY + high, p1.z, p0.x, groundY + high, p0.z,
          );
        }
        if (i % 2 === 0) postInstances.push(p0);
      }
    }
    if (railPos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
      geo.computeVertexNormals();
      const rails = new THREE.Mesh(geo, materials.rail);
      rails.name = 'Double steel guardrails';
      group.add(rails);
    }
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 1.22, 0.14), materials.railPost, postInstances.length,
    );
    const matrix = new THREE.Matrix4();
    postInstances.forEach((p, i) => {
      matrix.makeTranslation(p.x, groundY + 0.61, p.z);
      posts.setMatrixAt(i, matrix);
    });
    posts.instanceMatrix.needsUpdate = true;
    posts.name = 'Guardrail posts';
    group.add(posts);
    statistics.guardrailPosts = postInstances.length;
  }

  function addPitComplex(pit) {
    const direction = directionOf(pit.start, pit.end);
    const length = Math.min(340, distance(pit.start, pit.end) * 0.8);
    if (length < 80) return;
    // Local +Z points left of the travel direction after yaw rotation, while
    // path offsets use +1 on the right. Flip it for the pit complex geometry.
    const side = -(pit.side || 1);
    const yaw = Math.atan2(-direction.z, direction.x);
    const middle = midpoint(pit.start, pit.end);
    const complex = new THREE.Group();
    complex.name = 'Monza pit lane and paddock';
    complex.position.set(middle.x, 0, middle.z);
    complex.rotation.y = yaw;
    group.add(complex);

    const laneZ = side * (trackWidth / 2 + 7.6);
    box(complex, 'Pit lane tarmac', length + 36, 0.055, 12.8,
      0, groundY + 0.002, laneZ, materials.asphalt);
    box(complex, 'Pit lane separation line', length + 30, 0.009, 0.18,
      0, groundY + 0.036, side * (trackWidth / 2 + 2.0), materials.asphaltLine);
    const pitMarks = [];
    for (let i = -Math.floor(length / 11 / 2); i <= Math.floor(length / 11 / 2); i++) {
      pitMarks.push([0.12, 0.008, 4.6, i * 11, groundY + 0.036, side * (trackWidth / 2 + 10.2)]);
    }
    instancedBoxes(complex, 'Pit box markings', materials.asphaltLine, pitMarks);
    const pitWall = [];
    for (let i = -Math.floor(length / 3 / 2); i <= Math.floor(length / 3 / 2); i++) {
      pitWall.push([2.93, 0.93, 0.56, i * 3, groundY + 0.465, side * (trackWidth / 2 + 0.85)]);
    }
    instancedBoxes(complex, 'Pit wall modules', materials.concrete, pitWall);
    const buildingZ = side * (trackWidth / 2 + 23.8);
    const buildingDepth = 17.4;
    box(complex, 'Garage block', length, 6.1, buildingDepth,
      0, groundY + 3.05, buildingZ, materials.building);
    box(complex, 'Upper hospitality floor', length - 3, 5.1, buildingDepth - 1.5,
      0, groundY + 8.73, buildingZ + side * 0.25, materials.glazing);
    box(complex, 'Hospitality parapet', length + 1.8, 1.12, buildingDepth + 1.7,
      0, groundY + 11.85, buildingZ, materials.darkWall);
    box(complex, 'Overhanging roof', length + 6.0, 0.48, buildingDepth + 8,
      0, groundY + 12.65, buildingZ - side * 2.0, materials.roof);
    box(complex, 'Red roof fascia', length + 6, 0.55, 0.65,
      0, groundY + 12.38, buildingZ - side * (buildingDepth / 2 + 5.5), materials.racingRed);
    const bayCount = Math.max(10, Math.floor(length / 11.2));
    const bayWidth = length / bayCount;
    const shutters = [];
    const headers = [];
    const mullions = [];
    for (let i = 0; i < bayCount; i++) {
      const x = -length / 2 + bayWidth * (i + 0.5);
      shutters.push([bayWidth - 1.1, 4.35, 0.085,
        x, groundY + 2.31, buildingZ - side * (buildingDepth / 2 + 0.052)]);
      headers.push([bayWidth - 0.35, 0.25, 0.10,
        x, groundY + 5.05, buildingZ - side * (buildingDepth / 2 + 0.12)]);
      mullions.push([0.16, 4.2, 0.14,
        x - bayWidth / 2, groundY + 8.55, buildingZ - side * (buildingDepth / 2 + 0.18)]);
    }
    instancedBoxes(complex, 'Garage roller shutters', materials.garageDoor, shutters);
    instancedBoxes(complex, 'Garage headers', materials.darkWall, headers);
    instancedBoxes(complex, 'Hospitality window mullions', materials.darkWall, mullions);
    const awningRibs = [];
    for (let i = -Math.floor(length / 22 / 2); i <= Math.floor(length / 22 / 2); i++) {
      awningRibs.push([0.17, 0.2, 6.1,
        i * 22, groundY + 5.92, buildingZ - side * (buildingDepth / 2 + 3.0)]);
    }
    instancedBoxes(complex, 'Pit awning ribs', materials.darkWall, awningRibs);
    box(complex, 'Pit awning', length + 1, 0.25, 5.9,
      0, groundY + 6.0, buildingZ - side * (buildingDepth / 2 + 3.1), materials.roof);
    addPitSign(complex, buildingZ, buildingDepth, side, length);
    addGantry(complex, side, length);
  }

  function addPitSign(complex, buildingZ, buildingDepth, side, length) {
    if (typeof document === 'undefined') return;
    const tex = signTexture(THREE, 'AUTODROMO NAZIONALE MONZA', '#a72528', '#ffffff');
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(length - 8, 170), 3.6), mat);
    sign.position.set(0, groundY + 11.67, buildingZ - side * (buildingDepth / 2 + 0.92));
    sign.rotation.y = side > 0 ? Math.PI : 0;
    sign.name = 'Autodromo Nazionale Monza facade lettering';
    complex.add(sign);
  }

  function addGantry(complex, side, length) {
    const position = Math.min(64, length * 0.22);
    for (const z of [-trackWidth / 2 - 1.7, trackWidth / 2 + 1.7]) {
      box(complex, 'Start straight gantry leg', 0.56, 8.4, 0.6,
        position, groundY + 4.2, z, materials.darkWall);
    }
    box(complex, 'Start straight gantry bridge', 0.9, 1.75, trackWidth + 5.5,
      position, groundY + 8.52, 0, materials.darkWall);
    const lights = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 0.28, 0.46),
      new THREE.MeshBasicMaterial({ color: 0xbd151c }), 5,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      matrix.makeTranslation(position - 0.5, groundY + 8.25, (i - 2) * 1.75);
      lights.setMatrixAt(i, matrix);
    }
    lights.instanceMatrix.needsUpdate = true;
    lights.name = 'Starting lights';
    complex.add(lights);
  }

  function addGrandstand(desc, original) {
    const d = directionOf(desc.start, desc.end);
    const segmentLength = distance(desc.start, desc.end);
    const length = Math.max(32, Math.min(Number(original.length) || segmentLength * 0.77, 145));
    const side = desc.side || 1;
    const rows = clamp(Math.floor(Number(original.rows) || 12), 6, 17);
    const stand = new THREE.Group();
    stand.name = 'Covered Monza grandstand';
    const mid = midpoint(desc.start, desc.end);
    stand.position.set(mid.x + -d.z * side * (trackWidth / 2 + 53), groundY, mid.z + d.x * side * (trackWidth / 2 + 53));
    stand.rotation.y = Math.atan2(-d.z, d.x);
    group.add(stand);

    box(stand, 'Grandstand concrete slab', length + 5, 0.42, rows * 1.42 + 2.5,
      0, 0.22, side * rows * 0.72, materials.concrete);
    for (let row = 0; row < rows; row++) {
      const z = side * (row * 1.42 + 0.7);
      const y = 0.54 + row * 0.43;
      box(stand, 'Stepped concrete terrace', length + 1, 0.3, 1.39,
        0, y, z, materials.concrete);
      box(stand, 'Bench row', length - 1, 0.13, 0.58,
        0, y + 0.33, z + side * 0.08,
        row % 4 === 0 ? materials.seatGrey : materials.seatRed);
      box(stand, 'Seat backs', length - 1, 0.42, 0.1,
        0, y + 0.6, z + side * 0.33,
        row % 4 === 0 ? materials.seatGrey : materials.seatRed);
    }
    const columns = Math.max(3, Math.ceil(length / 25));
    for (let i = 0; i <= columns; i++) {
      const x = -length / 2 + length * i / columns;
      box(stand, 'Grandstand steel support', 0.17, 9.8, 0.18,
        x, 4.9, side * (rows * 1.42 - 0.5), materials.darkWall);
      box(stand, 'Grandstand front support', 0.17, 8.0, 0.18,
        x, 4.0, side * (-0.7), materials.darkWall);
    }
    const roof = box(stand, 'Grandstand floating metal roof', length + 4.3, 0.3, rows * 1.42 + 5.0,
      0, 9.75, side * (rows * 0.71 - 0.45), materials.roof);
    roof.rotation.x = side * -0.055;
    box(stand, 'Grandstand red roof fascia', length + 4.3, 0.6, 0.25,
      0, 9.36, side * -2.76, materials.racingRed);
    const spectators = [];
    const spacing = 2.55;
    for (let row = 0; row < rows; row++) {
      for (let x = -length / 2 + 2; x < length / 2 - 1; x += spacing) {
        if (rng() < 0.38) continue;
        spectators.push({
          x: x + (rng() - .5) * .42,
          y: .54 + row * .43,
          z: side * (row * 1.42 + .72),
          tint: rng(),
          skin: rng(),
        });
      }
    }
    const shirts = new THREE.InstancedMesh(
      new THREE.SphereGeometry(.35, 5, 4), materials.spectatorShirt, spectators.length,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(.19, 5, 4), materials.spectatorSkin, spectators.length,
    );
    const dummy = new THREE.Object3D();
    const shade = new THREE.Color();
    spectators.forEach((person, i) => {
      dummy.position.set(person.x, person.y + .84, person.z);
      dummy.scale.set(.92, 1.13, .86);
      dummy.updateMatrix();
      shirts.setMatrixAt(i, dummy.matrix);
      shade.setHex(person.tint < .38 ? 0xbe252c : person.tint < .63 ? 0xe8e9e1 : person.tint < .85 ? 0x25302e : 0x2e644e);
      shirts.setColorAt(i, shade);
      dummy.position.y = person.y + 1.29;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      shade.setHex(person.skin < .34 ? 0xd7ae8e : person.skin < .69 ? 0xa98065 : 0x70533e);
      heads.setColorAt(i, shade);
    });
    for (const mesh of [shirts, heads]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      stand.add(mesh);
    }
    shirts.name = 'Grandstand spectators';
    heads.name = 'Grandstand spectator heads';
    statistics.grandstands++;
  }

  function addTrees(pit, stands, traps) {
    const positions = [];
    const terrainWidth = bbox.maxX - bbox.minX;
    const terrainDepth = bbox.maxZ - bbox.minZ;
    const nearestDistance = (p) => {
      let best = Infinity;
      for (let i = 0; i < path.length; i++) {
        const d = pointSegmentDistance(p, path[i], path[(i + 1) % path.length]);
        if (d < best) best = d;
      }
      return best;
    };
    for (let attempts = 0; positions.length < treeCount && attempts < treeCount * 38; attempts++) {
      let x, z;
      if (rng() < 0.72) {
        const anchor = samples[Math.floor(rng() * samples.length)];
        const side = rng() > 0.5 ? 1 : -1;
        const radial = 37 + Math.pow(rng(), 0.75) * 235;
        const p = offset(anchor, side * radial);
        x = p.x + (rng() - 0.5) * 14;
        z = p.z + (rng() - 0.5) * 14;
      } else {
        x = bbox.minX + terrainWidth * rng();
        z = bbox.minZ + terrainDepth * rng();
      }
      if (x < bbox.minX + 5 || x > bbox.maxX - 5 || z < bbox.minZ + 5 || z > bbox.maxZ - 5) continue;
      const p = { x, z };
      if (nearestDistance(p) < 31) continue;
      if (pit && pointSegmentDistance(p, pit.start, pit.end) < 72) continue;
      if (stands.some((stand) => stand.start && stand.end &&
          pointSegmentDistance(p, pointOf(stand.start), pointOf(stand.end)) < 73)) continue;
      if (traps.some((trap) => distance(p, trap) < Math.max(trap.rx, trap.rz) + 8)) continue;
      positions.push({ x, z, height: 10.5 + rng() * 10.8, type: rng() < 0.27 ? 'pine' : 'deciduous', hue: rng() });
    }

    const deciduous = positions.filter((p) => p.type === 'deciduous');
    const pines = positions.filter((p) => p.type === 'pine');
    const loader = new THREE.TextureLoader();
    const broadleafMap = loader.load(new URL('./assets/monza_park_broadleaf_tree.png', import.meta.url).href);
    const pineMap = loader.load(new URL('./assets/monza-trackside-pine-transparent.png', import.meta.url).href);
    for (const texture of [broadleafMap, pineMap]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    }
    const broadleafMaterial = new THREE.MeshBasicMaterial({
      map: broadleafMap, color: 0xffffff, side: THREE.DoubleSide,
      alphaTest: .24, depthWrite: true,
    });
    const pineMaterial = new THREE.MeshBasicMaterial({
      map: pineMap, color: 0xffffff, side: THREE.DoubleSide,
      alphaTest: .38, depthWrite: true,
    });
    const treePlane = new THREE.PlaneGeometry(1, 1);
    const dummy = new THREE.Object3D();
    const leaf = new THREE.Color();
    const addCrossedTrees = (trees, material, kind, sizeFor) => {
      const bins = new Map();
      for (const p of trees) {
        const key = `${Math.floor(p.x / 620)}:${Math.floor(p.z / 620)}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(p);
      }
      let chunk = 0;
      for (const batch of bins.values()) {
        const front = new THREE.InstancedMesh(treePlane, material, batch.length);
        const cross = new THREE.InstancedMesh(treePlane, material, batch.length);
        batch.forEach((p, i) => {
          const [width, height] = sizeFor(p);
          const yaw = p.hue * Math.PI * 2;
          dummy.position.set(p.x, groundY + p.height * .50, p.z);
          dummy.scale.set(width, height, 1);
          dummy.rotation.set(0, yaw, 0);
          dummy.updateMatrix();
          front.setMatrixAt(i, dummy.matrix);
          dummy.rotation.y = yaw + Math.PI / 2;
          dummy.updateMatrix();
          cross.setMatrixAt(i, dummy.matrix);
          if (kind === 'Broadleaf') leaf.setRGB(.78 + p.hue * .16, .83 + p.hue * .13, .74 + p.hue * .14);
          else leaf.setRGB(.79 + p.hue * .15, .83 + p.hue * .12, .75 + p.hue * .13);
          front.setColorAt(i, leaf);
          cross.setColorAt(i, leaf);
        });
        for (const mesh of [front, cross]) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.frustumCulled = true;
          mesh.name = `${kind} billboards ${chunk}`;
          group.add(mesh);
        }
        chunk++;
      }
    };
    addCrossedTrees(deciduous, broadleafMaterial, 'Broadleaf', p => [p.height * 1.45, p.height * 1.45]);
    addCrossedTrees(pines, pineMaterial, 'Pine', p => [p.height * .82, p.height * 1.21]);
    const shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(THREE), transparent: true, opacity: .31,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      positions.length,
    );
    positions.forEach((p, i) => {
      dummy.position.set(p.x, groundY + .015, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(p.height * .66, p.height * .38, 1);
      dummy.updateMatrix();
      shadows.setMatrixAt(i, dummy.matrix);
    });
    shadows.instanceMatrix.needsUpdate = true;
    shadows.frustumCulled = false;
    shadows.name = 'Soft tree contact shadows';
    group.add(shadows);
    statistics.trees = positions.length;
  }

  function box(parent, name, width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = name.includes('roof') || name.includes('Roof') || name.includes('Garage block');
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function instancedBoxes(parent, name, material, items) {
    if (!items.length) return null;
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
    const dummy = new THREE.Object3D();
    items.forEach(([w, h, d, x, y, z], index) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.name = name;
    instances.receiveShadow = true;
    instances.frustumCulled = false;
    parent.add(instances);
    return instances;
  }
}

function pointOf(p) {
  return { x: Number(Array.isArray(p) ? p[0] : p.x), z: Number(Array.isArray(p) ? p[1] : p.z) };
}

function normalizeStraight(value) {
  if (!value || !value.start || !value.end) return null;
  const start = pointOf(value.start);
  const end = pointOf(value.end);
  if (![start.x, start.z, end.x, end.z].every(Number.isFinite) || distance(start, end) < 40) return null;
  return { start, end, side: value.side === -1 ? -1 : 1 };
}

function normalizeTrap(trap) {
  if (!trap) return null;
  const x = Number(trap.x);
  const z = Number(trap.z);
  const rx = Number(trap.rx ?? trap.radiusX);
  const rz = Number(trap.rz ?? trap.radiusZ);
  if (![x, z, rx, rz].every(Number.isFinite) || rx < 3 || rz < 3) return null;
  return { x, z, rx, rz, rotation: Number(trap.rotation) || 0 };
}

function deriveGravelTraps(samples, trackWidth) {
  const candidates = [...samples].sort((a, b) => b.curvature - a.curvature);
  const selected = [];
  for (const s of candidates) {
    if (selected.length >= 2 && s.curvature < 0.004) break;
    if (selected.some((other) => distance(s, other) < 225)) continue;
    selected.push(s);
    if (selected.length === 5) break;
  }
  return selected.map((s) => {
    const side = s.turn > 0 ? -1 : 1;
    const p = offset(s, side * (trackWidth / 2 + 34));
    return { x: p.x, z: p.z, rx: 49, rz: 31, rotation: Math.atan2(s.tz, s.tx) };
  });
}

function defaultStands(straight, samples) {
  if (!straight) return [];
  // addGrandstand's local side convention is opposite to the pit complex's;
  // this puts the principal stand across the circuit from the garages.
  const stand = { start: straight.start, end: straight.end, side: straight.side, rows: 13, length: 145 };
  const far = samples[Math.floor(samples.length * 0.53)];
  const a = { x: far.x - far.tx * 48, z: far.z - far.tz * 48 };
  const b = { x: far.x + far.tx * 48, z: far.z + far.tz * 48 };
  return [stand, { start: a, end: b, side: -1, rows: 9, length: 75 }];
}

function findLongestStraight(samples) {
  let best = null;
  let start = -1;
  for (let i = 0; i <= samples.length; i++) {
    const straight = i < samples.length && samples[i].curvature < 0.0028;
    if (straight && start < 0) start = i;
    if ((!straight || i === samples.length) && start >= 0) {
      if (!best || i - start > best.length) best = { start, end: i - 1, length: i - start };
      start = -1;
    }
  }
  if (!best || best.length < 22) return null;
  const a = samples[best.start + Math.floor(best.length * 0.12)];
  const b = samples[best.start + Math.floor(best.length * 0.88)];
  return { start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z }, side: 1 };
}

function sampleClosedPath(path, step) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const length = distance(a, b);
    if (length < 0.001) continue;
    segments.push({ a, b, length, start: total });
    total += length;
  }
  const count = Math.max(36, Math.ceil(total / step));
  const points = [];
  let segmentIndex = 0;
  for (let i = 0; i < count; i++) {
    const s = i / count * total;
    while (segmentIndex < segments.length - 1 &&
      s > segments[segmentIndex].start + segments[segmentIndex].length) segmentIndex++;
    const segment = segments[segmentIndex];
    const t = clamp((s - segment.start) / segment.length, 0, 1);
    points.push({ x: lerp(segment.a.x, segment.b.x, t), z: lerp(segment.a.z, segment.b.z, t), s });
  }
  for (let i = 0; i < count; i++) {
    const prev = points[(i + count - 3) % count];
    const next = points[(i + 3) % count];
    const delta = directionOf(prev, next);
    points[i].tx = delta.x;
    points[i].tz = delta.z;
  }
  for (let i = 0; i < count; i++) {
    const prev = points[(i + count - 3) % count];
    const next = points[(i + 3) % count];
    const cross = prev.tx * next.tz - prev.tz * next.tx;
    const dot = clamp(prev.tx * next.tx + prev.tz * next.tz, -1, 1);
    const angle = Math.atan2(cross, dot);
    points[i].curvature = Math.abs(angle) / (6 * total / count);
    points[i].turn = Math.sign(angle);
  }
  return points;
}

function boundsOf(path, margin) {
  return {
    minX: Math.min(...path.map((p) => p.x)) - margin,
    maxX: Math.max(...path.map((p) => p.x)) + margin,
    minZ: Math.min(...path.map((p) => p.z)) - margin,
    maxZ: Math.max(...path.map((p) => p.z)) + margin,
  };
}

function grassTexture(THREE, rng) {
  return createNoiseTexture(THREE, rng, 256, (v) => {
    const n = (v - 0.5) * 34;
    return [114 + n * 0.72, 148 + n, 94 + n * 0.68];
  });
}

function contactShadowTexture(THREE) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + .5 - size / 2) / (size / 2);
      const dy = (y + .5 - size / 2) / (size / 2);
      const falloff = Math.max(0, 1 - dx * dx - dy * dy);
      const i = (y * size + x) * 4;
      pixels.data[i] = 20;
      pixels.data[i + 1] = 29;
      pixels.data[i + 2] = 22;
      pixels.data[i + 3] = Math.round(falloff * falloff * 185);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function gravelTexture(THREE, rng) {
  return createNoiseTexture(THREE, rng, 256, (v) => {
    const n = (v - 0.5) * 75;
    return [141 + n, 137 + n, 121 + n * 0.9];
  });
}

function createNoiseTexture(THREE, rng, size, colorize) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const data = context.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = colorize(rng());
    data.data[i * 4] = clamp(r, 0, 255);
    data.data[i * 4 + 1] = clamp(g, 0, 255);
    data.data[i * 4 + 2] = clamp(b, 0, 255);
    data.data[i * 4 + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function signTexture(THREE, text, background, foreground) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = foreground;
  ctx.font = '700 59px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, 995);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function pushQuad(xyz, rgb, a, b, c, d, y, color) {
  for (const p of [a, b, c, a, c, d]) {
    xyz.push(p.x, y, p.z);
    rgb.push(color[0], color[1], color[2]);
  }
}

function offset(p, amount) {
  return { x: p.x - p.tz * amount, z: p.z + p.tx * amount };
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

function directionOf(a, b) {
  const length = distance(a, b) || 1;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
}

function midpoint(a, b) { return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; }
function distance(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
