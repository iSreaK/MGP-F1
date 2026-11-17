import { createTrackGapLookup } from '../monza/track-gap.js';

// The FIA circuit map marks the control and standing-start lines separately.
// 57 × 5,412 m minus the official 308.326 km race distance gives 158 m from
// control line to standing-start line in the direction of travel.
export const MIAMI_FINISH_BEFORE_START_METERS = 158;
// OpenF1 pre-start XY gives 8.09 m row spacing after lap calibration.
// Use the same spacing for painted boxes and race-car poses.
export const GRID_SLOT_SPACING = 8.09;
export const GRID_LANE_CENTER = 2.40;
// Across points left in this x/z map: negative offsets are on the right,
// toward the pit lane; pole is on the opposite side.
export const PIT_START_LANE_CENTER = -14.5;

export function addMiamiGridDetails(THREE, scene, curve, polyline, landmarks,
  trackY = .36, halfWidth = 5.0, roadHalfWidthAt = () => halfWidth) {
  const group = new THREE.Group();
  group.name = 'Miami start, finish and pit complex';
  scene.add(group);

  const gap = createTrackGapLookup(curve);
  let travelled = 0;
  let length = 0;
  const sourceDistances = [0];
  const controlIndex = Math.max(0, Math.min(polyline.length - 1,
    landmarks.controlLineIndex ?? 0));
  for (let i = 0; i < polyline.length; i++) {
    const next = polyline[(i + 1) % polyline.length];
    const segment = polyline[i].distanceTo(next);
    if (i < controlIndex) travelled += segment;
    length += segment;
    sourceDistances.push(length);
  }
  const controlU = length ? travelled / length : 0;
  const gridU = gap.behind(controlU, -MIAMI_FINISH_BEFORE_START_METERS);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();

  function frameAt(station) {
    const u = gap.behind(gridU, -station);
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward));
    return { u, point, forward, across, quaternion };
  }

  function flatQuads(name, material, quads, lift = .025) {
    if (!quads.length) return null;
    const vertices = [];
    const indices = [];
    for (const [from, to, x0, x1] of quads) {
      const a = frameAt(from), b = frameAt(to);
      const offset = vertices.length / 3;
      for (const [f, x] of [[a, x0], [a, x1], [b, x0], [b, x1]]) {
        const lateral=typeof x==='function'?x(f.u):x;
        vertices.push(f.point.x + f.across.x * lateral, f.point.y + lift,
          f.point.z + f.across.z * lateral);
      }
      indices.push(offset, offset + 2, offset + 1,
        offset + 1, offset + 2, offset + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const darkRoad = new THREE.MeshStandardMaterial({ color: 0x454b51,
    roughness: .97, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xe9edec, side: THREE.DoubleSide });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd3b957, side: THREE.DoubleSide });
  const rubber = new THREE.MeshBasicMaterial({ color: 0x111718, transparent: true,
    opacity: .32, depthWrite: false, side: THREE.DoubleSide });
  const wall = new THREE.MeshStandardMaterial({ color: 0xb6bcc0, roughness: .86 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x29343a, metalness: .4, roughness: .55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1f3949, metalness: .48,
    roughness: .22, emissive: 0x142632, emissiveIntensity: .46 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xd1d2c9, roughness: .72 });
  const garage = new THREE.MeshStandardMaterial({ color: 0x879296, metalness: .28, roughness: .67 });
  const paleConcrete = new THREE.MeshStandardMaterial({ color: 0xc7c1b2, roughness: .88 });
  const darkFascia = new THREE.MeshStandardMaterial({ color: 0x25343b, metalness: .32, roughness: .56 });
  const redAccent = new THREE.MeshStandardMaterial({ color: 0xb8222c, roughness: .62 });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff4d5 });

  // Reconstruct the lane alongside the start/finish straight. Its two tapers
  // leave and rejoin the road, while the speed-limited central section stays
  // parallel to the actual curved centreline rather than a straight chord.
  // The FIA map supplies the entry and exit stations. Their lateral offsets
  // are visual estimates because the published line omits pit-lane geometry.
  const sourceStation = index => {
    const raw = sourceDistances[index] - travelled - MIAMI_FINISH_BEFORE_START_METERS;
    return raw > length / 2 ? raw - length : raw < -length / 2 ? raw + length : raw;
  };
  const entry = sourceStation(landmarks?.pitStraight?.entryIndex ?? polyline.length - 88);
  const exit = sourceStation(landmarks?.pitStraight?.exitIndex ?? 84);
  const taper = 65;
  // Full-width pit lane spans these offsets from the circuit centreline.
  // The live replay drives at -14.5 m and moves toward -18 m for a stop.
  const pitNearEdge = -halfWidth - .15 - 2.15;
  const pitFarEdge = -halfWidth - .18 - 14.6;
  const pitWorkingDivider = -16.25;
  const nearAt = u => -roadHalfWidthAt(u)-.15-2.15;
  const farAt = u => -roadHalfWidthAt(u)-.18-14.6;
  const smooth = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const laneWidthAt = station => smooth(entry, entry + taper, station)
    * (1 - smooth(exit - taper, exit, station));
  const pitQuads = [];
  for (let s = entry; s < exit; s += 3.5) {
    const next = Math.min(exit, s + 3.5);
    const a = laneWidthAt(s), b = laneWidthAt(next);
    const f0 = frameAt(s), f1 = frameAt(next);
    // End tapers meet the actual variable-width road edge; the previous
    // fixed-width lane left a gap when the T1–2 section became narrower.
    const nearA = -roadHalfWidthAt(f0.u) - .005 - 2.295 * a;
    const farA = -roadHalfWidthAt(f0.u) - .015 - 14.765 * a;
    const nearB = -roadHalfWidthAt(f1.u) - .005 - 2.295 * b;
    const farB = -roadHalfWidthAt(f1.u) - .015 - 14.765 * b;
    const k = pitQuads.length / 3;
    for (const [frame, x] of [[f0, nearA], [f0, farA], [f1, nearB], [f1, farB]]) {
      pitQuads.push(frame.point.x + frame.across.x * x, frame.point.y - .016,
        frame.point.z + frame.across.z * x);
    }
  }
  const pitIndices = [];
  for (let i = 0; i < pitQuads.length / 12; i++) {
    const k = i * 4;
    pitIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const pitGeometry = new THREE.BufferGeometry();
  pitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pitQuads, 3));
  pitGeometry.setIndex(pitIndices);
  pitGeometry.computeVertexNormals();
  const pit = new THREE.Mesh(pitGeometry, darkRoad);
  pit.name = 'Miami pit entry, fast lane, working lane and exit';
  pit.receiveShadow = true;
  group.add(pit);

  // The pit fast/working lane and garage facade are separated by a paved
  // forecourt. Keep this apron at ground level, beneath the garage canopy.
  const apron = [];
  for (let s = -220; s < 161; s += 3.5) {
    apron.push([s, Math.min(161, s + 3.5), pitFarEdge - .02,
      -halfWidth - 20.55]);
  }
  flatQuads('Pit garage forecourt asphalt', darkRoad, apron, -.019);

  const pitLine = [], pitDashes = [], speedLines = [];
  for (let s = entry + taper; s < exit - taper; s += 3.5) {
    const end = Math.min(exit - taper, s + 3.5);
    // Both edge lines stay on the generated pit asphalt. The former outside
    // line was roughly two metres beyond the lane's visible outer edge.
    pitLine.push([s, end, u => farAt(u)+.05, u => farAt(u)+.15]);
    pitLine.push([s, end, u => nearAt(u)-.15, u => nearAt(u)-.05]);
    if (Math.floor((s - entry) / 3.5) % 3 === 0) {
      pitDashes.push([s, Math.min(s + 2, end), pitWorkingDivider - .055,
        pitWorkingDivider + .055]);
    }
  }
  speedLines.push([entry + taper + 7, entry + taper + 7.35,
    pitNearEdge - .16, pitFarEdge + .16]);
  speedLines.push([exit - taper - 7.35, exit - taper - 7,
    pitNearEdge - .16, pitFarEdge + .16]);
  flatQuads('Pit lane edge paint', white, pitLine, -.007);
  flatQuads('Pit working-lane dashed divider', yellow, pitDashes, -.004);
  flatQuads('Pit speed-control lines', white, speedLines, .004);

  // Pole is opposite the pit side. The first box is
  // 12 m behind the start stripe; subsequent rows use the measured spacing.
  const boxes = [], guides = [], launchRubber = [];
  for (let position = 0; position < 22; position++) {
    const station = -12.0 - GRID_SLOT_SPACING * position;
    const centre = position % 2 === 0 ? GRID_LANE_CENTER : -GRID_LANE_CENTER;
    const rear = station - 5.8;
    boxes.push([station - .16, station + .16, centre - 1.28, centre + 1.28]);
    boxes.push([rear, station, centre - 1.28, centre - 1.12]);
    boxes.push([rear, station, centre + 1.12, centre + 1.28]);
    boxes.push([rear, rear + .15, centre - 1.28, centre - .58]);
    boxes.push([rear, rear + .15, centre + .58, centre + 1.28]);
    guides.push([station + 1.5, station + 3.0, centre - .07, centre + .07]);
    for (const tyre of [-.78, .78]) {
      launchRubber.push([rear - 3.0, rear + 2.0,
        centre + tyre - .08, centre + tyre + .08]);
    }
  }
  flatQuads('Miami grid launch rubber', rubber, launchRubber, .026);
  flatQuads('Twenty-two staggered Miami grid boxes', white, boxes, .039);
  flatQuads('Grid alignment markers', yellow, guides, .044);

  const finish = [];
  const tile = halfWidth * 2 / 12;
  for (let row = 0; row < 2; row++) for (let col = 0; col < 12; col++) {
    if ((row + col) % 2 === 0) finish.push([
      -MIAMI_FINISH_BEFORE_START_METERS + row * .55,
      -MIAMI_FINISH_BEFORE_START_METERS + (row + 1) * .55,
      -halfWidth + col * tile, -halfWidth + (col + 1) * tile,
    ]);
  }
  flatQuads('FIA control and chequered finish line', white, finish, .048);
  flatQuads('Separate standing start line', white,
    [[-.16, .16, -halfWidth, halfWidth]], .048);

  function instanceBoxes(name, dimensions, material, stations, lateral, centreY) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...dimensions), material,
      stations.length);
    mesh.name = name;
    for (let i = 0; i < stations.length; i++) {
      const frame = frameAt(stations[i]);
      helper.position.copy(frame.point).addScaledVector(frame.across,
        typeof lateral==='function'?lateral(frame.u):lateral);
      helper.position.y = frame.point.y + centreY;
      const slope = curve.getTangentAt(frame.u).normalize();
      const normal = new THREE.Vector3().crossVectors(slope, frame.across).normalize();
      helper.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(frame.across, normal, slope));
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      mesh.setMatrixAt(i, helper.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // The Paddock Club and garages occupy the driver's right of this straight.
  // Repeated bay geometry keeps its garage rhythm readable without dozens of
  // separate draw calls; the exact facade is a stylised reconstruction.
  // FIA 2026 pit drawing numbers 37 bays, including the FIA allocation.
  const bayLength = 10.2;
  const bays = Array.from({ length: 37 }, (_, i) => -215 + i * bayLength);
  instanceBoxes('Miami pit garage concrete bays', [16.8, 6.2, bayLength + .2],
    wall, bays, -halfWidth - 29.0, 3.1);
  instanceBoxes('Pit garage roller shutters', [.12, 4.8, bayLength - 1.1],
    garage, bays, -halfWidth - 20.5, 2.5);
  instanceBoxes('Pit garage upper glazing', [15.4, 4.0, bayLength - .28],
    glass, bays, -halfWidth - 29.0, 8.2);
  instanceBoxes('Pit building roof modules', [19.0, .55, bayLength + .2],
    roof, bays, -halfWidth - 29.0, 10.48);
  instanceBoxes('Pit building canopy light strips', [.20, .10, bayLength - .35],
    light, bays, -halfWidth - 20.15, 5.9);
  instanceBoxes('Pit building dark fascia', [.48, .55, bayLength + .1],
    steel, bays, -halfWidth - 19.85, 10.0);
  instanceBoxes('Miami Paddock Club third floor glazing', [15.4,3.0,bayLength-.25],
    glass,bays,-halfWidth-29.0,12.0);
  instanceBoxes('Miami Paddock Club white upper roof', [19,.45,bayLength+.2],
    new THREE.MeshStandardMaterial({color:0xf3f1e7,roughness:.72}),bays,-halfWidth-29,13.9);
  instanceBoxes('Miami Paddock Club upper terrace slabs', [3.4,.25,bayLength+.04],
    paleConcrete,bays,-halfWidth-20.8,10.6);
  instanceBoxes('Miami Paddock Club upper balcony glazing', [.15,1.1,bayLength-.35],
    glass,bays,-halfWidth-19.35,11.25);

  // The MIAMI paddock is a long 37-bay hospitality building, not a single
  // blank block. Door seams, vertical piers, balcony rails and rooftop plant
  // are instanced so the near-camera facade has detail without 300 draw calls.
  const bayBoundaries = Array.from({ length: bays.length + 1 },
    (_, i) => bays[0] - bayLength / 2 + i * bayLength);
  instanceBoxes('Garage facade pale piers', [.44, 6.05, .46],
    paleConcrete, bayBoundaries, -halfWidth - 20.43, 3.08);
  for (const y of [1.12, 2.15, 3.18, 4.21]) {
    instanceBoxes('Garage shutter horizontal ribs', [.06, .055, bayLength - 1.05],
      darkFascia, bays, -halfWidth - 20.39, y);
  }
  instanceBoxes('Garage head fascia', [.25, .72, bayLength - .35],
    darkFascia, bays, -halfWidth - 20.27, 5.53);
  instanceBoxes('Paddock balcony floor slabs', [3.1, .25, bayLength + .04],
    paleConcrete, bays, -halfWidth - 21.0, 6.45);
  instanceBoxes('Paddock hospitality balcony glazing', [.17, 1.13, bayLength - .35],
    glass, bays, -halfWidth - 19.55, 7.13);
  instanceBoxes('Paddock balcony posts', [.20, 1.2, .18],
    steel, bayBoundaries, -halfWidth - 19.55, 7.15);
  instanceBoxes('Paddock upper facade mullions', [.22, 3.42, .25],
    steel, bayBoundaries, -halfWidth - 20.48, 8.2);
  instanceBoxes('Paddock upper window belt', [.20, .22, bayLength - .25],
    paleConcrete, bays, -halfWidth - 20.4, 8.45);
  instanceBoxes('Paddock roof red edge', [.31, .23, bayLength + .05],
    redAccent, bays, -halfWidth - 19.45, 10.86);
  instanceBoxes('Paddock roof parapet', [.38, .85, bayLength + .05],
    paleConcrete, bays, -halfWidth - 19.25, 11.25);
  instanceBoxes('Paddock rooftop service housings', [3.5, 1.12, 3.8],
    roof, bays.filter((_, index) => index % 5 === 2), -halfWidth - 34.0, 11.27);

  const pitBoxLines = [];
  for (const station of bays) {
    const wallSide = -halfWidth - 20.43;
    const fastSide = pitFarEdge - .34;
    pitBoxLines.push([station - 4.55, station - 4.45, wallSide, fastSide]);
    pitBoxLines.push([station + 4.45, station + 4.55, wallSide, fastSide]);
    pitBoxLines.push([station - 4.55, station + 4.55, fastSide - .06,
      fastSide + .04]);
  }
  flatQuads('MIAMI pit box working-area outlines', white, pitBoxLines, .012);

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024;
  signCanvas.height = 160;
  const signContext = signCanvas.getContext('2d');
  signContext.fillStyle = '#172934';
  signContext.fillRect(0, 0, 1024, 160);
  signContext.fillStyle = '#c92f31';
  signContext.fillRect(0, 0, 18, 160);
  signContext.font = 'italic 900 99px Arial, sans-serif';
  signContext.fillStyle = '#f3f4eb';
  signContext.fillText('MIAMI', 65, 113);
  signContext.font = '700 31px Arial, sans-serif';
  signContext.fillText('MIAMI INTERNATIONAL AUTODROME', 420, 101);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture,
    side: THREE.DoubleSide });
  const signGeometry = new THREE.PlaneGeometry(9.45, 1.28);
  for (let index = 2; index < bays.length; index += 6) {
    const frame = frameAt(bays[index]);
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.name = 'Miami International Autodrome garage fascia sign';
    sign.position.copy(frame.point).addScaledVector(frame.across,
      -halfWidth - 20.09);
    sign.position.y += 5.55;
    sign.quaternion.copy(frame.quaternion);
    sign.rotateY(Math.PI / 2);
    group.add(sign);
  }

  // Retaining wall between race road and pit fast lane. The merge taper at
  // each end stays open, and every block follows the road elevation.
  const dividerStations = [];
  for (let s = entry + taper + 35; s < exit - taper - 35; s += 3.6) dividerStations.push(s);
  instanceBoxes('Pit-lane separation concrete blocks', [.72, 1.03, 3.58],
    wall, dividerStations, u => -roadHalfWidthAt(u)-1.85, .54);

  // Gantry, five start lights and illuminated scoring header.
  const gantry = new THREE.Group();
  gantry.name = 'Miami starting gantry';
  const gantryFrame = frameAt(9);
  gantry.position.copy(gantryFrame.point);
  gantry.quaternion.copy(gantryFrame.quaternion);
  group.add(gantry);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 5.6, .72, .55), steel);
  beam.position.y = 8.2;
  gantry.add(beam);
  const gantryCanvas = document.createElement('canvas');
  gantryCanvas.width = 1024;
  gantryCanvas.height = 96;
  const gantryContext = gantryCanvas.getContext('2d');
  gantryContext.fillStyle = '#182939';
  gantryContext.fillRect(0, 0, 1024, 96);
  gantryContext.fillStyle = '#ffffff';
  gantryContext.font = 'italic 800 65px Arial, sans-serif';
  gantryContext.textAlign = 'center';
  gantryContext.fillText('MSC CRUISES', 512, 69);
  const gantryTexture = new THREE.CanvasTexture(gantryCanvas);
  gantryTexture.colorSpace = THREE.SRGBColorSpace;
  const gantryFace = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth * 2 + 5.1, .62),
    new THREE.MeshBasicMaterial({ map: gantryTexture, side: THREE.DoubleSide }));
  gantryFace.name = '2026 Miami start gantry sponsor banner';
  gantryFace.position.set(0, 8.2, -.29);
  gantryFace.rotation.y = Math.PI;
  gantry.add(gantryFace);
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(.38, 8.1, .38), steel);
    column.position.set(side * (halfWidth + 2.3), 4.05, 0);
    gantry.add(column);
  }
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.28, .28, .12, 12),
    new THREE.MeshBasicMaterial({ color: 0x671d1d }), 5);
  for (let i = 0; i < 5; i++) {
    helper.position.set((i - 2) * .84, 7.87, -.4);
    helper.rotation.set(Math.PI / 2, 0, 0);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    lamps.setMatrixAt(i, helper.matrix);
  }
  lamps.instanceMatrix.needsUpdate = true;
  lamps.frustumCulled = false;
  gantry.add(lamps);

  return {
    group, gridU, controlU,
    garageBayCount:bays.length,
    pitEntryStation:entry,pitExitStation:exit,
    gridPoint: frameAt(0).point,
    gridTangent: frameAt(0).forward,
    frameAt,
  };
}
