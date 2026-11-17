import { sculptPlaneToTrack } from '../terrain-follow.js';
import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { prepareShanghaiCurve } from './geometry-smoothing.js';
import { addShanghaiEnvironment } from './environment.js';
import { createShanghaiSurfaces, addShanghaiSafety } from './track-surface.js';

const wrap01 = value => ((value % 1) + 1) % 1;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value, 1664525) + 1013904223 >>> 0) / 4294967296);
}

function asphaltTexture(THREE, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(256, 256);
  const random = seededRandom(seed);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - .5) * 20;
    pixels.data[i] = 72 + grain;
    pixels.data[i + 1] = 75 + grain;
    pixels.data[i + 2] = 78 + grain;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createRibbon(THREE, parent, name, frames, from, to, material, height = 0) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = frames.length;
  for (let i = 0; i < count - 1; i++) {
    const next = i + 1;
    const offset = positions.length / 3;
    for (const [frame, across, v] of [
      [frames[i], from, 0], [frames[i], to, 1],
      [frames[next], from, 0], [frames[next], to, 1],
    ]) {
      positions.push(frame.point.x + frame.across.x * across,
        frame.point.y + height,
        frame.point.z + frame.across.z * across);
      uvs.push(i / 8, v);
    }
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createSegmentRibbon(THREE, parent, name, curve, centreU, halfLength,
  from, to, material, height = .025) {
  const segments = 14;
  const frames = [];
  for (let i = 0; i <= segments; i++) {
    const u = wrap01(centreU + (i / segments * 2 - 1) * halfLength);
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    frames.push({ point, across: new THREE.Vector3(forward.z, 0, -forward.x) });
  }
  return createRibbon(THREE, parent, name, frames, from, to, material, height);
}

function addGrid(THREE, group, curve, gridU, halfWidth, config) {
  const white = new THREE.MeshBasicMaterial({ color: 0xf6f4e9, side: THREE.DoubleSide });
  const line = createSegmentRibbon(THREE, group, `${config.name} start line`, curve,
    gridU, .18 / config.length, -halfWidth + .25, halfWidth - .25, white, .045);
  line.renderOrder = 4;
  const paint = new THREE.Group();
  paint.name = `${config.name} starting grid`;
  group.add(paint);
  for (let slot = 0; slot < 22; slot++) {
    const station = 14.1 + slot * config.gridSpacing;
    const u = wrap01(gridU - station / config.length);
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const lane = slot % 2 ? -config.gridLane : config.gridLane;
    const box = new THREE.Group();
    box.name = `Grid box ${slot + 1}`;
    box.position.copy(point).addScaledVector(across, lane);
    box.position.y += .04;
    box.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,
      new THREE.Vector3(0, 1, 0), forward));
    for (const [x, z, width, depth] of [[-1.17,0,.12,5.6],[1.17,0,.12,5.6],[0,2.75,2.45,.12]]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), white);
      stripe.rotation.x = -Math.PI / 2; stripe.position.set(x, 0, z); box.add(stripe);
    }
    paint.add(box);
  }
}

