import { TRACK_POINTS, LANDMARKS } from './track-data.js';
import { addMonzaEnvironment } from './environment.js';
import { addTracksideDetails } from './trackside-details.js';
import { trackElevationAt, createTerrainHeightAt } from './terrain-profile.js';
import { addMonzaGridDetails } from './grid-details.js';

const TRACK_WIDTH = 12;
const TRACK_Y = 0.30;
const SAMPLE_COUNT = 1500;

// The source SVG was imported with its east/west axis reversed. Reflect the
// centreline once, before any road, scenery, grid or vehicle geometry is
// derived from it. Point order is deliberately unchanged, so lap progress and
// the clockwise race direction keep the same timing semantics.
const DISPLAY_MIRROR_X = -1;

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
    // Fine aggregate over broad patches of newer and older resurfacing.
    // Keep the contrast quiet so the track reads as asphalt, not a pattern.
    const coarse = Float32Array.from({ length: 17 * 17 }, () => rand() - .5);
    for (let y = 0; y < h; y++) {
      const gy = y / h * 16;
      const iy = Math.floor(gy);
      const fy = gy - iy;
      for (let x = 0; x < w; x++) {
        const gx = x / w * 16;
        const ix = Math.floor(gx);
        const fx = gx - ix;
        const a = coarse[iy * 17 + ix] * (1 - fx) + coarse[iy * 17 + ix + 1] * fx;
        const b = coarse[(iy + 1) * 17 + ix] * (1 - fx) + coarse[(iy + 1) * 17 + ix + 1] * fx;
        const shoulder = Math.abs(x / w - .5) * 5.5;
        const base = 77 + (a * (1 - fy) + b * fy) * 14 + (rand() - .5) * 29 + shoulder;
        const i = (y * w + x) * 4;
        pixels.data[i] = base * .96;
        pixels.data[i + 1] = base;
        pixels.data[i + 2] = base * .99;
        pixels.data[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = rand() < .72 ? 'rgba(15,20,19,.085)' : 'rgba(215,212,196,.055)';
      ctx.fillRect(rand() * w, rand() * h, .4 + rand() * 1.9, 2 + rand() * 19);
    }
    for (let i = 0; i < 52; i++) {
      ctx.fillStyle = rand() < .6 ? 'rgba(18,23,22,.065)' : 'rgba(190,184,171,.038)';
      ctx.fillRect(rand() * w, rand() * h, 8 + rand() * 55, .5 + rand() * 2.5);
    }
  });
}

function curbTexture(THREE) {
  return textureFromPixels(THREE, 64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e3e1d9';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#bb3030';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 16);
    ctx.fillStyle = 'rgba(36,37,31,.09)';
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1.3);
    let seed = 367;
    for (let i = 0; i < 240; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = (seed / 4294967296) * w;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const y = (seed / 4294967296) * h;
      ctx.fillStyle = 'rgba(38,38,34,.055)';
      ctx.fillRect(x, y, 1.1, 1.1);
    }
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

