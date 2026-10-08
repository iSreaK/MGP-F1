// Las Vegas venue geometry, placed from the FIA centreline without changing it.
// Placement stations are approximate: the FIA circuit drawing is not a building survey.
// Sources: 2025 LVGP event map and official F1 grandstand/venue descriptions.
export const VEGAS_GRANDSTANDS = Object.freeze([
  { name: 'East Harmon main grandstand', station: 80, side: 1, from: 45, length: 96, rows: 11, seats: 32, roof: true, palette: 'silver' },
  { name: 'Turn 3 grandstand', station: 592, side: 1, from: 39, length: 72, rows: 9, seats: 26, roof: false, palette: 'silver' },
  { name: 'T-Mobile Sphere turn 5 grandstand', station: 1590, side: -1, from: 38, length: 78, rows: 10, seats: 28, roof: false, palette: 'magenta' },
  { name: 'T-Mobile Sphere chicane grandstand', station: 2075, side: 1, from: 38, length: 75, rows: 10, seats: 27, roof: false, palette: 'magenta' },
  { name: 'T-Mobile Sphere turn 9 grandstand', station: 2250, side: 1, from: 38, length: 67, rows: 9, seats: 25, roof: false, palette: 'magenta' },
  { name: 'West Harmon grandstand', station: 5725, side: 1, from: 41, length: 88, rows: 10, seats: 30, roof: false, palette: 'green' },
]);

export const vegasTierOffset = (side, row, rows, depth) =>
  -side * (depth / 2 - 1.55 - row * ((depth - 3.1) / (rows - 1)));