export function createShanghaiWorld(THREE, scene) {
 const config={name:'Shanghai International Circuit',groundColor:0x63805a,shoulderColor:0x555e60,curbColor:0xc72e3e,accent:0xc43d47,seed:20260315,urban:false,finishBeforeStart:190,gridSpacing:8,gridLane:2.4,pitSide:1,TRACK_POINTS,TRACK_LENGTH_METERS,TRACK_WIDTH_METERS,LANDMARKS,prepareCurve:prepareShanghaiCurve};
  const prepareCurve = config.prepareCurve;
  if (TRACK_POINTS.length < 100 || TRACK_POINTS[0][0] !== TRACK_POINTS.at(-1)[0]
    || TRACK_POINTS[0][1] !== TRACK_POINTS.at(-1)[1]) {
    throw new Error(`Le tracé de ${config.name} est incomplet.`);
  }
  // TRACK_POINTS already use the source chirality. Do not mirror this array.
  const { curve, sourcePoints } = prepareCurve(THREE, TRACK_POINTS, TRACK_LENGTH_METERS);
  const sampleCount = Math.max(1400, Math.round(TRACK_LENGTH_METERS / 3.2));
  const samples = Array.from({ length: sampleCount }, (_, i) => curve.getPointAt(i / sampleCount));
  const frames = samples.map((point, i) => {
    const forward = curve.getTangentAt(i / sampleCount).setY(0).normalize();
    return { station: i / sampleCount * TRACK_LENGTH_METERS, u: i / sampleCount, point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  });
  const half = TRACK_WIDTH_METERS / 2;
  const trackBounds = new THREE.Box3().setFromPoints(samples);
  const size = trackBounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  const venue = new THREE.Group();
  venue.name = `${config.name} 2026 venue`;
  scene.add(venue);

  // Shanghai sits on a broad, nearly level plain. Continue the venue ground
  // well beyond the camera's far plane so the overview never exposes the
  // finite, sculpted terrain's rectangular perimeter against the sky.
  const distantGround = new THREE.Mesh(new THREE.CircleGeometry(14000, 96),
    new THREE.MeshStandardMaterial({ color: config.groundColor, roughness: 1 }));
  distantGround.name = 'Shanghai distant plain to the horizon';
  distantGround.rotation.x = -Math.PI / 2;
  distantGround.position.set(trackBounds.getCenter(new THREE.Vector3()).x, -4,
    trackBounds.getCenter(new THREE.Vector3()).z);
  distantGround.receiveShadow = true;
  venue.add(distantGround);

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: config.groundColor, roughness: .98, metalness: 0, vertexColors: false,
  });
  const groundGeometry = sculptPlaneToTrack(
    new THREE.PlaneGeometry(span + 1900, span + 1900, 128, 128), samples,
    { baseHeight: -.45, roadClearance: .62, innerRadius: 62, outerRadius: 760, sampleStep: 9 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.name = `${config.name} terrain following the documented relief`;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  venue.add(ground);

  const terrainVertices = groundGeometry.attributes.position;
  const columns = groundGeometry.parameters.widthSegments + 1, lastCell = columns - 2;
  const x0 = terrainVertices.getX(0), z0 = -terrainVertices.getY(0);
  const dx = terrainVertices.getX(1) - x0, dz = -terrainVertices.getY(columns) - z0;
  const groundHeightAt = (x, z) => {
    const ux = (x - x0) / dx, uz = (z - z0) / dz;
    if (ux < 0 || uz < 0 || ux > columns - 1 || uz > columns - 1) return -.45;
    const ix = Math.min(lastCell, Math.floor(ux)), iz = Math.min(lastCell, Math.floor(uz));
    const tx = ux - ix, tz = uz - iz, a = iz * columns + ix;
    const y00 = terrainVertices.getZ(a), y10 = terrainVertices.getZ(a + 1);
    const y01 = terrainVertices.getZ(a + columns), y11 = terrainVertices.getZ(a + columns + 1);
    return tx + tz <= 1 ? y00 + tx * (y10 - y00) + tz * (y01 - y00)
      : y11 + (1 - tx) * (y01 - y11) + (1 - tz) * (y10 - y11);
  };

  const surfaces = createShanghaiSurfaces(THREE, venue, curve, frames, asphaltTexture(THREE, config.seed));
  const { asphalt, overviewAccent } = surfaces;
  // Nearby sections have different heights. Nearest-road terrain alone let
  // the higher T15 return lift the ground through the back straight by 39cm.
  // Bound every terrain cell under a drivable/runoff vertex to that surface's
  // lowest height. The denser mesh keeps this correction local and continuous.
  venue.traverse(mesh => {
    if (!mesh.userData.strip) return;
    const vertices = mesh.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const ix = Math.max(0, Math.min(lastCell, Math.floor((vertices.getX(i) - x0) / dx)));
      const iz = Math.max(0, Math.min(lastCell, Math.floor((vertices.getZ(i) - z0) / dz)));
      const a = iz * columns + ix, ceiling = vertices.getY(i) - .35;
      for (const cell of [a, a + 1, a + columns, a + columns + 1])
        terrainVertices.setZ(cell, Math.min(terrainVertices.getZ(cell), ceiling));
    }
  });
  terrainVertices.needsUpdate = true;
  groundGeometry.computeVertexNormals();
  const safety = addShanghaiSafety(THREE, venue, curve, frames, surfaces.edgeWidths, groundHeightAt);

  const gridU = wrap01(config.finishBeforeStart / TRACK_LENGTH_METERS);
  addGrid(THREE, venue, curve, gridU, half, { ...config, length: TRACK_LENGTH_METERS });





  const environment = addShanghaiEnvironment(THREE, venue, curve, samples, trackBounds, groundHeightAt);
  const gridPoint = curve.getPointAt(gridU);
  const gridTangent = curve.getTangentAt(gridU).setY(0).normalize();
  const bounds = trackBounds.clone().expandByScalar(config.urban ? 320 : 240);
  const trackHeightAt = (u, x, z) => {
    const point = curve.getPointAt(wrap01(u));
    if (!Number.isFinite(x) || !Number.isFinite(z)) return point.y;
    const tangent = curve.getTangentAt(wrap01(u));
    const grade = tangent.y / Math.max(.01, Math.hypot(tangent.x, tangent.z));
    return point.y + ((x - point.x) * tangent.x + (z - point.z) * tangent.z) * grade;
  };
  return {
    curve, samples, trackHeightAt, bounds, gridU, gridPoint, gridTangent,
    trackMaterial: asphalt, overviewAccent,
    environment,
    trackside: { group: venue, updateLighting() {}, setWetLighting() {} },
    sourcePoints, surfaces, safety, groundHeightAt,
  };
}
