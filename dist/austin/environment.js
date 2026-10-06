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
    const y00 = terrainPoints.getY(a), y10 = terrainPoints.getY(a + 1);
    const y01 = terrainPoints.getY(a + terrainColumns);
    const y11 = terrainPoints.getY(a + terrainColumns + 1);
    return tx + tz <= 1
      ? y00 * (1 - tx - tz) + y10 * tx + y01 * tz
      : y10 * (1 - tz) + y01 * (1 - tx) + y11 * (tx + tz - 1);
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
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff,
    roughness: .86, side: THREE.DoubleSide });
  const crowdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff,
    roughness: .91 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff,
    roughness: .95 });
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
  function addGrandstand(name, site, width,
    { roof = false, rows = 27, bleachers = false, starsAndStripes = false } = {}) {
    if (!site) return null;
    const stand = groupOnSite(name, site);
    const towardTrack = -site.side;
    const rowPitch = .93;
    const rowRise = bleachers ? .36 : .39;
    const frontX = towardTrack * 13.3;
    const bayCount = Math.ceil(width / 9);
    const bayLength = width / bayCount;
    const zStations = Array.from({ length: bayCount + 1 },
      (_, index) => -width / 2 + index * bayLength);
    const aisleZ = [];
    for (let z = -width / 2 + 16; z < width / 2 - 9; z += 18)
      aisleZ.push(z);
    const groundAt = (x, z) => {
      const worldX = site.position.x + site.frame.across.x * x
        + site.frame.forward.x * z;
      const worldZ = site.position.z + site.frame.across.z * x
        + site.frame.forward.z * z;
      return terrainHeightAt(worldX, worldZ, site.position.y)
        - site.position.y;
    };
    const rowX = row => frontX - towardTrack * row * rowPitch;
    const rowTop = (row, z) => groundAt(rowX(row), z)
      + 1.35 + row * rowRise;
    const isAisle = z => aisleZ.some(aisle => Math.abs(aisle - z) < .85);

    // Narrow 0.93 m risers and continuous bench/seat rows read like real
    // grandstands from the track. The decks tilt bay by bay to meet the hill;
    // a massive rectangular foundation would hide the actual steelwork.
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(.93, .20,
      bayLength + .02), concrete, rows * bayCount);
    deck.name = `${name} fine terraced seating deck`;
    const risers = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .40,
      bayLength + .02), shadow, rows * bayCount);
    risers.name = `${name} individual terrace risers`;
    let slabIndex = 0;
    for (let row = 0; row < rows; row++) for (let bay = 0; bay < bayCount; bay++) {
      const z0 = zStations[bay], z1 = zStations[bay + 1];
      const z = (z0 + z1) / 2;
      const y0 = rowTop(row, z0), y1 = rowTop(row, z1);
      const slope = -Math.atan2(y1 - y0, bayLength);
      helper.position.set(rowX(row), (y0 + y1) / 2 - .11, z);
      helper.rotation.set(slope, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      deck.setMatrixAt(slabIndex, helper.matrix);
      helper.position.set(rowX(row) - towardTrack * .44,
        (y0 + y1) / 2 - .39, z);
      helper.updateMatrix();
      risers.setMatrixAt(slabIndex++, helper.matrix);
    }
    deck.instanceMatrix.needsUpdate = true;
    risers.instanceMatrix.needsUpdate = true;
    stand.add(deck, risers);

    const seatPlaces = [];
    const spectators = [];
    const seatPitch = bleachers ? 1.15 : 1.04;
    const seatColumns = Math.floor((width - 1.4) / seatPitch);
    const shirtColours = [0xb92732, 0xe5e1d7, 0x28476d, 0x2e343b,
      0x6c8292, 0xd7a039, 0x435d43, 0x765c58];
    const skinColours = [0xe2b98e, 0xc28661, 0x916245, 0x5e4539,
      0xd6a880, 0xb87755];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < seatColumns; column++) {
        const z = -width / 2 + .7 + (column + .5) * seatPitch;
        if (isAisle(z)) continue;
        const x = rowX(row);
        const y = rowTop(row, z);
        const band = Math.floor((z + width / 2) / Math.max(1, width / 5));
        let seatHex = bleachers ? 0xaeb6b3 : 0x3d454b;
        if (starsAndStripes) {
          seatHex = band === 0 && row > rows * .5 ? 0x234a76
            : row % 5 < 2 ? 0xc4313b : 0xe8e4db;
        } else if (!bleachers && random() < .12) {
          seatHex = [0xae3034, 0x536f8c, 0xc4beb1][column % 3];
        }
        seatPlaces.push({ x, y, z, color: seatHex });
        if (random() < (bleachers ? .46 : .56)) {
          spectators.push({ x, y, z,
            shirt: shirtColours[Math.floor(random() * shirtColours.length)],
            skin: skinColours[Math.floor(random() * skinColours.length)],
            scale: .82 + random() * .32 });
        }
      }
    }
    if (bleachers) {
      const benches = new THREE.InstancedMesh(new THREE.BoxGeometry(.44, .1,
        bayLength + .04), steel, rows * bayCount);
      benches.name = `${name} aluminum bleacher benches`;
      let index = 0;
      for (let row = 0; row < rows; row++) for (let bay = 0; bay < bayCount; bay++) {
        const z = (zStations[bay] + zStations[bay + 1]) / 2;
        helper.position.set(rowX(row) + towardTrack * .08,
          rowTop(row, z) + .17, z);
        helper.rotation.set(-Math.atan2(rowTop(row, zStations[bay + 1])
          - rowTop(row, zStations[bay]), bayLength), 0, 0);
        helper.scale.set(1, 1, 1);
        helper.updateMatrix();
        benches.setMatrixAt(index++, helper.matrix);
      }
      benches.instanceMatrix.needsUpdate = true;
      stand.add(benches);
    } else {
      const seatBack = new THREE.PlaneGeometry(.67, .58);
      seatBack.rotateY(Math.PI / 2);
      const seats = new THREE.InstancedMesh(seatBack,
        seatMaterial, seatPlaces.length);
      seats.name = `${name} individual coloured chair backs`;
      const seatColor = new THREE.Color();
      seatPlaces.forEach((seat, i) => {
        helper.position.set(seat.x - towardTrack * .29,
          seat.y + .30, seat.z);
        helper.rotation.set(0, 0, 0);
        helper.scale.set(1, 1, 1);
        helper.updateMatrix();
        seats.setMatrixAt(i, helper.matrix);
        seats.setColorAt(i, seatColor.setHex(seat.color));
      });
      seats.instanceMatrix.needsUpdate = true;
      seats.instanceColor.needsUpdate = true;
      stand.add(seats);
    }
    const bodies = new THREE.InstancedMesh(new THREE.ConeGeometry(.29,
      .62, 4), crowdMaterial, spectators.length);
    bodies.name = `${name} seated race crowd shirts`;
    const heads = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.22, 0),
      skinMaterial, spectators.length);
    heads.name = `${name} seated race crowd heads`;
    const crowdColor = new THREE.Color();
    spectators.forEach((person, i) => {
      helper.position.set(person.x + towardTrack * .02,
        person.y + .49, person.z);
      helper.rotation.set(0, random() * .35 - .175, 0);
      helper.scale.set(person.scale, person.scale, person.scale);
      helper.updateMatrix();
      bodies.setMatrixAt(i, helper.matrix);
      bodies.setColorAt(i, crowdColor.setHex(person.shirt));
      helper.position.y = person.y + .91 * person.scale;
      helper.scale.set(person.scale, person.scale, person.scale);
      helper.updateMatrix();
      heads.setMatrixAt(i, helper.matrix);
      heads.setColorAt(i, crowdColor.setHex(person.skin));
    });
    bodies.instanceMatrix.needsUpdate = true;
    bodies.instanceColor.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    heads.instanceColor.needsUpdate = true;
    stand.add(bodies, heads);

    const braces = [];
    for (const z of zStations) {
      for (const row of [0, Math.floor(rows / 2), rows - 1]) {
        const x = rowX(row), top = rowTop(row, z) - .24;
        braces.push([[x, groundAt(x, z) + .1, z], [x, top, z], .36]);
      }
      for (const row of [Math.floor(rows / 2), rows - 1]) {
        const x = rowX(row), anchor = rowX(row - 4);
        braces.push([[anchor, groundAt(anchor, z) + .1, z],
          [x, rowTop(row, z) - .23, z], .28]);
      }
    }
    const scaffold = new THREE.InstancedMesh(beamGeometry, steel,
      braces.length);
    scaffold.name = `${name} terrain-rooted steel supports and diagonals`;
    braces.forEach(([from, to, thickness], i) =>
      setBeam(scaffold, i, from, to, thickness));
    scaffold.instanceMatrix.needsUpdate = true;
    stand.add(scaffold);

    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(.8, .08, 1.45),
      white, rows * aisleZ.length);
    steps.name = `${name} visible stair aisles`;
    let stepIndex = 0;
    for (const z of aisleZ) for (let row = 0; row < rows; row++) {
      helper.position.set(rowX(row), rowTop(row, z) + .08, z);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      steps.setMatrixAt(stepIndex++, helper.matrix);
    }
    steps.instanceMatrix.needsUpdate = true;
    stand.add(steps);
    const handrails = [];
    for (const z of aisleZ) for (const side of [-1, 1]) {
      const railZ = z + side * .82;
      for (let row = 0; row < rows - 1; row += 3) {
        handrails.push([[rowX(row), rowTop(row, railZ) + 1.05, railZ],
          [rowX(Math.min(rows - 1, row + 3)),
            rowTop(Math.min(rows - 1, row + 3), railZ) + 1.05, railZ], .08]);
      }
    }
    const rails = new THREE.InstancedMesh(beamGeometry, steel,
      handrails.length);
    rails.name = `${name} aisle handrails`;
    handrails.forEach(([from, to, thickness], i) =>
      setBeam(rails, i, from, to, thickness));
    rails.instanceMatrix.needsUpdate = true;
    stand.add(rails);

    const frontRails = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .13,
      bayLength + .02), red, bayCount);
    frontRails.name = `${name} track-facing red balustrade`;
    for (let bay = 0; bay < bayCount; bay++) {
      const z = (zStations[bay] + zStations[bay + 1]) / 2;
      helper.position.set(frontX + towardTrack * .59,
        rowTop(0, z) + 1.06, z);
      helper.rotation.set(-Math.atan2(rowTop(0, zStations[bay + 1])
        - rowTop(0, zStations[bay]), bayLength), 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      frontRails.setMatrixAt(bay, helper.matrix);
    }
    frontRails.instanceMatrix.needsUpdate = true;
    stand.add(frontRails);

    if (roof) {
      // The Main Grandstand has a broad white cantilever; Turn 1 only shades
      // its upper rows. Each panel follows the grandstand's longitudinal rise.
      const roofDepth = roof === 'partial' ? 14 : 27;
      const roofX = roof === 'partial' ? -towardTrack * 6.5
        : -towardTrack * .2;
      const rearX = rowX(rows - 1) - towardTrack * .6;
      const roofYAt = z => rowTop(rows - 1, z) + 4.65;
      const canopy = new THREE.InstancedMesh(new THREE.BoxGeometry(roofDepth,
        .33, bayLength + .06), white, bayCount);
      canopy.name = `${name} lightweight cantilever roof panels`;
      const lip = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, .65,
        bayLength + .05), red, bayCount);
      lip.name = `${name} red roof leading edge`;
      for (let bay = 0; bay < bayCount; bay++) {
        const z0 = zStations[bay], z1 = zStations[bay + 1];
        const z = (z0 + z1) / 2;
        const y0 = roofYAt(z0), y1 = roofYAt(z1);
        helper.position.set(roofX, (y0 + y1) / 2, z);
        helper.rotation.set(-Math.atan2(y1 - y0, bayLength), 0,
          -towardTrack * .045);
        helper.scale.set(1, 1, 1);
        helper.updateMatrix();
        canopy.setMatrixAt(bay, helper.matrix);
        helper.position.x = roofX + towardTrack * roofDepth / 2;
        helper.position.y -= .045 * roofDepth / 2;
        helper.updateMatrix();
        lip.setMatrixAt(bay, helper.matrix);
      }
      canopy.instanceMatrix.needsUpdate = true;
      lip.instanceMatrix.needsUpdate = true;
      stand.add(canopy, lip);
      const supports = [];
      for (const z of zStations.filter((_, i) => i % 2 === 0)) {
        supports.push([[rearX, groundAt(rearX, z) + .1, z],
          [rearX, roofYAt(z) - .2, z], .48]);
        supports.push([[rearX, rowTop(rows - 1, z) + 1.6, z],
          [roofX + towardTrack * (roofDepth / 2 - 1),
            roofYAt(z) - .4, z], .29]);
      }
      const roofBeams = new THREE.InstancedMesh(beamGeometry, steel,
        supports.length);
      roofBeams.name = `${name} cantilever roof columns and trusses`;
      supports.forEach(([from, to, thickness], i) =>
        setBeam(roofBeams, i, from, to, thickness));
      roofBeams.instanceMatrix.needsUpdate = true;
      stand.add(roofBeams);
    }
    if (name === 'COTA Main Grandstand') {
      // Glazed suites, loge boxes and ground-floor concessions sit within the
      // structure behind the main seating. Three recessed levels give the
      // long main stand the layered silhouette seen opposite the paddock.
      const suitesX = rowX(rows - 1) + towardTrack * 3.2;
      const suites = new THREE.InstancedMesh(new THREE.BoxGeometry(5.8, 2.45,
        bayLength - .16), darkGlass, bayCount * 3);
      suites.name = 'COTA Main Grandstand three-level suites and concessions';
      const balcony = new THREE.InstancedMesh(new THREE.BoxGeometry(7.0, .18,
        bayLength + .05), white, bayCount * 3);
      balcony.name = 'COTA Main Grandstand white balcony bands';
      let index = 0;
      for (let level = 0; level < 3; level++) for (let bay = 0; bay < bayCount; bay++) {
        const z = (zStations[bay] + zStations[bay + 1]) / 2;
        const base = groundAt(suitesX, z);
        helper.position.set(suitesX, base + 1.54 + level * 2.8, z);
        helper.rotation.set(0, 0, 0);
        helper.scale.set(1, 1, 1);
        helper.updateMatrix();
        suites.setMatrixAt(index, helper.matrix);
        helper.position.y = base + 2.8 + level * 2.8;
        helper.updateMatrix();
        balcony.setMatrixAt(index++, helper.matrix);
      }
      suites.instanceMatrix.needsUpdate = true;
      balcony.instanceMatrix.needsUpdate = true;
      stand.add(suites, balcony);
      const mullions = [];
      for (const z of zStations) {
        const x = suitesX + towardTrack * 2.95;
        mullions.push([[x, groundAt(x, z) + .16, z],
          [x, groundAt(x, z) + 8.4, z], .16]);
      }
      const suiteFrame = new THREE.InstancedMesh(beamGeometry, steel,
        mullions.length);
      suiteFrame.name = 'COTA Main Grandstand suite window mullions';
      mullions.forEach(([from, to, thickness], i) =>
        setBeam(suiteFrame, i, from, to, thickness));
      suiteFrame.instanceMatrix.needsUpdate = true;
      stand.add(suiteFrame);
    }
    stands.push(stand);
    return stand;
  }

  // The grid module builds the pit complex bay by bay beside the pit lane.
  // This environment adds only the spectator stand facing that complex.
  const mainU = (gridU + .005) % 1;

  const standPlans = [
    ['COTA Main Grandstand', mainU, -pitSide, 132, 'full', 50,
      { rows: 29 }],
    ['Turn 1 Grandstand on the hill', turnU(1),
      outsideSide(turnU(1) ?? 0), 96, 'partial', 58, { rows: 27 }],
    ['Turn 4 Grandstand beside the esses', turnU(4),
      outsideSide(turnU(4) ?? 0), 70, false, 52,
      { rows: 26, starsAndStripes: true }],
    ['Turn 12 bleachers at the back straight', turnU(12),
      outsideSide(turnU(12) ?? 0), 83, false, 53,
      { rows: 23, bleachers: true }],
    ['Turn 15 Grandstand at the stadium', turnU(15),
      outsideSide(turnU(15) ?? 0), 92, false, 55, { rows: 29 }],
  ];
  for (const [name, u, side, width, roof, start, details] of standPlans) {
    const site = placeSite(name, u, side, 19, width / 2 + 3, start);
    addGrandstand(name, site, width, { roof, ...details });
  }

  function addGroundPatch(parent, site, halfX, halfZ, material, name,
    offsetX = 0, offsetZ = 0, lift = .07) {
    const positions = [], indices = [];
    const nx = 6, nz = 10;
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = offsetX - halfX + ix * halfX * 2 / nx;
      const z = offsetZ - halfZ + iz * halfZ * 2 / nz;
      const worldX = site.position.x + site.frame.across.x * x
        + site.frame.forward.x * z;
      const worldZ = site.position.z + site.frame.across.z * x
        + site.frame.forward.z * z;
      positions.push(x, terrainHeightAt(worldX, worldZ, site.position.y)
        - site.position.y + lift, z);
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix;
      indices.push(a, a + nx + 1, a + 1,
        a + 1, a + nx + 1, a + nx + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const patch = new THREE.Mesh(geometry, material);
    patch.name = name;
    parent.add(patch);
    return patch;
  }

  // The venue is not empty pasture between the ribbon and the tower. The
  // Grand Plaza by T12–15 and the Turn 1 fan walk are laid over the actual
  // rolling ground, with shaded food rows and occupied circulation space.
  const plazaPaving = new THREE.MeshStandardMaterial({ color: 0xb7b2a6,
    roughness: .96, side: THREE.DoubleSide });
  const serviceAsphalt = new THREE.MeshStandardMaterial({ color: 0x686d6a,
    roughness: .98, side: THREE.DoubleSide });
  const umbrellaCanvas = new THREE.MeshStandardMaterial({
    color: 0x496582, roughness: .81 });
  const fanZones = [
    ['COTA Grand Plaza fan walk', turnU(15),
      outsideSide(turnU(15) ?? 0), 127],
    ['Turn 1 food and spectator walk', turnU(1),
      outsideSide(turnU(1) ?? 0), 132],
  ];
  const fanPlazas = [];
  const fanPlazaSites = new Map();
  for (const [name, u, side, lateral] of fanZones) {
    const site = placeSite(name, u, side, 29, 38, lateral,
      [0, 48, -48, 95, -95], 11);
    if (!site) continue;
    const plaza = groupOnSite(name, site);
    fanPlazas.push(plaza);
    fanPlazaSites.set(name, site);
    const localGround = (x, z) => {
      const worldX = site.position.x + site.frame.across.x * x
        + site.frame.forward.x * z;
      const worldZ = site.position.z + site.frame.across.z * x
        + site.frame.forward.z * z;
      return terrainHeightAt(worldX, worldZ, site.position.y)
        - site.position.y;
    };
    addGroundPatch(plaza, site, 27.5, 37, plazaPaving,
      `${name} terrain-following pedestrian surface`);
    addGroundPatch(plaza, site, 3.2, 36.4, serviceAsphalt,
      `${name} central service and accessible way`, 0, 0, .105);
    const booths = [];
    for (const x of [-19.3, 19.3]) for (const z of [-26, -9, 9, 26])
      booths.push({ x, z });
    const boothWalls = new THREE.InstancedMesh(new THREE.BoxGeometry(4.3,
      2.45, 5.6), white, booths.length);
    boothWalls.name = `${name} food and merchandise concessions`;
    const boothRoofs = new THREE.InstancedMesh(new THREE.BoxGeometry(5.25,
      .30, 6.4), seatMaterial, booths.length);
    boothRoofs.name = `${name} red white blue vendor awnings`;
    const tint = new THREE.Color();
    booths.forEach(({ x, z }, i) => {
      const ground = localGround(x, z);
      helper.position.set(x, ground + 1.23, z);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      boothWalls.setMatrixAt(i, helper.matrix);
      helper.position.y = ground + 2.59;
      helper.updateMatrix();
      boothRoofs.setMatrixAt(i, helper.matrix);
      boothRoofs.setColorAt(i, tint.setHex(
        [0xb92732, 0xe1dccc, 0x426380][i % 3]));
    });
    boothWalls.instanceMatrix.needsUpdate = true;
    boothRoofs.instanceMatrix.needsUpdate = true;
    boothRoofs.instanceColor.needsUpdate = true;
    plaza.add(boothWalls, boothRoofs);
    const shadePoints = [];
    for (const z of [-27, -13, 2, 17, 30]) for (const x of [-9, 9])
      shadePoints.push({ x, z });
    const parasols = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2,
      1.35, 6), umbrellaCanvas, shadePoints.length);
    parasols.name = `${name} shaded outdoor seating umbrellas`;
    const shadePosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08,
      .08, 2.7, 5), steel, shadePoints.length);
    shadePoints.forEach(({ x, z }, i) => {
      const ground = localGround(x, z);
      helper.position.set(x, ground + 3.0, z);
      helper.rotation.set(0, i * .37, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      parasols.setMatrixAt(i, helper.matrix);
      helper.position.y = ground + 1.4;
      helper.updateMatrix();
      shadePosts.setMatrixAt(i, helper.matrix);
    });
    parasols.instanceMatrix.needsUpdate = true;
    shadePosts.instanceMatrix.needsUpdate = true;
    plaza.add(parasols, shadePosts);
    const walkers = [];
    for (let attempt = 0; attempt < 215; attempt++) {
      const x = (random() - .5) * 30;
      const z = (random() - .5) * 67;
      if (Math.abs(x) > 15.4 && Math.abs(z) < 31) continue;
      if (shadePoints.some(point => Math.hypot(x - point.x,
        z - point.z) < .8)) continue;
      walkers.push({ x, z, scale: .85 + random() * .25 });
    }
    const people = new THREE.InstancedMesh(new THREE.ConeGeometry(.31,
      1.18, 4), crowdMaterial, walkers.length);
    people.name = `${name} dispersed spectators`;
    const heads = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.24,
      0), skinMaterial, walkers.length);
    heads.name = `${name} spectator heads`;
    const shirts = [0xb52e32, 0x365c83, 0xe5daca, 0x363f43, 0xb68a47];
    const complexions = [0xe1b78f, 0xc38f69, 0x906648, 0x624a3b];
    walkers.forEach(({ x, z, scale }, i) => {
      const ground = localGround(x, z);
      helper.position.set(x, ground + .66 * scale, z);
      helper.rotation.set(0, random() * Math.PI * 2, 0);
      helper.scale.set(scale, scale, scale);
      helper.updateMatrix();
      people.setMatrixAt(i, helper.matrix);
      people.setColorAt(i, tint.setHex(shirts[i % shirts.length]));
      helper.position.y = ground + 1.36 * scale;
      helper.updateMatrix();
      heads.setMatrixAt(i, helper.matrix);
      heads.setColorAt(i, tint.setHex(complexions[i % complexions.length]));
    });
    people.instanceMatrix.needsUpdate = true;
    people.instanceColor.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    heads.instanceColor.needsUpdate = true;
    plaza.add(people, heads);
  }

  const lotU = turnU(9);
  const lotSide = outsideSide(lotU ?? 0);
  const lotSite = placeSite('COTA outer service and shuttle lot', lotU,
    lotSide, 31, 52, 165, [0, 65, -65, 125, -125], 8);
  let serviceLot = null;
  if (lotSite) {
    serviceLot = groupOnSite('COTA outer service and shuttle lot', lotSite);
    addGroundPatch(serviceLot, lotSite, 29.5, 50.5, serviceAsphalt,
      'COTA graded outer parking lot');
    const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7,
      1.25, 3.7), seatMaterial, 44);
    carBody.name = 'COTA parked spectator and service vehicles';
    const carColor = new THREE.Color();
    let parked = 0;
    for (const x of [-21, -14, 14, 21]) for (let z = -38; z <= 38; z += 7.6) {
      const worldX = lotSite.position.x + lotSite.frame.across.x * x
        + lotSite.frame.forward.x * z;
      const worldZ = lotSite.position.z + lotSite.frame.across.z * x
        + lotSite.frame.forward.z * z;
      helper.position.set(x, terrainHeightAt(worldX, worldZ,
        lotSite.position.y) - lotSite.position.y + .68, z);
      helper.rotation.set(0, random() * .04 - .02, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      carBody.setMatrixAt(parked, helper.matrix);
      carBody.setColorAt(parked++, carColor.setHex(
        [0xc7c9c3, 0x465967, 0xb22c30, 0x343b3e, 0xddd9ce][parked % 5]));
      if (parked >= carBody.count) break;
    }
    carBody.instanceMatrix.needsUpdate = true;
    carBody.instanceColor.needsUpdate = true;
    serviceLot.add(carBody);
  }

  const accessRoutes = [];
  function addAccessPath(name, start, end, width, material) {
    accessRoutes.push({ start: start.clone(), end: end.clone(), width });
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const count = Math.ceil(distance / 5);
    const normalX = -(end.z - start.z) / distance;
    const normalZ = (end.x - start.x) / distance;
    const vertices = [], indices = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const centerX = start.x + (end.x - start.x) * t;
      const centerZ = start.z + (end.z - start.z) * t;
      for (const side of [-1, 1]) {
        const x = centerX + normalX * side * width / 2;
        const z = centerZ + normalZ * side * width / 2;
        vertices.push(x, terrainHeightAt(x, z, start.y) + .085, z);
      }
      if (i < count) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1,
          a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const path = new THREE.Mesh(geometry, material);
    path.name = name;
    group.add(path);
    return path;
  }
  if (fanPlazas[0] && stands[3] && stands[4]) {
    for (const target of [stands[3], stands[4]]) {
      const rear = target.position.clone();
      // Stand locations were admitted with ample track clearance. Walkways
      // meet their backs so the approach never cuts through a seating deck.
      const standSite = reserved.find(site => site.name === target.name);
      if (standSite) rear.addScaledVector(standSite.frame.across,
        standSite.side * 17);
      addAccessPath(`COTA Grand Plaza walkway to ${target.name}`,
        fanPlazas[0].position, rear, 4.8, plazaPaving);
    }
  }
  if (fanPlazas[1] && stands[1]) {
    const standSite = reserved.find(site => site.name === stands[1].name);
    const rear = stands[1].position.clone();
    if (standSite) rear.addScaledVector(standSite.frame.across,
      standSite.side * 17);
    addAccessPath('Turn 1 food walk to grandstand',
      fanPlazas[1].position, rear, 4.8, plazaPaving);
  }
  if (serviceLot) {
    addAccessPath('COTA outer parking access road', serviceLot.position,
      serviceLot.position.clone().add(new THREE.Vector3(310, 0, -20)),
      7.5, serviceAsphalt);
  }

  // COTA's planted Grand Plaza and the east side of the Main Grandstand
  // contain real shade trees. Keep them in legible groves at the visitor
  // precincts instead of scattering isolated dark blobs over the whole site.
  const grovePlans = [
    { site: fanPlazaSites.get('COTA Grand Plaza fan walk'),
      x: -63, z: -16, count: 11,
      spreadX: 14, spreadZ: 24 },
    { site: fanPlazaSites.get('COTA Grand Plaza fan walk'),
      x: 62, z: 18, count: 10,
      spreadX: 14, spreadZ: 21 },
    { site: fanPlazaSites.get('Turn 1 food and spectator walk'),
      x: 57, z: -13, count: 10,
      spreadX: 17, spreadZ: 19 },
    { site: lotSite, x: -53, z: 5, count: 11,
      spreadX: 18, spreadZ: 22 },
  ];
  function distanceToRoute(x, z, route) {
    const dx = route.end.x - route.start.x;
    const dz = route.end.z - route.start.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1,
      ((x - route.start.x) * dx + (z - route.start.z) * dz)
        / lengthSquared));
    return Math.hypot(x - route.start.x - dx * t,
      z - route.start.z - dz * t);
  }
  const planted = [];
  for (const plan of grovePlans) {
    if (!plan.site) continue;
    let accepted = 0;
    for (let attempt = 0; attempt < plan.count * 16
      && accepted < plan.count; attempt++) {
      const x = plan.x + (random() - .5) * plan.spreadX * 2;
      const z = plan.z + (random() - .5) * plan.spreadZ * 2;
      const world = plan.site.position.clone()
        .addScaledVector(plan.site.frame.across, x)
        .addScaledVector(plan.site.frame.forward, z);
      if (!clearFootprint(world, plan.site.frame, 3.6, 3.6)) continue;
      if (accessRoutes.some(route =>
        distanceToRoute(world.x, world.z, route) < route.width / 2 + 4.6))
        continue;
      if (planted.some(tree => Math.hypot(tree.point.x - world.x,
        tree.point.z - world.z) < 7.5)) continue;
      world.y = terrainHeightAt(world.x, world.z, plan.site.position.y);
      planted.push({ point: world,
        size: .83 + random() * .45,
        tint: random() });
      accepted++;
    }
  }
  if (planted.length) {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x796b54,
      roughness: 1 });
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff,
      roughness: .98 });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,
      .26, 3.3, 5), trunkMaterial, planted.length);
    trunks.name = 'Clustered Austin live oak and mesquite trunks';
    const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,
      1), foliageMaterial, planted.length * 3);
    canopy.name = 'Clustered live oak and mesquite crowns';
    const foliageColor = new THREE.Color();
    const hues = [0x8e9d70, 0x789066, 0x9da97d, 0x768a5f];
    let leaf = 0;
    for (let i = 0; i < planted.length; i++) {
      const { point, size, tint } = planted[i];
      helper.position.set(point.x, point.y + 1.65 * size, point.z);
      helper.rotation.set(0, tint * Math.PI * 2, (tint - .5) * .14);
      helper.scale.set(size, size, size);
      helper.updateMatrix();
      trunks.setMatrixAt(i, helper.matrix);
      for (const [dx, dy, dz, sx, sy, sz] of [
        [0, 4.0, 0, 2.9, 1.67, 2.65],
        [-1.65, 3.55, .55, 1.77, 1.16, 1.84],
        [1.54, 3.68, -.45, 1.85, 1.23, 1.71],
      ]) {
        helper.position.set(point.x + dx * size,
          point.y + dy * size, point.z + dz * size);
        helper.rotation.set(0, tint * Math.PI * 2, 0);
        helper.scale.set(sx * size, sy * size, sz * size);
        helper.updateMatrix();
        canopy.setMatrixAt(leaf, helper.matrix);
        canopy.setColorAt(leaf, foliageColor.setHex(
          hues[(i + leaf) % hues.length]));
        leaf++;
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    canopy.instanceColor.needsUpdate = true;
    group.add(trunks, canopy);
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

  return { group, grandstandCount: stands.length, landmarks: {
    stands, tower, amphitheater, fanPlazas, serviceLot },
    reservedSites: reserved };
}
