import { TRACK_POINTS, LANDMARKS } from './track-data.js';
import { addMonzaEnvironment } from './environment.js';
import { addTracksideDetails } from './trackside-details.js';

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

function checkerTexture(THREE) {
  return textureFromPixels(THREE, 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f8f8f3';
    ctx.fillRect(0, 0, w, h);
    const cell = 32;
    ctx.fillStyle = '#171c1c';
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        if (((x + y) / cell) % 2 === 0) ctx.fillRect(x, y, cell, cell);
      }
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
    const a = p.clone().addScaledVector(n0, from); a.y = elevation;
    const b = p.clone().addScaledVector(n0, to); b.y = elevation;
    const c = q.clone().addScaledVector(n1, from); c.y = elevation;
    const d = q.clone().addScaledVector(n1, to); d.y = elevation;
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

function finishLine(THREE, scene, point, tangent, material) {
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const p = point.clone();
  const halfTrack = TRACK_WIDTH / 2;
  const halfLength = .95;
  const a = p.clone().addScaledVector(normal, -halfTrack).addScaledVector(tangent, -halfLength);
  const b = p.clone().addScaledVector(normal, halfTrack).addScaledVector(tangent, -halfLength);
  const c = p.clone().addScaledVector(normal, -halfTrack).addScaledVector(tangent, halfLength);
  const d = p.clone().addScaledVector(normal, halfTrack).addScaledVector(tangent, halfLength);
  [a, b, c, d].forEach(v => { v.y = TRACK_Y + .055; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0,1,0, 0,1,0, 0,1,0, 0,1,0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 0,1, 1,1], 2));
  geo.setIndex([0,2,1, 1,2,3]);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'Ligne d’arrivée';
  scene.add(mesh);
}

function addGridBoxes(THREE, scene, curve, gridU, material) {
  const size = new THREE.Vector3(.16, .035, 4.7);
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  for (let row = 0; row < 13; row++) {
    const u = (gridU - .004 - row * .0025 + 1) % 1;
    const at = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).setY(0).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
    for (const lane of [-1, 1]) {
      const mark = new THREE.Mesh(geometry, material);
      mark.position.copy(at).addScaledVector(normal, lane * 2.7);
      mark.position.y = TRACK_Y + .06;
      mark.rotation.y = -Math.atan2(tangent.z, tangent.x);
      scene.add(mark);
    }
  }
}

