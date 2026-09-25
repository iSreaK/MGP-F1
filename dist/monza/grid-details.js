/**
 * The start/finish complex is built from the actual centreline, rather than a
 * chord between two distant points on the curved main straight.  All offsets
 * below are local metres: +X is the pit side, +Z is the direction of travel.
 */
export function addMonzaGridDetails(THREE, scene, curve, polyline, landmarks, trackY = .30) {
  const group = new THREE.Group();
  group.name = 'Monza start finish and pit complex';
  scene.add(group);

  const curveLength = curve.getLength();
  let travelled = 0;
  let total = 0;
  const gridIndex = Math.max(0, Math.min(polyline.length - 1, landmarks.gridIndex ?? 0));
  for (let i = 0; i < polyline.length; i++) {
    const segment = polyline[i].distanceTo(polyline[(i + 1) % polyline.length]);
    if (i < gridIndex) travelled += segment;
    total += segment;
  }
  const gridU = total ? travelled / total : 0;
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();

  function frameAt(metres) {
    const u = ((gridU + metres / curveLength) % 1 + 1) % 1;
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward),
    );
    return { point, forward, across, quaternion };
  }

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x323b3c, roughness: .97, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xe2e4dd, roughness: .98, side: THREE.DoubleSide });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd0b94d, roughness: .98, side: THREE.DoubleSide });
  const wornPaint = new THREE.MeshStandardMaterial({ color: 0xa5aaa2, roughness: 1, side: THREE.DoubleSide });
  const rubber = new THREE.MeshBasicMaterial({ color: 0x101817, transparent: true, opacity: .31, depthWrite: false, side: THREE.DoubleSide });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xabb0ac, roughness: .94 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x485050, roughness: .86 });
  const structure = new THREE.MeshStandardMaterial({ color: 0x293331, metalness: .32, roughness: .57 });
  const glazing = new THREE.MeshStandardMaterial({ color: 0x456270, metalness: .46, roughness: .23 });
  const doors = new THREE.MeshStandardMaterial({ color: 0x84908f, metalness: .35, roughness: .65 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xd6d9d3, metalness: .28, roughness: .64 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa92b30, roughness: .67 });
  const apronConcrete = new THREE.MeshStandardMaterial({ color: 0x707674, roughness: .97, side: THREE.DoubleSide });
  const apronConcreteDark = new THREE.MeshStandardMaterial({ color: 0x666d6a, roughness: .97, side: THREE.DoubleSide });

  // One curved polygon per pavement marking family keeps the main straight
  // smooth even though the CAD-like pit building is made of repeated bays.
  function surface(name, material, quads, y) {
    if (!quads.length) return null;
    const positions = [];
    const indices = [];
    for (const [s0, s1, x0, x1] of quads) {
      const a = frameAt(s0), b = frameAt(s1);
      const first = positions.length / 3;
      for (const [frame, offset] of [[a, x0], [a, x1], [b, x0], [b, x1]]) {
        const v = frame.point.clone().addScaledVector(frame.across, offset);
        positions.push(v.x, v.y + y - trackY, v.z);
      }
      indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function smoothstep(a, b, value) {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // The pit entry and exit taper into the main straight. The wall and garages
  // follow the track itself; their old straight chord missed it by >100 m.
  const pitSurface = [];
  for (let s = -310; s < 310; s += 4) {
    const a = smoothstep(-310, -224, s) * (1 - smoothstep(230, 310, s));
    const b = smoothstep(-310, -224, s + 4) * (1 - smoothstep(230, 310, s + 4));
    // The final polygon keeps the taper continuous without extending any part
    // of the pit lane into the racing surface at the pit entry or exit.
    const x0 = 6.48 + 1.47 * a;
    const x1 = 6.57 + 13.33 * a;
    const y0 = 6.48 + 1.47 * b;
    const y1 = 6.57 + 13.33 * b;
    const f0 = frameAt(s), f1 = frameAt(s + 4);
    const vertices = [];
    for (const [frame, offset] of [[f0, x0], [f0, x1], [f1, y0], [f1, y1]]) {
      const p = frame.point.clone().addScaledVector(frame.across, offset);
      vertices.push(p.x, p.y + .008, p.z);
    }
    pitSurface.push(vertices);
  }
  const pitVertices = pitSurface.flat();
  const pitIndices = [];
  for (let i = 0; i < pitSurface.length; i++) {
    const k = i * 4;
    pitIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const pitGeometry = new THREE.BufferGeometry();
  pitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pitVertices, 3));
  pitGeometry.setIndex(pitIndices);
  pitGeometry.computeVertexNormals();
  const pitRoad = new THREE.Mesh(pitGeometry, asphalt);
  pitRoad.name = 'Pit lane aligned with the curved Monza straight';
  pitRoad.receiveShadow = true;
  group.add(pitRoad);

  const laneEdges = [];
  for (let s = -224; s < 230; s += 4) laneEdges.push([s, Math.min(230, s + 4), 19.55, 19.72]);
  surface('Pit lane outer white line', white, laneEdges, trackY + .025);
  const laneDashes = [];
  for (let s = -210; s < 220; s += 10) laneDashes.push([s, s + 4.4, 13.6, 13.76]);
  surface('Pit lane speed and working-lane divider', yellow, laneDashes, trackY + .028);

  // The pit fast lane is immediately outside the separation wall, and the
  // painted pit boxes occupy the working lane towards the garage doors.
  // Timing lines and narrowing merge arrows stay entirely on the pit road.
  const pitLines = [
    [-215.1, -214.75, 8.08, 19.65],
    [225.2, 225.55, 8.08, 19.65],
  ];
  for (let s = -217.2; s < 223.8; s += 3.5) pitLines.push([s, Math.min(223.8, s + 3.5), 8.02, 8.16]);
  surface('Pit speed control and fast lane white lines', white, pitLines, trackY + .033);
  const pitChevrons = [];
  for (const start of [-235, -231, -227, 229, 233, 237]) {
    for (let k = 0; k < 5; k++) {
      const s = start + k * 1.2;
      pitChevrons.push([s, s + .36, 8.5 + k * .60, 8.90 + k * .60]);
    }
  }
  surface('Pit entry exit merge chevrons', white, pitChevrons, trackY + .039);

  // The 2026 field has 22 cars. The pole slot is on the left; successive
  // positions are staggered rather than paired at an identical station.
  // The first slot encloses the RB22 already parked by the viewer at -14.5 m.
  const gridMarks = [];
  const yellowGuides = [];
  const weatheredDashes = [];
  const launchRubber = [];
  const startingSlots = [];
  for (let position = 0; position < 22; position++) {
    const station = -10.7 - position * 9.05;
    const center = position % 2 === 0 ? -2.72 : 2.72;
    const halfWidth = 1.36;
    const rear = station - 6.8;
    startingSlots.push({ station, center, number: position + 1 });
    gridMarks.push([station - .16, station + .16, center - halfWidth, center + halfWidth]);
    gridMarks.push([rear, station, center - halfWidth, center - halfWidth + .15]);
    gridMarks.push([rear, station, center + halfWidth - .15, center + halfWidth]);
    gridMarks.push([rear, rear + .15, center - halfWidth, center - halfWidth + .77]);
    gridMarks.push([rear, rear + .15, center + halfWidth - .77, center + halfWidth]);

    // Short visual reference ahead of the nose, as used on current F1 grids.
    yellowGuides.push([station + .82, station + 2.8, center - .065, center + .065]);
    // A few older transverse traces are visible under the current paint.
    if (position % 3 === 1) weatheredDashes.push([station - 3.5, station - 3.39, center - .92, center + .92]);
    for (const wheelOffset of [-.78, .78]) {
      const jitter = .17 * Math.sin(position * 8.7 + wheelOffset);
      launchRubber.push([rear - 4.2 - position % 3, rear + 1.7, center + wheelOffset + jitter, center + wheelOffset + .16 + jitter]);
      launchRubber.push([rear - 2.4, rear + .7, center + wheelOffset + .32 + jitter, center + wheelOffset + .41 + jitter]);
    }
  }
  surface('Rubber launch streaks on the grid', rubber, launchRubber, trackY + .041);
  surface('Older scuffed grid traces', wornPaint, weatheredDashes, trackY + .044);
  surface('Twenty two staggered FIA grid boxes', white, gridMarks, trackY + .055);
  surface('Grid alignment reference bars', yellow, yellowGuides, trackY + .058);

  if (typeof document !== 'undefined') {
    const textTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (const slot of startingSlots) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(228,230,221,.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 82px Arial, sans-serif';
      ctx.fillText(String(slot.number), 64, 67);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(.95, .95),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      label.name = `Painted grid position ${slot.number}`;
      const frame = frameAt(slot.station - 2.2);
      label.position.copy(frame.point).addScaledVector(frame.across, slot.center > 0 ? .83 : -.83);
      label.position.y += .066;
      label.quaternion.copy(frame.quaternion).multiply(textTilt);
      group.add(label);
    }
  }

  // Separate chequered finish stripe and its flanking white bars.  The strip
  // sits on the actual track centreline, not on the pit-building chord.
  const finishQuads = [];
  const tileWidth = 11.5 / 12;
  for (let col = 0; col < 12; col++) {
    for (let row = 0; row < 2; row++) {
      if ((col + row) % 2 === 0) finishQuads.push([row * .55, (row + 1) * .55, -5.75 + col * tileWidth, -5.75 + (col + 1) * tileWidth]);
    }
  }
  surface('Chequered start finish line', white, finishQuads, trackY + .055);
  surface('Start finish transverse edge', white, [[-1.3, -1.14, -5.75, 5.75], [1.14, 1.30, -5.75, 5.75]], trackY + .055);

  function instancedBoxes(name, dims, material, stations, x, y) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...dims), material, stations.length);
    mesh.name = name;
    for (let i = 0; i < stations.length; i++) {
      const frame = frameAt(stations[i]);
      helper.position.copy(frame.point).addScaledVector(frame.across, x);
      helper.position.y = frame.point.y + y - trackY;
      helper.quaternion.copy(frame.quaternion);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      mesh.setMatrixAt(i, helper.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const bayLength = 10.8;
  const bays = Array.from({ length: 32 }, (_, i) => -173.2 + i * bayLength);
  // Every garage bay is tangential to the local track direction. At Monza the
  // pit building and paddock side sit to the driver's right on this straight.
  instancedBoxes('Continuous pit garage block', [16.1, 6.15, bayLength + .12], concrete, bays, 29.2, 3.075);
  instancedBoxes('Garage roller doors', [.10, 4.5, bayLength - 1.08], doors, bays, 21.07, 2.42);
  instancedBoxes('Garage lintels', [.23, .33, bayLength - .36], structure, bays, 20.99, 5.03);
  instancedBoxes('Hospitality glazing over pits', [14.9, 4.42, bayLength - .35], glazing, bays, 29.4, 8.36);
  instancedBoxes('Window mullions', [.16, 4.5, .19], structure, bays, 21.78, 8.36);
  instancedBoxes('Pit building white roof', [20.2, .55, bayLength + .12], roof, bays, 28.1, 11.04);
  instancedBoxes('Pit building red fascia', [.43, .60, bayLength + .1], red, bays, 19.93, 10.61);
  instancedBoxes('Pit box canopy', [5.65, .22, bayLength + .1], roof, bays, 20.0, 6.13);
  instancedBoxes('Canopy support ribs', [5.6, .18, .17], structure, bays, 20.0, 5.95);

  // Working apron slabs meet the garage fronts. Their joints and team boards
  // make the pit lane read as an occupied 2026 F1 complex from track level.
  const lightSlabs = [], darkSlabs = [], drainGrates = [];
  for (let i = 0; i < bays.length; i++) {
    const station = bays[i];
    (i % 4 === 0 ? darkSlabs : lightSlabs).push([station - 5.32, station + 5.32, 14.28, 19.85]);
    drainGrates.push([station - 3.65, station + 3.65, 19.62, 19.78]);
  }
  surface('Concrete pit working apron', apronConcrete, lightSlabs, trackY + .017);
  surface('Weathered concrete pit apron panels', apronConcreteDark, darkSlabs, trackY + .018);
  surface('Pit box drainage channel grates', darkConcrete, drainGrates, trackY + .024);

  if (typeof document !== 'undefined') {
    const teamBoards = [
      ['CADILLAC', '#333d42', '#f4f4ed'],
      ['ALPINE', '#226e9d', '#f5f8fa'],
      ['AUDI', '#a82432', '#fff4f3'],
      ['HAAS', '#c5c7c6', '#232727'],
      ['ASTON MARTIN', '#13564e', '#f1f4ee'],
      ['RACING BULLS', '#284879', '#f3f6fb'],
      ['WILLIAMS', '#2672b8', '#f8f9fc'],
      ['FERRARI', '#bd232b', '#fff4ec'],
      ['RED BULL RACING', '#17254b', '#f3f4f8'],
      ['MERCEDES', '#285f5d', '#f1f4f1'],
      ['McLAREN', '#cb6924', '#171b1b'],
    ];
    const faceRoad = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    const boardMaterials = teamBoards.map(([name, background, foreground]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 512, 80);
      ctx.fillStyle = foreground;
      ctx.fillRect(0, 0, 11, 80);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '700 38px Arial, sans-serif';
      ctx.fillText(name, 262, 43, 440);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    });
    for (let i = 0; i < bays.length; i++) {
      const frame = frameAt(bays[i]);
      const team = Math.min(teamBoards.length - 1, Math.floor(i / 3));
      const board = new THREE.Mesh(new THREE.PlaneGeometry(8.8, .72), boardMaterials[team]);
      board.name = `${teamBoards[team][0]} pit garage fascia`;
      board.position.copy(frame.point).addScaledVector(frame.across, 20.87);
      board.position.y = frame.point.y + 5.45 - trackY;
      board.quaternion.copy(frame.quaternion).multiply(faceRoad);
      group.add(board);
    }
  }

  const pitBoxes = [];
  for (const station of bays) {
    pitBoxes.push([station - 4.15, station - 4.02, 15.1, 19.2]);
    pitBoxes.push([station + 4.02, station + 4.15, 15.1, 19.2]);
    pitBoxes.push([station - 4.15, station + 4.15, 19.03, 19.18]);
  }
  surface('Painted garage working boxes', white, pitBoxes, trackY + .029);

  // A single swept wall replaces the old row of detached 3 m blocks. The
  // front edge is 0.82 m beyond the racing asphalt, with a low painted skirt
  // and a thin continuous cap; it follows every bend and height change.
  function curvedWallBand(name, start, end, x0, x1, bottom, top, material) {
    const positions = [];
    const indices = [];
    const point = (frame, x, y) => {
      const p = frame.point.clone().addScaledVector(frame.across, x);
      return [p.x, frame.point.y + y - trackY, p.z];
    };
    const quad = (a, b, c, d) => {
      const k = positions.length / 3;
      positions.push(...a, ...b, ...c, ...d);
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    };
    for (let s = start; s < end; s += 2) {
      const a = frameAt(s), b = frameAt(Math.min(end, s + 2));
      quad(point(a, x0, bottom), point(a, x0, top), point(b, x0, bottom), point(b, x0, top));
      quad(point(a, x1, bottom), point(a, x1, top), point(b, x1, bottom), point(b, x1, top));
      quad(point(a, x0, top), point(a, x1, top), point(b, x0, top), point(b, x1, top));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const wallConcrete = new THREE.MeshStandardMaterial({ color: 0xadb2ae, roughness: .94, side: THREE.DoubleSide });
  const wallSkirt = new THREE.MeshStandardMaterial({ color: 0x465b54, roughness: .87, side: THREE.DoubleSide });
  const wallCap = new THREE.MeshStandardMaterial({ color: 0x59615e, metalness: .15, roughness: .68, side: THREE.DoubleSide });
  curvedWallBand('Continuous curved pit wall', -218, 220, 6.87, 7.59, 0, .91, wallConcrete);
  curvedWallBand('Low painted pit wall fascia', -218, 220, 6.845, 6.865, .065, .51, wallSkirt);
  curvedWallBand('Pit wall continuous top rail', -218, 220, 6.82, 7.64, .90, 1.025, wallCap);

  // Start light gantry spans the circuit symmetrically. Both feet are beyond
  // the 12 m asphalt; the pit-side foot stands on the separation wall.
  const gantryFrame = frameAt(17);
  const gantry = new THREE.Group();
  gantry.name = 'Centered start lights and timing gantry';
  gantry.position.copy(gantryFrame.point);
  gantry.position.y = gantryFrame.point.y - trackY;
  gantry.quaternion.copy(gantryFrame.quaternion);
  group.add(gantry);
  function gantryBox(name, dims, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dims), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    gantry.add(mesh);
    return mesh;
  }
  gantryBox('Outside gantry column', [.50, 8.25, .63], -7.23, 4.125, 0, structure);
  gantryBox('Pit wall gantry column', [.50, 8.25, .63], 7.23, 4.125, 0, structure);
  gantryBox('Start light truss', [15.1, 1.95, 1.12], 0, 8.35, 0, structure);
  gantryBox('Gantry white edge', [15.1, .12, 1.18], 0, 9.38, 0, roof);
  gantryBox('Start signal black face', [11.65, 1.26, .18], 0, 6.87, -.66, darkConcrete);

  const lightOff = new THREE.MeshBasicMaterial({ color: 0x6b191c });
  const lightRim = new THREE.MeshStandardMaterial({ color: 0x171c1c, roughness: .42 });
  for (let i = -2; i <= 2; i++) {
    for (const y of [6.59, 7.14]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .095, 16), lightRim);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(i * 1.74, y, -.79);
      gantry.add(rim);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(.165, 16), lightOff);
      lamp.position.set(i * 1.74, y, -.86);
      lamp.rotation.y = Math.PI;
      gantry.add(lamp);
    }
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1d2929';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#e8eee8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 54px Arial, sans-serif';
    ctx.fillText('AUTODROMO NAZIONALE MONZA', 512, 65, 970);
    for (const [x, colour] of [[0, '#19834d'], [1010, '#b92f36']]) {
      ctx.fillStyle = colour;
      ctx.fillRect(x, 0, 14, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    for (const facing of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(14.0, 1.75), signMaterial);
      sign.name = 'Monza start gantry lettering';
      sign.position.set(0, 8.34, facing * .59);
      if (facing < 0) sign.rotation.y = Math.PI;
      gantry.add(sign);
    }
  }

  return { group, gridU, gridPoint: frameAt(0).point, gridTangent: frameAt(0).forward };
}
