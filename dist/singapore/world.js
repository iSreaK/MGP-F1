import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { addSingaporeEnvironment } from './environment.js';
import { addSingaporeGridDetails } from './grid-details.js';
import { addSingaporeTrackside } from './trackside-details.js';
import { prepareSingaporeCurve } from './geometry-smoothing.js';

// The FIA map fixes the centreline length and corner order. The source outline
// does not contain a surveyed carriageway width or street elevations, so those
// dimensions remain visual approximations. Everything here is in metres.
const TRACK_Y = .36;
const SAMPLE_COUNT = 2048;

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
      const value = 70 + patches[iy * 13 + ix] * 12 + (random() - .5) * 26;
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
    ctx.fillStyle = '#dddcd8';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#a21d24';
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

export function createSingaporeWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('Le tracé de Singapour est incomplet.');
  }
  const { curve, sourcePoints } = prepareSingaporeCurve(THREE, TRACK_POINTS,
    TRACK_LENGTH_METERS);
  const { fractions: sourceFractions } = distanceFractions(sourcePoints);
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => curve.getPointAt(i / SAMPLE_COUNT));
  const frames = samples.map((point, i) => {
    const before = samples[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const after = samples[(i + 1) % SAMPLE_COUNT];
    const forward = after.clone().sub(before).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  });
  const distances = [0];
  for (let i = 1; i < SAMPLE_COUNT; i++) distances.push(distances[i - 1] + samples[i - 1].distanceTo(samples[i]));
  const half = Math.max(4.5, Math.min(6.0, Number(TRACK_WIDTH_METERS || 10.5) / 2));

  const street = new THREE.MeshBasicMaterial({ color: 0x252b32, side: THREE.DoubleSide });
  const urbanGround = new THREE.Mesh(new THREE.PlaneGeometry(6500, 6500), street);
  urbanGround.name = 'Urban road and paved ground beyond the circuit';
  urbanGround.rotation.x = -Math.PI / 2;
  urbanGround.position.y = -.045;
  urbanGround.receiveShadow = true;
  scene.add(urbanGround);

  const shoulder = new THREE.MeshStandardMaterial({ color: 0x555d63, roughness: .94, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xd8dce0,
    roughness: .91, metalness: .015, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xd9e0df, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), color: 0xffffff,
    roughness: .87, side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x101922, transparent: true,
    opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  createRibbon(THREE, scene, 'Street pavement beside Singapore circuit', frames, distances,
    -half - 9.6, half + 9.6, shoulder, { height: -.17, repeatMetres: 18 });
  createRibbon(THREE, scene, 'Overview circuit silhouette', frames, distances,
    -half - 5.5, half + 5.5, overviewAccent, { height: -.055 });
  const road = createRibbon(THREE, scene, 'Marina Bay Street Circuit racing surface', frames, distances,
    -half, half, asphalt, { repeatMetres: 10 });
  createRibbon(THREE, scene, 'Left street-circuit edge line', frames, distances,
    -half + .08, -half + .21, white, { height: .018 });
  createRibbon(THREE, scene, 'Right street-circuit edge line', frames, distances,
    half - .21, half - .08, white, { height: .018 });

  // Corner curbs are short low strips, so the rest of the lap reads as a true
  // wall-lined street and not a permanent red-and-white race track border.
  const turns = LANDMARKS?.turns || {};
  for (let corner = 1; corner <= 19; corner++) {
    const info = turns[`T${corner}`];
    if (!info || !Number.isInteger(info.index)) continue;
    const u = sourceFractions[info.index] ?? 0;
    const before = curve.getTangentAt((u - .006 + 1) % 1).setY(0).normalize();
    const after = curve.getTangentAt((u + .006) % 1).setY(0).normalize();
    const clockwise = before.x * after.z - before.z * after.x < 0;
    const side = clockwise ? 1 : -1;
    const include = t => Math.abs(wrappedDelta(t, u)) * TRACK_LENGTH_METERS < 27;
    createRibbon(THREE, scene, `Turn ${corner} low inner curb`, frames, distances,
      side * (half + .025), side * (half + .66), curb,
      { include, height: .026, repeatMetres: 3.2 });
  }

  const grid = addSingaporeGridDetails(THREE, scene, curve, sourcePoints, LANDMARKS, TRACK_Y, half);
  const trackside = addSingaporeTrackside(THREE, scene, curve, frames, LANDMARKS,
    { trackY: TRACK_Y, halfWidth: half, gridU: grid.gridU, sourceFractions });
  const environment = addSingaporeEnvironment(THREE, scene, curve, frames, LANDMARKS,
    { trackY: TRACK_Y, halfWidth: half, gridU: grid.gridU, sourceFractions });
  const bounds = new THREE.Box3().setFromPoints(samples).expandByScalar(135);
  const trackHeightAt = () => TRACK_Y;
  return {
    curve, samples, trackHeightAt, bounds,
    gridU: grid.gridU, gridPoint: grid.gridPoint, gridTangent: grid.gridTangent,
    trackMaterial: asphalt, overviewAccent,
    environment, trackside,
  };
}
