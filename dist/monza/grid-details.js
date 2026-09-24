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
  const white = new THREE.MeshBasicMaterial({ color: 0xe9ede8, side: THREE.DoubleSide });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd5c26f, side: THREE.DoubleSide });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xabb0ac, roughness: .94 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x485050, roughness: .86 });
  const structure = new THREE.MeshStandardMaterial({ color: 0x293331, metalness: .32, roughness: .57 });
  const glazing = new THREE.MeshStandardMaterial({ color: 0x456270, metalness: .46, roughness: .23 });
  const doors = new THREE.MeshStandardMaterial({ color: 0x84908f, metalness: .35, roughness: .65 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xd6d9d3, metalness: .28, roughness: .64 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa92b30, roughness: .67 });

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

  // Staggered two-column Formula 1 grid: one longitudinal marker and an L
  // shaped front edge for each of twenty cars, all laid flat on the track.
  const gridMarks = [];
  for (let row = 0; row < 10; row++) {
    for (const lane of [-1, 1]) {
      const station = -23 - row * 17.6 - (lane > 0 ? 8.8 : 0);
      const center = lane * 2.78;
      gridMarks.push([station, station + .18, center - 1.2, center + 1.2]);
      gridMarks.push([station - 2.7, station, center - 1.2, center - 1.05]);
      gridMarks.push([station - 2.7, station, center + 1.05, center + 1.2]);
    }
  }
  surface('Twenty staggered painted starting boxes', white, gridMarks, trackY + .052);

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
  gantryBox('Start signal black face', [11.65, .78, .14], 0, 6.84, -.66, darkConcrete);

  const lightOff = new THREE.MeshBasicMaterial({ color: 0x6b191c });
  const lightRim = new THREE.MeshStandardMaterial({ color: 0x171c1c, roughness: .42 });
  for (let i = -2; i <= 2; i++) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .09, 16), lightRim);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(i * 1.74, 6.84, -.76);
    gantry.add(rim);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(.19, 16), lightOff);
    lamp.position.set(i * 1.74, 6.84, -.82);
    lamp.rotation.y = Math.PI;
    gantry.add(lamp);
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
