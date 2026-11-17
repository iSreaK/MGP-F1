import { LANDMARKS, TRACK_LENGTH_METERS as LENGTH } from './track-data.js';

const wrap = value => ((value % 1) + 1) % 1;
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const stationDelta = (a, b) => { let d = a - b; if (d > LENGTH / 2) d -= LENGTH; if (d < -LENGTH / 2) d += LENGTH; return d; };

export function framesBetween(THREE, curve, start, end, step = 3) {
  const count = Math.ceil((end - start) / step);
  return Array.from({ length: count + 1 }, (_, i) => {
    const station = start + (end - start) * i / count;
    const u = wrap(station / LENGTH), point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    return { station, u, point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  });
}

// Open strips have N-1 spans. The former implementation joined their final
// frame back to their first, drawing a return triangle across kerbs and pits.
export function ribbon(THREE, parent, name, frames, from, to, material, {
  height = 0, closed = false, stripeMeters = 0,
} = {}) {
  const positions = [], uvs = [], indices = [], red = [], white = [];
  const count = closed ? frames.length : frames.length - 1;
  const lateral = (value, frame, i) => typeof value === 'function' ? value(frame, i) : value;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % frames.length, offset = positions.length / 3;
    for (const [frame, across, v] of [[frames[i], lateral(from, frames[i], i), 0],
      [frames[i], lateral(to, frames[i], i), 1],
      [frames[next], lateral(from, frames[next], next), 0],
      [frames[next], lateral(to, frames[next], next), 1]]) {
      positions.push(frame.point.x + frame.across.x * across,
        frame.point.y + height, frame.point.z + frame.across.z * across);
      uvs.push(frame.station / 12, v);
    }
    const target = stripeMeters ? Math.floor(frames[i].station / stripeMeters) % 2 ? red : white : indices;
    target.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(stripeMeters ? [...red, ...white] : indices);
  if (stripeMeters) { geometry.addGroup(0, red.length, 0); geometry.addGroup(red.length, white.length, 1); }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.receiveShadow = true;
  mesh.userData.strip = { closed, frames: frames.length, spans: count };
  parent.add(mesh);
  return mesh;
}

export function pitLaneOffset(station) {
  // Stations are measured from the control line, not the standing-start line.
  const s = ((station + LENGTH / 2) % LENGTH + LENGTH) % LENGTH - LENGTH / 2;
  return 17 * smooth((s + 420) / 160) * (1 - smooth((s - 360) / 190));
}

export function createShanghaiSurfaces(THREE, venue, curve, frames, asphaltMap) {
  const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color,
    roughness: .93, side: THREE.DoubleSide, ...extra });
  const asphalt = standard(0xd7dbdc, { map: asphaltMap, metalness: .015 });
  const shoulder = standard(0x545a5a), white = new THREE.MeshBasicMaterial({ color: 0xedece5, side: THREE.DoubleSide });
  const red = standard(0xbb2937), green = standard(0x367c69), gravel = standard(0xa6977b);
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0xc43d47,
    transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const cornerInfo = Object.entries(LANDMARKS.turns).map(([id, turn]) => {
    const station = turn.distanceMeters;
    const a = curve.getTangentAt(wrap((station - 16) / LENGTH));
    const b = curve.getTangentAt(wrap((station + 16) / LENGTH));
    return { id, station, inside: a.x * b.z - a.z * b.x > 0 ? -1 : 1 };
  });
  const nearby = (point, frameIndex, minStationGap = 75) => {
    let best = Infinity;
    for (let j = 0; j < frames.length; j += 3) {
      if (Math.abs(stationDelta(frames[j].station, frames[frameIndex].station)) < minStationGap) continue;
      best = Math.min(best, Math.hypot(point.x - frames[j].point.x, point.z - frames[j].point.z));
    }
    return best;
  };
  const edgeWidths = [-1, 1].map(side => frames.map((frame, i) => {
    let desired = 9.2;
    for (const corner of cornerInfo) {
      if (corner.inside === side) continue;
      const delta = stationDelta(frame.station, corner.station);
      const spread = corner.id === 'T13' ? 145 : corner.id === 'T1' ? 120 : 70;
      desired += (['T1', 'T6', 'T13', 'T14'].includes(corner.id) ? 28 : 11)
        * Math.exp(-.5 * (delta / spread) ** 2);
    }
    const before = curve.getTangentAt(wrap((frame.station - 4) / LENGTH)).setY(0).normalize();
    const after = curve.getTangentAt(wrap((frame.station + 4) / LENGTH)).setY(0).normalize();
    const cross = before.x * after.z - before.z * after.x;
    if (cross * side < 0) {
      const radius = 8 / Math.max(1e-6, before.angleTo(after));
      desired = Math.min(desired, Math.max(8.2, radius * .72));
    }
    // A runoff island must never spread over a neighbouring part of the
    // snail or hairpin. Limit its edge before the adjacent road envelope.
    let width = 8.2;
    for (let candidate = 9.2; candidate <= desired; candidate += 1) {
      const p = frame.point.clone().addScaledVector(frame.across, candidate * side);
      if (nearby(p, i) < 9) break;
      width = candidate;
    }
    return width;
  }));
  // Gentle station-to-station width changes avoid scalloped runoff borders.
  for (let pass = 0; pass < 3; pass++) for (const widths of edgeWidths) {
    const old = [...widths];
    for (let i = 0; i < widths.length; i++) widths[i] = Math.min(widths[i],
      (old[(i + old.length - 1) % old.length] + 2 * old[i] + old[(i + 1) % old.length]) / 4);
  }
  const gravelInner = frames.map((frame, i) => {
    const blend = smooth((frame.station - 4680) / 50) * (1 - smooth((frame.station - 4820) / 50));
    return Math.min(edgeWidths[1][i], Math.max(8.25, edgeWidths[1][i] - 10 * blend));
  });
  for (const [k, side] of [-1, 1].entries()) {
    ribbon(THREE, venue, `Shanghai ${side > 0 ? 'left' : 'right'} paved runoff`, frames,
      side * 7.02, (_, i) => side * (side > 0 ? gravelInner[i] : edgeWidths[k][i]),
      shoulder, { height: -.018, closed: true });
    ribbon(THREE, venue, `Shanghai ${side > 0 ? 'left' : 'right'} green runoff border`, frames,
      (_, i) => side * edgeWidths[k][i], (_, i) => side * (edgeWidths[k][i] + .6), green,
      { height: -.025, closed: true });
  }
  ribbon(THREE, venue, 'Shanghai T14 gravel bed', frames,
    (_, i) => gravelInner[i], (_, i) => edgeWidths[1][i], gravel, { height: -.018, closed: true });
  ribbon(THREE, venue, 'Shanghai International Circuit overview silhouette', frames,
    -9.1, 9.1, overviewAccent, { height: .012, closed: true });
  const road = ribbon(THREE, venue, 'Shanghai International Circuit racing surface', frames,
    -7, 7, asphalt, { closed: true });
  for (const side of [-1, 1]) ribbon(THREE, venue, `Shanghai ${side > 0 ? 'left' : 'right'} road edge`,
    frames, side * 6.78, side * 6.96, white, { height: .021, closed: true });
  for (const corner of cornerInfo) {
    const halfSpan = ['T1', 'T13'].includes(corner.id) ? 95 : corner.id === 'T2' ? 55 : 39;
    const kerbFrames = framesBetween(THREE, curve, corner.station - halfSpan, corner.station + halfSpan, 2);
    ribbon(THREE, venue, `Shanghai ${corner.id} red and white kerb`, kerbFrames,
      corner.inside * 7.05, corner.inside * 7.95, [red, white], { height: .055, stripeMeters: 2 });
  }

  const pitFrames = framesBetween(THREE, curve, -420, 550, 3);
  const pit = ribbon(THREE, venue, 'Shanghai International Circuit pit lane', pitFrames,
    frame => pitLaneOffset(frame.station) - 4.4,
    frame => pitLaneOffset(frame.station) + 4.4, standard(0x555b5e), { height: .026 });
  const apronFrames = framesBetween(THREE, curve, -235, 235, 3);
  const apron = ribbon(THREE, venue, 'Shanghai garage working apron', apronFrames,
    17.2, 23.1, standard(0x777c7b), { height: .033 });
  ribbon(THREE, venue, 'Shanghai pit fast lane separation', apronFrames, 17, 17.13,
    white, { height: .046 });
  return { asphalt, overviewAccent, road, pit, apron, pitFrames, edgeWidths, cornerInfo };
}