export function createMonzaWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('La géométrie du tracé est incomplète.');
  }
  // The source polygon repeats its first point; CatmullRomCurve3 closes it itself.
  const centerline = TRACK_POINTS.slice(0, -1);
  const points = centerline.map(([x, z]) => new THREE.Vector3(x, TRACK_Y, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', .27);
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => curve.getPointAt(i / SAMPLE_COUNT));
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

  const curbZones = [
    [.130, .199], [.259, .278], [.342, .405], [.422, .515],
    [.645, .735], [.842, .964],
  ];
  const onCorner = u => curbZones.some(([start, end]) => u >= start && u <= end);
  const apexZones = [
    [.146, .165], [.356, .371], [.426, .445], [.476, .495],
    [.665, .710], [.877, .915],
  ];
  const onApex = u => apexZones.some(([start, end]) => u >= start && u <= end);
  const paintedT1 = u => u >= .137 && u <= .183;
  const paintedT11 = u => u >= .853 && u <= .936;
  const chevronT1 = u => u >= .149 && u <= .160;
  const chevronT11 = u => u >= .884 && u <= .908;
  ribbon(THREE, scene, 'Lisière de piste', samples, distances, -13, 13, .075, boundary);
  ribbon(THREE, scene, 'Accotements en asphalte usé', samples, distances, -8.4, 8.4, .105, verge);
  ribbon(THREE, scene, 'Lecture aérienne du tracé', samples, distances, -13, 13, TRACK_Y - .015, overviewAccent);
  ribbon(THREE, scene, 'Piste asphaltée de Monza', samples, distances, -6, 6, TRACK_Y, tarmac, null, 12);
  ribbon(THREE, scene, 'Ligne de rive gauche', samples, distances, -5.92, -5.48, TRACK_Y + .018, white);
  ribbon(THREE, scene, 'Ligne de rive droite', samples, distances, 5.48, 5.92, TRACK_Y + .018, white);
  ribbon(THREE, scene, 'Bordures rouge et blanc gauche', samples, distances, -8.25, -6.03, TRACK_Y + .024, redWhite, onCorner, 4.0);
  ribbon(THREE, scene, 'Bordures rouge et blanc droite', samples, distances, 6.03, 8.25, TRACK_Y + .024, redWhite, onCorner, 4.0);
  ribbon(THREE, scene, 'Dégagements végétalisés gauche', samples, distances, -18, -8.25, .17, greenRunoff, onCorner);
  ribbon(THREE, scene, 'Dégagements végétalisés droite', samples, distances, 8.25, 18, .17, greenRunoff, onCorner);
  ribbon(THREE, scene, 'Vibreurs élargis aux apex gauche', samples, distances, -9.55, -8.24, TRACK_Y + .032, redWhite, onApex, 4.0);
  ribbon(THREE, scene, 'Vibreurs élargis aux apex droite', samples, distances, 8.24, 9.55, TRACK_Y + .032, redWhite, onApex, 4.0);
  ribbon(THREE, scene, 'Dégagement peint vert Rettifilo', samples, distances, -18, -9.55, .178, paintedGreen, paintedT1);
  ribbon(THREE, scene, 'Dégagement peint bleu Rettifilo', samples, distances, -29, -18, .181, paintedBlue, paintedT1);
  ribbon(THREE, scene, 'Zone rouge et blanc Rettifilo', samples, distances, -21.4, -17.6, .19, redWhite, chevronT1, 5.8);
  ribbon(THREE, scene, 'Dégagement peint vert Alboreto', samples, distances, 9.55, 18, .178, paintedGreen, paintedT11);
  ribbon(THREE, scene, 'Dégagement peint bleu Alboreto', samples, distances, 18, 29, .181, paintedBlue, paintedT11);
  ribbon(THREE, scene, 'Zone rouge et blanc Alboreto', samples, distances, 17.6, 21.4, .19, redWhite, chevronT11, 5.8);

  const gridIndex = Math.max(0, Math.min(centerline.length - 1, LANDMARKS.gridIndex ?? 0));
  const gridU = (() => {
    // Landmark indices belong to the original polyline, while getPointAt uses arc length.
    let length = 0;
    for (let i = 1; i <= gridIndex; i++) length += points[i - 1].distanceTo(points[i]);
    let total = length;
    for (let i = gridIndex + 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
    total += points[points.length - 1].distanceTo(points[0]);
    return length / total;
  })();
  const gridPoint = curve.getPointAt(gridU);
  const gridTangent = curve.getTangentAt(gridU).setY(0).normalize();
  finishLine(THREE, scene, gridPoint, gridTangent,
    new THREE.MeshBasicMaterial({ map: checkerTexture(THREE), side: THREE.DoubleSide }));
  addGridBoxes(THREE, scene, curve, gridU, white);

  const pit = LANDMARKS.pitStraight;
  const pitStart = points[pit.fromIndex];
  const pitEnd = points[pit.toIndex];
  const environment = addMonzaEnvironment(scene, THREE, samples, {
    trackWidth: TRACK_WIDTH,
    groundY: 0,
    treeCount: 3400,
    margin: 1100,
    landmarks: {
      pitStraight: { start: pitStart, end: pitEnd, side: 1 },
    },
  });
  addTracksideDetails(THREE, scene, curve, points, LANDMARKS, TRACK_Y);
  const bounds = new THREE.Box3().setFromPoints(samples);
  bounds.expandByScalar(95);
  return { curve, samples, bounds, gridU, gridPoint, gridTangent, environment, overviewAccent };
}
