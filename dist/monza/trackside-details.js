/**
 * Small trackside elements, kept separate from the terrain and circuit mesh.
 * Distances are metres; the centreline uses arc-length-normalised curve values.
 */
export function addTracksideDetails(THREE, scene, curve, polyline, landmarks, trackY = .30, terrainHeightAt = () => 0) {
  const group = new THREE.Group();
  group.name = 'Monza trackside details';
  scene.add(group);

  const length = curve.getLength();
  const up = new THREE.Vector3(0, 1, 0);
  const local = new THREE.Object3D();
  const dark = new THREE.MeshStandardMaterial({ color: 0x18211f, roughness: .79, metalness: .16 });
  const paintedSteel = new THREE.MeshStandardMaterial({ color: 0xdbded8, roughness: .55, metalness: .31 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb42128, roughness: .66 });
  const green = new THREE.MeshStandardMaterial({ color: 0x238044, roughness: .8 });

  const pointAt = (u) => {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    const forward = curve.getTangentAt(wrapped).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    return { point, forward, across };
  };
  const indexToU = (index) => {
    let travelled = 0;
    let total = 0;
    for (let i = 0; i < polyline.length; i++) {
      const segment = polyline[i].distanceTo(polyline[(i + 1) % polyline.length]);
      total += segment;
      if (i < index) travelled += segment;
    }
    return total ? travelled / total : 0;
  };
  const turnU = (key) => indexToU(landmarks.turns[key].index);

  // Low-contrast rubber marks sit just above the asphalt. Two slender ribbons
  // convey the racing line without turning the circuit into a dark stripe.
  const rubberPositions = [];
  const rubberIndices = [];
  for (const [key, before, after] of [
    ['T1', 175, 28], ['T4', 130, 22], ['T6', 105, 18],
    ['T8', 130, 25], ['T11', 170, 28],
  ]) {
    const apex = turnU(key);
    const start = apex - before / length;
    const end = apex + after / length;
    const count = Math.ceil((before + after) / 4);
    for (const wheelLine of [-.74, .74]) {
      for (let i = 0; i < count; i++) {
        const a = pointAt(start + (end - start) * i / count);
        const b = pointAt(start + (end - start) * (i + 1) / count);
        const swayA = Math.sin(i * .17 + wheelLine) * .09;
        const swayB = Math.sin((i + 1) * .17 + wheelLine) * .09;
        const base = rubberPositions.length / 3;
        for (const [sample, center, width] of [
          [a, wheelLine + swayA, -.11], [a, wheelLine + swayA, .11],
          [b, wheelLine + swayB, -.11], [b, wheelLine + swayB, .11],
        ]) {
          const p = sample.point.clone().addScaledVector(sample.across, center + width);
          rubberPositions.push(p.x, sample.point.y + .042, p.z);
        }
        rubberIndices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  const rubberGeometry = new THREE.BufferGeometry();
  rubberGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rubberPositions, 3));
  rubberGeometry.setIndex(rubberIndices);
  rubberGeometry.computeVertexNormals();
  const rubber = new THREE.Mesh(rubberGeometry, new THREE.MeshBasicMaterial({
    color: 0x111715, transparent: true, opacity: .24,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  }));
  rubber.name = 'Rubber laid down in braking zones';
  rubber.renderOrder = 2;
  group.add(rubber);

  // White braking boards are readable from the driver's approach. Their
  // locations are approximate visual cues, not timing or telemetry data.
  const markerMaterials = new Map();
  const markerGeometry = new THREE.PlaneGeometry(1.9, 2.45);
  const postGeometry = new THREE.BoxGeometry(.13, 2.7, .16);
  for (const [key, side, distances] of [
    ['T1', -1, [200, 150, 100, 50]],
    ['T4', 1, [150, 100, 50]],
    ['T8', 1, [150, 100, 50]],
    ['T11', -1, [150, 100, 50]],
  ]) {
    const apex = turnU(key);
    for (const metres of distances) {
      const frame = pointAt(apex - metres / length);
      const position = frame.point.clone().addScaledVector(frame.across, side * 15.9);
      position.y = terrainHeightAt(position.x, position.z);
      const boardGroup = new THREE.Group();
      boardGroup.position.copy(position);
      const boardBasis = new THREE.Matrix4().makeBasis(frame.across.clone().negate(), up, frame.forward.clone().negate());
      boardGroup.quaternion.setFromRotationMatrix(boardBasis);
      const post = new THREE.Mesh(postGeometry, paintedSteel);
      post.position.y = 1.35;
      boardGroup.add(post);
      if (!markerMaterials.has(metres)) {
        markerMaterials.set(metres, new THREE.MeshBasicMaterial({
          map: boardTexture(THREE, metres), side: THREE.DoubleSide,
        }));
      }
      const board = new THREE.Mesh(markerGeometry, markerMaterials.get(metres));
      board.position.set(0, 2.72, -.11);
      board.name = `${metres} m braking marker`;
      boardGroup.add(board);
      group.add(boardGroup);
    }
  }

  // A single overhead landmark on the long run toward Ascari makes the
  // circuit easier to read both from the air and from the chase camera.
  const portalAt = pointAt(turnU('T7') + 155 / length);
  const portal = new THREE.Group();
  portal.name = 'Monza circuit bridge';
  portal.position.copy(portalAt.point);
  portal.position.y = terrainHeightAt(portal.position.x, portal.position.z);
  portal.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(portalAt.across, up, portalAt.forward));
  group.add(portal);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(24.7, 2.35, 1.2), dark);
  beam.position.y = 8.3;
  beam.castShadow = true;
  portal.add(beam);
  for (const x of [-11.8, 11.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.75, 7.5, 1), paintedSteel);
    leg.position.set(x, 3.75, 0);
    leg.castShadow = true;
    portal.add(leg);
    const redBase = new THREE.Mesh(new THREE.BoxGeometry(1.25, .8, 1.48), red);
    redBase.position.set(x, .4, 0);
    portal.add(redBase);
  }
  const portalMaterial = new THREE.MeshBasicMaterial({ map: portalTexture(THREE), side: THREE.DoubleSide });
  for (const facing of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(23.4, 1.78), portalMaterial);
    sign.position.set(0, 8.37, facing * .64);
    if (facing < 0) sign.rotation.y = Math.PI;
    portal.add(sign);
  }

  // A few compact tyre walls protect selected corner exits. Instancing keeps
  // the visual detail cheap even in the aerial view.
  const tyreLayout = [];
  for (const [key, side, stacks] of [
    ['T1', 1, 10], ['T4', -1, 7], ['T6', 1, 7],
    ['T8', -1, 9], ['T11', 1, 11],
  ]) {
    const apex = turnU(key);
    for (let i = 0; i < stacks; i++) {
      const frame = pointAt(apex + ((i - (stacks - 1) / 2) * 1.28) / length);
      const center = frame.point.clone().addScaledVector(frame.across, side * 24.1);
      const ground = terrainHeightAt(center.x, center.z);
      for (let tier = 0; tier < 4; tier++) tyreLayout.push([center.x, ground + .25 + tier * .31, center.z, i, tier]);
    }
  }
  const tyres = new THREE.InstancedMesh(
    new THREE.TorusGeometry(.47, .15, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x232a29, roughness: 1, metalness: .03 }),
    tyreLayout.length,
  );
  const tyreColor = new THREE.Color();
  local.rotation.set(-Math.PI / 2, 0, 0);
  for (let i = 0; i < tyreLayout.length; i++) {
    const [x, y, z, stack, tier] = tyreLayout[i];
    local.position.set(x, y, z);
    local.scale.setScalar(.94 + ((stack + tier) % 4) * .025);
    local.updateMatrix();
    tyres.setMatrixAt(i, local.matrix);
    tyreColor.setHex((stack + tier) % 5 === 0 ? 0x303534 : 0x1c2221);
    tyres.setColorAt(i, tyreColor);
  }
  tyres.instanceMatrix.needsUpdate = true;
  tyres.instanceColor.needsUpdate = true;
  tyres.frustumCulled = false;
  tyres.name = 'Corner tyre barriers';
  group.add(tyres);

  // Catch fencing follows the outside of the main braking areas. All wires
  // share one geometry and the posts one instanced draw call.
  const fenceLines = [];
  const fencePosts = [];
  const fenceZones = [
    ['T1', -1, -145, 75], ['T4', 1, -105, 65],
    ['T8', 1, -115, 92], ['T11', -1, -150, 115],
  ];
  for (const [key, side, startMetres, endMetres] of fenceZones) {
    const apex = turnU(key);
    const count = Math.ceil((endMetres - startMetres) / 3);
    let previous = null;
    for (let i = 0; i <= count; i++) {
      const offsetMetres = startMetres + (endMetres - startMetres) * i / count;
      const frame = pointAt(apex + offsetMetres / length);
      const p = frame.point.clone().addScaledVector(frame.across, side * 31.3);
      const ground = terrainHeightAt(p.x, p.z);
      if (i % 2 === 0) fencePosts.push([p.x, ground, p.z]);
      fenceLines.push(p.x, ground + .34, p.z, p.x, ground + 4.15, p.z);
      if (previous) {
        for (const offsetY of [.38, 1.15, 1.92, 2.69, 3.46, 4.13]) {
          fenceLines.push(previous.x, previous.y + offsetY, previous.z, p.x, ground + offsetY, p.z);
        }
      }
      previous = { x: p.x, y: ground, z: p.z };
    }
  }
  const wiresGeometry = new THREE.BufferGeometry();
  wiresGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fenceLines, 3));
  const wires = new THREE.LineSegments(wiresGeometry, new THREE.LineBasicMaterial({
    color: 0x9ca8a4, transparent: true, opacity: .58, depthWrite: false,
  }));
  wires.name = 'Catch fencing at braking zones';
  group.add(wires);
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(.12, 4.28, .12), paintedSteel, fencePosts.length,
  );
  for (let i = 0; i < fencePosts.length; i++) {
    local.position.set(fencePosts[i][0], fencePosts[i][1] + 2.14, fencePosts[i][2]);
    local.rotation.set(0, 0, 0);
    local.scale.setScalar(1);
    local.updateMatrix();
    posts.setMatrixAt(i, local.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.frustumCulled = false;
  posts.name = 'Catch fence posts';
  group.add(posts);

  // Small coloured panels along the outer wall give each section a familiar
  // Grand Prix rhythm, with legible lettering at low camera angles.
  const panelMaterials = [
    new THREE.MeshBasicMaterial({ map: panelTexture(THREE, 'MONZA', '#a42128'), side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ map: panelTexture(THREE, 'ITALIA', '#197044'), side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ map: panelTexture(THREE, 'AUTODROMO', '#1a2422'), side: THREE.DoubleSide }),
  ];
  const panelGeometry = new THREE.PlaneGeometry(6, 1.42);
  let panelIndex = 0;
  for (const [key, side, startMetres, endMetres] of fenceZones) {
    const apex = turnU(key);
    for (let offsetMetres = startMetres + 18; offsetMetres < endMetres - 12; offsetMetres += 27) {
      const frame = pointAt(apex + offsetMetres / length);
      const board = new THREE.Mesh(panelGeometry, panelMaterials[panelIndex++ % panelMaterials.length]);
      board.position.copy(frame.point).addScaledVector(frame.across, side * 27.5);
      board.position.y = terrainHeightAt(board.position.x, board.position.z) + 1.8;
      board.lookAt(frame.point.x, board.position.y, frame.point.z);
      board.name = 'Trackside Monza panel';
      group.add(board);
    }
  }

  // A compact timing tower gives the start area a clear vertical silhouette.
  const grid = pointAt(indexToU(landmarks.gridIndex || 0));
  const tower = new THREE.Group();
  tower.name = 'Start straight timing tower';
  tower.position.copy(grid.point).addScaledVector(grid.across, 67);
  tower.position.y = terrainHeightAt(tower.position.x, tower.position.z);
  tower.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(grid.across, up, grid.forward));
  group.add(tower);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(7.2, 26, 4.2), dark);
  shaft.position.y = 13;
  shaft.castShadow = true;
  tower.add(shaft);
  const towerFace = new THREE.Mesh(
    new THREE.PlaneGeometry(6.25, 19),
    new THREE.MeshBasicMaterial({ map: towerTexture(THREE), side: THREE.DoubleSide }),
  );
  towerFace.position.set(0, 14.4, -2.15);
  towerFace.rotation.y = Math.PI;
  tower.add(towerFace);
  for (const [i, material] of [red, paintedSteel, green].entries()) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.05, 4.35), material);
    band.position.y = 24.7 + i * 1.05;
    tower.add(band);
  }

  return group;
}

