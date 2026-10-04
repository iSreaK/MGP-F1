/**
 * Safety walls, catch fencing, lighting and worn road paint. All geometry is
 * batched: the urban circuit needs thousands of repeated elements, while the
 * replay must still be able to render twenty-two moving cars smoothly.
 */
export function addSingaporeTrackside(THREE, scene, curve, frames, landmarks, options = {}) {
  const {
    trackY = .36,
    halfWidth = 5.0,
    gridU = 0,
    sourceFractions = [],
  } = options;
  const group = new THREE.Group();
  group.name = 'Singapore circuit barriers, fencing and floodlights';
  scene.add(group);

  const length = curve.getLength();
  const helper = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const frameAt = u => {
    const t = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(t);
    const forward = curve.getTangentAt(t).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward));
    return { point, forward, across, quaternion };
  };
  const signedStation = u => {
    let delta = u - gridU;
    if (delta > .5) delta -= 1;
    if (delta < -.5) delta += 1;
    return delta * length;
  };
  const pitEntry = signedStation(sourceFractions[landmarks?.pitStraight?.entryIndex] ?? .94);
  const pitExit = signedStation(sourceFractions[landmarks?.pitStraight?.exitIndex] ?? .08);
  const turnU = number => sourceFractions[landmarks?.turns?.[`T${number}`]?.index] ?? null;

  const positions = [];
  const barrierColors = [];
  const stepMetres = 4.2;
  const count = Math.ceil(length / stepMetres);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const frame = frameAt(u);
    const station = signedStation(u);
    for (const side of [-1, 1]) {
      // The left-hand pit entry and exit are open. The pit module builds its
      // own divider where the pit lane runs parallel with the main straight.
      if (side < 0 && station > pitEntry - 7 && station < pitExit + 7) continue;
      positions.push({ frame, side, i });
    }
  }
  const barrier = new THREE.InstancedMesh(
    new THREE.BoxGeometry(.72, 1.12, stepMetres + .06),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9,
      metalness: .015, vertexColors: true }), positions.length);
  barrier.name = 'Close concrete street-circuit walls';
  for (let i = 0; i < positions.length; i++) {
    const { frame, side, i: segment } = positions[i];
    helper.position.copy(frame.point).addScaledVector(frame.across, side * (halfWidth + 1.85));
    helper.position.y = trackY + .48;
    helper.quaternion.copy(frame.quaternion);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    barrier.setMatrixAt(i, helper.matrix);
    const highlighted = segment % 19 === 0 || segment % 19 === 1;
    color.setHex(highlighted ? 0xa32c32 : (segment % 7 === 0 ? 0xc0c4c3 : 0x9ba3a8));
    barrier.setColorAt(i, color);
  }
  barrier.instanceMatrix.needsUpdate = true;
  barrier.instanceColor.needsUpdate = true;
  barrier.frustumCulled = false;
  barrier.receiveShadow = true;
  group.add(barrier);

  // Trackside catch fencing: one instanced post draw call and one line buffer
  // for the horizontal wires and sparse diagonal mesh. It sits behind the
  // concrete wall, away from the racing surface.
  const fenceStations = [];
  const fenceVertices = [];
  const fenceStep = 7.0;
  const fenceCount = Math.ceil(length / fenceStep);
  for (let i = 0; i < fenceCount; i++) {
    const frame = frameAt(i / fenceCount);
    const next = frameAt((i + 1) / fenceCount);
    const station = signedStation(i / fenceCount);
    for (const side of [-1, 1]) {
      if (side < 0 && station > pitEntry - 7 && station < pitExit + 7) continue;
      const lateral = side * (halfWidth + 2.58);
      const a = frame.point.clone().addScaledVector(frame.across, lateral);
      const b = next.point.clone().addScaledVector(next.across, lateral);
      a.y = b.y = trackY;
      fenceStations.push({ point: a, quaternion: frame.quaternion });
      for (const height of [1.18, 1.94, 2.70, 3.46, 4.22]) {
        fenceVertices.push(a.x, a.y + height, a.z, b.x, b.y + height, b.z);
      }
      for (let k = 0; k < 3; k++) {
        const from = 1.23 + k * 1.0;
        fenceVertices.push(a.x, a.y + from, a.z, b.x, b.y + from + .76, b.z);
      }
    }
  }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 4.25, .12),
    new THREE.MeshStandardMaterial({ color: 0x7d888b, roughness: .65,
      metalness: .3 }), fenceStations.length);
  posts.name = 'Catch-fence uprights';
  for (let i = 0; i < fenceStations.length; i++) {
    const item = fenceStations[i];
    helper.position.copy(item.point);
    helper.position.y += 2.16;
    helper.quaternion.copy(item.quaternion);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    posts.setMatrixAt(i, helper.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.frustumCulled = false;
  group.add(posts);
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fenceVertices, 3));
  const wires = new THREE.LineSegments(wireGeometry,
    new THREE.LineBasicMaterial({ color: 0x8b9ca7, transparent: true,
      opacity: .42, depthWrite: false }));
  wires.name = 'Catch-fence mesh and rails';
  group.add(wires);

  // Singapore's night race is lit from above rather than by a daytime sun.
  // One row of visible floodlight masts repeats around the lap. Only a few
  // real lights are needed around the grid and braking zones: hundreds of
  // shadow-casting point lights would make the replay unusable.
  const mastStep = 32;
  const mastCount = Math.ceil(length / mastStep);
  const masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.105, .16, 10.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x7a858b, metalness: .47,
      roughness: .58 }), mastCount);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, .22, 7.7),
    new THREE.MeshBasicMaterial({ color: 0xe4f2ff }), mastCount);
  const hoods = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, .17, 7.8),
    new THREE.MeshStandardMaterial({ color: 0x9daeb7, metalness: .34,
      roughness: .61 }), mastCount);
  masts.name = 'Singapore night-race floodlight masts';
  bars.name = 'Floodlight luminous runs';
  hoods.name = 'Floodlight metal hoods';
  for (let i = 0; i < mastCount; i++) {
    const frame = frameAt(i / mastCount);
    const side = i % 3 === 0 ? -1 : 1;
    const lateral = side * (halfWidth + 5.2);
    const base = frame.point.clone().addScaledVector(frame.across, lateral);
    helper.position.copy(base);
    helper.position.y = trackY + 5.1;
    helper.quaternion.copy(frame.quaternion);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    masts.setMatrixAt(i, helper.matrix);
    helper.position.y = trackY + 10.31;
    helper.position.addScaledVector(frame.across, -side * 2.0);
    helper.updateMatrix();
    bars.setMatrixAt(i, helper.matrix);
    helper.position.y += .17;
    helper.updateMatrix();
    hoods.setMatrixAt(i, helper.matrix);
  }
  for (const mesh of [masts, bars, hoods]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  const importantStations = [gridU, turnU(1), turnU(7), turnU(9), turnU(14), turnU(16), turnU(19)]
    .filter(Number.isFinite);
  for (const u of importantStations) {
    const frame = frameAt(u);
    const lamp = new THREE.PointLight(0xe5f5ff, 22, 115, 2);
    lamp.name = 'Night race local fill light';
    lamp.position.copy(frame.point).addScaledVector(frame.across, halfWidth + 2.5);
    lamp.position.y += 13;
    group.add(lamp);
  }

  const paint = new THREE.MeshBasicMaterial({ color: 0xd8ddda,
    transparent: true, opacity: .72, depthWrite: false,
    side: THREE.DoubleSide });
  const roadPaint = [];
  for (let i = 0; i < 155; i++) {
    const station = i * 32;
    // Sparse remnants of ordinary city-road lane paint are limited to straights.
    const u = (gridU + station / length) % 1;
    const a = frameAt(u), b = frameAt(u + 4.5 / length);
    const bend = a.forward.angleTo(b.forward);
    if (bend > .06) continue;
    const first = roadPaint.length / 3;
    for (const [frame, offset] of [[a, -.04], [a, .04], [b, -.04], [b, .04]]) {
      roadPaint.push(frame.point.x + frame.across.x * offset,
        frame.point.y + .024, frame.point.z + frame.across.z * offset);
    }
    // The geometry is stored as independent quads and indexed below.
  }
  if (roadPaint.length) {
    const indices = [];
    for (let i = 0; i < roadPaint.length / 12; i++) {
      const j = i * 4;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPaint, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const dashes = new THREE.Mesh(geometry, paint);
    dashes.name = 'Faded urban lane markings';
    group.add(dashes);
  }

  // Braking-distance boards on approaches to the major slow corners. These
  // visual boards are not telemetry or track survey data.
  const boardFace = new THREE.MeshBasicMaterial({ color: 0xe7e8df,
    side: THREE.DoubleSide });
  const boardPost = new THREE.MeshStandardMaterial({ color: 0x667277,
    metalness: .37, roughness: .63 });
  for (const corner of [1, 7, 14, 16]) {
    const apex = turnU(corner);
    if (!Number.isFinite(apex)) continue;
    for (const distance of [150, 100, 50]) {
      const frame = frameAt(apex - distance / length);
      const side = corner % 2 ? 1 : -1;
      const root = frame.point.clone().addScaledVector(frame.across,
        side * (halfWidth + 4.0));
      const sign = new THREE.Group();
      sign.position.copy(root);
      sign.quaternion.copy(frame.quaternion);
      sign.name = `${distance} m braking board for turn ${corner}`;
      const post = new THREE.Mesh(new THREE.BoxGeometry(.11, 2.9, .11), boardPost);
      post.position.y = 1.45;
      sign.add(post);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.95), boardFace);
      board.position.set(0, 2.9, 0);
      board.rotation.y = Math.PI;
      sign.add(board);
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 96; canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f2f1e9'; ctx.fillRect(0, 0, 96, 120);
        ctx.fillStyle = '#202b2f'; ctx.textAlign = 'center';
        ctx.font = '800 45px Arial, sans-serif';
        ctx.fillText(String(distance), 48, 76);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        board.material = new THREE.MeshBasicMaterial({ map: texture,
          side: THREE.DoubleSide });
      }
      group.add(sign);
    }
  }

  return { group, barrierCount: positions.length, fencePostCount: fenceStations.length,
    floodlightCount: mastCount };
}
