import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { addAustinEnvironment } from './environment.js';
import { addAustinGridDetails } from './grid-details.js';
import { addAustinTrackside } from './trackside-details.js';
import { prepareAustinCurve } from './geometry-smoothing.js';

// The FIA map fixes the plan-view centreline and corner order. The elevation
// profile models COTA's climb to T1; widths and runoff depths are estimated.
const SAMPLE_COUNT = 3308;

function textureFromPixels(THREE, size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  paint(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value, 1664525) + 1013904223 >>> 0) / 4294967296);
}

function asphaltTexture(THREE) {
  const random = seededRandom(2075);
  return textureFromPixels(THREE, 384, (ctx, size) => {
    const pixels = ctx.createImageData(size, size);
    const patches = Float32Array.from({ length: 13 * 13 }, () => random() - .5);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const ix = Math.min(11, Math.floor(x / size * 12));
      const iy = Math.min(11, Math.floor(y / size * 12));
      const value = 79 + patches[iy * 13 + ix] * 11 + (random() - .5) * 25;
      const index = (y * size + x) * 4;
      pixels.data[index] = value * .96;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value * 1.025;
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = random() < .7 ? 'rgba(9,14,17,.12)' : 'rgba(165,173,175,.065)';
      ctx.fillRect(random() * size, random() * size, .4 + random() * 2, 3 + random() * 17);
    }
  });
}

function curbTexture(THREE) {
  return textureFromPixels(THREE, 128, (ctx, size) => {
    ctx.fillStyle = '#e4e2dc';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#b51f31';
    for (let y = 0; y < size; y += 32) ctx.fillRect(0, y, size, 16);
    ctx.fillStyle = 'rgba(25,30,29,.12)';
    for (let y = 0; y < size; y += 16) ctx.fillRect(0, y, size, 1);
  });
}

function wrappedDelta(a, b) {
  let delta = a - b;
  if (delta > .5) delta -= 1;
  if (delta < -.5) delta += 1;
  return delta;
}

function createRibbon(THREE, scene, name, frames, distances, from, to, material, options = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const n = frames.length;
  const height = options.height ?? 0;
  const repeatMetres = options.repeatMetres ?? 12;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (options.include && !options.include(u)) continue;
    const j = (i + 1) % n;
    const nextU = j / n;
    const a = frames[i], b = frames[j];
    const fromA = typeof from === 'function' ? from(u) : from;
    const toA = typeof to === 'function' ? to(u) : to;
    const fromB = typeof from === 'function' ? from(nextU) : from;
    const toB = typeof to === 'function' ? to(nextU) : to;
    const first = positions.length / 3;
    for (const [frame, offset] of [[a, fromA], [a, toA], [b, fromB], [b, toB]]) {
      positions.push(frame.point.x + frame.across.x * offset, frame.point.y + height,
        frame.point.z + frame.across.z * offset);
      normals.push(0, 1, 0);
    }
    const v0 = distances[i] / repeatMetres;
    const v1 = (distances[i] + a.point.distanceTo(b.point)) / repeatMetres;
    uvs.push(0, v0, 1, v0, 0, v1, 1, v1);
    indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function distanceFractions(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i - 1].distanceTo(points[i]));
  const total = lengths.at(-1) + points.at(-1).distanceTo(points[0]);
  return { fractions: lengths.map(value => value / total), total };
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

