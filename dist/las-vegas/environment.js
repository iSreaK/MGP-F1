import { TRACK_LENGTH_METERS } from './track-data.js';

// Recognisable Las Vegas landmarks are architectural abstractions at safe
// stand-offs from the FIA road. The FIA map supplies the circuit, not a 3D
// building survey; footprints and heights here are intentionally illustrative.
export function addVegasEnvironment(THREE, scene, curve, frames) {
  const group = new THREE.Group();
  group.name = 'Las Vegas Strip and Grand Prix Plaza nightscape';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  let seed = 19052025;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const frameAt = station => frames[Math.floor((((station % TRACK_LENGTH_METERS) +
    TRACK_LENGTH_METERS) % TRACK_LENGTH_METERS) / TRACK_LENGTH_METERS * frames.length) % frames.length];
  const nearRoad = (x, z) => {
    let minimum = Infinity;
    for (const frame of frames) {
      const d2 = (x - frame.point.x) ** 2 + (z - frame.point.z) ** 2;
      if (d2 < minimum) minimum = d2;
    }
    return Math.sqrt(minimum);
  };
  function site(station, side, setback, radius) {
    const frame = frameAt(station);
    for (let distance = setback; distance <= setback + 240; distance += 18) {
      const point = frame.point.clone().addScaledVector(frame.across, side * distance);
      if (nearRoad(point.x, point.z) > radius + 27) {
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(frame.across, up, frame.forward));
        return { point, frame, quaternion, distance };
      }
    }
    return null;
  }
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x556070,
    roughness: .7, metalness: .16, emissive: 0x152133, emissiveIntensity: .28 });
  const darkRoof = new THREE.MeshStandardMaterial({ color: 0x243140,
    roughness: .69, metalness: .2 });
  const goldGlass = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const coolGlass = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const warmSign = new THREE.MeshBasicMaterial({ color: 0xffd49a,
    side: THREE.DoubleSide, toneMapped: false });
  const pearl = new THREE.MeshStandardMaterial({ color: 0xd3c9bb,
    roughness: .66, metalness: .04 });

  function textTexture(label, accent, width = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    const backing = context.createLinearGradient(0, 0, width, 192);
    backing.addColorStop(0, '#111b31');
    backing.addColorStop(.5, '#080d1c');
    backing.addColorStop(1, '#22152b');
    context.fillStyle = backing;
    context.fillRect(0, 0, width, 192);
    context.strokeStyle = accent;
    context.lineWidth = 9;
    context.strokeRect(5, 5, width - 10, 182);
    context.fillStyle = accent;
    context.font = `italic 900 ${label.length > 15 ? 86 : 113}px Arial, sans-serif`;
    context.shadowColor = accent;
    context.shadowBlur = 23;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, width / 2, 96, width - 90);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function hotel({ name, station, side, distance, depth, length, height,
    color, glass = 'gold', accent = '#ffda9f' }) {
    const radius = Math.hypot(depth, length) / 2;
    const anchor = site(station, side, distance, radius);
    if (!anchor) return null;
    const building = new THREE.Group();
    building.name = `${name} hotel massing and illuminated facade`;
    building.position.copy(anchor.point);
    building.quaternion.copy(anchor.quaternion);
    group.add(building);
    const surface = new THREE.MeshStandardMaterial({ color,
      roughness: .72, metalness: .1, emissive: color, emissiveIntensity: .12 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(depth, height, length), surface);
    body.position.y = height / 2;
    building.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 3, 1.7, length + 3),
      darkRoof);
    roof.position.y = height + .85;
    building.add(roof);
    const roadFace = -side * (depth / 2 + .13);
    const floors = Math.max(4, Math.floor((height - 8) / 4.6));
    const columns = Math.max(4, Math.floor((length - 6) / 7));
    const windowGeometry = new THREE.BoxGeometry(.12, 1.75, 3.5);
    const windows = new THREE.InstancedMesh(windowGeometry,
      glass === 'gold' ? goldGlass : coolGlass, floors * columns * 2);
    let windowIndex = 0;
    for (const face of [-1, 1]) for (let row = 0; row < floors; row++) {
      for (let col = 0; col < columns; col++, windowIndex++) {
        helper.position.set(face * (depth / 2 + .13), 6 + row * 4.6,
          -length / 2 + 4 + col * (length - 8) / columns);
        helper.quaternion.identity();
        helper.scale.set(1, .78 + random() * .22, .8 + random() * .2);
        helper.updateMatrix();
        windows.setMatrixAt(windowIndex, helper.matrix);
        const lit = random();
        windows.setColorAt(windowIndex, new THREE.Color(lit < .1 ? 0x202a3a
          : glass === 'gold' ? lit < .63 ? 0xffd397 : 0xfff1c6
            : lit < .7 ? 0xbce5ff : 0xf2e9d8));
      }
    }
    windows.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    windows.name = `${name} instanced lit windows`;
    building.add(windows);
    const signMaterial = new THREE.MeshBasicMaterial({ map: textTexture(name.toUpperCase(), accent),
      side: THREE.DoubleSide, toneMapped: false });
    const signGeometry = new THREE.PlaneGeometry(Math.min(length * .78, 92), 9.5);
    for (const face of [-1, 1]) {
      const sign = new THREE.Mesh(signGeometry, signMaterial);
      sign.position.set(face * (depth / 2 + .39), Math.min(height - 11, 25), 0);
      sign.rotation.y = Math.PI / 2;
      building.add(sign);
    }
    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(.36, .42, 1),
      new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), 4);
    for (let face = 0; face < 2; face++) for (let row = 0; row < 2; row++) {
      helper.position.set((face ? 1 : -1) * (depth / 2 + .24),
        row ? height - 2 : 4.2, 0);
      helper.quaternion.identity();
      helper.scale.set(1, 1, length + 2);
      helper.updateMatrix();
      trim.setMatrixAt(face * 2 + row, helper.matrix);
    }
    trim.instanceMatrix.needsUpdate = true;
    trim.name = `${name} facade light bands`;
    building.add(trim);
    return { group: building, anchor, body, side, depth, length, height,
      roadX: -side * (depth / 2 + .13) };
  }

  // North-to-south order on the ~2 km Strip section: Venetian, Caesars,
  // Bellagio and Paris. Large setbacks keep all architecture off the course.
  const wynn = hotel({ name: 'WYNN', station: 4130, side: -1, distance: 108,
    depth: 53, length: 83, height: 104, color: 0x6a4b42, accent: '#f9d29a' });
  const venetian = hotel({ name: 'VENETIAN', station: 4340, side: -1,
    distance: 126, depth: 54, length: 118, height: 97,
    color: 0xbaafa5, accent: '#ffe3ac' });
  const caesars = hotel({ name: 'CAESARS PALACE', station: 4550, side: 1,
    distance: 123, depth: 59, length: 126, height: 85,
    color: 0xa99789, accent: '#fff4d4' });
  const bellagio = hotel({ name: 'BELLAGIO', station: 4800, side: 1,
    distance: 160, depth: 72, length: 168, height: 93,
    color: 0xc9b9a7, accent: '#ffe8b7' });
  const paris = hotel({ name: 'PARIS', station: 4980, side: -1,
    distance: 116, depth: 44, length: 76, height: 73,
    color: 0x8b9ab2, glass: 'cool', accent: '#b9d9ff' });

  // A race camera sees these illuminated hotel pylons close to the Strip.
  // Their surveyed building footprints are unknown; the site check leaves
  // more than 27 m of clear space beyond each sign's edge.
  const pylons = [
    ['WYNN', 4130, -1, '#f7c98e'],
    ['VENETIAN', 4340, -1, '#eddbc0'],
    ['CAESARS PALACE', 4550, 1, '#f4e4b8'],
    ['BELLAGIO', 4800, 1, '#f7d7a2'],
    ['PARIS', 4980, -1, '#afd6ff'],
  ];
  for (const [label, station, side, accent] of pylons) {
    const anchor = site(station, side, 48, 16);
    if (!anchor) continue;
    const pylon = new THREE.Group();
    pylon.name = `${label} Strip roadside sign`;
    pylon.position.copy(anchor.point);
    pylon.quaternion.copy(anchor.quaternion);
    group.add(pylon);
    const column = new THREE.Mesh(new THREE.BoxGeometry(1.15, 13, 1.15), darkRoof);
    column.position.y = 6.5;
    pylon.add(column);
    const luminous = new THREE.Mesh(new THREE.PlaneGeometry(31, 10.5),
      new THREE.MeshBasicMaterial({ map: textTexture(label, accent),
        side: THREE.DoubleSide, toneMapped: false }));
    luminous.position.set(0, 17.1, -1.05);
    luminous.rotation.y = Math.PI;
    pylon.add(luminous);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(32, .4, 1.2),
      new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
    edge.position.y = 22.6;
    pylon.add(edge);
  }

  // Distinct structural silhouettes, kept on the surveyed map's exterior.
  // Repeated columns and light strips use instances instead of individual
  // meshes; the geometry is deliberately lighter than the 19 GLB cars.
  function colonnade(hotelSite, count, stoneColor) {
    if (!hotelSite) return;
    const { group: building, roadX, side, length } = hotelSite;
    const facade = new THREE.Group();
    facade.position.set(roadX - side * 5.4, 0, 0);
    building.add(facade);
    const stone = new THREE.MeshStandardMaterial({ color: stoneColor,
      roughness: .76, emissive: stoneColor, emissiveIntensity: .1 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, length + 4), stone);
    podium.position.y = 1;
    facade.add(podium);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(10, 1.45, length + 6), stone);
    cornice.position.y = 17.1;
    facade.add(cornice);
    const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(.86, 1.1, 14.6, 8),
      stone, count);
    const capitals = new THREE.InstancedMesh(new THREE.BoxGeometry(2.7, .8, 2.7),
      stone, count);
    for (let i = 0; i < count; i++) {
      const z = -length / 2 + 5 + i * (length - 10) / (count - 1);
      helper.position.set(-side * 1.3, 9.2, z);
      helper.quaternion.identity();
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      columns.setMatrixAt(i, helper.matrix);
      helper.position.y = 16.9;
      helper.updateMatrix();
      capitals.setMatrixAt(i, helper.matrix);
    }
    columns.instanceMatrix.needsUpdate = true;
    capitals.instanceMatrix.needsUpdate = true;
    facade.add(columns, capitals);
  }

  if (wynn) {
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(.72, 1, 2.9),
      new THREE.MeshBasicMaterial({ color: 0xffc277, toneMapped: false }), 18);
    for (let i = 0; i < 18; i++) {
      const z = -wynn.length / 2 + 4 + i * (wynn.length - 8) / 17;
      helper.position.set(wynn.roadX - wynn.side * (1.0 + 2.8 * Math.sin(i / 17 * Math.PI)),
        wynn.height * .51, z);
      helper.quaternion.identity();
      helper.scale.set(1, wynn.height * .82, 1);
      helper.updateMatrix();
      fins.setMatrixAt(i, helper.matrix);
    }
    fins.instanceMatrix.needsUpdate = true;
    fins.name = 'Wynn curved bronze frontage fins';
    wynn.group.add(fins);
  }

  colonnade(venetian, 16, 0xd5c5ac);
  colonnade(caesars, 18, 0xe7dccd);
  if (caesars) {
    const roofDome = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 10,
      0, Math.PI * 2, 0, Math.PI / 2), pearl);
    roofDome.position.set(0, caesars.height + 1.5, 0);
    caesars.group.add(roofDome);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(15.3, 16.4, 3, 24), pearl);
    crown.position.set(0, caesars.height + 1.2, 0);
    caesars.group.add(crown);
  }

  if (bellagio) {
    const podium = new THREE.Mesh(new THREE.BoxGeometry(14, 16, bellagio.length * .84),
      pearl);
    podium.position.set(bellagio.roadX - bellagio.side * 7.7, 8.2, 0);
    bellagio.group.add(podium);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(12, 22, 8,
      0, Math.PI * 2, 0, Math.PI / 2), pearl);
    crown.position.set(0, bellagio.height + 1.3, 0);
    bellagio.group.add(crown);
    for (const z of [-bellagio.length * .32, bellagio.length * .32]) {
      const pavilion = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.5, 12, 12),
        pearl);
      pavilion.position.set(bellagio.roadX - bellagio.side * 6, 19, z);
      bellagio.group.add(pavilion);
    }
  }

  if (paris) {
    const tower = new THREE.Group();
    tower.name = 'Paris Las Vegas illuminated Eiffel Tower silhouette';
    tower.position.set(paris.roadX - paris.side * 25, 0, paris.length * .2);
    paris.group.add(tower);
    const gold = new THREE.MeshBasicMaterial({ color: 0xf5c16f, toneMapped: false });
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.62, 1.0, 1, 7),
      gold, 4);
    let legIndex = 0;
    for (const x of [-14, 14]) for (const z of [-14, 14]) {
      const foot = new THREE.Vector3(x, 1, z);
      const crown = new THREE.Vector3(x * .12, 72, z * .12);
      const delta = crown.clone().sub(foot);
      helper.position.copy(foot).add(crown).multiplyScalar(.5);
      helper.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      helper.scale.set(1, delta.length(), 1);
      helper.updateMatrix();
      legs.setMatrixAt(legIndex++, helper.matrix);
    }
    legs.instanceMatrix.needsUpdate = true;
    tower.add(legs);
    for (const [y, width] of [[25, 23], [48, 14], [69, 6]]) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 1.8, width), gold);
      deck.position.y = y;
      tower.add(deck);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(.28, .75, 24, 8), gold);
    spire.position.y = 81;
    tower.add(spire);
    const braces = [];
    for (const y of [12, 33, 55]) {
      const spread = 15 - y * .17;
      for (const sign of [-1, 1]) {
        braces.push(-spread, y, sign * spread, spread, y + 12, sign * (spread - 2));
        braces.push(spread, y, sign * spread, -spread, y + 12, sign * (spread - 2));
      }
    }
    const frame = new THREE.BufferGeometry();
    frame.setAttribute('position', new THREE.Float32BufferAttribute(braces, 3));
    tower.add(new THREE.LineSegments(frame,
      new THREE.LineBasicMaterial({ color: 0xffd694, toneMapped: false })));
  }

  if (venetian) {
    const tower = new THREE.Group();
    tower.name = 'Venetian-style campanile silhouette';
    tower.position.set(venetian.roadX - venetian.side * 8, 97, -32);
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 61, 12), pearl);
    base.position.y = 30.5;
    tower.add(base);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(9, 21, 4), darkRoof);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 72;
    tower.add(cap);
    venetian.group.add(tower);
  }

  if (bellagio) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(53, 115),
      new THREE.MeshBasicMaterial({ color: 0x255e8e,
        side: THREE.DoubleSide, transparent: true, opacity: .86 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(-80, .12, 0);
    water.name = 'Bellagio fountain lagoon';
    bellagio.group.add(water);
    const fountains = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .5, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0xcbeaff }), 17);
    for (let i = 0; i < 17; i++) {
      helper.position.set(-80, 2.7 + .45 * Math.sin(i * 2.3), -49 + i * 6.1);
      helper.quaternion.identity();
      helper.scale.set(1, 1 + .3 * Math.sin(i * 2.3), 1);
      helper.updateMatrix();
      fountains.setMatrixAt(i, helper.matrix);
    }
    fountains.instanceMatrix.needsUpdate = true;
    bellagio.group.add(fountains);
  }

  // The Sphere is the unmistakable east-side landmark near Koval/Sands.
  const sphereSite = site(1930, 1, 182, 64);
  if (sphereSite) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#19156b');
    gradient.addColorStop(.3, '#2148c2');
    gradient.addColorStop(.68, '#2377c9');
    gradient.addColorStop(1, '#60359d');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    for (let band = 0; band < 11; band++) {
      context.fillStyle = band % 2 ? 'rgba(111,225,255,.32)' : 'rgba(247,116,217,.27)';
      for (let column = 0; column < 64; column++) {
        const x = column * 8;
        const y = band * 23 + 5 * Math.sin(column * .17 + band * .7);
        context.fillRect(x, y, 9, 2.2);
      }
    }
    for (let row = 0; row < 28; row++) for (let col = 0; col < 56; col++) {
      const x = col * 9.2 + (row % 2) * 4.6;
      const y = row * 9.2;
      context.fillStyle = row % 4 === 0 ? 'rgba(255,242,211,.78)'
        : 'rgba(123,219,255,.42)';
      context.beginPath();
      context.arc(x, y, 1.35, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(56, 44, 30),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    dome.name = 'T-Mobile Zone at Sphere LED dome';
    dome.position.copy(sphereSite.point);
    dome.position.y += 56;
    group.add(dome);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(59, 59, 5, 48),
      darkRoof);
    rim.position.copy(sphereSite.point);
    rim.position.y += 2.2;
    group.add(rim);
  }

  // Secondary casinos and city blocks, batched into two instanced draw calls.
  const masses = [], windows = [];
  for (let station = 130; station < TRACK_LENGTH_METERS; station += 112) {
    for (const side of [-1, 1]) {
      if (side === 1 && station > 1620 && station < 2260) continue;
      if (station > 4100 && station < 5170 && random() < .75) continue;
      if (station > 5820 || station < 380) continue; // Grand Prix Plaza
      const depth = 24 + random() * 34;
      const length = 24 + random() * 51;
      const height = 19 + random() * 68;
      const anchor = site(station, side, 88 + random() * 70,
        Math.hypot(depth, length) / 2);
      if (!anchor) continue;
      masses.push({ anchor, depth, length, height, tint: random() });
      for (let floor = 0; floor < Math.min(10, height / 5); floor++) {
        for (let column = 0; column < Math.min(8, length / 8); column++) {
          if (random() < .27) continue;
          for (const face of [-1, 1])
            windows.push({ anchor, depth, length, height, floor, column, face });
        }
      }
    }
  }
  const skyline = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    bodyMat, masses.length);
  const matrix = new THREE.Matrix4();
  masses.forEach(({ anchor, depth, length, height, tint }, index) => {
    helper.position.copy(anchor.point).add(new THREE.Vector3(0, height / 2, 0));
    helper.quaternion.copy(anchor.quaternion);
    helper.scale.set(depth, height, length);
    helper.updateMatrix();
    skyline.setMatrixAt(index, helper.matrix);
    skyline.setColorAt(index, new THREE.Color().setHSL(.58 + tint * .09, .16, .36 + tint * .11));
  });
  skyline.instanceMatrix.needsUpdate = true;
  if (skyline.instanceColor) skyline.instanceColor.needsUpdate = true;
  skyline.name = 'Instanced Las Vegas background hotel blocks';
  group.add(skyline);
  const roofLights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .45, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), masses.length * 2);
  masses.forEach(({ anchor, depth, length, height, tint }, index) => {
    for (const face of [-1, 1]) {
      helper.position.copy(new THREE.Vector3(face * (depth / 2 + .18),
        height - 1.1, 0).applyQuaternion(anchor.quaternion).add(anchor.point));
      helper.quaternion.copy(anchor.quaternion);
      helper.scale.set(1, 1, length + 1);
      helper.updateMatrix();
      roofLights.setMatrixAt(index * 2 + (face + 1) / 2, helper.matrix);
      roofLights.setColorAt(index * 2 + (face + 1) / 2,
        new THREE.Color(tint > .68 ? 0xf295db : tint > .34 ? 0x72cbff : 0xffc98d));
    }
  });
  roofLights.instanceMatrix.needsUpdate = true;
  if (roofLights.instanceColor) roofLights.instanceColor.needsUpdate = true;
  roofLights.name = 'Instanced Strip roofline neon';
  group.add(roofLights);
  const litWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, 1.7, 2.3),
    coolGlass, windows.length);
  windows.forEach(({ anchor, depth, length, floor, column, face }, index) => {
    const local = new THREE.Vector3(face * (depth / 2 + .09),
      4.5 + floor * 5, -length / 2 + 4 + column * 7);
    helper.position.copy(local.applyQuaternion(anchor.quaternion).add(anchor.point));
    helper.quaternion.copy(anchor.quaternion);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    litWindows.setMatrixAt(index, helper.matrix);
    const value = random();
    litWindows.setColorAt(index, new THREE.Color(value < .12 ? 0x293749
      : value < .49 ? 0xffd7aa : value < .73 ? 0x8ed8ff
        : value < .91 ? 0xfff0d0 : 0xf5a7ca));
  });
  litWindows.instanceMatrix.needsUpdate = true;
  if (litWindows.instanceColor) litWindows.instanceColor.needsUpdate = true;
  litWindows.name = 'Instanced city window lights';
  group.add(litWindows);

  // Grand Prix Plaza opposite the garage: raised seating with real supports.
  const grandstandSite = site(6085, 1, 47, 38);
  if (grandstandSite) {
    const stand = new THREE.Group();
    stand.name = 'Grand Prix Plaza main grandstand, tiers and supports';
    stand.position.copy(grandstandSite.point);
    stand.quaternion.copy(grandstandSite.quaternion);
    group.add(stand);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 74), darkRoof);
    floor.position.y = 4;
    stand.add(floor);
    const tierMat = new THREE.MeshStandardMaterial({ color: 0xb3b7c0,
      roughness: .87 });
    for (let tier = 0; tier < 8; tier++) {
      const seats = new THREE.Mesh(new THREE.BoxGeometry(2.8, .7, 72),
        tier % 3 === 0 ? warmSign : tierMat);
      seats.position.set(-10 + tier * 2.8, 5 + tier * 1.2, 0);
      stand.add(seats);
    }
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.65, 1, .65),
      darkRoof, 12);
    for (let i = 0; i < 12; i++) {
      const x = i % 2 ? 9 : -9;
      const z = -32 + Math.floor(i / 2) * 13;
      helper.position.set(x, 3.5, z);
      helper.quaternion.identity();
      helper.scale.set(1, 7, 1);
      helper.updateMatrix();
      legs.setMatrixAt(i, helper.matrix);
    }
    legs.instanceMatrix.needsUpdate = true;
    stand.add(legs);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(30, .9, 80), darkRoof);
    roof.position.y = 16.5;
    stand.add(roof);
  }
  return { group, landmarkCount: 7, skylineBlocks: masses.length,
    minimumStaticClearanceMetres: 27 };
}
