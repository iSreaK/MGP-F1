import { TRACK_POINTS, LANDMARKS } from './track-data.js';
import { addMonzaEnvironment } from './environment.js';
import { addTracksideDetails } from './trackside-details.js';
import { trackElevationAt, createTerrainHeightAt } from './terrain-profile.js';
import { addMonzaGridDetails } from './grid-details.js';

const TRACK_WIDTH = 12;
const TRACK_Y = 0.30;
const SAMPLE_COUNT = 1500;

function textureFromPixels(THREE, width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function asphaltTexture(THREE) {
  let seed = 2026;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return textureFromPixels(THREE, 512, 512, (ctx, w, h) => {
    const pixels = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const base = 79 + (rand() - .5) * 25;
      pixels.data[i * 4] = base * .96;
      pixels.data[i * 4 + 1] = base;
      pixels.data[i * 4 + 2] = base * .99;
      pixels.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 360; i++) {
      ctx.fillStyle = rand() < .67 ? 'rgba(14,19,18,.085)' : 'rgba(218,217,199,.045)';
      ctx.fillRect(rand() * w, rand() * h, .45 + rand() * 1.6, 3 + rand() * 28);
    }
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = 'rgba(10,17,15,.038)';
      ctx.fillRect(rand() * w, rand() * h, 8 + rand() * 40, 1 + rand() * 5);
    }
  });
}

function curbTexture(THREE) {
  return textureFromPixels(THREE, 64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e4e2d8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c3242b';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 16);
    ctx.fillStyle = 'rgba(28,34,30,.12)';
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
  });
}

