/**
 * Autódromo Hermanos Rodríguez race-day venue. The Estadio GNP Seguros,
 * paddock and spectator architecture are reconstructed from FIA circuit plans
 * and the promoter's race photography. Footprints are rejected against every
 * section of the race road and pit lane, not merely the nearest named corner.
 */
export function addMexicoEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const { trackY = 0, halfWidth = 6.5, gridU = 0,
    sourceFractions = [], pitSide = -1 } = options;
  const group = new THREE.Group();
  group.name = 'Autódromo Hermanos Rodríguez stadium and Mexico City venue';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const lapLength = curve.getLength();
  const reserved = [];
  const terrain = scene.getObjectByName('Mexico City park terrain');
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
  const pit = scene.getObjectByName('Mexico pit entry, fast lane, working lane and exit');
  const pitVertices = pit?.geometry?.getAttribute('position');
  let state = 0x0c1dad2025;
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
    { roof = false, rows = 27, bleachers = false, stadium = false,
      occupancy = .65 } = {}) {
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
    // grandstands from the track. The decks tilt bay by bay to meet the ground;
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
    const shirtColours = [0x146846, 0xf2ead7, 0xbe282e, 0x19333c,
      0x245a74, 0xe2aa3d, 0x35473b, 0x8b5350];
    const skinColours = [0xe2b98e, 0xc28661, 0x916245, 0x5e4539,
      0xd6a880, 0xb87755];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < seatColumns; column++) {
        const z = -width / 2 + .7 + (column + .5) * seatPitch;
        if (isAisle(z)) continue;
        const x = rowX(row);
        const y = rowTop(row, z);
        const band = Math.floor((z + width / 2) / Math.max(1, width / 5));
        let seatHex = bleachers ? 0x9da3a1 : 0x39454b;
        if (stadium) seatHex = band === 0 ? 0x267159
          : band === 4 ? 0xb93537 : 0xe0dbcb;
        else if (!bleachers && random() < .17)
          seatHex = [0x2d765a, 0xbe484a, 0xd5d0bd][column % 3];
        seatPlaces.push({ x, y, z, color: seatHex });
        if (random() < occupancy) {
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
    if (name === 'Mexico Main Grandstand') {
      // Glazed suites, loge boxes and ground-floor concessions sit within the
      // structure behind the main seating. Three recessed levels give the
      // long main stand the layered silhouette seen opposite the paddock.
      const suitesX = rowX(rows - 1) + towardTrack * 3.2;
      const suites = new THREE.InstancedMesh(new THREE.BoxGeometry(5.8, 2.45,
        bayLength - .16), darkGlass, bayCount * 3);
      suites.name = 'Mexico Main Grandstand three-level suites and concessions';
      const balcony = new THREE.InstancedMesh(new THREE.BoxGeometry(7.0, .18,
        bayLength + .05), white, bayCount * 3);
      balcony.name = 'Mexico Main Grandstand white balcony bands';
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
      suiteFrame.name = 'Mexico Main Grandstand suite window mullions';
      mullions.forEach(([from, to, thickness], i) =>
        setBeam(suiteFrame, i, from, to, thickness));
      suiteFrame.instanceMatrix.needsUpdate = true;
      stand.add(suiteFrame);
    }
    stands.push(stand);
    return stand;
  }

  // The pit building is made by grid-details. From the grid camera the long
  // covered main stand must balance it on the opposite side of the straight.
  const standPlans = [
    ['Mexico Main Grandstand', (gridU + .010) % 1, -pitSide,
      168, 48, { rows: 31, roof: 'full', occupancy: .73 }],
    ['Mexico Orange Zone Grada 2A main straight', (gridU + .112) % 1,
      -pitSide, 116, 53,
      { rows: 22, roof: false, occupancy: .72 }],
    ['Moisés Solana Turn 1 Grandstand', turnU(1),
      outsideSide(turnU(1) ?? 0), 90, 54,
      { rows: 24, roof: false, occupancy: .7 }],
    ['Moisés Solana Grada 4 at Turns 1–2', turnU(2),
      outsideSide(turnU(2) ?? 0), 79, 59,
      { rows: 20, roof: false, occupancy: .76 }],
    ['Moisés Solana Grada 5A at Turn 3', turnU(3),
      outsideSide(turnU(3) ?? 0), 83, 62,
      { rows: 21, roof: false, occupancy: .75 }],
    ['Turn 4 Grandstand overlooking Rebaque', turnU(4),
      outsideSide(turnU(4) ?? 0), 82, 53,
      { rows: 22, roof: false, occupancy: .68 }],
    ['Turn 9 technical section grandstand', turnU(9),
      outsideSide(turnU(9) ?? 0), 70, 55,
      { rows: 20, bleachers: true, occupancy: .62 }],
    ['Estadio GNP Seguros north grandstand 15', turnU(12),
      1, 115, 66,
      { rows: 37, roof: 'partial', stadium: true, occupancy: .88 }],
    ['Estadio GNP Seguros south grandstand 14', turnU(16),
      -1, 121, 66,
      { rows: 37, roof: 'partial', stadium: true, occupancy: .88 }],
  ];
  const stadiumStands = [];
  for (const [name, u, side, width, start, details] of standPlans) {
    const site = placeSite(name, u, side, details.stadium ? 44 : 35,
      width / 2 + 4, start, [0, 34, -34, 68, -68], 4);
    const stand = addGrandstand(name, site, width, details);
    if (stand && details.stadium) stadiumStands.push({ stand, site, width,
      rows: details.rows });
  }

  // The circuit actually enters a concert stadium, not a generic pair of
  // open bleachers. Add outer concrete shells, entry portals, upper fascia,
  // a visible concourse and an overhead scoring screen around both stands.
  const stadiumConcrete = new THREE.MeshStandardMaterial({ color: 0xbebdb4,
    roughness: .94 });
  const stadiumFascia = new THREE.MeshStandardMaterial({ color: 0x254b4b,
    roughness: .78 });
  const concourse = new THREE.MeshStandardMaterial({ color: 0x777b76,
    roughness: .91 });
  for (const { stand, site, width, rows } of stadiumStands) {
    const toward = -site.side;
    const rearX = toward * 13.3 - toward * (rows - 1) * .93;
    const shellX = rearX - toward * 3.6;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(6.2, 12.6,
      width + 2.5), stadiumConcrete);
    shell.name = `${stand.name} outer stadium concrete shell`;
    shell.position.set(shellX, 6.3, 0);
    stand.add(shell);
    const upperBand = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.45,
      width + 3.2), stadiumFascia);
    upperBand.name = `${stand.name} upper stadium fascia`;
    upperBand.position.set(shellX, 13.0, 0);
    stand.add(upperBand);
    const roofBand = new THREE.Mesh(new THREE.BoxGeometry(8.4, .42,
      width + 4.0), stadiumConcrete);
    roofBand.name = `${stand.name} stadium upper concourse coping`;
    roofBand.position.set(shellX - toward * .2, 14.35, 0);
    stand.add(roofBand);
    const portalPositions = [];
    for (let z = -width / 2 + 11; z <= width / 2 - 9; z += 17)
      portalPositions.push(z);
    const portals = new THREE.InstancedMesh(new THREE.BoxGeometry(.18,
      3.0, 3.3), shadow, portalPositions.length);
    portals.name = `${stand.name} concourse entry portals`;
    portalPositions.forEach((z, i) => {
      helper.position.set(shellX - toward * 3.16, 2.35, z);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      portals.setMatrixAt(i, helper.matrix);
    });
    portals.instanceMatrix.needsUpdate = true;
    stand.add(portals);
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(13.2, .22,
      width + 8), concourse);
    terrace.name = `${stand.name} spectator circulation terrace`;
    terrace.position.set(shellX - toward * 10.6, .15, 0);
    stand.add(terrace);
    const fasciaStripes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(.09, .22, 6.5),
      new THREE.MeshStandardMaterial({ color: 0xc8d9cc,
        roughness: .86 }), Math.ceil(width / 10));
    fasciaStripes.name = `${stand.name} stadium fascia rhythm`;
    for (let i = 0; i < fasciaStripes.count; i++) {
      helper.position.set(shellX + toward * 3.30, 12.8,
        -width / 2 + 5 + i * 10);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      fasciaStripes.setMatrixAt(i, helper.matrix);
    }
    fasciaStripes.instanceMatrix.needsUpdate = true;
    stand.add(fasciaStripes);
  }

  function addGroundPatch(parent, site, halfX, halfZ, material, name,
    offsetX = 0, offsetZ = 0, lift = .055) {
    const positions = [], indices = [];
    const nx = 5, nz = 8;
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

  const plazaPaving = new THREE.MeshStandardMaterial({ color: 0xaeb2ac,
    roughness: .96, side: THREE.DoubleSide });
  const serviceAsphalt = new THREE.MeshStandardMaterial({ color: 0x636967,
    roughness: .97, side: THREE.DoubleSide });
  const canvasFabric = new THREE.MeshStandardMaterial({ color: 0xd9d3c6,
    roughness: .88 });
  const fanSites = [];
  for (const [name, corner, lateral] of [
    ['Estadio GNP north spectator plaza', 13, 147],
    ['Estadio GNP south spectator plaza', 15, 149],
    ['Moisés Solana spectator access', 1, 125],
    ['Moisés Solana blue-zone fan walk', 3, 145],
  ]) {
    const u = turnU(corner);
    const site = placeSite(name, u, outsideSide(u ?? 0), 31, 44,
      lateral, [0, 46, -46, 92, -92], 3);
    if (!site) continue;
    const plaza = groupOnSite(name, site);
    fanSites.push(site);
    addGroundPatch(plaza, site, 29, 42, plazaPaving,
      `${name} concrete fan-walk`);
    addGroundPatch(plaza, site, 3.0, 42, serviceAsphalt,
      `${name} central service route`, 0, 0, .09);
    const concessions = [];
    for (const x of [-19, 19]) for (const z of [-29, -10, 10, 29])
      concessions.push({ x, z });
    const booths = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6,
      2.4, 5.4), white, concessions.length);
    booths.name = `${name} food and merchandise kiosks`;
    const awnings = new THREE.InstancedMesh(new THREE.BoxGeometry(5.5,
      .20, 6.15), seatMaterial, concessions.length);
    awnings.name = `${name} striped kiosk awnings`;
    const colour = new THREE.Color();
    concessions.forEach(({ x, z }, i) => {
      helper.position.set(x, 1.25, z);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      booths.setMatrixAt(i, helper.matrix);
      helper.position.y = 2.55;
      helper.updateMatrix();
      awnings.setMatrixAt(i, helper.matrix);
      awnings.setColorAt(i, colour.setHex([
        0x166a4e, 0xf1e6d5, 0xb9363b][i % 3]));
    });
    booths.instanceMatrix.needsUpdate = true;
    awnings.instanceMatrix.needsUpdate = true;
    awnings.instanceColor.needsUpdate = true;
    plaza.add(booths, awnings);
    const umbrellas = new THREE.InstancedMesh(
      new THREE.ConeGeometry(2.25, .7, 6), canvasFabric, 15);
    umbrellas.name = `${name} fan-walk parasols`;
    for (let i = 0; i < 15; i++) {
      helper.position.set((i % 3 - 1) * 5.7,
        2.95, (Math.floor(i / 3) - 2) * 14.5);
      helper.rotation.set(0, i * .7, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      umbrellas.setMatrixAt(i, helper.matrix);
    }
    umbrellas.instanceMatrix.needsUpdate = true;
    plaza.add(umbrellas);
  }

  // An illuminated-looking score panel and tall Mexican tricolour poles make
  // the stadium section recognisable from the high camera without using giant
  // overhead slabs across the live racing line.
  for (const { stand, site, width, rows } of stadiumStands) {
    const toward = -site.side;
    const rearX = toward * 13.3 - toward * (rows - 1) * .93;
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(.72, 7.5, 12.8),
      shadow);
    screenFrame.name = `${stand.name} stadium video screen frame`;
    screenFrame.position.set(rearX - toward * 3.7, 21.3,
      width * .28);
    stand.add(screenFrame);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(.08, 6.7, 11.8),
      darkGlass);
    screen.name = `${stand.name} LED race screen`;
    screen.position.set(rearX - toward * 3.25, 21.3,
      width * .28);
    stand.add(screen);
    const supports = new THREE.InstancedMesh(beamGeometry, steel, 2);
    supports.name = `${stand.name} score screen steel masts`;
    for (let i = 0; i < 2; i++) {
      const z = width * .28 + (i ? 4.6 : -4.6);
      setBeam(supports, i,
        [rearX - toward * 4.1, .08, z],
        [rearX - toward * 4.1, 18.2, z], .6);
    }
    supports.instanceMatrix.needsUpdate = true;
    stand.add(supports);
  }
  if (fanSites.length) {
    const site = fanSites[0];
    const festival = groupOnSite('Mexico GP Estadio GNP fan entrance', site);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,
      .15, 19, 7), steel, 6);
    poles.name = 'Estadio GNP Mexican flags poles';
    const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 4.4),
      seatMaterial, 18);
    flags.name = 'Estadio GNP Mexican flags green white red bands';
    const colours = [0x087b50, 0xf4efe0, 0xd6343b];
    const tint = new THREE.Color();
    for (let i = 0; i < 6; i++) {
      const z = -32 + i * 12.4;
      helper.position.set(-27, 9.55, z);
      helper.rotation.set(0, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      poles.setMatrixAt(i, helper.matrix);
      for (let stripe = 0; stripe < 3; stripe++) {
        const index = i * 3 + stripe;
        helper.position.set(-26 + stripe * 1.6, 15.3, z);
        helper.rotation.set(0, Math.PI / 2, 0);
        helper.updateMatrix();
        flags.setMatrixAt(index, helper.matrix);
        flags.setColorAt(index, tint.setHex(colours[stripe]));
      }
    }
    poles.instanceMatrix.needsUpdate = true;
    flags.instanceMatrix.needsUpdate = true;
    flags.instanceColor.needsUpdate = true;
    festival.add(poles, flags);
  }

  // Mexico City is a dense, flat urban park, not a dry open paddock. Model
  // only the perimeter district as compact instanced masses: inner areas stay
  // green and legible, while the far background receives a believable city
  // edge. The noise is seeded for identical reloads and replay seeks.
  function clearDisk(x, z, radius, roadMargin = 10) {
    for (const { point } of frames) {
      if (Math.hypot(point.x - x, point.z - z) < radius + halfWidth
        + roadMargin) return false;
    }
    if (pitVertices) for (let i = 0; i < pitVertices.count; i++) {
      if (Math.hypot(pitVertices.getX(i) - x,
        pitVertices.getZ(i) - z) < radius + roadMargin) return false;
    }
    for (const item of reserved) {
      if (Math.hypot(item.x - x, item.z - z)
        < radius + Math.hypot(item.halfX, item.halfZ) + 9)
        return false;
    }
    return true;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { point } of frames) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }

  // The Palacio de los Deportes stands to the west of Estadio GNP. Its
  // copper geodesic roof gives the park a recognisable skyline without
  // adding fictional hills to this genuinely level circuit. Keep it beyond
  // the race and pit surfaces, and reserve the footprint before placing the
  // surrounding low-rise city blocks.
  const stadiumZ = [turnU(13), turnU(16)]
    .filter(Number.isFinite)
    .map(u => frameAt(u).point.z);
  const palaceX = minX - 240;
  const palaceZ = stadiumZ.length
    ? stadiumZ.reduce((sum, z) => sum + z, 0) / stadiumZ.length + 45
    : minZ + 190;
  if (clearDisk(palaceX, palaceZ, 66, 25)) {
    const palaceY = terrainHeightAt(palaceX, palaceZ, 0);
    reserved.push({ name: 'Palacio de los Deportes',
      x: palaceX, z: palaceZ, radius: 68 });
    const palace = new THREE.Group();
    palace.name = 'Palacio de los Deportes copper geodesic dome';
    palace.position.set(palaceX, palaceY, palaceZ);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(65, 67, 4,
      40), concrete);
    plinth.name = 'Palacio de los Deportes circular concrete plinth';
    plinth.position.y = 2;
    const glazing = new THREE.Mesh(new THREE.CylinderGeometry(61, 63, 7,
      40), darkGlass);
    glazing.name = 'Palacio de los Deportes glazed perimeter';
    glazing.position.y = 7.5;
    const copperGeometry = new THREE.SphereGeometry(60, 40, 14,
      0, Math.PI * 2, 0, Math.PI / 2);
    const copper = new THREE.Mesh(copperGeometry,
      new THREE.MeshStandardMaterial({ color: 0xb27643,
        metalness: .48, roughness: .58, flatShading: true,
        side: THREE.DoubleSide }));
    copper.name = 'Palacio de los Deportes faceted copper canopy';
    copper.position.y = 11;
    copper.scale.y = .52;
    const lattice = new THREE.LineSegments(
      new THREE.WireframeGeometry(copperGeometry),
      new THREE.LineBasicMaterial({ color: 0x664b36,
        transparent: true, opacity: .43 }));
    lattice.name = 'Palacio de los Deportes geodesic roof lattice';
    lattice.position.y = 11.08;
    lattice.scale.set(1.004, .522, 1.004);
    palace.add(plinth, glazing, copper, lattice);
    group.add(palace);
  }

  const buildingSites = [];
  const cityStep = 82;
  const cityX0 = Math.floor((minX - 250) / cityStep) * cityStep;
  const cityZ0 = Math.floor((minZ - 250) / cityStep) * cityStep;
  for (let x = cityX0;
    x < maxX + 290; x += cityStep) {
    for (let z = cityZ0;
      z < maxZ + 290; z += cityStep) {
      const cx = x + (random() - .5) * 13;
      const cz = z + (random() - .5) * 13;
      if (!clearDisk(cx, cz, 38, 50)) continue;
      if (random() < .17) continue; // neighborhood courtyards and sports fields
      const width = 23 + random() * 24;
      const depth = 18 + random() * 24;
      const height = 7 + random() * 20
        + (random() < .08 ? 18 + random() * 27 : 0);
      buildingSites.push({ x: cx, z: cz, width, depth, height,
        y: terrainHeightAt(cx, cz, 0),
        facade: Math.floor(random() * 4),
        tint: [0xc5b9aa, 0xc8c8bc, 0xc6aa91, 0xafb3ad,
          0xbab7aa, 0xd3c7b5][Math.floor(random() * 6)] });
    }
  }
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff,
    roughness: .94 });
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    buildingMaterial, buildingSites.length);
  buildings.name = 'Mexico City low and mid-rise urban perimeter';
  const roofTops = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x777b77, roughness: .94 }),
    buildingSites.length);
  roofTops.name = 'Mexico City flat rooftops and parapets';
  const buildingColor = new THREE.Color();
  buildingSites.forEach((site, i) => {
    helper.position.set(site.x, site.y + site.height / 2, site.z);
    helper.rotation.set(0, 0, 0);
    helper.scale.set(site.width, site.height, site.depth);
    helper.updateMatrix();
    buildings.setMatrixAt(i, helper.matrix);
    buildings.setColorAt(i, buildingColor.setHex(site.tint));
    helper.position.y = site.y + site.height + .3;
    helper.scale.set(site.width + .45, .6, site.depth + .45);
    helper.updateMatrix();
    roofTops.setMatrixAt(i, helper.matrix);
  });
  buildings.instanceMatrix.needsUpdate = true;
  buildings.instanceColor.needsUpdate = true;
  roofTops.instanceMatrix.needsUpdate = true;
  group.add(buildings, roofTops);

  // Individual panes read as real facades from a low chase camera. Varying
  // their widths, floors and reflectance avoids a row of featureless boxes.
  const paneSites = [];
  const roofEquipmentSites = [];
  const glassTints = [0x314d57, 0x455d61, 0x6c7773, 0x778985,
    0x536c74, 0x82918c];
  for (const site of buildingSites) {
    const floors = Math.max(2, Math.min(8, Math.floor(site.height / 3.8)));
    const levelHeight = site.height / (floors + .35);
    const glass = glassTints[Math.floor(random() * glassTints.length)];
    for (let floor = 0; floor < floors; floor++) {
      const y = site.y + (floor + .62) * levelHeight;
      for (const alongX of [true, false]) {
        const faceLength = alongX ? site.width : site.depth;
        const columns = Math.max(3, Math.floor(faceLength / (site.facade === 1 ? 3.7 : 5)));
        const pitch = faceLength / columns;
        for (let column = 0; column < columns; column++) {
          if (site.facade === 3 && column % 5 === 4) continue;
          const offset = (column + .5 - columns / 2) * pitch;
          const paneWidth = Math.min(pitch * (site.facade === 1 ? .68 : .53), 2.65);
          const paneHeight = Math.min(levelHeight * (site.facade === 2 ? .57 : .43), 1.95);
          for (const side of [-1, 1]) {
            paneSites.push({
              x: alongX ? site.x + offset : site.x + side * (site.width / 2 + .055),
              y,
              z: alongX ? site.z + side * (site.depth / 2 + .055) : site.z + offset,
              angle: alongX ? 0 : Math.PI / 2,
              width: paneWidth,
              height: paneHeight,
              tint: random() < .14 ? 0x9a9e96 : glass,
            });
          }
        }
      }
    }
    // Roof plants, tanks and stairhead boxes make the stepped skyline more
    // faithful to the low-rise district around the Magdalena Mixiuhca park.
    if (random() < .7) roofEquipmentSites.push({
      x: site.x + (random() - .5) * site.width * .43,
      y: site.y + site.height,
      z: site.z + (random() - .5) * site.depth * .4,
      width: 3 + random() * 6,
      height: 1.6 + random() * 3.7,
      depth: 3 + random() * 5,
      tint: random() < .45 ? 0x6b716d : 0x9c9e94,
    });
  }
  const windowPanes = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff,
      metalness: .17, roughness: .54, side: THREE.DoubleSide }),
    paneSites.length);
  windowPanes.name = 'Mexico City urban facade window grids';
  const paneTint = new THREE.Color();
  paneSites.forEach((pane, index) => {
    helper.position.set(pane.x, pane.y, pane.z);
    helper.rotation.set(0, pane.angle, 0);
    helper.scale.set(pane.width, pane.height, 1);
    helper.updateMatrix();
    windowPanes.setMatrixAt(index, helper.matrix);
    windowPanes.setColorAt(index, paneTint.setHex(pane.tint));
  });
  windowPanes.instanceMatrix.needsUpdate = true;
  windowPanes.instanceColor.needsUpdate = true;
  const roofEquipment = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .91 }),
    roofEquipmentSites.length);
  roofEquipment.name = 'Mexico City varied stairhead and roof plant silhouettes';
  roofEquipmentSites.forEach((item, index) => {
    helper.position.set(item.x, item.y + item.height / 2, item.z);
    helper.rotation.set(0, 0, 0);
    helper.scale.set(item.width, item.height, item.depth);
    helper.updateMatrix();
    roofEquipment.setMatrixAt(index, helper.matrix);
    roofEquipment.setColorAt(index, paneTint.setHex(item.tint));
  });
  roofEquipment.instanceMatrix.needsUpdate = true;
  roofEquipment.instanceColor.needsUpdate = true;
  group.add(windowPanes, roofEquipment);

  // A light street lattice makes the surrounding park feel connected to
  // Mexico City. It stays back in the urban district: asphalt ribbons ending
  // at a catch fence would look like accidental extensions of the circuit.
  // Every strip follows the local terrain and shares one geometry/draw call.
  const streetPositions = [], streetNormals = [], streetIndices = [];
  const streetWidth = 7.4;
  function addStreet(x1, z1, x2, z2) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const segments = Math.max(1, Math.ceil(length / 7));
    for (let sample = 0; sample <= segments; sample++) {
      const t = sample / segments;
      if (!clearDisk(x1 + (x2 - x1) * t,
        z1 + (z2 - z1) * t, streetWidth / 2, 56)) return;
    }
    const xDirection = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    for (let slice = 0; slice < segments; slice++) {
      const startT = slice / segments, endT = (slice + 1) / segments;
      const ax = x1 + (x2 - x1) * startT;
      const az = z1 + (z2 - z1) * startT;
      const bx = x1 + (x2 - x1) * endT;
      const bz = z1 + (z2 - z1) * endT;
      const a = xDirection ? [ax, az - streetWidth / 2]
        : [ax - streetWidth / 2, az];
      const b = xDirection ? [bx, bz - streetWidth / 2]
        : [bx - streetWidth / 2, bz];
      const c = xDirection ? [bx, bz + streetWidth / 2]
        : [bx + streetWidth / 2, bz];
      const d = xDirection ? [ax, az + streetWidth / 2]
        : [ax + streetWidth / 2, az];
      const start = streetPositions.length / 3;
      for (const [x, z] of [a, b, c, d]) {
        streetPositions.push(x, terrainHeightAt(x, z, .8) + .12, z);
        streetNormals.push(0, 1, 0);
      }
      streetIndices.push(start, start + 1, start + 2,
        start, start + 2, start + 3);
    }
  }
  for (let x = cityX0 + cityStep / 2; x < maxX + 250; x += cityStep) {
    for (let z = cityZ0 + cityStep / 2; z < maxZ + 250; z += cityStep)
      addStreet(x, z, x, z + cityStep);
  }
  for (let z = cityZ0 + cityStep / 2; z < maxZ + 250; z += cityStep) {
    for (let x = cityX0 + cityStep / 2; x < maxX + 250; x += cityStep)
      addStreet(x, z, x + cityStep, z);
  }
  if (streetIndices.length) {
    const streetsGeometry = new THREE.BufferGeometry();
    streetsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(streetPositions, 3));
    streetsGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(streetNormals, 3));
    streetsGeometry.setIndex(streetIndices);
    const streets = new THREE.Mesh(streetsGeometry,
      new THREE.MeshStandardMaterial({ color: 0x7b817a,
        roughness: .99, side: THREE.DoubleSide }));
    streets.name = 'Mexico City access street lattice beyond track and pit';
    group.add(streets);
  }

  // Park lawns near the route, with clustered shade trees rather than a
  // uniform forest. Trunks and low-poly crowns are each a single draw call.
  const treeSites = [];
  const groveCentres = [
    [turnU(1), -1, 135], [turnU(2), 1, 150],
    [turnU(3), 1, 110], [turnU(5), 1, 130],
    [turnU(7), -1, 105], [turnU(11), 1, 135],
    [turnU(12), -1, 150], [turnU(16), -1, 190],
  ];
  for (const [u, side, lateral] of groveCentres) {
    if (!Number.isFinite(u)) continue;
    const frame = frameAt(u);
    const centre = frame.point.clone().addScaledVector(frame.across,
      side * lateral);
    for (let i = 0; i < 66; i++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 95;
      const x = centre.x + Math.cos(angle) * radius;
      const z = centre.z + Math.sin(angle) * radius;
      if (!clearDisk(x, z, 5, 22)) continue;
      if (buildingSites.some(building => Math.abs(building.x - x)
        < building.width / 2 + 7 && Math.abs(building.z - z)
        < building.depth / 2 + 7)) continue;
      treeSites.push({ x, z, y: terrainHeightAt(x, z, 0),
        height: 5.2 + random() * 4.1,
        radius: 2.7 + random() * 2.5 });
    }
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.26,
    .36, 1, 6), new THREE.MeshStandardMaterial({ color: 0x695d47,
      roughness: .95 }), treeSites.length);
  trunks.name = 'Magdalena Mixiuhca park tree trunks';
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .99 }),
    treeSites.length);
  crowns.name = 'Magdalena Mixiuhca broad shade tree crowns';
  const leafColors = [0x496d45, 0x567c50, 0x648354, 0x647a49,
    0x476741];
  const leaf = new THREE.Color();
  treeSites.forEach((tree, i) => {
    helper.position.set(tree.x, tree.y + tree.height * .33, tree.z);
    helper.rotation.set(0, random() * Math.PI, 0);
    helper.scale.set(1, tree.height * .66, 1);
    helper.updateMatrix();
    trunks.setMatrixAt(i, helper.matrix);
    helper.position.y = tree.y + tree.height * .77;
    helper.scale.set(tree.radius, tree.height * .42, tree.radius);
    helper.updateMatrix();
    crowns.setMatrixAt(i, helper.matrix);
    crowns.setColorAt(i, leaf.setHex(leafColors[i % leafColors.length]));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  crowns.instanceColor.needsUpdate = true;
  group.add(trunks, crowns);

  return {
    group,
    grandstandCount: stands.length,
    landmarks: {
      stadium: stadiumStands.map(item => ({
        name: item.stand.name,
        x: item.site.position.x,
        z: item.site.position.z,
        lateral: item.site.lateral,
        along: item.site.along,
      })),
      fanPlazas: fanSites.length,
      cityBuildings: buildingSites.length,
      parkTrees: treeSites.length,
    },
  };
}

