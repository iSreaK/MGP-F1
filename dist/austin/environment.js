/**
 * Circuit of The Americas venue scenery. The track centreline comes from the
 * circuit drawing; building offsets are visual reconstructions, not a survey.
 * Every ground footprint is checked against the entire centreline before it is
 * admitted, because two distant turns can be close together in world space.
 */
export function addAustinEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const { trackY = .36, halfWidth = 6.5, gridU = 0,
    sourceFractions = [], pitSide = -1 } = options;
  const group = new THREE.Group();
  group.name = 'Circuit of The Americas venue and Texas landscape';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const lapLength = curve.getLength();
  const reserved = [];
  const terrain = scene.getObjectByName('COTA rolling Texas terrain');
  const terrainPoints = terrain?.geometry?.getAttribute('position');
  let terrainColumns = 0;
  if (terrainPoints) {
    const z0 = terrainPoints.getZ(0);
    while (terrainColumns < terrainPoints.count
      && Math.abs(terrainPoints.getZ(terrainColumns) - z0) < .001)
      terrainColumns++;
  }
  const terrainRows = terrainColumns ? terrainPoints.count / terrainColumns : 0;
  function terrainHeightAt(x, z, fallback) {
    if (terrainColumns < 2 || terrainRows < 2) return fallback;
    const x0 = terrainPoints.getX(0), z0 = terrainPoints.getZ(0);
    const stepX = terrainPoints.getX(1) - x0;
    const stepZ = terrainPoints.getZ(terrainColumns) - z0;
    if (Math.abs(stepX) < .001 || Math.abs(stepZ) < .001) return fallback;
    const ux = (x - x0) / stepX, uz = (z - z0) / stepZ;
    if (ux < 0 || ux > terrainColumns - 1 || uz < 0 || uz > terrainRows - 1)
      return fallback;
    const ix = Math.min(terrainColumns - 2, Math.floor(ux));
    const iz = Math.min(terrainRows - 2, Math.floor(uz));
    const tx = ux - ix, tz = uz - iz;
    const a = iz * terrainColumns + ix;
    const y0 = terrainPoints.getY(a) * (1 - tx)
      + terrainPoints.getY(a + 1) * tx;
    const y1 = terrainPoints.getY(a + terrainColumns) * (1 - tx)
      + terrainPoints.getY(a + terrainColumns + 1) * tx;
    return y0 * (1 - tz) + y1 * tz;
  }
  const pit = scene.getObjectByName('Austin pit entry, fast lane, working lane and exit');
  const pitVertices = pit?.geometry?.getAttribute('position');
  let state = 0x0c07a2025;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const turnU = number => sourceFractions[landmarks?.turns?.[`T${number}`]?.index] ?? null;

  function frameAt(u) {
    const t = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(t);
    const forward = curve.getTangentAt(t).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward));
    return { point, forward, across, quaternion };
  }
  function outsideSide(u) {
    const before = frameAt(u - 14 / lapLength).forward;
    const after = frameAt(u + 14 / lapLength).forward;
    const turn = before.x * after.z - before.z * after.x;
    return turn < 0 ? -1 : 1;
  }
  function clearFootprint(position, frame, halfX, halfZ, margin = halfWidth + 5) {
    // The longest sampled chord is under 3 m, much smaller than the 5 m
    // reserve around the actual asphalt and kerbs.
    for (const { point } of frames) {
      const x = (point.x - position.x) * frame.across.x
        + (point.z - position.z) * frame.across.z;
      const z = (point.x - position.x) * frame.forward.x
        + (point.z - position.z) * frame.forward.z;
      if (Math.abs(x) <= halfX + margin && Math.abs(z) <= halfZ + margin)
        return false;
    }
    // The pit ribbon is detached from the racing centreline. Check both of
    // its edges, including the merge taper, so low scrub and large stands do
    // not occupy the speed-limited lane.
    if (pitVertices) for (let i = 0; i < pitVertices.count; i++) {
      const dx = pitVertices.getX(i) - position.x;
      const dz = pitVertices.getZ(i) - position.z;
      const x = dx * frame.across.x + dz * frame.across.z;
      const z = dx * frame.forward.x + dz * frame.forward.z;
      if (Math.abs(x) <= halfX + 4 && Math.abs(z) <= halfZ + 4)
        return false;
    }
    for (const item of reserved) {
      const dx = position.x - item.x, dz = position.z - item.z;
      if (!item.frame) {
        if (Math.hypot(dx, dz) < Math.hypot(halfX, halfZ) + item.radius + 8)
          return false;
        continue;
      }
      const axes = [frame.across, frame.forward,
        item.frame.across, item.frame.forward];
      const separated = axes.some(axis => {
        const displacement = Math.abs(dx * axis.x + dz * axis.z);
        const ownRadius = halfX * Math.abs(frame.across.dot(axis))
          + halfZ * Math.abs(frame.forward.dot(axis));
        const otherRadius = item.halfX * Math.abs(item.frame.across.dot(axis))
          + item.halfZ * Math.abs(item.frame.forward.dot(axis));
        return displacement > ownRadius + otherRadius + 8;
      });
      if (!separated) return false;
    }
    return true;
  }
  function placeSite(name, u, side, halfX, halfZ, startLateral,
    alongChoices = [0, 36, -36, 72, -72, 108, -108], maxRelief = Infinity) {
    if (!Number.isFinite(u)) return null;
    for (let lateral = startLateral; lateral <= 340; lateral += 12) {
      for (const along of alongChoices) {
        const frame = frameAt(u + along / lapLength);
        const position = frame.point.clone().addScaledVector(frame.across,
          side * lateral);
        position.y = terrainHeightAt(position.x, position.z,
          frame.point.y - trackY);
        if (!clearFootprint(position, frame, halfX, halfZ)) continue;
        if (Number.isFinite(maxRelief)) {
          let low = Infinity, high = -Infinity;
          for (const x of [-halfX, 0, halfX]) for (const z of [-halfZ, 0, halfZ]) {
            const worldX = position.x + frame.across.x * x + frame.forward.x * z;
            const worldZ = position.z + frame.across.z * x + frame.forward.z * z;
            const y = terrainHeightAt(worldX, worldZ, position.y);
            low = Math.min(low, y); high = Math.max(high, y);
          }
          if (high - low > maxRelief) continue;
        }
        reserved.push({ name, x: position.x, z: position.z,
          frame, halfX, halfZ });
        return { name, frame, position, side, lateral, along, halfX, halfZ };
      }
    }
    return null;
  }
  function footprintTerrainRange(site, halfX, halfZ, steps = 5) {
    let low = Infinity, high = -Infinity;
    for (let ix = 0; ix < steps; ix++) for (let iz = 0; iz < steps; iz++) {
      const x = -halfX + ix * halfX * 2 / (steps - 1);
      const z = -halfZ + iz * halfZ * 2 / (steps - 1);
      const worldX = site.position.x + site.frame.across.x * x
        + site.frame.forward.x * z;
      const worldZ = site.position.z + site.frame.across.z * x
        + site.frame.forward.z * z;
      const y = terrainHeightAt(worldX, worldZ, site.position.y);
      low = Math.min(low, y); high = Math.max(high, y);
    }
    return { low, high };
  }

  const concrete = new THREE.MeshStandardMaterial({ color: 0xb3ada0,
    roughness: .92 });
  const shadow = new THREE.MeshStandardMaterial({ color: 0x343b3e,
    metalness: .2, roughness: .68 });
  const red = new THREE.MeshStandardMaterial({ color: 0xcc202a,
    metalness: .24, roughness: .51 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9fa7a5,
    metalness: .48, roughness: .56 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe2e0d6,
    roughness: .8 });
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x344d55,
    metalness: .35, roughness: .34 });
  const seatColours = [0xbc3139, 0xdad8cf, 0x324d6e, 0xe2e0d7];
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, roughness: .86 });
  const beamGeometry = new THREE.BoxGeometry(.42, 1, .42);
  const beamStart = new THREE.Vector3(), beamEnd = new THREE.Vector3();
  const beamDirection = new THREE.Vector3();
  function setBeam(mesh, index, from, to, thickness = .42) {
    beamStart.set(...from);
    beamEnd.set(...to);
    beamDirection.subVectors(beamEnd, beamStart);
    helper.position.addVectors(beamStart, beamEnd).multiplyScalar(.5);
    helper.quaternion.setFromUnitVectors(up, beamDirection.clone().normalize());
    helper.scale.set(thickness / .42, beamDirection.length(), thickness / .42);
    helper.updateMatrix();
    mesh.setMatrixAt(index, helper.matrix);
  }
  function groupOnSite(name, site) {
    const object = new THREE.Group();
    object.name = name;
    object.position.copy(site.position);
    object.quaternion.copy(site.frame.quaternion);
    object.userData.footprint = { halfX: site.halfX, halfZ: site.halfZ };
    group.add(object);
    return object;
  }

  const stands = [];
  function addGrandstand(name, site, width, { roof = false, tiers = 6 } = {}) {
    if (!site) return null;
    const stand = groupOnSite(name, site);
    const towardTrack = -site.side;
    const stationCount = Math.ceil(width / 12) + 1;
    const moduleCount = stationCount - 1;
    const moduleLength = width / moduleCount;
    const zStations = Array.from({ length: stationCount },
      (_, index) => -width / 2 + index * width / (stationCount - 1));
    const groundAt = (x, z) => {
      const worldX = site.position.x + site.frame.across.x * x
        + site.frame.forward.x * z;
      const worldZ = site.position.z + site.frame.across.z * x
        + site.frame.forward.z * z;
      return terrainHeightAt(worldX, worldZ, site.position.y)
        - site.position.y;
    };
    // The Main Straight and T1 grandstand climb sharply. Split long seating
    // decks into ~12 m bays, each resting on local ground, rather than making
    // one horizontal slab float above or disappear into the Texas hillside.
    const foundations = new THREE.InstancedMesh(new THREE.BoxGeometry(34, 1.4,
      moduleLength + .12), concrete, moduleCount);
    foundations.name = `${name} stepped hillside foundations`;
    for (let module = 0; module < moduleCount; module++) {
      const z = (zStations[module] + zStations[module + 1]) / 2;
      helper.position.set(0, groundAt(0, z) - .6, z);
      helper.quaternion.identity();
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      foundations.setMatrixAt(module, helper.matrix);
    }
    foundations.instanceMatrix.needsUpdate = true;
    stand.add(foundations);
    const decks = new THREE.InstancedMesh(new THREE.BoxGeometry(4.45, .28,
      moduleLength + .08), shadow, tiers * moduleCount);
    decks.name = `${name} stepped seating decks`;
    const seating = new THREE.InstancedMesh(new THREE.BoxGeometry(3.86, .22,
      moduleLength + .02), seatMaterial, tiers * moduleCount);
    seating.name = `${name} red white and blue seating`;
    const seatColor = new THREE.Color();
    const beamCount = zStations.length * (tiers * 3 + 2);
    const scaffold = new THREE.InstancedMesh(beamGeometry, steel, beamCount);
    scaffold.name = `${name} visible steel supports`;
    let beam = 0;
    for (let tier = 0; tier < tiers; tier++) {
      const x = towardTrack * (11.5 - tier * 4.1);
      for (let module = 0; module < moduleCount; module++) {
        const z = (zStations[module] + zStations[module + 1]) / 2;
        const y = groundAt(x, z) + 2.1 + tier * 1.85;
        const instance = tier * moduleCount + module;
        helper.position.set(x, y, z);
        helper.quaternion.identity();
        helper.scale.set(1, 1, 1);
        helper.updateMatrix();
        decks.setMatrixAt(instance, helper.matrix);
        helper.position.y += .24;
        helper.updateMatrix();
        seating.setMatrixAt(instance, helper.matrix);
        seating.setColorAt(instance, seatColor.setHex(
          seatColours[tier % seatColours.length]));
      }
      for (const z of zStations) {
        const front = x + towardTrack * 1.7;
        const rear = x - towardTrack * 1.7;
        const deckY = groundAt(x, z) + 2.1 + tier * 1.85;
        setBeam(scaffold, beam++, [front, groundAt(front, z) + .1, z],
          [front, deckY - .12, z]);
        setBeam(scaffold, beam++, [rear, groundAt(rear, z) + .1, z],
          [rear, deckY - .12, z]);
        setBeam(scaffold, beam++, [front, groundAt(front, z) + .12, z],
          [rear, deckY - .12, z], .33);
      }
    }
    decks.instanceMatrix.needsUpdate = true;
    seating.instanceMatrix.needsUpdate = true;
    seating.instanceColor.needsUpdate = true;
    stand.add(decks, seating);
    for (const z of zStations) {
      setBeam(scaffold, beam++, [towardTrack * 13.2,
        groundAt(towardTrack * 13.2, z) + .16, z],
      [-towardTrack * 11.2,
        groundAt(-towardTrack * 11.2, z) + 11.5, z], .5);
      setBeam(scaffold, beam++, [-towardTrack * 13.5,
        groundAt(-towardTrack * 13.5, z) + .1, z],
      [-towardTrack * 13.5,
        groundAt(-towardTrack * 13.5, z) + 12.7, z], .52);
    }
    scaffold.instanceMatrix.needsUpdate = true;
    scaffold.frustumCulled = false;
    stand.add(scaffold);
    if (roof) {
      const roofX = -towardTrack * 1.2;
      const canopy = new THREE.InstancedMesh(new THREE.BoxGeometry(36, .65,
        moduleLength + .1), white, moduleCount);
      canopy.name = `${name} hillside following canopy`;
      for (let module = 0; module < moduleCount; module++) {
        const z = (zStations[module] + zStations[module + 1]) / 2;
        helper.position.set(roofX, groundAt(roofX, z) + 15.45, z);
        helper.quaternion.identity();
        helper.scale.set(1, 1, 1);
        helper.updateMatrix();
        canopy.setMatrixAt(module, helper.matrix);
      }
      canopy.instanceMatrix.needsUpdate = true;
      stand.add(canopy);
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(36, 1.25, .48), red);
      fascia.position.set(roofX, groundAt(roofX, width / 2) + 15.25,
        width / 2 + .22);
      stand.add(fascia);
      const roofStations = zStations.filter((_, index) => index % 2 === 0);
      const struts = new THREE.InstancedMesh(beamGeometry, steel,
        roofStations.length);
      struts.name = `${name} canopy columns`;
      for (let i = 0; i < roofStations.length; i++) {
        const x = -towardTrack * 12.8, z = roofStations[i];
        setBeam(struts, i, [x, groundAt(x, z) + .1, z],
          [x, groundAt(roofX, z) + 15.1, z], .52);
      }
      struts.instanceMatrix.needsUpdate = true;
      stand.add(struts);
    }
    stands.push(stand);
    return stand;
  }

  // The grid module builds the pit complex bay by bay beside the pit lane.
  // This environment adds only the spectator stand facing that complex.
  const mainU = (gridU + .005) % 1;

  const standPlans = [
    ['COTA Main Grandstand', mainU, -pitSide, 132, true, 50],
    ['Turn 1 Grandstand on the hill', turnU(1), outsideSide(turnU(1) ?? 0), 96, true, 58],
    ['Turn 4 Grandstand beside the esses', turnU(4), outsideSide(turnU(4) ?? 0), 70, true, 52],
    ['Turn 12 bleachers at the back straight', turnU(12), outsideSide(turnU(12) ?? 0), 83, false, 53],
    ['Turn 15 Grandstand at the stadium', turnU(15), outsideSide(turnU(15) ?? 0), 92, false, 55],
  ];
  for (const [name, u, side, width, roof, start] of standPlans) {
    const site = placeSite(name, u, side, 19, width / 2 + 3, start);
    addGrandstand(name, site, width, { roof });
  }

  // The 77 m observation tower stands outside the T16-18 stadium curve. Its
  // red open lattice, white lift shaft and projecting viewing deck are visible
  // from much of the venue without placing a huge opaque block in the infield.
  const stadiumU = turnU(17) ?? .79;
  const towerSide = outsideSide(stadiumU);
  const towerSite = placeSite('tower', stadiumU, towerSide, 25, 25, 96,
    [0, 45, -45, 90, -90], 8);
  let tower = null;
  if (towerSite) {
    const towerGround = footprintTerrainRange(towerSite, 19, 19);
    // A circular retaining foundation levels the sloping hill under the
    // tower. Its top clears the highest ground; the concrete side descends to
    // the lowest ground instead of leaving the lower ribs suspended in air.
    towerSite.position.y = towerGround.high + .35;
    tower = groupOnSite('COTA red observation tower', towerSite);
    const foundationDepth = towerGround.high - towerGround.low + 1.4;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(19, 19,
      foundationDepth, 32), concrete);
    base.position.y = .5 - foundationDepth / 2;
    tower.add(base);
    const lift = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.2, 65, 14), white);
    lift.position.y = 32.7;
    tower.add(lift);
    const shaftGlass = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 62, 12,
      1, true, Math.PI * .2, Math.PI * .55), darkGlass);
    shaftGlass.position.y = 32.6;
    tower.add(shaftGlass);
    const ribCount = 26;
    const ribs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.27, .34, 1, 6),
      red, ribCount * 3);
    ribs.name = 'COTA tower red steel fan ribs';
    let rib = 0;
    for (let i = 0; i < ribCount; i++) {
      const t = i / (ribCount - 1);
      const angle = -.65 * Math.PI + t * 1.3 * Math.PI;
      const x = Math.cos(angle), z = Math.sin(angle);
      const p0 = [x * 16, .45, z * 16];
      const p1 = [x * 12 + 2.1, 27, z * 12];
      const p2 = [x * 8 + 4.6, 53, z * 8];
      const p3 = [x * 5 + 8.0, 73.5, z * 5];
      for (const [a, b] of [[p0, p1], [p1, p2], [p2, p3]]) {
        setBeam(ribs, rib++, a, b, .5);
      }
    }
    ribs.instanceMatrix.needsUpdate = true;
    tower.add(ribs);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(16, 14, 2.3, 32), white);
    deck.position.set(5.2, 67.5, 0);
    deck.scale.z = .7;
    tower.add(deck);
    const deckGlass = new THREE.Mesh(new THREE.CylinderGeometry(15.1, 15.1, 2, 32),
      darkGlass);
    deckGlass.position.set(5.2, 69.5, 0);
    deckGlass.scale.z = .68;
    tower.add(deckGlass);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(16.2, 16.2, .65, 32), red);
    cap.position.set(5.2, 71.1, 0);
    cap.scale.z = .72;
    tower.add(cap);
    const spiral = [];
    for (let i = 0; i <= 240; i++) {
      const t = i / 240;
      const theta = t * Math.PI * 2 * 8;
      spiral.push(new THREE.Vector3(Math.cos(theta) * 5.1,
        2 + t * 61, Math.sin(theta) * 5.1));
    }
    const stairs = new THREE.Mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(spiral), 240, .26, 5, false), steel);
    stairs.name = 'External double-helix staircase';
    tower.add(stairs);
  }

  // Germania Insurance Amphitheater is directly below the tower. Its rows
  // conform to the natural slope rather than floating as flat rings.
  const amphitheaterSite = towerSite && placeSite('amphitheater', stadiumU,
    towerSide, 38, 37, towerSite.lateral + 52, [towerSite.along,
      towerSite.along + 42, towerSite.along - 42], 8);
  let amphitheater = null;
  if (amphitheaterSite) {
    amphitheater = groupOnSite('COTA Germania amphitheater', amphitheaterSite);
    const localGround = (x, z) => {
      const worldX = amphitheaterSite.position.x
        + amphitheaterSite.frame.across.x * x
        + amphitheaterSite.frame.forward.x * z;
      const worldZ = amphitheaterSite.position.z
        + amphitheaterSite.frame.across.z * x
        + amphitheaterSite.frame.forward.z * z;
      return terrainHeightAt(worldX, worldZ,
        amphitheaterSite.position.y) - amphitheaterSite.position.y;
    };
    const rowPositions = [], rowColors = [], rowIndices = [];
    for (let tier = 0; tier < 7; tier++) {
      const radius = 14 + tier * 3.15;
      const tint = new THREE.Color(tier % 2 ? 0xbbb6a8 : 0xdbd4c3);
      for (let segment = 0; segment < 32; segment++) {
        const a = Math.PI * (.15 + .7 * segment / 32);
        const b = Math.PI * (.15 + .7 * (segment + 1) / 32);
        const first = rowPositions.length / 3;
        for (const [r, theta] of [[radius, a], [radius + 1.7, a],
          [radius, b], [radius + 1.7, b]]) {
          const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
          rowPositions.push(x, localGround(x, z) + .3 + tier * .14, z);
          rowColors.push(tint.r, tint.g, tint.b);
        }
        rowIndices.push(first, first + 2, first + 1,
          first + 1, first + 2, first + 3);
      }
    }
    const rowGeometry = new THREE.BufferGeometry();
    rowGeometry.setAttribute('position',
      new THREE.Float32BufferAttribute(rowPositions, 3));
    rowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(rowColors, 3));
    rowGeometry.setIndex(rowIndices);
    rowGeometry.computeVertexNormals();
    const rows = new THREE.Mesh(rowGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
        roughness: .9, side: THREE.DoubleSide }));
    rows.name = 'Amphitheater hillside seating terraces';
    amphitheater.add(rows);
    const stageCorners = [-13, 13].flatMap(x => [-19.5, -6.5]
      .map(z => localGround(x, z)));
    const stageTop = Math.max(...stageCorners) + .55;
    const stageDepth = stageTop - Math.min(...stageCorners) + 1.0;
    const stage = new THREE.Mesh(new THREE.BoxGeometry(26, stageDepth, 13), shadow);
    stage.position.set(0, stageTop - stageDepth / 2, -13);
    amphitheater.add(stage);
    const stageRoof = new THREE.Mesh(new THREE.BoxGeometry(29, .65, 16), red);
    stageRoof.position.set(0, stageTop + 10.6, -13);
    amphitheater.add(stageRoof);
    const columns = new THREE.InstancedMesh(beamGeometry, steel, 4);
    columns.name = 'Amphitheater stage columns rooted in hillside';
    let column = 0;
    for (const x of [-13.5, 13.5]) for (const z of [-20, -6]) {
      setBeam(columns, column++, [x, localGround(x, z) + .1, z],
        [x, stageTop + 10.2, z], .6);
    }
    columns.instanceMatrix.needsUpdate = true;
    amphitheater.add(columns);
  }

  // Sparse low vegetation gives the open hill-country site its scale. Every
  // tuft and service tent sits clear of the whole racing ribbon and venues.
  const shrubs = [];
  const tents = [];
  const sourceCount = frames.length;
  for (let attempt = 0; attempt < 950; attempt++) {
    const u = random();
    const frame = frames[Math.floor(u * sourceCount) % sourceCount];
    const side = random() < .5 ? -1 : 1;
    const point = frame.point.clone().addScaledVector(frame.across,
      side * (32 + random() * 235));
    point.y = terrainHeightAt(point.x, point.z,
      frame.point.y - trackY);
    if (!clearFootprint(point, frame, 4.5, 4.5, halfWidth + 4)) continue;
    if (attempt % 16 === 0 && tents.length < 36) {
      reserved.push({ name: 'spectator tent', x: point.x, z: point.z,
        radius: 5.2 });
      tents.push(point);
    } else if (shrubs.length < 400) shrubs.push({ point,
      scale: .55 + random() * 1.55 });
  }
  if (shrubs.length) {
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x647454, roughness: .97,
        vertexColors: true }), shrubs.length);
    leaves.name = 'Sparse Texas hill-country mesquite and scrub';
    const color = new THREE.Color();
    for (let i = 0; i < shrubs.length; i++) {
      const { point, scale } = shrubs[i];
      helper.position.copy(point);
      helper.position.y += .8 * scale;
      helper.quaternion.identity();
      helper.rotation.y = random() * Math.PI * 2;
      helper.scale.set(2.2 * scale, .85 * scale, 1.8 * scale);
      helper.updateMatrix();
      leaves.setMatrixAt(i, helper.matrix);
      leaves.setColorAt(i, color.setHex(i % 3 === 0 ? 0x738052 :
        i % 3 === 1 ? 0x5f7050 : 0x808260));
    }
    leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
    leaves.frustumCulled = false;
    group.add(leaves);
  }
  if (tents.length) {
    const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(5, 3.2, 4),
      white, tents.length);
    canopies.name = 'Small spectator hospitality tents';
    for (let i = 0; i < tents.length; i++) {
      helper.position.copy(tents[i]);
      helper.position.y += 3.3;
      helper.quaternion.identity();
      helper.rotation.y = Math.PI / 4;
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      canopies.setMatrixAt(i, helper.matrix);
    }
    canopies.instanceMatrix.needsUpdate = true;
    canopies.frustumCulled = false;
    group.add(canopies);
  }

  return { group, grandstandCount: stands.length, landmarks: {
    stands, tower, amphitheater }, reservedSites: reserved };
}
