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
    terrainHeightAt = null,
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
  const heightAt = (x, z) => {
    if (typeof terrainHeightAt !== 'function') return groundY;
    const y = terrainHeightAt(x, z);
    return Number.isFinite(y) ? y : groundY;
  };
  const group = new THREE.Group();
  group.name = 'Monza environment';
  const samples = sampleClosedPath(path, 5.5);
  const bbox = boundsOf(path, margin);
  const statistics = { trees: 0, guardrailPosts: 0, curbSegments: 0, gravelTraps: 0, grandstands: 0, serviceRoads: 0 };
  // Only scenery farther from the safety zone is lifted. The racing surface
  // continues to use the exact terrainHeightAt profile supplied by world.js.
  const trackCells = new Map();
  const cellSize = 96;
  const cellKey = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  for (const sample of samples) {
    const key = cellKey(sample.x, sample.z);
    if (!trackCells.has(key)) trackCells.set(key, []);
    trackCells.get(key).push(sample);
  }
  const nearestTrack = (x, z) => {
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    let nearest = null;
    let best = Infinity;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const bucket = trackCells.get(`${cx + dx},${cz + dz}`);
      if (!bucket) continue;
      for (const p of bucket) {
        const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
        if (d2 < best) { best = d2; nearest = p; }
      }
    }
    if (!nearest) return null;
    const signedSide = Math.sign(nearest.tx * (z - nearest.z) - nearest.tz * (x - nearest.x));
    return { sample: nearest, distance: Math.sqrt(best), side: signedSide };
  };
  const scenicHeightAt = (x, z) => {
    const base = heightAt(x, z);
    const nearest = nearestTrack(x, z);
    if (!nearest) return base;
    const d = nearest.distance;
    if (d < 31 || d > 265) return base;
    // Parkland has broad contours, while the raised spectator banks are placed
    // only behind the barriers. This leaves kerbs and runoff at road grade.
    const natural = smoothstep(32, 85, d) * (1 - smoothstep(215, 265, d)) *
      (.28 * Math.sin(x * .025 + z * .006) + .19 * Math.cos(z * .018 - x * .011));
    const banks = [
      [80, 760, 1, 2.9], [1080, 1800, 1, 2.2],
      [1880, 2800, 1, 2.5], [3500, 4250, -1, 3.5],
      [4800, 5630, 1, 3.0],
    ];
    let rise = 0;
    for (const [from, to, side, height] of banks) {
      if (nearest.side !== side) continue;
      const along = smoothstep(from, from + 90, nearest.sample.s) *
        (1 - smoothstep(to - 90, to, nearest.sample.s));
      const across = smoothstep(61, 105, d) * (1 - smoothstep(165, 245, d));
      rise = Math.max(rise, height * along * across);
    }
    return base + natural + rise;
  };
  const serviceRoadSegments = [];

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
    seatPlastic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .78, metalness: .04 }),
    spectatorShirt: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    spectatorSkin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x635d4c, roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98 }),
    serviceRoad: new THREE.MeshStandardMaterial({ color: 0xc9ccc2, roughness: 1, side: THREE.DoubleSide }),
    footpath: new THREE.MeshStandardMaterial({ color: 0xc6b89b, roughness: 1, side: THREE.DoubleSide }),
    embankment: new THREE.MeshStandardMaterial({ color: 0x777c62, roughness: 1, side: THREE.DoubleSide }),
    standPaving: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .94,
      vertexColors: true, side: THREE.DoubleSide }),
    standAggregate: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1,
      vertexColors: true, side: THREE.DoubleSide }),
    drain: new THREE.MeshStandardMaterial({ color: 0x343938, roughness: .91, side: THREE.DoubleSide }),
  };

  addGround();
  const straight = normalizeStraight(landmarks.pitStraight) || findLongestStraight(samples);
  const gravelTraps = Array.isArray(landmarks.gravelTraps)
    ? landmarks.gravelTraps.map(normalizeTrap).filter(Boolean)
    : deriveGravelTraps(samples, trackWidth);
  for (const trap of gravelTraps) addGravelTrap(trap);
  // The road mesh owns the corner kerbs; duplicating them here created
  // overlapping strips, especially where the road follows the new relief.
  addGuardrails(straight);
  // Pit building, grid bridge and lights are now aligned to the road curve by
  // the dedicated track infrastructure module.

  const stands = Array.isArray(landmarks.stands) ? landmarks.stands : defaultStands(straight, samples);
  for (const stand of stands) {
    const descriptor = normalizeStraight(stand);
    if (descriptor) addGrandstand(descriptor, stand);
  }
  addServiceRoads();
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
    const geo = new THREE.PlaneGeometry(width, depth, 204, 268);
    const terrainCenterX = (bbox.minX + bbox.maxX) / 2;
    const terrainCenterZ = (bbox.minZ + bbox.maxZ) / 2;
    const color = new THREE.Color();
    const colors = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const x = geo.attributes.position.getX(i);
      const y = geo.attributes.position.getY(i);
      const worldX = x + terrainCenterX;
      const worldZ = terrainCenterZ - y;
      geo.attributes.position.setZ(i, scenicHeightAt(worldX, worldZ) - groundY);
      const mottling = .5 * valueNoise(worldX, worldZ, 27) +
        .35 * valueNoise(worldX, worldZ, 91) + .15 * valueNoise(worldX, worldZ, 190);
      const variation = .78 + .30 * mottling;
      const dryGrass = smoothstep(.48, .82, valueNoise(worldX, worldZ, 225));
      color.setRGB(variation * (.94 + .16 * dryGrass),
        variation * (1 - .11 * dryGrass), variation * (.81 - .09 * dryGrass));
      colors.push(color.r, color.g, color.b);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const turf = grassTexture(THREE, rng);
    if (turf) {
      turf.repeat.set(width / 46, depth / 46);
      materials.grass.map = turf;
    }
    materials.standPaving.map = standPavingTexture(THREE, mulberry32((seed ^ 0x7c9ab5e1) >>> 0));
    materials.standAggregate.map = createNoiseTexture(THREE,
      mulberry32((seed ^ 0x45c31e7a) >>> 0), 256, (v) => {
        const n = (v - .5) * 55;
        return [166 + n, 158 + n, 140 + n * .9];
      });
    const mesh = new THREE.Mesh(geo, materials.grass);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(terrainCenterX, groundY - 0.027, terrainCenterZ);
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
    if (trap.points) {
      const polygon = trap.points.map((p) => new THREE.Vector2(p.x, p.z));
      const triangles = THREE.ShapeUtils.triangulateShape(polygon, []);
      if (!triangles.length) return;
      const vertices = [];
      const uvs = [];
      for (const p of trap.points) {
        vertices.push(p.x, scenicHeightAt(p.x, p.z) + .085, p.z);
        uvs.push(p.x / 115, p.z / 115);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(triangles.flat());
      geometry.computeVertexNormals();
      const patch = new THREE.Mesh(geometry, materials.gravel);
      patch.name = `Gravel run-off – ${trap.name || 'Monza corner'}`;
      patch.receiveShadow = true;
      group.add(patch);
      statistics.gravelTraps++;
      return;
    }
    const segments = 72;
    const vertices = [trap.x, scenicHeightAt(trap.x, trap.z) + 0.085, trap.z];
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
      const px = trap.x + u * ca - v * sa;
      const pz = trap.z + u * sa + v * ca;
      vertices.push(px, scenicHeightAt(px, pz) + 0.085, pz);
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

  function addServiceRoads() {
    const roadMap = createNoiseTexture(THREE, rng, 128, v => {
      const grain = (v - .5) * 28;
      return [118 + grain, 121 + grain, 112 + grain];
    });
    if (roadMap) materials.serviceRoad.map = roadMap;
    const shoulderMap = createNoiseTexture(THREE, rng, 128, v => {
      const grain = (v - .5) * 33;
      return [161 + grain, 153 + grain, 127 + grain];
    });
    if (shoulderMap) materials.footpath.map = shoulderMap;
    const paths = [
      [45, 780, 1, 96, 6.5], [1060, 1790, 1, 96, 5.2],
      [1880, 2780, 1, 92, 5.4], [3460, 4250, -1, 102, 5.6],
      [4730, 5650, 1, 103, 6.1],
    ];
    for (const [from, to, side, radial, width] of paths) {
      const vertices = [];
      const uvs = [];
      const indices = [];
      const shoulderVertices = [];
      const shoulderUvs = [];
      const shoulderIndices = [];
      const stations = samples.filter((p, i) => p.s >= from && p.s <= to && i % 3 === 0);
      for (let i = 0; i + 1 < stations.length; i++) {
        const a = stations[i];
        const b = stations[i + 1];
        const bendA = 3.6 * Math.sin(a.s * .012) + 1.2 * Math.sin(a.s * .046);
        const bendB = 3.6 * Math.sin(b.s * .012) + 1.2 * Math.sin(b.s * .046);
        const centerA = offset(a, side * (radial + bendA));
        const centerB = offset(b, side * (radial + bendB));
        if (nearestTrack(centerA.x, centerA.z)?.distance < 38 ||
            nearestTrack(centerB.x, centerB.z)?.distance < 38) continue;
        const corners = [
          offset(a, side * (radial + bendA) - width / 2),
          offset(a, side * (radial + bendA) + width / 2),
          offset(b, side * (radial + bendB) - width / 2),
          offset(b, side * (radial + bendB) + width / 2),
        ];
        const first = vertices.length / 3;
        for (const p of corners) vertices.push(p.x, scenicHeightAt(p.x, p.z) + .14, p.z);
        const v0 = a.s / 13;
        const v1 = b.s / 13;
        uvs.push(0, v0, 1, v0, 0, v1, 1, v1);
        indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
        const shoulderCorners = [
          offset(a, side * (radial + bendA) - 11),
          offset(a, side * (radial + bendA) + 11),
          offset(b, side * (radial + bendB) - 11),
          offset(b, side * (radial + bendB) + 11),
        ];
        const shoulderFirst = shoulderVertices.length / 3;
        for (const p of shoulderCorners)
          shoulderVertices.push(p.x, scenicHeightAt(p.x, p.z) + .095, p.z);
        shoulderUvs.push(0, v0 / 2, 1, v0 / 2, 0, v1 / 2, 1, v1 / 2);
        shoulderIndices.push(shoulderFirst, shoulderFirst + 1, shoulderFirst + 2,
          shoulderFirst + 1, shoulderFirst + 3, shoulderFirst + 2);
        serviceRoadSegments.push([centerA, centerB]);
      }
      if (!indices.length) continue;
      const shoulderGeometry = new THREE.BufferGeometry();
      shoulderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shoulderVertices, 3));
      shoulderGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(shoulderUvs, 2));
      shoulderGeometry.setIndex(shoulderIndices);
      shoulderGeometry.computeVertexNormals();
      const shoulder = new THREE.Mesh(shoulderGeometry, materials.footpath);
      shoulder.name = 'Dry gravel service road verge';
      shoulder.receiveShadow = true;
      group.add(shoulder);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const road = new THREE.Mesh(geometry, materials.serviceRoad);
      road.name = 'Winding Monza park service road';
      road.receiveShadow = true;
      group.add(road);
      statistics.serviceRoads++;
    }
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
    const lapMetres = samples[samples.length - 1].s + distance(samples[samples.length - 1], samples[0]);
    // The rebuilt pit block occupies about 230 m either side of the finish
    // line, on the driver's right. Keep the remaining main straight protected.
    const pitSide = pit ? -(pit.side || 1) : null;
    for (const side of [-1, 1]) {
      for (let i = 0; i < samples.length; i++) {
        const a = samples[i];
        const b = samples[(i + 1) % samples.length];
        const distanceFromCircuit = Math.max(a.curvature, b.curvature) > 0.008 ? 37 : 28;
        if (pitSide === side && (a.s < 235 || a.s > lapMetres - 235)) continue;
        const p0 = offset(a, side * distanceFromCircuit);
        const p1 = offset(b, side * distanceFromCircuit);
        const base0 = heightAt(p0.x, p0.z);
        const base1 = heightAt(p1.x, p1.z);
        for (const [low, high] of [[0.47, 0.63], [0.82, 0.99]]) {
          railPos.push(
            p0.x, base0 + low, p0.z, p1.x, base1 + low, p1.z,
            p1.x, base1 + high, p1.z, p0.x, base0 + low, p0.z,
            p1.x, base1 + high, p1.z, p0.x, base0 + high, p0.z,
          );
        }
        if (i % 2 === 0) postInstances.push({ ...p0, base: base0 });
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
      matrix.makeTranslation(p.x, p.base + 0.61, p.z);
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
    const length = Math.max(32, Math.min(Number(original.length) || segmentLength * 0.77, 165));
    const side = desc.side || 1;
    const rows = clamp(Math.floor(Number(original.rows) || 12), 6, 18);
    const roofed = original.roof !== false;
    const stand = new THREE.Group();
    stand.name = `Monza grandstand – ${original.name || 'spectator terrace'}`;
    const mid = midpoint(desc.start, desc.end);
    const setback = clamp(Number(original.setback) || 42, 37, 70);
    const standX = mid.x - d.z * side * (trackWidth / 2 + setback);
    const standZ = mid.z + d.x * side * (trackWidth / 2 + setback);
    const rearOffset = rows * 1.42 + 9;
    const footprintHeights = [
      scenicHeightAt(standX, standZ),
      scenicHeightAt(standX + d.x * length / 2, standZ + d.z * length / 2),
      scenicHeightAt(standX - d.x * length / 2, standZ - d.z * length / 2),
      scenicHeightAt(standX - d.z * side * rearOffset, standZ + d.x * side * rearOffset),
    ];
    const standY = Math.max(...footprintHeights) + (roofed ? 1.15 : .78);
    stand.position.set(standX, standY, standZ);
    stand.rotation.y = Math.atan2(-d.z, d.x);
    group.add(stand);
    addStandEmbankment(stand, standX, standZ, standY, length, rows, side);

    // Terraces rise from a solid earth/concrete berm. Seats and spectators are
    // instances, so the additional stands cost only a few draw calls each.
    box(stand, 'Grandstand concrete footprint', length + 3, .38, rows * 1.42 + 3.2,
      0, .18, side * rows * .71, materials.concrete);
    const terraces = [];
    const aisles = [];
    const aisleXs = length > 116 ? [-length / 3, 0, length / 3] : [-length / 4, length / 4];
    const seatPlaces = [];
    for (let row = 0; row < rows; row++) {
      const z = side * (row * 1.42 + 0.7);
      const top = .55 + row * .48;
      terraces.push([length + 1, top, 1.4, 0, top / 2, z]);
      for (const aisleX of aisleXs) aisles.push([1.5, .035, 1.38,
        aisleX, top + .018, z]);
      for (let x = -length / 2 + 1.2; x < length / 2 - .6; x += 1.22) {
        if (aisleXs.some((aisleX) => Math.abs(x - aisleX) < 1.12)) continue;
        seatPlaces.push({ x, z, top, row, tint: rng() });
      }
    }
    instancedBoxes(stand, 'Stepped concrete grandstand', materials.concrete, terraces);
    instancedBoxes(stand, 'Grandstand access aisles', materials.seatGrey, aisles);

    const seatBase = new THREE.InstancedMesh(
      new THREE.BoxGeometry(.98, .12, .66), materials.seatPlastic, seatPlaces.length);
    const seatBack = new THREE.InstancedMesh(
      new THREE.BoxGeometry(.98, .46, .10), materials.seatPlastic, seatPlaces.length);
    const dummy = new THREE.Object3D();
    const shade = new THREE.Color();
    const spectators = [];
    seatPlaces.forEach((seat, i) => {
      dummy.position.set(seat.x, seat.top + .12, seat.z - side * .11);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      seatBase.setMatrixAt(i, dummy.matrix);
      dummy.position.set(seat.x, seat.top + .38, seat.z + side * .27);
      dummy.updateMatrix();
      seatBack.setMatrixAt(i, dummy.matrix);
      const mainStraight = /rettifilo|traguardo/i.test(original.name || '');
      const palette = mainStraight
        ? (seat.row % 4 === 0 ? 0xdfe2df : seat.tint < .20 ? 0x77869a : 0x254563)
        : (seat.row % 4 === 0 || seat.tint < .11 ? 0x5a6264
          : seat.tint < .26 ? 0xd5d8d1 : 0xa41f26);
      shade.setHex(palette);
      seatBase.setColorAt(i, shade);
      seatBack.setColorAt(i, shade);
      if (rng() < (original.occupancy ?? .40)) spectators.push({
        x: seat.x + (rng() - .5) * .22,
        y: seat.top,
        z: seat.z,
        tint: rng(), skin: rng(),
      });
    });
    for (const mesh of [seatBase, seatBack]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      stand.add(mesh);
    }

    const rear = rows * 1.42 + .6;
    box(stand, 'Spectator access concourse', length + 8, .12, 6.8,
      0, .07, side * (rear + 5), materials.asphalt);
    const railItems = [];
    const railCount = Math.max(3, Math.ceil(length / 8));
    for (let i = 0; i <= railCount; i++) {
      const x = -length / 2 + length * i / railCount;
      railItems.push([.10, 1.7, .10, x, .85, side * -1.4]);
      railItems.push([.10, 1.4, .10, x, .7 + (rows - 1) * .48, side * (rear + .3)]);
    }
    instancedBoxes(stand, 'Grandstand safety railing posts', materials.railPost, railItems);
    box(stand, 'Grandstand front safety rail', length + 1.6, .09, .09,
      0, 1.65, side * -1.4, materials.rail);
    if (roofed) {
      const frontY = 5.6;
      const rearY = .55 + (rows - 1) * .48 + 3.5;
      const roofDepth = rear + 4.6;
      const roofCenterZ = side * (rear / 2 - .3);
      const roof = box(stand, 'Grandstand pitched roof', length + 4.6, .36, roofDepth,
        0, (frontY + rearY) / 2, roofCenterZ, materials.roof);
      roof.rotation.x = -side * Math.atan2(rearY - frontY, rear + 3.4);
      box(stand, 'Grandstand red roof fascia', length + 4.6, .54, .23,
        0, frontY - .08, side * -2.5, materials.racingRed);
      const supports = [];
      const columns = Math.max(3, Math.ceil(length / 27));
      for (let i = 0; i <= columns; i++) {
        const x = -length / 2 + length * i / columns;
        supports.push([.19, frontY, .19, x, frontY / 2, side * -1.9]);
        supports.push([.19, rearY, .19, x, rearY / 2, side * (rear + 1.3)]);
      }
      instancedBoxes(stand, 'Grandstand roof columns', materials.darkWall, supports);
      const braces = [];
      for (let i = 0; i <= columns; i++) {
        const x = -length / 2 + length * i / columns;
        braces.push([[x, frontY - .1, side * -2],
          [x, rearY - .2, side * (rear + 1.3)], .12]);
      }
      instancedBeams(stand, 'Canopy steel rafters', materials.darkWall, braces);
      box(stand, 'Rear roof gutter', length + 3.2, .20, .30,
        0, rearY - .08, side * (rear + 1.4), materials.darkWall);
    } else {
      box(stand, 'Open grandstand rear parapet', length + 2, 1.35, .4,
        0, .68 + (rows - 1) * .48, side * (rear + .45), materials.concrete);
      const legs = [];
      const cross = [];
      const bays = Math.max(5, Math.ceil(length / 13));
      for (let i = 0; i <= bays; i++) {
        const x = -length / 2 + i * length / bays;
        legs.push([.14, 2.3, .14, x, 1.15, side * (rear * .50)]);
        legs.push([.14, 4.4, .14, x, 2.2, side * (rear + .3)]);
        if (i < bays) cross.push([
          [x, .25, side * (rear + .3)],
          [x + length / bays, 3.9, side * (rear + .3)], .09,
        ]);
      }
      instancedBoxes(stand, 'Open stand steel subframe', materials.railPost, legs);
      instancedBeams(stand, 'Open stand diagonal bracing', materials.rail, cross);
    }

    const shirts = new THREE.InstancedMesh(
      new THREE.SphereGeometry(.35, 5, 4), materials.spectatorShirt, spectators.length,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(.19, 5, 4), materials.spectatorSkin, spectators.length,
    );
    spectators.forEach((person, i) => {
      dummy.position.set(person.x, person.y + .70, person.z);
      dummy.scale.set(.92, 1.13, .86);
      dummy.updateMatrix();
      shirts.setMatrixAt(i, dummy.matrix);
      shade.setHex(person.tint < .38 ? 0xbe252c : person.tint < .63 ? 0xe8e9e1 : person.tint < .85 ? 0x25302e : 0x2e644e);
      shirts.setColorAt(i, shade);
      dummy.position.y = person.y + 1.18;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      shade.setHex(person.skin < .34 ? 0xd7ae8e : person.skin < .69 ? 0xa98065 : 0x70533e);
      heads.setColorAt(i, shade);
    });
    for (const mesh of [shirts, heads]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      stand.add(mesh);
    }
    shirts.name = 'Grandstand spectators';
    heads.name = 'Grandstand spectator heads';
    statistics.grandstands++;
  }

  function addStandEmbankment(stand, standX, standZ, standY, length, rows, side) {
    const rear = rows * 1.42 + 9;
    const top = [
      [-length / 2 - 3, side * -5], [length / 2 + 3, side * -5],
      [length / 2 + 3, side * rear], [-length / 2 - 3, side * rear],
    ];
    const bottom = [
      [-length / 2 - 9, side * -11], [length / 2 + 9, side * -11],
      [length / 2 + 9, side * (rear + 9)], [-length / 2 - 9, side * (rear + 9)],
    ];
    const yaw = stand.rotation.y;
    const toWorld = ([x, z]) => [standX + x * Math.cos(yaw) + z * Math.sin(yaw),
      standZ - x * Math.sin(yaw) + z * Math.cos(yaw)];
    const positions = [];
    for (const [x, z] of top) positions.push(x, -.025, z);
    for (const local of bottom) {
      const [x, z] = toWorld(local);
      positions.push(local[0], scenicHeightAt(x, z) - standY + .035, local[1]);
    }
    const indices = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      indices.push(i, 4 + i, 4 + j, i, 4 + j, j);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const berm = new THREE.Mesh(geometry, materials.embankment);
    berm.name = 'Grassy and compacted earth grandstand bank';
    berm.receiveShadow = true;
    stand.add(berm);
    const [frontAx, frontAz] = toWorld(bottom[0]);
    const [frontBx, frontBz] = toWorld(bottom[1]);
    const bankFrontA = scenicHeightAt(frontAx, frontAz) - standY + .035;
    const bankFrontB = scenicHeightAt(frontBx, frontBz) - standY + .035;
    // Terrain-conforming concourses read as part of the park instead of flat
    // floating rectangles. They stay behind the fence: even the closest front
    // edge is at least 33 m from the racing line with the stand setbacks above.
    const patch = (name, x0, x1, z0, z1, material, lift = .095,
      tile = 8, followBank = false) => {
      const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
      const nx = Math.max(2, Math.ceil((x1 - x0) / 5));
      const nz = Math.max(2, Math.ceil((maxZ - minZ) / 4));
      const vertices = [], uvs = [], colors = [], indices = [];
      for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
        const x = lerp(x0, x1, ix / nx);
        const z = lerp(minZ, maxZ, iz / nz);
        const [wx, wz] = toWorld([x, z]);
        let surfaceY = scenicHeightAt(wx, wz) - standY + lift;
        if (followBank) {
          // Match the actual front bank mesh, whose lower edge interpolates
          // between its corner heights. Sampling the terrain independently
          // caused dark grass stripes to cut through the paved ramp.
          const edgeY = lerp(bankFrontA, bankFrontB,
            clamp((x + length / 2 + 9) / (length + 18), 0, 1));
          const climb = clamp((side * z + 11) / 6, 0, 1);
          surfaceY = Math.max(surfaceY, lerp(edgeY, -.025, climb) + lift);
        }
        vertices.push(x, surfaceY, z);
        uvs.push(x / tile, z / tile);
        if (material.vertexColors) {
          const mottling = material === materials.standPaving
            ? .92 + .11 * valueNoise(wx, wz, 19)
            : .72 + .33 * valueNoise(wx, wz, 24);
          colors.push(mottling, mottling, mottling);
        }
      }
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const a = ix * (nz + 1) + iz;
        const b = (ix + 1) * (nz + 1) + iz;
        const c = a + 1, d = b + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (material.vertexColors) geometry.setAttribute('color',
        new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const surface = new THREE.Mesh(geometry, material);
      surface.name = name;
      surface.receiveShadow = true;
      stand.add(surface);
    };
    const front = side * -10;
    const foot = side * -1.5;
    patch('Textured pedestrian paving below grandstand', -length / 2 - 3,
      length / 2 + 3, front, foot, materials.standPaving, .105, 8, true);
    patch('Front paved concourse edging', -length / 2 - 3,
      length / 2 + 3, side * -10, side * -9.45, materials.concrete, .12, 8, true);
    patch('Grandstand forecourt drainage channel', -length / 2 - 3,
      length / 2 + 3, side * -9.55, side * -9.22, materials.drain, .123, 8, true);

    const rearStart = side * (rear + 8.2);
    const rearEnd = side * (rear + 25);
    patch('Compacted park access to grandstand', -length / 2 - 11,
      length / 2 + 11, rearStart, rearEnd, materials.standAggregate, .075, 9);
    patch('Rear grandstand pedestrian promenade', -length / 2 - 8,
      length / 2 + 8, side * (rear + 9), side * (rear + 17.5),
      materials.standPaving, .103, 8);
    patch('Rear promenade drainage', -length / 2 - 8,
      length / 2 + 8, side * (rear + 17.25), side * (rear + 17.7),
      materials.drain, .121, 8);

    // Access steps bridge the raised seating bank and its landscaped approach.
    // Instancing keeps the 28 stands inexpensive despite the visible treads.
    const stairXs = length > 116 ? [-length / 3, 0, length / 3] : [-length / 4, length / 4];
    const stairTreads = [];
    const stepCount = 8;
    for (const stairX of stairXs) {
      const [wx, wz] = toWorld([stairX, side * (rear + 20.5)]);
      const groundAtLanding = scenicHeightAt(wx, wz) - standY + .13;
      for (let i = 0; i < stepCount; i++) {
        const distanceFromBank = (i + .5) / stepCount;
        const z = side * (rear + 8.2 + (i + .5) * 1.48);
        const [sx, sz] = toWorld([stairX, z]);
        const earthY = scenicHeightAt(sx, sz) - standY + .06;
        const landingY = lerp(.09, groundAtLanding, distanceFromBank);
        const treadTop = Math.max(earthY + .10, landingY);
        const thickness = Math.max(.16, treadTop - earthY);
        stairTreads.push([2.55, thickness, 1.44,
          stairX, treadTop - thickness / 2, z]);
      }
    }
    instancedBoxes(stand, 'Grandstand pedestrian access steps', materials.concrete, stairTreads);

    const edgePosts = [];
    const handrails = [];
    const postCount = Math.max(5, Math.floor(length / 13));
    let previousRail = null;
    for (let i = 0; i <= postCount; i++) {
      const x = -length / 2 - 3 + (length + 6) * i / postCount;
      const z = side * (rear + 18.2);
      const [wx, wz] = toWorld([x, z]);
      const ground = scenicHeightAt(wx, wz) - standY;
      edgePosts.push([.085, 1.12, .085, x,
        ground + .66, z]);
      const currentRail = [x, ground + 1.18, z];
      if (previousRail) handrails.push([previousRail, currentRail, .07]);
      previousRail = currentRail;
    }
    instancedBoxes(stand, 'Grandstand promenade fencing posts', materials.railPost, edgePosts);
    instancedBeams(stand, 'Grandstand promenade handrail', materials.rail, handrails);
  }

  function addTrees(pit, stands, traps) {
    const positions = [];
    const terrainWidth = bbox.maxX - bbox.minX;
    const terrainDepth = bbox.maxZ - bbox.minZ;
    const lapMetres = samples[samples.length - 1].s + distance(samples[samples.length - 1], samples[0]);
    const pitStart = samples[Math.round((lapMetres - 245) / lapMetres * samples.length) % samples.length];
    const pitEnd = samples[Math.round(245 / lapMetres * samples.length) % samples.length];
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
      if (pit && pointSegmentDistance(p, pitStart, pitEnd) < 60) continue;
      if (stands.some((stand) => stand.start && stand.end &&
          pointSegmentDistance(p, pointOf(stand.start), pointOf(stand.end)) < 100)) continue;
      if (traps.some((trap) => pointNearGravel(p, trap, 9))) continue;
      if (serviceRoadSegments.some(([a, b]) => pointSegmentDistance(p, a, b) < 12)) continue;
      positions.push({ x, z, ground: scenicHeightAt(x, z), height: 10.5 + rng() * 10.8,
        type: rng() < 0.27 ? 'pine' : 'deciduous', hue: rng() });
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
          dummy.position.set(p.x, p.ground + p.height * .50, p.z);
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
      dummy.position.set(p.x, p.ground + .015, p.z);
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
    instances.computeBoundingSphere();
    instances.frustumCulled = true;
    parent.add(instances);
    return instances;
  }

  function instancedBeams(parent, name, material, items) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    items.forEach(([a, b, width], i) => {
      start.set(...a);
      end.set(...b);
      const delta = end.clone().sub(start);
      dummy.position.copy(start).add(end).multiplyScalar(.5);
      dummy.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      dummy.scale.set(width, delta.length(), width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = name;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
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
  if (Array.isArray(trap.points) && trap.points.length >= 3) {
    const points = trap.points.map(pointOf);
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return null;
    return { points, name: trap.name || '',
      minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
      minZ: Math.min(...points.map((p) => p.z)), maxZ: Math.max(...points.map((p) => p.z)) };
  }
  const x = Number(trap.x);
  const z = Number(trap.z);
  const rx = Number(trap.rx ?? trap.radiusX);
  const rz = Number(trap.rz ?? trap.radiusZ);
  if (![x, z, rx, rz].every(Number.isFinite) || rx < 3 || rz < 3) return null;
  return { x, z, rx, rz, rotation: Number(trap.rotation) || 0 };
}

function pointNearGravel(p, trap, margin = 0) {
  if (!trap.points) {
    const ca = Math.cos(-(trap.rotation || 0));
    const sa = Math.sin(-(trap.rotation || 0));
    const dx = p.x - trap.x;
    const dz = p.z - trap.z;
    const localX = dx * ca - dz * sa;
    const localZ = dx * sa + dz * ca;
    return (localX / (trap.rx + margin)) ** 2 +
      (localZ / (trap.rz + margin)) ** 2 < 1;
  }
  if (p.x < trap.minX - margin || p.x > trap.maxX + margin ||
      p.z < trap.minZ - margin || p.z > trap.maxZ + margin) return false;
  let inside = false;
  for (let i = 0, j = trap.points.length - 1; i < trap.points.length; j = i++) {
    const a = trap.points[j], b = trap.points[i];
    if (pointSegmentDistance(p, a, b) <= margin) return true;
    if ((a.z > p.z) !== (b.z > p.z) &&
        p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
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
  if (!samples.length) return [];
  // Metres measured clockwise from the start/finish line. Monza concentrates
  // grandstands around Rettifilo, Roggia, Ascari and Alboreto; the long park
  // straights remain visibly wooded. Positive side is left of travel, away
  // from the garages on the main straight.
  const layout = [
    [25, 102, 15, 1, 'Gradinate Traguardo', true],
    [135, 125, 14, 1, 'Rettifilo A', true],
    [295, 134, 16, 1, 'Rettifilo B', true],
    [470, 136, 15, 1, 'Rettifilo C', true],
    [650, 122, 14, 1, 'Rettifilo D', true],
    [790, 92, 11, 1, 'Prima variante ingresso', false],
    [1040, 98, 10, -1, 'Prima variante uscita', false],
    [1350, 112, 11, 1, 'Curva Grande', false],
    [1490, 108, 11, 1, 'Alta velocità A', false],
    [1640, 100, 11, 1, 'Biassono', false],
    [1790, 92, 10, 1, 'Alta velocità C', false],
    [1950, 118, 12, 1, 'Roggia ingresso', true],
    [2085, 80, 10, 1, 'Seconda variante', false],
    [2200, 82, 10, -1, 'Roggia uscita', false],
    [2440, 92, 10, 1, 'Lesmo 1', false],
    [2580, 74, 9, 1, 'Lesmo esterna', false],
    [2740, 92, 10, 1, 'Lesmo 2', false],
    [2890, 78, 8, -1, 'Lesmo interna', false],
    [3605, 83, 10, -1, 'Ascari 2', false],
    [3780, 108, 12, -1, 'Ascari ingresso', true],
    [3915, 78, 10, -1, 'Ascari centrale', false],
    [4050, 104, 11, -1, 'Ascari uscita', false],
    [4925, 95, 12, 1, 'Laterale Parabolica E', false],
    [5090, 115, 14, 1, 'Alboreto ingresso', true],
    [5290, 120, 15, 1, 'Alboreto uscita', true],
    [5415, 96, 12, 1, 'Laterale Parabolica A', false],
    [5540, 112, 12, 1, 'Rettifilo finale', true],
    [5670, 92, 10, 1, 'Vedano', false],
  ];
  const total = samples[samples.length - 1].s + distance(samples[samples.length - 1], samples[0]);
  return layout.map(([metres, length, rows, side, name, roof]) => {
    const sample = samples[Math.round(metres / total * samples.length) % samples.length];
    const half = length / 2;
    return {
      start: { x: sample.x - sample.tx * half, z: sample.z - sample.tz * half },
      end: { x: sample.x + sample.tx * half, z: sample.z + sample.tz * half },
      side, rows, length, name, roof,
      setback: roof ? 43 : 46,
      occupancy: roof ? .64 : .53,
    };
  });
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

function standPavingTexture(THREE, rng) {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const paverTints = Array.from({ length: 8 * 4 }, () => (rng() - .5) * 25);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 32);
    const shifted = (x + (row % 2) * 32) % size;
    const col = Math.floor(shifted / 64);
    const mortar = shifted % 64 < 2 || y % 32 < 2;
    const fleck = (rng() - .5) * 17;
    const tint = paverTints[row * 4 + col] + fleck;
    const base = mortar ? 157 : 190;
    const p = (y * size + x) * 4;
    image.data[p] = clamp(base + tint, 0, 255);
    image.data[p + 1] = clamp(base - 1 + tint, 0, 255);
    image.data[p + 2] = clamp(base - 7 + tint, 0, 255);
    image.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
function smoothstep(start, end, value) {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}
function valueNoise(x, z, scale) {
  const px = x / scale;
  const pz = z / scale;
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const tx = smoothstep(0, 1, px - ix);
  const tz = smoothstep(0, 1, pz - iz);
  const hash = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), tx),
    lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), tx), tz);
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