export function addVegasVenueDetails(THREE, group, frames, frameAt, nearRoad, site, textTexture) {
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const basis = new THREE.Matrix4();
  const instances = [];
  const small = new THREE.MeshStandardMaterial({ color: 0x34414c, roughness: .82, metalness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: .72, metalness: .32 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8095a2, roughness: .56, metalness: .5 });
  const silverSeat = new THREE.MeshStandardMaterial({ color: 0xa1a9b3, roughness: .88 });
  const magentaSeat = new THREE.MeshStandardMaterial({ color: 0xb45b9c, roughness: .82 });
  const greenSeat = new THREE.MeshStandardMaterial({ color: 0x70a19a, roughness: .82 });
  const paving = new THREE.MeshStandardMaterial({ color: 0x51515a, roughness: .95, side: THREE.DoubleSide });
  const road = new THREE.MeshStandardMaterial({ color: 0x282f3d, roughness: .91, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0x969daf, side: THREE.DoubleSide });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfed7a0, toneMapped: false });
  let seed = 717442;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);

  function placeFootprint(station, side, start, depth, length, clearance = 21) {
    const frame = frameAt(station);
    for (let distance = start; distance <= start + 195; distance += 6) {
      const centre = frame.point.clone().addScaledVector(frame.across, side * distance);
      let clear = true;
      for (const x of [-depth / 2, 0, depth / 2]) {
        for (const z of [-length / 2, -length / 4, 0, length / 4, length / 2]) {
          const q = centre.clone().addScaledVector(frame.across, x)
            .addScaledVector(frame.forward, z);
          if (nearRoad(q.x, q.z) <= clearance) { clear = false; break; }
        }
        if (!clear) break;
      }
      if (!clear) continue;
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(
        basis.makeBasis(frame.across, up, frame.forward));
      return { point: centre, quaternion, distance, side, station };
    }
    return null;
  }

  function addInstanced(parent, name, geometry, material, transforms) {
    if (!transforms.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name;
    transforms.forEach((entry, index) => {
      helper.position.set(entry.x, entry.y, entry.z);
      helper.quaternion.copy(entry.quaternion || new THREE.Quaternion());
      helper.scale.set(entry.sx ?? 1, entry.sy ?? 1, entry.sz ?? 1);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
      if (entry.color) mesh.setColorAt(index, new THREE.Color(entry.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    instances.push(mesh);
    return mesh;
  }

  // Sidewalks and local access roads form a visible city block around the
  // municipal road. They stay below the racing surface and have no collision.
  function strip(name, start, end, side, inner, outer, material) {
    const positions = [], indices = [];
    for (let station = start; station < end; station += 8) {
      const next = Math.min(end, station + 8);
      const a = frameAt(station), b = frameAt(next);
      const qa = [
        a.point.clone().addScaledVector(a.across, side * inner),
        a.point.clone().addScaledVector(a.across, side * outer),
        b.point.clone().addScaledVector(b.across, side * inner),
        b.point.clone().addScaledVector(b.across, side * outer),
      ];
      // At a crossing with another part of the loop, leave the surface clear.
      if (qa.some(q => nearRoad(q.x, q.z) < 18)) continue;
      const offset = positions.length / 3;
      qa.forEach(q => positions.push(q.x, -.15, q.z));
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
    if (!indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
  }
  for (const zone of [
    ['Koval urban blocks', 820, 1500],
    ['Sands avenues', 2370, 3220],
    ['Las Vegas Boulevard', 4050, 5150],
    ['Harmon avenues', 5410, 5910],
  ]) for (const side of [-1, 1]) {
    strip(zone[0] + ' service road', zone[1], zone[2], side, 24, 38, road);
    strip(zone[0] + ' raised sidewalk', zone[1], zone[2], side, 38, 55, paving);
  }

  const allStandSites = [];
  const crowdPalette = {
    silver: [0xe8e4dd, 0xf1b046, 0xd74247, 0x6b91c7, 0xeeeef1],
    magenta: [0xf4b9dd, 0xfef5f6, 0xd62b9d, 0x39537b, 0xd0e8f6],
    green: [0xdbe8dd, 0xf0f3e9, 0x67a7a4, 0xd8b06a, 0x7293ba],
  };
  for (const spec of VEGAS_GRANDSTANDS) {
    const depth = spec.rows * 2.25 + 4;
    const anchor = placeFootprint(spec.station, spec.side, spec.from, depth, spec.length, 22);
    if (!anchor) continue;
    allStandSites.push({ ...spec, anchor, depth });
    const stand = new THREE.Group();
    stand.name = spec.name + ' facing the circuit';
    stand.position.copy(anchor.point);
    stand.quaternion.copy(anchor.quaternion);
    group.add(stand);
    const seatMaterial = spec.palette === 'magenta' ? magentaSeat
      : spec.palette === 'green' ? greenSeat : silverSeat;
    const rows = [], risers = [], seats = [], heads = [], torsos = [];
    const support = [], braces = [], rails = [];
    const seatLength = spec.length / spec.seats;
    for (let row = 0; row < spec.rows; row++) {
      const x = vegasTierOffset(spec.side, row, spec.rows, depth);
      const y = 3.6 + row * 1.13;
      rows.push({ x, y, z: 0, sx: 2.15, sy: .38, sz: spec.length });
      risers.push({ x: x + spec.side * .78, y: y - .43, z: 0,
        sx: .28, sy: .87, sz: spec.length });
      for (let col = 0; col < spec.seats; col++) {
        const z = -spec.length / 2 + (col + .5) * seatLength;
        const occupied = random() > .22;
        seats.push({ x, y: y + .27, z, sx: 1.55, sy: .16, sz: seatLength * .8,
          color: spec.palette === 'magenta' ? 0xb14396
            : spec.palette === 'green' ? 0x4d8d83 : 0x8d9ca7 });
        if (occupied) {
          const color = crowdPalette[spec.palette][Math.floor(random() * 5)];
          torsos.push({ x, y: y + .86, z, sx: .57, sy: .78, sz: .52, color });
          heads.push({ x, y: y + 1.42, z, sx: .37, sy: .38, sz: .37,
            color: random() < .52 ? 0xc9a780 : 0x9b795b });
        }
      }
    }
    for (const z of [-spec.length / 2 + 2, 0, spec.length / 2 - 2]) {
      for (const row of [1, Math.floor(spec.rows / 2), spec.rows - 1]) {
        const x = vegasTierOffset(spec.side, row, spec.rows, depth);
        const y = 3.6 + row * 1.13;
        support.push({ x, y: y / 2, z, sx: .5, sy: y, sz: .5 });
      }
      const front = vegasTierOffset(spec.side, 0, spec.rows, depth);
      const back = vegasTierOffset(spec.side, spec.rows - 1, spec.rows, depth);
      const origin = new THREE.Vector3(front, 1.4, z);
      const top = new THREE.Vector3(back, 3.6 + (spec.rows - 1) * 1.13, z);
      const delta = top.clone().sub(origin);
      braces.push({ x: (front + back) / 2, y: (origin.y + top.y) / 2, z,
        sy: delta.length(),
        quaternion: new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()) });
    }
    for (const edge of [-1, 1]) {
      rails.push({ x: -spec.side * (depth / 2 + .35), y: 4.3,
        z: edge * (spec.length / 2 - .3), sx: 1, sy: 1, sz: 1 });
    }
    addInstanced(stand, spec.name + ' supported raked deck',
      new THREE.BoxGeometry(1, 1, 1), dark, rows);
    addInstanced(stand, spec.name + ' concrete risers',
      new THREE.BoxGeometry(1, 1, 1), steel, risers);
    addInstanced(stand, spec.name + ' seats',
      new THREE.BoxGeometry(1, 1, 1), seatMaterial, seats);
    addInstanced(stand, spec.name + ' spectators',
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95 }), torsos);
    addInstanced(stand, spec.name + ' spectator heads',
      new THREE.SphereGeometry(1, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .96 }), heads);
    addInstanced(stand, spec.name + ' vertical steel supports',
      new THREE.BoxGeometry(1, 1, 1), small, support);
    addInstanced(stand, spec.name + ' diagonal underdeck trusses',
      new THREE.BoxGeometry(.52, 1, .52), steel, braces);
    const front = vegasTierOffset(spec.side, 0, spec.rows, depth);
    const back = vegasTierOffset(spec.side, spec.rows - 1, spec.rows, depth);
    addInstanced(stand, spec.name + ' safety rails',
      new THREE.BoxGeometry(.12, 1.25, spec.length), steel, [
        { x: front - spec.side * .8, y: 4.7, z: 0 },
        { x: back + spec.side * .95,
          y: 4.9 + (spec.rows - 1) * 1.13, z: 0 },
      ]);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(depth + 4, .6, spec.length + 7), paving);
    pad.name = spec.name + ' plaza base';
    pad.position.y = -.38;
    stand.add(pad);
    if (textTexture) {
      const label = spec.palette === 'magenta' ? 'T-MOBILE ZONE'
        : spec.palette === 'green' ? 'WEST HARMON'
          : spec.name.includes('main') ? 'LAS VEGAS GRAND PRIX' : 'TURN 3';
      const accent = spec.palette === 'magenta' ? '#f49bdf'
        : spec.palette === 'green' ? '#b2e9d7' : '#f0dfbc';
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(64, spec.length * .74), 3.0),
        new THREE.MeshBasicMaterial({ map: textTexture(label, accent),
          side: THREE.DoubleSide, toneMapped: false }));
      sign.name = spec.name + ' road-facing illuminated fascia';
      sign.position.set(front - spec.side * .44, 2.2, 0);
      sign.rotation.y = -spec.side * Math.PI / 2;
      stand.add(sign);
    }
    if (spec.roof) {
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(depth + 5, .75, spec.length + 7),
        dark);
      canopy.name = spec.name + ' canopy';
      canopy.position.set(0, 18.6, 0);
      stand.add(canopy);
      addInstanced(stand, spec.name + ' roof stanchions',
        new THREE.BoxGeometry(.45, 1, .45), steel,
        [-spec.length / 2 + 5, 0, spec.length / 2 - 5].map(z => ({
          x: back + spec.side * 1.0, y: 13.2, z, sy: 10.8,
        })));
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(depth + 5.2, .35, spec.length + 7.2),
        lamp);
      fascia.position.y = 18.2;
      stand.add(fascia);
    }
  }

  if (textTexture) for (const [label, station, side, accent] of [
    ['GRAND PRIX PLAZA', 315, 1, '#f8d8a0'],
    ['T-MOBILE ZONE', 1820, 1, '#eea8e9'],
    ['LAS VEGAS STRIP', 4090, -1, '#bbe4ff'],
  ]) {
    const anchor = placeFootprint(station, side, 53, 4, 38, 25);
    if (!anchor) continue;
    const marker = new THREE.Group();
    marker.name = label + ' roadside LED pylon';
    marker.position.copy(anchor.point);
    marker.quaternion.copy(anchor.quaternion);
    group.add(marker);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(1.5, 14.4, 1.5), dark);
    stem.position.y = 7.2;
    marker.add(stem);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(33, 9.0),
      new THREE.MeshBasicMaterial({ map: textTexture(label, accent),
        side: THREE.DoubleSide, toneMapped: false }));
    sign.name = label + ' illuminated city marker';
    sign.position.set(-side * .95, 18.5, 0);
    sign.rotation.y = -side * Math.PI / 2;
    marker.add(sign);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.1, .4, 36), lamp);
    crown.position.set(0, 23.3, 0);
    marker.add(crown);
  }
  // Palm-lined resort promenades add the characteristic pedestrian scale.
  // Trees are batched into two draw calls and are outside the catch fencing.
  const outsideStand = point => allStandSites.every(stand => {
    const local = point.clone().sub(stand.anchor.point)
      .applyQuaternion(stand.anchor.quaternion.clone().invert());
    return Math.abs(local.x) > stand.depth / 2 + 5
      || Math.abs(local.z) > stand.length / 2 + 7;
  });
  const palms = [];
  for (const [start, end, step, sides] of [
    [4050, 5140, 34, [-1, 1]],
    [1580, 2270, 51, [1]],
    [5450, 5860, 44, [1]],
    [100, 430, 45, [1]],
  ]) for (let station = start; station < end; station += step) {
    for (const side of sides) {
      const anchor = site(station, side, 55, 4.5);
      if (!anchor) continue;
      palms.push({ point: anchor.point, height: 8.5 + random() * 3.4,
        lean: (random() - .5) * .8 });
    }
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.18, .34, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x806b56, roughness: .97 }), palms.length);
  trunks.name = 'Instanced resort palm trunks';
  const frondPositions = [], frondIndices = [];
  for (let leaf = 0; leaf < 8; leaf++) {
    const angle = leaf * Math.PI / 4;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const px = -dz, pz = dx, base = frondPositions.length / 3;
    const coords = [
      [0, 0, 0], [dx * 2.1 + px * .52, .26, dz * 2.1 + pz * .52],
      [dx * 4.5, -1.15, dz * 4.5],
      [dx * 2.1 - px * .52, .26, dz * 2.1 - pz * .52],
    ];
    coords.forEach(p => frondPositions.push(...p));
    frondIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const frondGeometry = new THREE.BufferGeometry();
  frondGeometry.setAttribute('position',
    new THREE.Float32BufferAttribute(frondPositions, 3));
  frondGeometry.setIndex(frondIndices);
  frondGeometry.computeVertexNormals();
  const crowns = new THREE.InstancedMesh(frondGeometry,
    new THREE.MeshStandardMaterial({ color: 0x335744, side: THREE.DoubleSide,
      roughness: .9, emissive: 0x07190d, emissiveIntensity: .28 }), palms.length);
  crowns.name = 'Instanced palm fronds';
  palms.forEach(({ point, height, lean }, i) => {
    helper.position.set(point.x + lean / 2, height / 2, point.z);
    helper.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean / height);
    helper.scale.set(1, height, 1);
    helper.updateMatrix();
    trunks.setMatrixAt(i, helper.matrix);
    helper.position.set(point.x + lean, height, point.z);
    helper.quaternion.identity();
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    crowns.setMatrixAt(i, helper.matrix);
    crowns.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0x527154
      : i % 3 === 1 ? 0x3c654e : 0x67815c));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  trunks.frustumCulled = crowns.frustumCulled = false;
  group.add(trunks, crowns);
  instances.push(trunks, crowns);

  // A low, lit retail edge fills the empty gap between fencing and hotels.
  // The different roof heights and facade lights remain three instanced calls.
  const stores = [];
  for (let station = 4100; station < 5100; station += 73) {
    for (const side of [-1, 1]) {
      if (station > 4520 && station < 4710 && side === -1) continue;
      const depth = 18 + random() * 8, length = 28 + random() * 17;
      const anchor = placeFootprint(station, side, 70, depth, length, 23);
      if (!anchor) continue;
      stores.push({ anchor, depth, length, height: 7.5 + random() * 7.8,
        tint: random() });
    }
  }
  const makeStoreInstance = (name, material, geometry, layout) => {
    const mesh = new THREE.InstancedMesh(geometry, material, stores.length);
    mesh.name = name;
    stores.forEach((store, i) => {
      const { anchor, depth, length, height } = store;
      const local = layout(store);
      helper.position.copy(local.position.applyQuaternion(anchor.quaternion)
        .add(anchor.point));
      helper.quaternion.copy(anchor.quaternion);
      helper.scale.set(...local.scale);
      helper.updateMatrix();
      mesh.setMatrixAt(i, helper.matrix);
      if (local.color) mesh.setColorAt(i, new THREE.Color(local.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    instances.push(mesh);
  };
  makeStoreInstance('Strip ground-floor shops', small,
    new THREE.BoxGeometry(1, 1, 1), store => ({
      position: new THREE.Vector3(0, store.height / 2, 0),
      scale: [store.depth, store.height, store.length],
      color: store.tint < .5 ? 0x68606f : 0x665f5e,
    }));
  makeStoreInstance('Strip illuminated shopfronts', lamp,
    new THREE.BoxGeometry(1, 1, 1), store => ({
      position: new THREE.Vector3(-store.anchor.side * (store.depth / 2 + .08),
        store.height * .39, 0),
      scale: [.14, store.height * .57, store.length * .88],
      color: store.tint < .35 ? 0xf8dfac : store.tint < .7 ? 0xaadcf7 : 0xf4b6d6,
    }));
  makeStoreInstance('Strip shop awnings and signs', lamp,
    new THREE.BoxGeometry(1, 1, 1), store => ({
      position: new THREE.Vector3(-store.anchor.side * (store.depth / 2 + 1.2),
        store.height * .78, 0),
      scale: [2.6, .5, store.length * .92],
      color: store.tint < .35 ? 0xb97bdf : store.tint < .7 ? 0x72cceb : 0xf5a86a,
    }));

  // Large race-week LED screens break the flat retail frontage on the Strip.
  // They reuse one texture and one draw call; each panel stays on an existing
  // shop facade, safely behind the barriers and pedestrian pavement.
  const screenStores = stores.filter((_, index) => index % 4 === 1);
  if (screenStores.length) {
    const screenMaterial = new THREE.MeshBasicMaterial({
      ...(typeof textTexture === 'function'
        ? { map: textTexture('LAS VEGAS GRAND PRIX', '#ee72c5') }
        : { color: 0xee72c5 }),
      side: THREE.DoubleSide, toneMapped: false,
    });
    const screens = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(21, 4.8), screenMaterial, screenStores.length);
    screens.name = 'Strip race-week LED facade screens';
    const turnToRoad = new THREE.Quaternion();
    screenStores.forEach(({ anchor, depth, height }, index) => {
      const local = new THREE.Vector3(
        -anchor.side * (depth / 2 + .22), Math.min(height - 2.8, 6.2), 0);
      helper.position.copy(local.applyQuaternion(anchor.quaternion).add(anchor.point));
      turnToRoad.setFromAxisAngle(up, -anchor.side * Math.PI / 2);
      helper.quaternion.copy(anchor.quaternion).multiply(turnToRoad);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      screens.setMatrixAt(index, helper.matrix);
    });
    screens.instanceMatrix.needsUpdate = true;
    screens.frustumCulled = false;
    group.add(screens);
    instances.push(screens);
  }

  // The 167 m High Roller stands east of the Boulevard behind the LINQ.
  // The wheel and 28 cabins are recognisable from the Strip, yet stay clear
  // of all branches of the course through the same footprint placement test.
  const wheelSite = placeFootprint(4580, -1, 270, 35, 174, 31);
  if (wheelSite) {
    const wheel = new THREE.Group();
    wheel.name = 'High Roller at the LINQ Promenade';
    wheel.position.copy(wheelSite.point);
    wheel.quaternion.copy(wheelSite.quaternion);
    group.add(wheel);
    const ice = new THREE.MeshBasicMaterial({ color: 0xb9ddf1, toneMapped: false });
    const rimGeometry = new THREE.TorusGeometry(76, 1.15, 6, 96);
    for (const x of [-2.0, 2.0]) {
      const ring = new THREE.Mesh(rimGeometry, ice);
      ring.name = 'High Roller LED rim';
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x, 83, 0);
      wheel.add(ring);
    }
    const spokes = [];
    for (let i = 0; i < 28; i++) {
      const angle = i * 2 * Math.PI / 28;
      for (const x of [-1.8, 1.8]) {
        spokes.push(x, 83, 0, x, 83 + 76 * Math.sin(angle),
          76 * Math.cos(angle));
      }
    }
    const spokesGeom = new THREE.BufferGeometry();
    spokesGeom.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
    const spokesMesh = new THREE.LineSegments(spokesGeom,
      new THREE.LineBasicMaterial({ color: 0x81adcc, toneMapped: false }));
    spokesMesh.name = 'High Roller spokes';
    wheel.add(spokesMesh);
    const cabinTransforms = [];
    for (let i = 0; i < 28; i++) {
      const angle = i * 2 * Math.PI / 28;
      cabinTransforms.push({
        x: 0, y: 83 + 76 * Math.sin(angle), z: 76 * Math.cos(angle),
      });
    }
    addInstanced(wheel, 'Twenty-eight High Roller cabins',
      new THREE.BoxGeometry(5.2, 3.1, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x99cce3, emissive: 0x477b98,
        emissiveIntensity: .55, roughness: .31, metalness: .32 }), cabinTransforms);
    addInstanced(wheel, 'High Roller paired steel legs',
      new THREE.CylinderGeometry(1.15, 1.9, 1, 8), steel,
      [-1, 1].map(side => {
        const foot = new THREE.Vector3(side * 15, 1, 0);
        const hub = new THREE.Vector3(0, 83, 0);
        const delta = hub.clone().sub(foot);
        return { x: (foot.x + hub.x) / 2, y: 42, z: 0, sy: delta.length(),
          quaternion: new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()) };
      }));
  }

  return { group, grandstands: allStandSites, palmCount: palms.length,
    storeCount: stores.length, highRoller: Boolean(wheelSite),
    addedInstancedMeshes: instances.length };
}