// The terrain follows the elevated road without cutting through the tarmac.
// A coarse mesh is enough for the open Texas landscape and limits draw cost.
function addRollingTerrain(THREE, scene, samples) {
  const measured = samples.filter((_, index) => index % 19 === 0);
  const box = new THREE.Box3().setFromPoints(samples);
  const margin = 390;
  const minX = box.min.x - margin, maxX = box.max.x + margin;
  const minZ = box.min.z - margin, maxZ = box.max.z + margin;
  const nx = Math.ceil((maxX - minX) / 26);
  const nz = Math.ceil((maxZ - minZ) / 26);
  const stepX = (maxX - minX) / nx, stepZ = (maxZ - minZ) / nz;
  const base = Math.min(...measured.map(point => point.y)) - 5;
  const plainColor = new THREE.Color().setRGB(.24 * .82, .37 * .82, .20 * .82);
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(18000, 18000),
    new THREE.MeshStandardMaterial({ color: plainColor, roughness: 1 }));
  plain.name = 'Texas landscape to the horizon';
  plain.rotation.x = -Math.PI / 2;
  plain.position.set((minX + maxX) / 2, base - .035, (minZ + maxZ) / 2);
  plain.receiveShadow = true;
  scene.add(plain);
  const positions = [], colors = [], indices = [];
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = minX + ix * stepX, z = minZ + iz * stepZ;
    let distanceSquared = Infinity;
    let nearHeight = base;
    for (let k = 0; k < measured.length; k++) {
      const a = measured[k], b = measured[(k + 1) % measured.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const blend = Math.max(0, Math.min(1,
        ((x - a.x) * dx + (z - a.z) * dz) / Math.max(.001, dx * dx + dz * dz)));
      const px = a.x + blend * dx, pz = a.z + blend * dz;
      const square = (x - px) ** 2 + (z - pz) ** 2;
      if (square < distanceSquared) {
        distanceSquared = square;
        nearHeight = a.y + blend * (b.y - a.y);
      }
    }
    const distance = Math.sqrt(distanceSquared);
    const edgeDistance = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    const edgeFade = smoothstep(edgeDistance / 145);
    const undulation = (Math.sin(x * .0041) * Math.cos(z * .0037) * 1.6
      + Math.sin((x + z) * .0022)) * edgeFade;
    const far = base + undulation;
    const bank = nearHeight - .72 - Math.min(8, Math.max(0, distance - 14) * .039);
    const following = 1 - smoothstep((distance - 14) / 270);
    positions.push(x, far * (1 - following) + bank * following, z);
    const tint = .82 + edgeFade * (.14 * Math.sin(x * .007 + z * .011)
      + .06 * Math.cos(z * .019));
    colors.push(.24 * tint, .37 * tint, .20 * tint);
    if (ix < nx && iz < nz) {
      const a = iz * (nx + 1) + ix, b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'COTA rolling Texas terrain';
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createAustinWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('Le tracé d’Austin est incomplet.');
  }
  const { curve, sourcePoints } = prepareAustinCurve(THREE, TRACK_POINTS,
    TRACK_LENGTH_METERS);
  const { fractions: sourceFractions } = distanceFractions(sourcePoints);
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => curve.getPointAt(i / SAMPLE_COUNT));
  const frames = samples.map((point, i) => {
    // Use the curve derivative, as the replay cars and trackside props do.
    // A chord through neighbouring samples diverged by up to 6.8 degrees at
    // the sharpest corners, amplifying bends in offset edge lines and walls.
    const forward = curve.getTangentAt(i / SAMPLE_COUNT).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  });
  const distances = [0];
  for (let i = 1; i < SAMPLE_COUNT; i++) distances.push(distances[i - 1] + samples[i - 1].distanceTo(samples[i]));
  const half = Math.max(6, Math.min(8.8, Number(TRACK_WIDTH_METERS || 14) / 2));
  // Preserve straight road edges; an invented varying width introduces waves.
  const roadHalfWidthAt = () => half;

  addRollingTerrain(THREE, scene, samples);

  const shoulder = new THREE.MeshStandardMaterial({ color: 0x485057, roughness: .94, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xd8d9d9,
    roughness: .91, metalness: .015, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xe9e8e2, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), color: 0xffffff,
    roughness: .87, side: THREE.DoubleSide });
  const blueRunoff = new THREE.MeshStandardMaterial({ color: 0x315077, roughness: .97,
    side: THREE.DoubleSide });
  const redRunoff = new THREE.MeshStandardMaterial({ color: 0xa23a45, roughness: .97,
    side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x3f6986, transparent: true,
    opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  createRibbon(THREE, scene, 'COTA paved shoulder', frames, distances,
    -half - 11, half + 11, shoulder, { height: -.16, repeatMetres: 18 });
  createRibbon(THREE, scene, 'Overview circuit silhouette', frames, distances,
    -half - 5.5, half + 5.5, overviewAccent, { height: .009 });
  createRibbon(THREE, scene, 'Circuit of The Americas racing surface', frames, distances,
    u => -roadHalfWidthAt(u), roadHalfWidthAt, asphalt, { repeatMetres: 10 });
  createRibbon(THREE, scene, 'COTA left track-limit line', frames, distances,
    u => -roadHalfWidthAt(u) + .08, u => -roadHalfWidthAt(u) + .21,
    white, { height: .018 });
  createRibbon(THREE, scene, 'COTA right track-limit line', frames, distances,
    u => roadHalfWidthAt(u) - .21, u => roadHalfWidthAt(u) - .08,
    white, { height: .018 });

  // Low striped kerbs and broad paved exits use the same frames as the cars.
  const turns = LANDMARKS?.turns || {};
  for (let corner = 1; corner <= 20; corner++) {
    const info = turns[`T${corner}`];
    if (!info || !Number.isInteger(info.index)) continue;
    const u = sourceFractions[info.index] ?? 0;
    const before = curve.getTangentAt((u - .006 + 1) % 1).setY(0).normalize();
    const after = curve.getTangentAt((u + .006) % 1).setY(0).normalize();
    const clockwise = before.x * after.z - before.z * after.x < 0;
    const side = clockwise ? 1 : -1;
    const include = t => Math.abs(wrappedDelta(t, u)) * TRACK_LENGTH_METERS < (corner === 1 ? 85 : 46);
    const outside = -side;
    createRibbon(THREE, scene, `COTA turn ${corner} paved runoff`, frames, distances,
      t => outside * (roadHalfWidthAt(t) + .75),
      t => outside * (roadHalfWidthAt(t) + (corner === 1 || corner === 12 ? 35 : 19)),
      blueRunoff, { include, height: -.037 });
    createRibbon(THREE, scene, `COTA turn ${corner} red runoff stripe`, frames, distances,
      t => outside * (roadHalfWidthAt(t) + (corner === 1 || corner === 12 ? 22 : 12)),
      t => outside * (roadHalfWidthAt(t) + (corner === 1 || corner === 12 ? 25 : 14)),
      redRunoff, { include, height: -.023 });
    createRibbon(THREE, scene, `Turn ${corner} striped inside kerb`, frames, distances,
      t => side * (roadHalfWidthAt(t) + .025),
      t => side * (roadHalfWidthAt(t) + 1.05), curb,
      { include, height: .027, repeatMetres: 3.2 });
  }

  const grid = addAustinGridDetails(THREE, scene, curve, sourcePoints, LANDMARKS, 0, half);
  const trackside = addAustinTrackside(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions, pitSide: -1 });
  const environment = addAustinEnvironment(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions, pitSide: -1 });
  const bounds = new THREE.Box3().setFromPoints(samples).expandByScalar(180);
  const trackHeightAt = (u, x, z) => {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return point.y;
    const tangent = curve.getTangentAt(wrapped);
    const grade = tangent.y / Math.max(.01, Math.hypot(tangent.x, tangent.z));
    return point.y + ((x - point.x) * tangent.x + (z - point.z) * tangent.z) * grade;
  };
  return {
    curve, samples, trackHeightAt, bounds,
    gridU: grid.gridU, gridPoint: grid.gridPoint, gridTangent: grid.gridTangent,
    trackMaterial: asphalt, overviewAccent,
    environment, trackside,
  };
}