export function addShanghaiSafety(THREE, venue, curve, frames, edgeWidths, groundHeightAt) {
  const parts = [];
  const minRoadDistance = point => {
    let d = Infinity;
    for (let i = 0; i < frames.length; i += 2) d = Math.min(d,
      Math.hypot(point.x - frames[i].point.x, point.z - frames[i].point.z));
    return d;
  };
  const stepMeters = 2;
  for (const [k, side] of [-1, 1].entries()) for (let s = 0; s < LENGTH; s += stepMeters) {
    // Pit entry/exit and the working lane must remain open on the left side.
    if (side > 0 && (s < 570 || s > LENGTH - 440)) continue;
    const edgeAt = station => {
      const x = wrap(station / LENGTH) * frames.length, i = Math.floor(x), blend = x - i;
      return Math.max(15, edgeWidths[k][i] * (1 - blend)
        + edgeWidths[k][(i + 1) % frames.length] * blend + 4.5);
    };
    const ends = [s, Math.min(s + stepMeters + .08, LENGTH)].map(station => {
      const u = wrap(station / LENGTH), p = curve.getPointAt(u);
      const f = curve.getTangentAt(u).setY(0).normalize();
      return p.addScaledVector(new THREE.Vector3(f.z, 0, -f.x), edgeAt(station) * side);
    });
    if (ends.some(p => minRoadDistance(p) < 11.5)) continue;
    const centre = ends[0].clone().add(ends[1]).multiplyScalar(.5);
    const direction = ends[1].clone().sub(ends[0]);
    parts.push({ centre, length: direction.length() + .1, ends,
      yaw: Math.atan2(direction.x, direction.z), side, station: s });
  }
  const metal = new THREE.MeshStandardMaterial({ color: 0xb7bdbe, roughness: .55, metalness: .48 });
  const helper = new THREE.Object3D();
  for (const [name, height, thickness] of [['Shanghai continuous lower safety rail', .5, .27],
    ['Shanghai continuous upper safety rail', .94, .27]]) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.15, thickness, 1), metal, parts.length);
    mesh.name = name;
    parts.forEach((part, i) => {
      helper.position.copy(part.centre); helper.position.y += height;
      helper.rotation.set(0, part.yaw, 0); helper.scale.set(1, 1, part.length);
      helper.updateMatrix(); mesh.setMatrixAt(i, helper.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true; venue.add(mesh);
  }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 1, .12), metal, parts.length);
  posts.name = 'Shanghai safety rail posts';
  parts.forEach((part, i) => {
    const top = part.centre.y + 1.08;
    const bottom = groundHeightAt ? groundHeightAt(part.centre.x, part.centre.z) - .08 : part.centre.y - .7;
    helper.position.copy(part.centre); helper.position.y = (top + bottom) / 2;
    helper.rotation.set(0, part.yaw, 0); helper.scale.set(1, top - bottom, 1);
    helper.updateMatrix(); posts.setMatrixAt(i, helper.matrix);
  });
  venue.add(posts);
  return { parts, minRoadDistance, stepMeters };
}
