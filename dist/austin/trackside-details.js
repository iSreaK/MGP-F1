/**
 * Daytime COTA infrastructure. Permanent-circuit guardrails and tall catch
 * fences sit beyond broad run-off, rather than hugging the road like Monza's
 * temporary barriers or Singapore's concrete street walls.
 */
export function addAustinTrackside(THREE, scene, curve, frames, landmarks, options = {}) {
  const { halfWidth = 6.5, gridU = 0, sourceFractions = [],
    pitSide = -1 } = options;
  const group = new THREE.Group();
  group.name = 'COTA guardrails, catch fencing and distance boards';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const lapLength = curve.getLength();
  const baseGuardOffset = halfWidth + 11.8;
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
  function signedStation(u) {
    let delta = u - gridU;
    if (delta > .5) delta -= 1;
    if (delta < -.5) delta += 1;
    return delta * lapLength;
  }
  const pitEntry = signedStation(sourceFractions[landmarks?.pitStraight?.entryIndex] ?? .94);
  const pitExit = signedStation(sourceFractions[landmarks?.pitStraight?.exitIndex] ?? .08);
  const runoffCorners = Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;
    const u = turnU(number);
    if (!Number.isFinite(u)) return null;
    const before = frameAt(u - .006).forward;
    const after = frameAt(u + .006).forward;
    const clockwise = before.x * after.z - before.z * after.x < 0;
    return { u, outside: clockwise ? -1 : 1,
      span: number === 1 ? 85 : 46,
      target: halfWidth + (number === 1 || number === 12 ? 40 : 24) };
  }).filter(Boolean);
  function guardOffsetAt(u, side) {
    let offset = baseGuardOffset;
    for (const corner of runoffCorners) {
      if (side !== corner.outside) continue;
      let delta = u - corner.u;
      if (delta > .5) delta -= 1;
      if (delta < -.5) delta += 1;
      const beyond = Math.abs(delta * lapLength) - corner.span;
      if (beyond > 45) continue;
      const t = Math.max(0, Math.min(1, beyond / 45));
      const fade = 1 - t * t * (3 - 2 * t);
      offset = Math.max(offset, baseGuardOffset
        + (corner.target - baseGuardOffset) * fade);
    }
    return offset;
  }
  const pitOpening = (u, side) => {
    if (side !== pitSide) return false;
    const station = signedStation(u);
    if (pitEntry <= pitExit)
      return station > pitEntry - 8 && station < pitExit + 8;
    return station > pitEntry - 8 || station < pitExit + 8;
  };

  // A coarse lookup is enough here: adjacent centreline samples are under
  // 2-3 m apart, but the guardrail reserve is several metres wide. Looking
  // across all turns catches barriers that fold into another track section.
  const cellSize = 26;
  const cells = new Map();
  const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  for (let i = 0; i < frames.length; i += 2) {
    const point = frames[i].point;
    const id = key(point.x, point.z);
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(point);
  }
  const pit = scene.getObjectByName('Austin pit entry, fast lane, working lane and exit');
  const pitVertices = pit?.geometry?.getAttribute('position');
  if (pitVertices) for (let i = 0; i < pitVertices.count; i++) {
    const point = new THREE.Vector3(pitVertices.getX(i), pitVertices.getY(i),
      pitVertices.getZ(i));
    const id = key(point.x, point.z);
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(point);
  }
  function distanceToTrack(x, z) {
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
    let distance = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const point of cells.get(`${cx + dx},${cz + dz}`) ?? []) {
        distance = Math.min(distance, Math.hypot(x - point.x, z - point.z));
      }
    }
    return distance;
  }
  function offsetPoint(frame, lateral, rise = 0) {
    return frame.point.clone().addScaledVector(frame.across, lateral)
      .addScaledVector(up, rise);
  }
  function allowed(a, b, margin = halfWidth + 3.5) {
    if (distanceToTrack(a.x, a.z) < margin
      || distanceToTrack(b.x, b.z) < margin) return false;
    const mid = a.clone().add(b).multiplyScalar(.5);
    return distanceToTrack(mid.x, mid.z) >= margin;
  }

  const vertices = [], normals = [], indices = [], colors = [];
  const silver = new THREE.Color(0xb3b8b5);
  const blue = new THREE.Color(0x45617d);
  const railPosts = [];
  let barrierCount = 0;
  for (let i = 0; i < frames.length; i++) {
    const a = frames[i], b = frames[(i + 1) % frames.length];
    const u = i / frames.length;
    for (const side of [-1, 1]) {
      if (pitOpening(u, side)) continue;
      const start = offsetPoint(a, side * guardOffsetAt(u, side));
      const end = offsetPoint(b, side * guardOffsetAt((i + 1) / frames.length,
        side));
      if (!allowed(start, end)) continue;
      const colour = Math.floor(i * lapLength / frames.length / 72) % 9 === 0
        ? blue : silver;
      for (const [bottom, top, depth] of [[.18, .6, 0], [.82, 1.25, 0]]) {
        const first = vertices.length / 3;
        for (const [frame, point, height] of [
          [a, start, bottom], [a, start, top],
          [b, end, bottom], [b, end, top],
        ]) {
          vertices.push(point.x + frame.across.x * depth,
            point.y + height, point.z + frame.across.z * depth);
          normals.push(-frame.across.x * side, 0, -frame.across.z * side);
          colors.push(colour.r, colour.g, colour.b);
        }
        indices.push(first, first + 2, first + 1,
          first + 1, first + 2, first + 3);
      }
      if (i % 6 === 0) railPosts.push({ point: start });
      barrierCount++;
    }
  }
  const railGeometry = new THREE.BufferGeometry();
  railGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  railGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  railGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  railGeometry.setIndex(indices);
  const rails = new THREE.Mesh(railGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
      metalness: .5, roughness: .56, side: THREE.DoubleSide }));
  rails.name = 'COTA outside Armco guardrails';
  rails.frustumCulled = false;
  group.add(rails);
  if (railPosts.length) {
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, 1.35, .16),
      new THREE.MeshStandardMaterial({ color: 0x7d8587, metalness: .6,
        roughness: .52 }), railPosts.length);
    posts.name = 'Armco steel uprights';
    for (let i = 0; i < railPosts.length; i++) {
      helper.position.copy(railPosts[i].point);
      helper.position.y += .67;
      helper.quaternion.identity();
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      posts.setMatrixAt(i, helper.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.frustumCulled = false;
    group.add(posts);
  }

  // Catch fences are outside the Armco. Mesh wires are a single line buffer;
  // a separate instanced upright mesh avoids hundreds of draw calls.
  const wires = [], fencePosts = [];
  const stepCount = Math.ceil(lapLength / 8);
  for (let i = 0; i < stepCount; i++) {
    const a = frameAt(i / stepCount), b = frameAt((i + 1) / stepCount);
    for (const side of [-1, 1]) {
      if (pitOpening(i / stepCount, side)) continue;
      const start = offsetPoint(a, side * (guardOffsetAt(i / stepCount, side)
        + 3.2));
      const end = offsetPoint(b, side * (guardOffsetAt((i + 1) / stepCount,
        side) + 3.2));
      if (!allowed(start, end, halfWidth + 4)) continue;
      fencePosts.push({ point: start, quaternion: a.quaternion });
      for (const height of [1.2, 2, 2.8, 3.6, 4.4]) {
        wires.push(start.x, start.y + height, start.z,
          end.x, end.y + height, end.z);
      }
      for (const [low, high] of [[1.25, 2], [2.1, 2.85], [2.95, 3.7]]) {
        wires.push(start.x, start.y + low, start.z,
          end.x, end.y + high, end.z);
      }
    }
  }
  const fenceMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, 4.4, .14),
    new THREE.MeshStandardMaterial({ color: 0x858f8f, metalness: .5,
      roughness: .57 }), fencePosts.length);
  fenceMesh.name = 'COTA catch-fence uprights';
  for (let i = 0; i < fencePosts.length; i++) {
    helper.position.copy(fencePosts[i].point);
    helper.position.y += 2.2;
    helper.quaternion.copy(fencePosts[i].quaternion);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    fenceMesh.setMatrixAt(i, helper.matrix);
  }
  fenceMesh.instanceMatrix.needsUpdate = true;
  fenceMesh.frustumCulled = false;
  group.add(fenceMesh);
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const wireMesh = new THREE.LineSegments(wireGeometry,
    new THREE.LineBasicMaterial({ color: 0xaeb6b2, transparent: true,
      opacity: .55, depthWrite: false }));
  wireMesh.name = 'COTA catch-fence diagonal wire mesh';
  group.add(wireMesh);

  // Braking boards flank the major stop zones. Each footprint is checked
  // against the complete circuit, avoiding a sign on a neighbouring corner.
  const signFace = new THREE.MeshBasicMaterial({ color: 0xf1f2ed,
    side: THREE.DoubleSide });
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x6d7779,
    metalness: .46, roughness: .6 });
  const boardCorners = [1, 11, 12, 15, 20];
  let boardCount = 0;
  for (const corner of boardCorners) {
    const u = turnU(corner);
    if (!Number.isFinite(u)) continue;
    for (const distance of [150, 100, 50]) {
      const frame = frameAt(u - distance / lapLength);
      const side = corner === 20 ? 1 : corner % 2 ? 1 : -1;
      const point = offsetPoint(frame, side * (halfWidth + 17));
      if (distanceToTrack(point.x, point.z) < halfWidth + 5) continue;
      const sign = new THREE.Group();
      sign.name = `${distance} m braking board before COTA turn ${corner}`;
      sign.position.copy(point);
      sign.quaternion.copy(frame.quaternion);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(.14, 3.5, .14), postMaterial);
      pole.position.y = 1.75;
      sign.add(pole);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.1), signFace);
      face.position.set(0, 3.15, 0);
      face.rotation.y = Math.PI;
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 96; canvas.height = 112;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f5f4ed'; ctx.fillRect(0, 0, 96, 112);
        ctx.fillStyle = '#27353e'; ctx.font = '900 43px Arial';
        ctx.textAlign = 'center'; ctx.fillText(String(distance), 48, 70);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        face.material = new THREE.MeshBasicMaterial({ map: texture,
          side: THREE.DoubleSide });
      }
      sign.add(face);
      group.add(sign);
      boardCount++;
    }
  }

  // The actual venue's red T3 pedestrian bridge is high above the tarmac.
  // The posts are off the outside guardrails, while the walking deck clears
  // the racing surface by over 8 m. Omit it if another loop reaches a foot.
  let bridge = null;
  const bridgeU = turnU(3);
  if (Number.isFinite(bridgeU)) {
    const frame = frameAt(bridgeU - 34 / lapLength);
    const left = offsetPoint(frame, -(halfWidth + 22));
    const right = offsetPoint(frame, halfWidth + 22);
    if (distanceToTrack(left.x, left.z) > halfWidth + 7
      && distanceToTrack(right.x, right.z) > halfWidth + 7) {
      bridge = new THREE.Group();
      bridge.name = 'COTA Turn 3 red pedestrian bridge';
      bridge.position.copy(frame.point);
      bridge.quaternion.copy(frame.quaternion);
      const span = halfWidth * 2 + 44;
      const bridgeRed = new THREE.MeshStandardMaterial({ color: 0xc4212e,
        metalness: .3, roughness: .5 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(span, .8, 4.2),
        bridgeRed);
      deck.position.y = 8.8;
      bridge.add(deck);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(span, .7, 4.2),
        bridgeRed);
      roof.position.y = 12.7;
      bridge.add(roof);
      for (const side of [-1, 1]) {
        const column = new THREE.Mesh(new THREE.BoxGeometry(1.3, 12.3, 1.3),
          bridgeRed);
        column.position.set(side * (halfWidth + 21.7), 6.15, 0);
        bridge.add(column);
      }
      for (const z of [-1.8, 1.8]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 1.0, .18),
          bridgeRed);
        rail.position.set(0, 10.15, z);
        bridge.add(rail);
      }
      group.add(bridge);
    }
  }

  return { group, barrierCount, fencePostCount: fencePosts.length,
    brakingBoardCount: boardCount, bridge,
    updateLighting() {}, setWetLighting() {} };
}