function shoulderTexture(THREE, base, noise) {
  let seed = base[0] * 13 + base[1] * 17 + base[2] * 31;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return textureFromPixels(THREE, 256, 256, (ctx, w, h) => {
    const pixels = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const grain = (rand() - .5) * noise;
      for (let channel = 0; channel < 3; channel++) pixels.data[i * 4 + channel] = base[channel] + grain;
      pixels.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 68; i++) {
      ctx.fillStyle = rand() < .5 ? 'rgba(21,37,27,.075)' : 'rgba(218,219,192,.047)';
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 2 + rand() * 17, 5 + rand() * 34, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function ribbon(THREE, scene, name, samples, distances, from, to, elevation, material, mask = null, repeat = 7) {
  const positions = [];
  const normals = [];
  const uv = [];
  const indices = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    if (mask && !mask(i / n)) continue;
    const j = (i + 1) % n;
    const p = samples[i], q = samples[j];
    const before = samples[(i - 1 + n) % n];
    const after = samples[(j + 1) % n];
    const t0 = q.clone().sub(before).setY(0).normalize();
    const t1 = after.clone().sub(p).setY(0).normalize();
    const n0 = new THREE.Vector3(t0.z, 0, -t0.x);
    const n1 = new THREE.Vector3(t1.z, 0, -t1.x);
    const layerOffset = elevation - TRACK_Y;
    const a = p.clone().addScaledVector(n0, from); a.y = p.y + layerOffset;
    const b = p.clone().addScaledVector(n0, to); b.y = p.y + layerOffset;
    const c = q.clone().addScaledVector(n1, from); c.y = q.y + layerOffset;
    const d = q.clone().addScaledVector(n1, to); d.y = q.y + layerOffset;
    const k = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    for (let m = 0; m < 4; m++) normals.push(0, 1, 0);
    const v0 = distances[i] / repeat;
    const v1 = (distances[i] + p.distanceTo(q)) / repeat;
    uv.push(0, v0, 1, v0, 0, v1, 1, v1);
    indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createMonzaWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('La géométrie du tracé est incomplète.');
  }
  // The source polygon repeats its first point; CatmullRomCurve3 closes it itself.
  const centerline = TRACK_POINTS.slice(0, -1);
  const polylineLengths = [0];
  for (let i = 1; i < centerline.length; i++) {
    const [ax, az] = centerline[i - 1];
    const [bx, bz] = centerline[i];
    polylineLengths.push(polylineLengths[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  const [firstX, firstZ] = centerline[0];
  const [lastX, lastZ] = centerline[centerline.length - 1];
  const polylineLength = polylineLengths.at(-1) + Math.hypot(firstX - lastX, firstZ - lastZ);
  const points = centerline.map(([x, z], i) =>
    new THREE.Vector3(x, TRACK_Y + trackElevationAt(polylineLengths[i] / polylineLength), z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', .27);
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => curve.getPointAt(i / SAMPLE_COUNT));
  const terrainHeightAt = createTerrainHeightAt(samples);
  const distances = [0];
  for (let i = 1; i < samples.length; i++) distances.push(distances[i-1] + samples[i-1].distanceTo(samples[i]));

  const verge = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [112, 125, 116], 37), color: 0xdce0d9, roughness: 1, side: THREE.DoubleSide });
  const boundary = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [111, 142, 93], 46), color: 0xf4f6ed, roughness: 1, side: THREE.DoubleSide });
  const tarmac = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xe0e2e0, roughness: .97, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eae1, roughness: .85, side: THREE.DoubleSide });
  const redWhite = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), roughness: .86, side: THREE.DoubleSide });
  const greenRunoff = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [68, 120, 79], 30), color: 0xe1e8df, roughness: .98, side: THREE.DoubleSide });
  const paintedGreen = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [48, 133, 76], 27), color: 0xecf0e4, roughness: .89, side: THREE.DoubleSide });
  const paintedBlue = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [49, 100, 140], 29), color: 0xe9eceb, roughness: .88, side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x182421, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  // Curbs follow the inside of each named bend rather than painting both
  // edges continuously around the entire circuit.
  const curbZones = [
    [.142, .155, 1], [.157, .172, -1], // Rettifilo right / left
    [.217, .252, 1],                    // Curva Grande
    [.353, .365, -1], [.367, .382, 1], // Roggia left / right
    [.416, .449, 1], [.470, .498, 1], // Lesmo 1 / 2
    [.659, .679, -1], [.682, .696, 1], [.698, .721, -1], // Ascari
    [.853, .926, 1],                    // Alboreto
  ];
  const onCornerSide = side => u => curbZones.some(([start, end, curbSide]) =>
    curbSide === side && u >= start && u <= end);
  const apexZones = [
    [.148, .154, 1], [.162, .168, -1],
    [.359, .365, -1], [.371, .378, 1],
    [.430, .440, 1], [.481, .491, 1],
    [.669, .676, -1], [.687, .694, 1], [.705, .714, -1],
  ];
  const onApexSide = side => u => apexZones.some(([start, end, curbSide]) =>
    curbSide === side && u >= start && u <= end);
  const onCorner = u => curbZones.some(([start, end]) => u >= start && u <= end);
  const paintedT1 = u => u >= .137 && u <= .183;
  const paintedT11 = u => u >= .853 && u <= .936;
  const chevronT1 = u => u >= .149 && u <= .160;
  const chevronT11 = u => u >= .884 && u <= .908;
  ribbon(THREE, scene, 'Lisière de piste', samples, distances, -13, 13, .075, boundary);
  ribbon(THREE, scene, 'Accotements en asphalte usé', samples, distances, -8.4, 8.4, .105, verge);
  ribbon(THREE, scene, 'Lecture aérienne du tracé', samples, distances, -13, 13, TRACK_Y - .015, overviewAccent);
  ribbon(THREE, scene, 'Piste asphaltée de Monza', samples, distances, -6, 6, TRACK_Y, tarmac, null, 12);
  ribbon(THREE, scene, 'Ligne de rive gauche', samples, distances, -5.95, -5.76, TRACK_Y + .018, white);
  ribbon(THREE, scene, 'Ligne de rive droite', samples, distances, 5.76, 5.95, TRACK_Y + .018, white);
  ribbon(THREE, scene, 'Bordures rouge et blanc gauche', samples, distances, -8.25, -6.03, TRACK_Y + .024, redWhite, onCornerSide(-1), 4.0);
  ribbon(THREE, scene, 'Bordures rouge et blanc droite', samples, distances, 6.03, 8.25, TRACK_Y + .024, redWhite, onCornerSide(1), 4.0);
  ribbon(THREE, scene, 'Dégagements végétalisés gauche', samples, distances, -18, -8.25, .17, greenRunoff, onCorner);
  ribbon(THREE, scene, 'Dégagements végétalisés droite', samples, distances, 8.25, 18, .17, greenRunoff, onCorner);
  ribbon(THREE, scene, 'Vibreurs élargis aux apex gauche', samples, distances, -9.55, -8.24, TRACK_Y + .032, redWhite, onApexSide(-1), 4.0);
  ribbon(THREE, scene, 'Vibreurs élargis aux apex droite', samples, distances, 8.24, 9.55, TRACK_Y + .032, redWhite, onApexSide(1), 4.0);
  ribbon(THREE, scene, 'Dégagement peint vert Rettifilo', samples, distances, -18, -9.55, .178, paintedGreen, paintedT1);
  ribbon(THREE, scene, 'Dégagement peint bleu Rettifilo', samples, distances, -29, -18, .181, paintedBlue, paintedT1);
  ribbon(THREE, scene, 'Zone rouge et blanc Rettifilo', samples, distances, -21.4, -17.6, .19, redWhite, chevronT1, 5.8);
  ribbon(THREE, scene, 'Dégagement peint vert Alboreto', samples, distances, -18, -9.55, .178, paintedGreen, paintedT11);
  ribbon(THREE, scene, 'Dégagement peint bleu Alboreto', samples, distances, -29, -18, .181, paintedBlue, paintedT11);
  ribbon(THREE, scene, 'Zone rouge et blanc Alboreto', samples, distances, -21.4, -17.6, .19, redWhite, chevronT11, 5.8);

  const pit = LANDMARKS.pitStraight;
  const pitStart = points[pit.fromIndex];
  const pitEnd = points[pit.toIndex];
  const environment = addMonzaEnvironment(scene, THREE, samples, {
    trackWidth: TRACK_WIDTH,
    groundY: 0,
    terrainHeightAt,
    treeCount: 3400,
    margin: 1100,
    landmarks: {
      pitStraight: { start: pitStart, end: pitEnd, side: 1 },
    },
  });
  const { gridU, gridPoint, gridTangent } = addMonzaGridDetails(THREE, scene, curve, points, LANDMARKS, TRACK_Y);
  addTracksideDetails(THREE, scene, curve, points, LANDMARKS, TRACK_Y, terrainHeightAt);
  const bounds = new THREE.Box3().setFromPoints(samples);
  bounds.expandByScalar(95);
  return { curve, samples, bounds, gridU, gridPoint, gridTangent, environment, overviewAccent };
}
