import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { prepareVegasCurve } from './geometry-smoothing.js';
import { mirrorTrackPointsX } from '../track-orientation.js';
import { sculptPlaneToTrack } from '../terrain-follow.js';
import { addVegasGridDetails } from './grid-details.js';
import { addVegasTrackside } from './trackside-details.js';
import { addVegasEnvironment } from './environment.js';

const SAMPLE_COUNT = 1860;
const wrap01 = value => ((value % 1) + 1) % 1;
const cyclicDistance = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

function asphaltTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const data = context.createImageData(256, 256);
  let seed = 20251122;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const grain = (random() - .5) * 12;
    const broad = 4 * Math.sin(x * .031 + y * .012) + 3 * Math.sin(y * .047);
    const v = 88 + grain + broad;
    const i = (y * 256 + x) * 4;
    data.data[i] = v - 3;
    data.data[i + 1] = v - 1;
    data.data[i + 2] = v + 2;
    data.data[i + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function ribbon(THREE, scene, name, frames, from, to, material, options = {}) {
  const positions = [], uvs = [], indices = [];
  let vertex = 0;
  const count = frames.length;
  const height = options.height ?? 0;
  for (let i = 0; i < count; i++) {
    const u = i / count;
    if (options.include && !options.include(u)) continue;
    const a = frames[i], b = frames[(i + 1) % count];
    const offsets = [[a, from, u], [a, to, u], [b, from, (i + 1) / count],
      [b, to, (i + 1) / count]];
    for (const [frame, offset, fraction] of offsets) {
      positions.push(frame.point.x + frame.across.x * offset,
        frame.point.y + height, frame.point.z + frame.across.z * offset);
      uvs.push(offset / (to - from), fraction * TRACK_LENGTH_METERS /
        (options.repeatMetres || 12));
    }
    indices.push(vertex, vertex + 2, vertex + 1,
      vertex + 1, vertex + 2, vertex + 3);
    vertex += 4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function dashedRoadPaint(THREE, scene, frames, from, to, segments, material, name) {
  const positions = [], indices = [];
  let n = 0;
  for (const [start, end] of segments) {
    for (let metre = start; metre < end; metre += 15) {
      const a = frames[Math.floor((metre % TRACK_LENGTH_METERS) /
        TRACK_LENGTH_METERS * frames.length) % frames.length];
      const b = frames[Math.floor((Math.min(metre + 5, end) % TRACK_LENGTH_METERS) /
        TRACK_LENGTH_METERS * frames.length) % frames.length];
      for (const [frame, offset] of [[a, from], [a, to], [b, from], [b, to]]) {
        positions.push(frame.point.x + frame.across.x * offset,
          frame.point.y + .021, frame.point.z + frame.across.z * offset);
      }
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      n += 4;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  scene.add(mesh);
}

export function createVegasWorld(THREE, scene) {
  if (TRACK_POINTS.length < 500 || Object.keys(LANDMARKS.turns).length !== 17)
    throw new Error('Le tracé FIA de Las Vegas est incomplet.');
  const { curve, sourcePoints } = prepareVegasCurve(THREE,
    mirrorTrackPointsX(TRACK_POINTS), TRACK_LENGTH_METERS);
  const frames = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const u = index / SAMPLE_COUNT;
    const point = curve.getPointAt(u);
    const forward = curve.getTangentAt(u).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x), u };
  });
  const half = TRACK_WIDTH_METERS / 2;

  const groundGeometry = sculptPlaneToTrack(
    new THREE.PlaneGeometry(6000, 6200, 96, 96), frames.map(frame => frame.point),
    { baseHeight: -.24, roadClearance: .52, innerRadius: 85, outerRadius: 900 });
  const ground = new THREE.Mesh(groundGeometry,
    new THREE.MeshStandardMaterial({ color: 0x151923, roughness: .97 }));
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'Las Vegas night city ground';
  scene.add(ground);

  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE),
    color: 0xb2bac1, roughness: .86, metalness: .035,
    side: THREE.DoubleSide });
  const apron = new THREE.MeshStandardMaterial({ color: 0x303541,
    roughness: .92, side: THREE.DoubleSide });
  const pavement = new THREE.MeshStandardMaterial({ color: 0x515461,
    roughness: .93, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xe7e8e2, side: THREE.DoubleSide });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd4b56d, side: THREE.DoubleSide });
  const kerbRed = new THREE.MeshBasicMaterial({ color: 0x9e2836,
    side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x53afe5,
    side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });

  // Street road, bounded by asphalt shoulders and continuous white lines.
  // Every layer uses the same arc-length frames so edge seams cannot drift.
  ribbon(THREE, scene, 'Las Vegas street-side pavement', frames,
    -18, 18, pavement, { height: -.105 });
  ribbon(THREE, scene, 'Las Vegas asphalt shoulder', frames,
    -12.5, 12.5, apron, { height: -.045 });
  ribbon(THREE, scene, 'Circuit silhouette in overview', frames,
    -9, 9, overviewAccent, { height: .006 });
  ribbon(THREE, scene, 'FIA Las Vegas racing surface', frames,
    -half, half, asphalt, { height: .004, repeatMetres: 9 });
  ribbon(THREE, scene, 'Left continuous track limit', frames,
    -half + .06, -half + .18, white, { height: .018 });
  ribbon(THREE, scene, 'Right continuous track limit', frames,
    half - .18, half - .06, white, { height: .018 });

  // The Strip and long approach roads retain restrained municipal paint.
  dashedRoadPaint(THREE, scene, frames, -.075, .075,
    [[900, 1370], [2310, 2590], [4170, 5020], [5430, 5860]],
    yellow, 'Street lane centre dashes');
  const sourceDistances = [0];
  for (let i = 1; i < sourcePoints.length; i++)
    sourceDistances.push(sourceDistances.at(-1) +
      sourcePoints[i].distanceTo(sourcePoints[i - 1]));
  const full = sourceDistances.at(-1) + sourcePoints.at(-1).distanceTo(sourcePoints[0]);
  for (const [id, turn] of Object.entries(LANDMARKS.turns)) {
    const u = sourceDistances[turn.index] / full;
    const before = curve.getTangentAt(wrap01(u - .004)).setY(0).normalize();
    const after = curve.getTangentAt(wrap01(u + .004)).setY(0).normalize();
    const inside = before.x * after.z - before.z * after.x < 0 ? 1 : -1;
    const stripeFrom = inside > 0 ? half + .05 : -half - .85;
    const stripeTo = stripeFrom + .8;
    ribbon(THREE, scene, `${id} red-white urban kerb`, frames,
      stripeFrom, stripeTo, kerbRed,
      { height: .025, include: at => cyclicDistance(at, u) * TRACK_LENGTH_METERS < 24 });
  }

  const grid = addVegasGridDetails(THREE, scene, curve, sourcePoints, LANDMARKS, 0, half);
  const trackside = addVegasTrackside(THREE, scene, curve, frames, LANDMARKS,
    { trackY: .38, halfWidth: half, gridU: grid.gridU, sourceFractions: sourceDistances.map(v => v / full), pitSide: -1 });
  const environment = addVegasEnvironment(THREE, scene, curve, frames, LANDMARKS,
    { trackY: .38, halfWidth: half, gridU: grid.gridU, sourceFractions: sourceDistances.map(v => v / full), pitSide: -1 });
  const bounds = new THREE.Box3().setFromPoints(frames.map(frame => frame.point)).expandByScalar(230);
  const trackHeightAt = (u, x, z) => {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return point.y;
    const tangent = curve.getTangentAt(wrapped);
    const grade = tangent.y / Math.max(.01, Math.hypot(tangent.x, tangent.z));
    return point.y + ((x - point.x) * tangent.x + (z - point.z) * tangent.z) * grade;
  };
  return { curve, samples: frames.map(frame => frame.point), trackHeightAt,
    bounds, gridU: grid.gridU, gridPoint: grid.gridPoint, gridTangent: grid.gridTangent,
    trackMaterial: asphalt, overviewAccent, environment, trackside };
}