function boardTexture(THREE, metres) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f1e9';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#ba262c';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#17201e';
  ctx.font = '900 135px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(metres), 128, 179, 241);
  ctx.font = '700 26px Arial, sans-serif';
  ctx.fillText('METRI', 128, 276);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function portalTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ac1f27';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, 1024, 8);
  ctx.fillRect(0, 120, 1024, 8);
  for (const baseX of [22, 890]) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if ((row + col) % 2 === 0) ctx.fillRect(baseX + col * 30, 19 + row * 30, 30, 30);
      }
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 79px Arial, sans-serif';
  ctx.fillText('MONZA', 512, 62);
  ctx.font = '700 18px Arial, sans-serif';
  ctx.fillText('AUTODROMO NAZIONALE', 512, 108);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function towerTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#131c1a';
  ctx.fillRect(0, 0, 192, 512);
  ctx.fillStyle = '#cf3030';
  ctx.fillRect(0, 0, 192, 12);
  ctx.fillStyle = '#f5f4eb';
  ctx.textAlign = 'center';
  ctx.font = '900 42px Arial, sans-serif';
  ctx.fillText('MONZA', 96, 70, 180);
  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillText('RACE CONTROL', 96, 109, 181);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ddded4' : '#87918b';
    ctx.fillRect(28, 146 + i * 39, 136, 2);
    ctx.fillStyle = '#e7e9df';
    ctx.fillRect(38, 157 + i * 39, 15, 12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function panelTexture(THREE, label, background) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#e8e8db';
  ctx.fillRect(0, 0, 512, 7);
  ctx.fillRect(0, 121, 512, 7);
  ctx.font = `900 ${label.length > 8 ? 58 : 78}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64, 486);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