function smoothstep(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function zoneWeight(u, start, end, feather = .006) {
  return smoothstep(start, start + feather, u)
    * (1 - smoothstep(end - feather, end, u));
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
    const from0 = typeof from === 'function' ? from(i / n) : from;
    const to0 = typeof to === 'function' ? to(i / n) : to;
    const from1 = typeof from === 'function' ? from(j / n) : from;
    const to1 = typeof to === 'function' ? to(j / n) : to;
    const a = p.clone().addScaledVector(n0, from0);
    const b = p.clone().addScaledVector(n0, to0);
    const c = q.clone().addScaledVector(n1, from1);
    const d = q.clone().addScaledVector(n1, to1);
    if (typeof elevation === 'function') {
      a.y = elevation(a, from0, p);
      b.y = elevation(b, to0, p);
      c.y = elevation(c, from1, q);
      d.y = elevation(d, to1, q);
    } else {
      const layerOffset = elevation - TRACK_Y;
      a.y = b.y = p.y + layerOffset;
      c.y = d.y = q.y + layerOffset;
    }
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

export function createTrackHeightSampler(asphalt, samples) {
  const count = samples.length;
  // Read the actual triangles drawn for the asphalt. In a chicane the driven
  // line is metres from the centreline and its slope can differ.
  const roadVertices = asphalt.geometry.getAttribute('position').array;
  const triangleHeight = (x, z, a, b, c) => {
    const ax = roadVertices[a * 3], az = roadVertices[a * 3 + 2];
    const bx = roadVertices[b * 3], bz = roadVertices[b * 3 + 2];
    const cx = roadVertices[c * 3], cz = roadVertices[c * 3 + 2];
    const abx = bx - ax, abz = bz - az;
    const acx = cx - ax, acz = cz - az;
    const dx = x - ax, dz = z - az;
    const denominator = abx * acz - acx * abz;
    if (Math.abs(denominator) < 1e-8) return null;
    const bWeight = (dx * acz - acx * dz) / denominator;
    const cWeight = (abx * dz - dx * abz) / denominator;
    const aWeight = 1 - bWeight - cWeight;
    if (aWeight < -1e-5 || bWeight < -1e-5 || cWeight < -1e-5) return null;
    return aWeight * roadVertices[a * 3 + 1]
      + bWeight * roadVertices[b * 3 + 1]
      + cWeight * roadVertices[c * 3 + 1];
  };
  return (u, x, z) => {
    const sample = (((u % 1) + 1) % 1) * count;
    const nearest = Math.floor(sample);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      for (let distance = 0; distance <= 12; distance++) {
        for (const sign of distance ? [-1, 1] : [0]) {
          const panel = (nearest + sign * distance + count) % count;
          const a = panel * 4;
          const first = triangleHeight(x, z, a, a + 2, a + 1);
          if (first !== null) return first;
          const second = triangleHeight(x, z, a + 1, a + 2, a + 3);
          if (second !== null) return second;
        }
      }
    }
    // Defensive fallback for a query beyond the asphalt ribbon.
    const blend = sample - nearest;
    return samples[nearest].y * (1 - blend) + samples[(nearest + 1) % count].y * blend;
  };
}

export function createMonzaWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('La géométrie du tracé est incomplète.');
  }
  // The source polygon repeats its first point; CatmullRomCurve3 closes it itself.
  const centerline = TRACK_POINTS.slice(0, -1)
    .map(([x, z]) => [x * DISPLAY_MIRROR_X, z]);
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

  const verge = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [95, 97, 89], 35), color: 0xd9dad4, roughness: 1, side: THREE.DoubleSide });
  const boundary = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [100, 113, 88], 54), color: 0xe9e9dd, roughness: 1, side: THREE.DoubleSide });
  const tarmac = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xdedfde, roughness: .98, side: THREE.DoubleSide });
  // Very broad, nearly level run-offs should stay legible under the movable
  // shadow camera; dynamic self-shadowing made these sheets almost black.
  const escapeAsphalt = new THREE.MeshBasicMaterial({ map: shoulderTexture(THREE, [95, 98, 96], 25), color: 0xffffff, side: THREE.DoubleSide });
  const concrete = new THREE.MeshBasicMaterial({ map: shoulderTexture(THREE, [143, 139, 128], 27), color: 0xe7e5dc, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eae1, roughness: .85, side: THREE.DoubleSide });
  const redWhite = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), roughness: .86, side: THREE.DoubleSide });
  const paintedGreen = new THREE.MeshStandardMaterial({ map: shoulderTexture(THREE, [52, 129, 76], 29), color: 0xe8eee4, roughness: .94, side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x182421, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  // These ranges follow the 11 numbered corners. Recent Monza curbs are low,
  // relatively narrow slabs; they should not read as a continuous red border.
  const curbZones = [
    [.140, .157, 1, 1.85], [.157, .174, -1, 1.65], // Rettifilo
    [.218, .250, 1, 1.15],                         // Biassono
    [.351, .368, -1, 1.7], [.368, .385, 1, 1.7], // Roggia
    [.418, .452, 1, 1.2], [.470, .500, 1, 1.25], // Lesmo
    [.657, .680, -1, 1.55], [.682, .698, 1, 1.5],
    [.698, .724, -1, 1.55],                        // Ascari
    [.855, .934, 1, 1.25],                         // Alboreto
  ];
  const groundTransition = (position, lateral, center) => {
    const blend = smoothstep(8, 14, Math.abs(lateral));
    return (center.y - .13) * (1 - blend)
      + (terrainHeightAt(position.x, position.z) + .025) * blend;
  };
  const runoffHeight = (position, lateral, center) => {
    const blend = smoothstep(9, 38, Math.abs(lateral));
    return (center.y - .055) * (1 - blend)
      + (terrainHeightAt(position.x, position.z) + .045) * blend;
  };
  ribbon(THREE, scene, 'Talus bas et herbe irrégulière', samples, distances, -14, 14, groundTransition, boundary);
  ribbon(THREE, scene, 'Accotement goudronné et usé', samples, distances, -7.5, 7.5, TRACK_Y - .072, verge);
  ribbon(THREE, scene, 'Lecture aérienne du tracé', samples, distances, -13, 13, TRACK_Y - .015, overviewAccent);
  const asphalt = ribbon(THREE, scene, 'Piste asphaltée de Monza', samples, distances, -6, 6, TRACK_Y, tarmac, null, 12);
  ribbon(THREE, scene, 'Ligne de rive gauche', samples, distances, -5.95, -5.76, TRACK_Y + .018, white);
  ribbon(THREE, scene, 'Ligne de rive droite', samples, distances, 5.76, 5.95, TRACK_Y + .018, white);
  for (const [start, end, side, width] of curbZones) {
    const fade = u => zoneWeight(u, start, end, .0025);
    const inner = side * 6.04;
    const outer = u => side * (6.04 + width * fade(u));
    ribbon(THREE, scene, 'Vibreur bas rouge et blanc', samples, distances,
      inner, outer, TRACK_Y + .024, redWhite,
      u => u >= start && u <= end, 3.8);
  }

  // Run-offs are concentrated at the braking zones and Alboreto. The long
  // forest straights retain their narrow weathered shoulders and grass.
  const escapeZones = [
    ['Rettifilo escape road', .121, .174, -1, 31, escapeAsphalt],
    ['Rettifilo exit apron', .151, .180, 1, 14, concrete],
    ['Roggia outside asphalt', .336, .382, 1, 17, escapeAsphalt],
    ['Roggia exit apron', .364, .395, -1, 12, concrete],
    ['Lesmo 2 outside apron', .468, .506, -1, 10, concrete],
    ['Ascari outside apron', .646, .722, 1, 16, escapeAsphalt],
    ['Alboreto asphalt run-off', .833, .945, -1, 37, escapeAsphalt],
  ];
  for (const [name, start, end, side, width, material] of escapeZones) {
    ribbon(THREE, scene, name, samples, distances,
      side * 7.7,
      u => side * (7.7 + width * zoneWeight(u, start, end, .009)),
      runoffHeight, material, u => u >= start && u <= end, 10);
  }
  // Track-limit paint is only a short apron beside selected corner exits.
  for (const [name, start, end, side, width] of [
    ['Rettifilo green exit', .150, .178, -1, 2.0],
    ['Roggia green exit', .371, .391, 1, 1.55],
    ['Ascari green apron', .675, .716, 1, 2.1],
    ['Alboreto green exit', .873, .929, -1, 2.45],
  ]) {
    ribbon(THREE, scene, name, samples, distances,
      side * 7.8,
      u => side * (7.8 + width * zoneWeight(u, start, end, .004)),
      (position, lateral, center) => runoffHeight(position, lateral, center) + .012,
      paintedGreen, u => u >= start && u <= end, 6);
  }

  // Polygonal gravel traps grow away from the driving surface. They follow the
  // sector's tangent instead of appearing as disconnected circular patches.
  const gravelTraps = [];
  function addGravel(name, start, end, side, inner, depth) {
    const segments = Math.max(12, Math.ceil((end - start) * SAMPLE_COUNT / 2));
    const points = [];
    const edge = (u, offset) => {
      const point = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).setY(0).normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      const p = point.addScaledVector(normal, side * offset);
      return { x: p.x, z: p.z };
    };
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(edge(start + (end - start) * t, inner));
    }
    for (let i = segments - 1; i >= 1; i--) {
      const t = i / segments;
      const depthAt = depth * Math.pow(Math.sin(Math.PI * t), .7);
      points.push(edge(start + (end - start) * t, inner + depthAt));
    }
    gravelTraps.push({ name, points });
  }
  addGravel('Rettifilo outside', .130, .153, -1, 32, 28);
  addGravel('Rettifilo second apex', .157, .183, 1, 19, 21);
  addGravel('Roggia first apex', .347, .372, 1, 19, 28);
  addGravel('Roggia exit', .372, .399, -1, 18, 22);
  addGravel('Lesmo 2 exit', .476, .507, -1, 16, 25);
  addGravel('Ascari entry', .651, .691, 1, 19, 37);
  addGravel('Ascari exit', .696, .729, 1, 20, 28);

  const pit = LANDMARKS.pitStraight;
  const pitStart = points[pit.fromIndex];
  const pitEnd = points[pit.toIndex];
  const environment = addMonzaEnvironment(scene, THREE, samples, {
    trackWidth: TRACK_WIDTH,
    groundY: 0,
    terrainHeightAt,
    treeCount: 4800,
    margin: 1100,
    landmarks: {
      pitStraight: { start: pitStart, end: pitEnd, side: 1 },
      gravelTraps,
    },
  });
  const { gridU, gridPoint, gridTangent } = addMonzaGridDetails(THREE, scene, curve, points, LANDMARKS, TRACK_Y);
  addTracksideDetails(THREE, scene, curve, points, LANDMARKS, TRACK_Y, terrainHeightAt);
  const bounds = new THREE.Box3().setFromPoints(samples);
  bounds.expandByScalar(95);
  const trackHeightAt = createTrackHeightSampler(asphalt, samples);
  return { curve, samples, trackHeightAt, bounds, gridU, gridPoint, gridTangent, environment, overviewAccent, trackMaterial: tarmac };
}
