// Spielberg in its current configuration: the steel bull, Red Bull Wing,
// stepped grandstands and the expanded 2026 Schönberghof. These are procedural
// architectural interpretations, not surveyed building models. Sources and
// limits are documented in scripts/spielberg/README.md.
export function addEnvironment(THREE, ctx) {
  const group = new THREE.Group();
  group.name = 'Red Bull Ring · Styrian hills and venue architecture';
  ctx.scene.add(group);
  const landmarks = [], footprints = [], helper = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const mat = (color, options = {}) => ctx.helpers.material(color, options);
  const materials = {
    concrete: mat(0xa8aaa4), silver: mat(0xc0c6c4, { metalness: .65, roughness: .4 }),
    dark: mat(0x394349), blue: mat(0x1d4580), glass: mat(0x63838d, { metalness: .38, roughness: .3 }),
    white: mat(0xe6e7df), timber: mat(0x766247), stone: mat(0x9a9c8e),
    corten: mat(0x875338, { metalness: .5, roughness: .66, flatShading: true }),
    panels: mat(0xffffff, { vertexColors: true, metalness: .5, roughness: .65, side: THREE.DoubleSide, flatShading: true }),
    gold: mat(0xc8aa56, { metalness: .78, roughness: .26 }),
  };
  const wrap = u => ((u % 1) + 1) % 1;
  const frame = station => {
    const f = ctx.frameAt(wrap(station / ctx.length));
    const forward = f.forward.clone().setY(0).normalize();
    return { point: f.point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  };
  const roadDistance = (x, z) => Math.min(ctx.roadDistance(x, z), ctx.pitDistance?.(x, z) ?? Infinity);
  function register(name, parent = group, landmark = true) {
    const result = new THREE.Group(); result.name = name;
    result.userData.staticBatchRoot = landmark;
    parent.add(result); if (landmark) landmarks.push(result);
    return result;
  }
  function box(parent, name, dimensions, position, material, shadow = true) {
    const result = ctx.helpers.box(parent, name, dimensions, position, material);
    result.castShadow = shadow; return result;
  }
  function localPoint(parent, x, z) {
    parent.updateWorldMatrix(true, false);
    return parent.localToWorld(new THREE.Vector3(x, 0, z));
  }
  function rectangle(parent, width, depth) {
    const center = localPoint(parent, 0, 0);
    return { center, x: localPoint(parent, 1, 0).sub(center).normalize(),
      z: localPoint(parent, 0, 1).sub(center).normalize(), width, depth };
  }
  function rectanglesOverlap(a, b, margin = 1) {
    const delta = b.center.clone().sub(a.center);
    for (const axis of [a.x, a.z, b.x, b.z]) {
      const ra = Math.abs(a.x.dot(axis)) * a.width / 2 + Math.abs(a.z.dot(axis)) * a.depth / 2;
      const rb = Math.abs(b.x.dot(axis)) * b.width / 2 + Math.abs(b.z.dot(axis)) * b.depth / 2;
      if (Math.abs(delta.dot(axis)) > ra + rb + margin) return false;
    }
    return true;
  }
  function footprintClearance(parent, width, depth) {
    let minimum = Infinity;
    const nx = Math.max(2, Math.ceil(width / 6)), nz = Math.max(2, Math.ceil(depth / 6));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const p = localPoint(parent, (i / nx - .5) * width, (j / nz - .5) * depth);
      minimum = Math.min(minimum, roadDistance(p.x, p.z));
    }
    return minimum;
  }
  function rememberFootprint(parent, width, depth, minimum) {
    const r = rectangle(parent, width, depth); r.owner = parent.name; footprints.push(r);
    parent.userData.footprint = { width, depth };
    parent.userData.minimumRoadDistance = minimum;
    parent.userData.proceduralApproximation = true;
  }
  function placeStation(name, station, lateral, width, depth, parent = group, landmark = true) {
    const result = register(name, parent, landmark), f = frame(station), side = Math.sign(lateral) || 1;
    result.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.forward.clone().negate(), up, f.across));
    let minimum = 0, distance = lateral;
    for (let attempt = 0; attempt < 30; attempt++) {
      distance = lateral + attempt * side * 5;
      result.position.copy(f.point).addScaledVector(f.across, distance);
      result.position.y = ctx.groundHeightAt(result.position.x, result.position.z);
      result.updateWorldMatrix(true, true);
      minimum = footprintClearance(result, width, depth);
      const bounds = rectangle(result, width, depth);
      if (minimum >= 14 && !footprints.some(other => rectanglesOverlap(bounds, other))) break;
    }
    result.userData.stationMeters = station; result.userData.lateralMeters = distance;
    rememberFootprint(result, width, depth, minimum);
    return result;
  }
  function placeGeographic(name, coordinates, yaw, width, depth) {
    const result = register(name), g = ctx.config.geography;
    result.position.set((coordinates[0] - g.origin[0]) * g.metresPerDegree[0] * g.scale, 0,
      -(coordinates[1] - g.origin[1]) * g.metresPerDegree[1] * g.scale);
    result.position.y = ctx.groundHeightAt(result.position.x, result.position.z);
    result.rotation.y = yaw; result.updateWorldMatrix(true, true);
    result.userData.geographicCoordinates = coordinates;
    rememberFootprint(result, width, depth, footprintClearance(result, width, depth));
    return result;
  }
  function foundation(parent, width, depth, lift = .3) {
    const supports = [], nx = Math.max(2, Math.ceil(width / 13)), nz = Math.max(1, Math.ceil(depth / 13));
    let floor = -Infinity;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = (i / nx - .5) * width, z = (j / nz - .5) * depth, point = localPoint(parent, x, z);
      const ground = ctx.groundHeightAt(point.x, point.z) - parent.position.y;
      supports.push({ x, z, ground }); floor = Math.max(floor, ground + lift);
    }
    const piles = new THREE.InstancedMesh(new THREE.BoxGeometry(.75, 1, .75), materials.concrete, supports.length);
    piles.name = parent.name + ' terrain-reaching foundations';
    supports.forEach((p, i) => {
      const height = floor - p.ground + .15;
      helper.position.set(p.x, floor - height / 2, p.z); helper.quaternion.identity();
      helper.scale.set(1, height, 1); helper.updateMatrix(); piles.setMatrixAt(i, helper.matrix);
    });
    piles.receiveShadow = true; parent.add(piles);
    box(parent, parent.name + ' level concrete foundation deck', [width, .4, depth], [0, floor, 0], materials.concrete);
    parent.userData.floorY = floor;
    return floor;
  }
  function lettering(parent, text, width, height, position, side = 1) {
    const texture = ctx.helpers.label(THREE, text, { background: '#273a50', foreground: '#f1eee2' });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.name = text + ' architectural lettering'; mesh.position.set(...position);
    if (side < 0) mesh.rotation.y = Math.PI;
    parent.add(mesh);
  }
  function stand(parent, width, rows, side, roofed = false) {
    const depth = rows * 1.55 + 5, floor = foundation(parent, width, depth);
    const terraces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.concrete, rows);
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .28, 1.05), materials.blue, rows * 2);
    terraces.name = parent.name + ' solid stepped terraces'; seats.name = parent.name + ' seating and central aisle';
    for (let row = 0; row < rows; row++) {
      const height = .8 + row * .61, z = side * (row - (rows - 1) / 2) * 1.55;
      helper.position.set(0, floor + .2 + height / 2, z); helper.quaternion.identity();
      helper.scale.set(width, height, 1.7); helper.updateMatrix(); terraces.setMatrixAt(row, helper.matrix);
      for (let bank = 0; bank < 2; bank++) {
        helper.position.set((bank ? 1 : -1) * (width / 4 + 1.1), floor + height + .42, z);
        helper.scale.set(width / 2 - 2.5, 1, 1); helper.updateMatrix(); seats.setMatrixAt(row * 2 + bank, helper.matrix);
        seats.setColorAt(row * 2 + bank, new THREE.Color(row % 5 === 0 ? 0xc6c4ba : 0xffffff));
      }
    }
    terraces.receiveShadow = seats.receiveShadow = true; parent.add(terraces, seats);
    const stairs = new THREE.InstancedMesh(new THREE.BoxGeometry(4.1, .25, .78), materials.white, rows * 2);
    stairs.name = parent.name + ' central stepped access aisle';
    for (let i = 0; i < rows * 2; i++) {
      helper.position.set(0, floor + 1.1 + i * .305, side * (i * .775 - (rows - 1) * .775 - .35));
      helper.quaternion.identity(); helper.scale.set(1, 1, 1); helper.updateMatrix(); stairs.setMatrixAt(i, helper.matrix);
    }
    parent.add(stairs);
    if (roofed) {
      const roofY = floor + rows * .61 + 5.2;
      const roof = box(parent, parent.name + ' main grandstand roof', [width + 8, .55, depth + 8], [0, roofY, 0], materials.silver);
      roof.rotation.x = -side * .07;
      const columns = Math.ceil(width / 16) + 1;
      for (let i = 0; i < columns; i++) {
        const x = (i / (columns - 1) - .5) * (width - 3), z = side * (depth / 2 - .7);
        const p = localPoint(parent, x, z), ground = ctx.groundHeightAt(p.x, p.z) - parent.position.y;
        box(parent, 'Main grandstand grounded roof column', [.65, roofY - ground, .65], [x, (roofY + ground) / 2, z], materials.dark);
      }
      lettering(parent, 'RED BULL RING', Math.min(76, width - 8), 2, [0, roofY + .2, -side * (depth / 2 + 4.2)], -side);
    }
  }

  // OSM node 5443064309 fixes the landmark geographically. Its form and
  // 17.2 m overall height come from the venue, not the OSM date tag.
  const bull = placeGeographic('Der Bulle vom Spielberg · 17.2 m steel landmark',
    [14.7611031, 47.2232459], -.42, 34, 24);
  const bullFloor = foundation(bull, 29, 18, .2);
  const sculpture = new THREE.Group(); sculpture.name = 'Leaping Corten bull and silver arch';
  sculpture.position.y = bullFloor; bull.add(sculpture);
  const archCurve = new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, i) => {
    const angle = i / 48 * Math.PI;
    return new THREE.Vector3(13 * Math.cos(angle), .4 + 16.45 * Math.sin(angle), 2.5);
  }));
  const arch = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 64, .35, 8, false), materials.silver);
  arch.name = 'Silver sweep framing the bull · overall top 17.2 m'; arch.castShadow = true; sculpture.add(arch);
  function platedEllipsoid(name, position, scale, detail = 1, rotation = 0) {
    const source = new THREE.IcosahedronGeometry(1, detail), input = source.attributes.position.array;
    const vertices = [], colors = [], palette = [0x875237, 0x965b3a, 0x754b36, 0xa36b45];
    for (let face = 0; face < input.length / 9; face++) {
      if (face % 17 === 5) continue;
      const a = new THREE.Vector3(...input.slice(face * 9, face * 9 + 3));
      const b = new THREE.Vector3(...input.slice(face * 9 + 3, face * 9 + 6));
      const c = new THREE.Vector3(...input.slice(face * 9 + 6, face * 9 + 9));
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3), color = new THREE.Color(palette[face % palette.length]);
      for (const p of [a, b, c]) { p.sub(center).multiplyScalar(.89).add(center); vertices.push(...p.toArray()); colors.push(color.r, color.g, color.b); }
    }
    source.dispose();
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials.panels); mesh.name = name;
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.z = rotation;
    mesh.castShadow = true; sculpture.add(mesh);
  }
  platedEllipsoid('Perforated Corten torso', [-.8, 10.2, 0], [5.5, 2.7, 2.2], 2, -.12);
  platedEllipsoid('Bull muscular shoulders', [3.2, 10.2, 0], [2.8, 3.0, 2.35], 1, -.25);
  platedEllipsoid('Bull lowered neck', [5.4, 9.4, 0], [2.2, 2.4, 1.9], 1, -.5);
  platedEllipsoid('Bull angular head', [7.1, 8.3, 0], [2.15, 1.9, 1.5], 1, -.32);
  platedEllipsoid('Bull squared muzzle', [8.7, 7.5, 0], [1.15, .8, 1.15]);
  platedEllipsoid('Bull powerful hindquarters', [-4.2, 10.2, .15], [2.2, 2.8, 2.0], 1, .22);
  function limb(name, points, radii, material = materials.corten) {
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]), delta = b.clone().sub(a);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radii[i], radii[i - 1], delta.length(), 7, 1), material);
      mesh.name = name + ' segment ' + i; mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(up, delta.normalize()); mesh.castShadow = true; sculpture.add(mesh);
    }
  }
  limb('Near front leg', [[3.5, 9.1, -1.7], [4.5, 5.8, -1.9], [6.4, 3.5, -2], [7.3, 3.4, -2]], [.8, .58, .28, .38]);
  limb('Far front leg', [[3.3, 9.2, 1.7], [5.6, 6.8, 1.9], [7.7, 5.7, 2], [8.4, 5.8, 2]], [.7, .48, .24, .32]);
  limb('Near rear leg', [[-4.4, 9, -1.5], [-6.1, 7, -1.8], [-5.5, 4, -1.9], [-7.0, 2.8, -1.9]], [.94, .7, .3, .35]);
  limb('Far rear leg', [[-3.9, 9, 1.5], [-6.7, 8.3, 1.7], [-8.0, 5.5, 1.9], [-9.2, 4.9, 1.9]], [.8, .58, .27, .32]);
  function taperedCurve(name, points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const segments = 24, radial = 7, frames = curve.computeFrenetFrames(segments, false), vertices = [], indices = [];
    for (let i = 0; i <= segments; i++) {
      const p = curve.getPointAt(i / segments), r = radius * Math.pow(1 - i / segments, .7) + .012;
      for (let j = 0; j < radial; j++) {
        const angle = j / radial * Math.PI * 2;
        vertices.push(...p.clone().addScaledVector(frames.normals[i], Math.cos(angle) * r)
          .addScaledVector(frames.binormals[i], Math.sin(angle) * r).toArray());
      }
      if (i) for (let j = 0; j < radial; j++) {
        const a = (i - 1) * radial + j, b = (i - 1) * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = true; sculpture.add(mesh);
  }
  for (const sign of [-1, 1]) taperedCurve('Golden sweeping horn ' + sign,
    [[6.6, 9.6, sign * 1.05], [7.1, 11.5, sign * 2.35], [6.3, 13, sign * 3.35], [5.1, 13.6, sign * 3.5]], .58, materials.gold);
  taperedCurve('Raised curved tail', [[-5.3, 11.0, .8], [-7.5, 13.5, .9], [-10.4, 13.2, 1.5], [-10.8, 11.2, 2]], .2, materials.corten);
  lettering(bull, 'RED BULL RING', 16, 1.7, [0, bullFloor + 1.2, -9.05], -1);
  bull.userData.overallSculptureHeightMeters = 17.2;

  const start = register('Start–Ziel · covered grandstand blocks');
  for (const station of [-183, 175]) {
    const part = placeStation('Start–Ziel roofed spectator block ' + station, station, 61, 136, 40, start, false);
    stand(part, 124, 13, 1, true);
  }
  const steiermark = placeStation('Steiermark · outside Niki Lauda Turn', ctx.config.turns.T1.station - 55, 90, 151, 39);
  stand(steiermark, 142, 18, 1);
  const redBullStand = register('Red Bull grandstand · climbing hillside sectors');
  for (let i = 0; i < 8; i++) {
    const station = ctx.config.turns.T1.station + 118 + i * 78;
    const sector = placeStation('Red Bull climbing sector ' + String.fromCharCode(65 + i), station, 67, 73, 33, redBullStand, false);
    stand(sector, 66, 15, 1);
  }
  const t3 = placeStation('T3 · summit hairpin grandstand', ctx.config.turns.T3.station - 25, 88, 148, 39);
  stand(t3, 138, 18, 1);
  const north = placeStation('Nord · Rauch Turn braking grandstand', ctx.config.turns.T4.station - 30, 86, 156, 33);
  stand(north, 146, 15, 1);
  const center = placeStation('Mitte · central spectator terrace', ctx.config.turns.T7.station - 85, 53, 84, 26);
  stand(center, 76, 11, 1);
  const t10 = placeStation('T10 · final corner spectator terrace', ctx.config.turns.T10.station - 15, 77, 129, 30);
  stand(t10, 120, 13, 1);

  // The Wing is an independent public building opposite the F1 garages.
  // Its swept metal volume is inspired by a rear wing, as in the venue's
  // architectural description. Keep the actual garage building to the core.
  const wing = placeStation('Red Bull Wing · rear-wing architecture and Welcome Center', -4, 88, 125, 43);
  const wingFloor = foundation(wing, 112, 33, .3);
  box(wing, 'Wing Welcome Center glazed ground floor', [42, 7.6, 25], [0, wingFloor + 4.2, 0], materials.glass);
  const wingVertices = [], wingIndices = [];
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40 - .5) * 115, t = Math.abs(x) / 57.5;
    const y = wingFloor + 13.6 + 7.2 * t * t, halfDepth = 17 - 7 * t;
    for (const [yy, z] of [[y - 2.2, -halfDepth], [y - 2.2, halfDepth], [y + 1.1, -halfDepth], [y + 1.1, halfDepth]])
      wingVertices.push(x, yy, z);
    if (i) {
      const a = (i - 1) * 4, b = i * 4;
      for (const [j, k] of [[0, 1], [1, 3], [3, 2], [2, 0]]) wingIndices.push(a + j, b + j, a + k, a + k, b + j, b + k);
    }
  }
  wingIndices.push(0, 1, 2, 1, 3, 2, 160, 162, 161, 161, 162, 163);
  const wingGeometry = new THREE.BufferGeometry(); wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wingVertices, 3));
  wingGeometry.setIndex(wingIndices); wingGeometry.computeVertexNormals();
  const canopy = new THREE.Mesh(wingGeometry, materials.silver); canopy.name = 'Red Bull Wing swept steel silhouette';
  canopy.castShadow = canopy.receiveShadow = true; wing.add(canopy);
  box(wing, 'Wing panoramic conference glazing', [101, 3.5, 24], [0, wingFloor + 11, -.4], materials.glass);
  for (const x of [-27, 27]) {
    const p = localPoint(wing, x, 0), ground = ctx.groundHeightAt(p.x, p.z) - wing.position.y;
    box(wing, 'Wing grounded main support', [4.2, wingFloor + 12 - ground, 9], [x, (wingFloor + 12 + ground) / 2, 0], materials.white);
  }
  lettering(wing, 'RED BULL RING', 34, 3, [0, wingFloor + 7.6, -12.65], -1);

  // OSM provides the persistent site position; the current venue confirms
  // its 2026 expansion and a fifth-floor panoramic bar, not these dimensions.
  const hotel = placeGeographic('Schönberghof Spielberg · expanded 2026 hillside hotel',
    [14.7592202, 47.2278696], .12, 117, 45);
  const hotelFloor = foundation(hotel, 107, 36, .3);
  // Ground floor plus five storeys: put the advertised fifth-floor bar
  // on the uppermost storey, rather than labelling the fourth as the fifth.
  for (let level = 0; level <= 5; level++) {
    const y = hotelFloor + .4 + level * 4.0;
    box(hotel, 'Schönberghof current hotel floor', [99, 3.6, 29], [0, y + 1.8, 0], materials.stone);
    box(hotel, 'Schönberghof track-facing panoramic windows', [94, 2.7, .16], [0, y + 1.9, 14.6], materials.glass);
    box(hotel, 'Schönberghof broad terrace slab', [107, .35, 36], [0, y, .9], materials.white);
    box(hotel, 'Schönberghof timber balcony rail', [105, 1.05, .2], [0, y + .8, 18.6], materials.timber);
  }
  box(hotel, 'Schönberghof current rooftop', [108, .5, 37], [0, hotelFloor + 24.5, .8], materials.silver);
  lettering(hotel, 'SCHÖNBERGHOF · TAURUS', 43, 2.4, [0, hotelFloor + 22.1, 14.75]);

  // Open infield meadows stay readable. Mixed woodland follows the exact
  // rendered ground around the perimeter, with occasional small inner copses.
  const woodland = register('Styria · mixed woodland and open infield meadows');
  const bounds = new THREE.Box3().setFromPoints(ctx.samples.map(p => p.point || p)); bounds.expandByScalar(280);
  let seed = 43262026;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const polygon = ctx.samples.map(p => p.point || p);
  function insideTrack(x, z) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }
  function inFootprint(x, z, margin = 9) {
    return footprints.some(r => {
      const delta = new THREE.Vector3(x - r.center.x, 0, z - r.center.z);
      return Math.abs(delta.dot(r.x)) < r.width / 2 + margin && Math.abs(delta.dot(r.z)) < r.depth / 2 + margin;
    });
  }
  const trees = [[], []], bases = [];
  for (let attempt = 0; attempt < 22000 && bases.length < 2100; attempt++) {
    const x = bounds.min.x + random() * (bounds.max.x - bounds.min.x), z = bounds.min.z + random() * (bounds.max.z - bounds.min.z);
    const distance = roadDistance(x, z);
    if (distance < 48 || distance > 365 || inFootprint(x, z)) continue;
    if (insideTrack(x, z) && !(x > 285 && z < -110)) continue;
    const tree = { x, z, y: ctx.groundHeightAt(x, z), scale: .8 + random() * .8, yaw: random() * Math.PI * 2 };
    trees[random() < .73 ? 0 : 1].push(tree); bases.push(tree);
  }
  for (let species = 0; species < 2; species++) {
    const list = trees[species], trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.28, .48, 4.8, 5), materials.timber, list.length);
    const crowns = new THREE.InstancedMesh(species === 0 ? new THREE.ConeGeometry(3.8, 12.6, 7)
      : new THREE.IcosahedronGeometry(4.4, 0), mat(species === 0 ? 0x34553e : 0x4b6842), list.length);
    trunks.name = 'Styrian grounded tree trunks ' + species; crowns.name = 'Styrian woodland canopy ' + species;
    list.forEach((tree, i) => {
      helper.position.set(tree.x, tree.y + 2.4 * tree.scale, tree.z); helper.rotation.set(0, tree.yaw, 0);
      helper.scale.setScalar(tree.scale); helper.updateMatrix(); trunks.setMatrixAt(i, helper.matrix);
      helper.position.y = tree.y + (species === 0 ? 8.2 : 7.3) * tree.scale;
      helper.scale.set(tree.scale, tree.scale * (species ? 1.1 : 1), tree.scale); helper.updateMatrix(); crowns.setMatrixAt(i, helper.matrix);
    });
    woodland.add(trunks, crowns);
  }
  woodland.userData.treeCount = bases.length; woodland.userData.treeBases = bases;

  // Distant, stylised Styrian ridges. They begin more than a kilometre from
  // the road; this is atmosphere, not an alteration of the circuit elevation.
  const ridges = register('Styria · distant forested mountain horizon');
  const centerX = (bounds.min.x + bounds.max.x) / 2, centerZ = (bounds.min.z + bounds.max.z) / 2;
  for (let layer = 0; layer < 3; layer++) {
    const vertices = [], indices = [], colors = [], count = 112;
    for (let i = 0; i <= count; i++) {
      const angle = i / count * Math.PI * 2, north = Math.max(0, -Math.sin(angle));
      const radius = 2200 + layer * 540, peak = 145 + north * 280 + layer * 52 + 75 * Math.sin(angle * 7 + layer) + 40 * Math.cos(angle * 13);
      for (const [r, height] of [[radius - 350, -5], [radius, peak], [radius + 500, -5]]) {
        vertices.push(centerX + Math.cos(angle) * r, height, centerZ + Math.sin(angle) * r);
        const color = new THREE.Color([0x687b66, 0x7d8d7b, 0x94a393][layer]);
        color.multiplyScalar(height < 0 ? .9 : 1); colors.push(color.r, color.g, color.b);
      }
      if (i) for (let j = 0; j < 2; j++) {
        const a = (i - 1) * 3 + j, b = i * 3 + j;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
    mesh.name = 'Distant Styrian ridge layer ' + layer; mesh.userData.horizon = true; ridges.add(mesh);
  }
  group.updateMatrixWorld(true);
  return { group, landmarks, stats: { treeCount: bases.length, bullHeightMeters: 17.2,
    architecturalFootprints: footprints.map(r => ({ name: r.owner, center: r.center.toArray(),
      xAxis: r.x.toArray(), zAxis: r.z.toArray(), width: r.width, depth: r.depth })),
    geographicConvention: 'x east, z south; across driver left; no reflections' } };
}
