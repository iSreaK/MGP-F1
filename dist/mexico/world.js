import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { addMexicoEnvironment } from './environment.js';
import { addMexicoGridDetails } from './grid-details.js';
import { addMexicoTrackside } from './trackside-details.js';
import { prepareMexicoCurve, trackBankAngleAtFraction } from './geometry-smoothing.js';
import { mirrorTrackPointsX } from '../track-orientation.js';

// FIA plan-view geometry with subtle park relief. Widths and kerb/run-off
// placements remain visual estimates rather than a kerb survey.
const SAMPLE_COUNT = 2584;

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

function hash2D(x, z) {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 0x51a7c07a;
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smoothstep(x - ix), fz = smoothstep(z - iz);
  const a = hash2D(ix, iz) * (1 - fx) + hash2D(ix + 1, iz) * fx;
  const b = hash2D(ix, iz + 1) * (1 - fx) + hash2D(ix + 1, iz + 1) * fx;
  return a * (1 - fz) + b * fz;
}

// Parque Magdalena Mixhuca is mostly maintained grass, with warm dry patches
// and compacted paths. A seamless high-frequency tile sits over broad vertex
// colour variation so the venue reads as a park in both car and aerial views.
function parkTexture(THREE) {
  const random = seededRandom(26102025);
  const size = 512;
  return textureFromPixels(THREE, size, (ctx) => {
    const pixels = ctx.createImageData(size, size);
    const tileNoise = (x, z, cells) => {
      const ix = Math.floor(x), iz = Math.floor(z);
      const fx = smoothstep(x - ix), fz = smoothstep(z - iz);
      const h = (dx, dz) => hash2D((ix + dx + cells) % cells,
        (iz + dz + cells) % cells);
      return (h(0, 0) * (1 - fx) + h(1, 0) * fx) * (1 - fz)
        + (h(0, 1) * (1 - fx) + h(1, 1) * fx) * fz;
    };
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const broad = tileNoise(x * 8 / size, z * 8 / size, 8);
      const fine = tileNoise(x * 32 / size, z * 32 / size, 32);
      const grain = random() - .5;
      const brightness = 220 + (broad - .5) * 24 + (fine - .5) * 14
        + grain * 17;
      const index = (z * size + x) * 4;
      pixels.data[index] = brightness - 2;
      pixels.data[index + 1] = brightness + 6;
      pixels.data[index + 2] = brightness - 12;
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 8500; i++) {
      const dark = random() < .72;
      ctx.fillStyle = dark ? 'rgba(50,66,31,.24)' : 'rgba(214,191,132,.22)';
      ctx.fillRect(random() * size, random() * size,
        .45 + random() * 1.4, .6 + random() * 3.4);
    }
  });
}

function asphaltTexture(THREE) {
  const random = seededRandom(2075);
  return textureFromPixels(THREE, 384, (ctx, size) => {
    const pixels = ctx.createImageData(size, size);
    const cells = 18;
    const patches = Float32Array.from({ length: cells * cells }, () => random() - .5);
    const shade = (x, y) => {
      const fx = x / size * cells, fy = y / size * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = smoothstep(fx - ix), ty = smoothstep(fy - iy);
      const at = (dx, dy) => patches[((iy + dy) % cells) * cells + (ix + dx) % cells];
      const top = at(0, 0) * (1 - tx) + at(1, 0) * tx;
      const bottom = at(0, 1) * (1 - tx) + at(1, 1) * tx;
      return top * (1 - ty) + bottom * ty;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const value = 82 + shade(x, y) * 9 + (random() - .5) * 17;
      const index = (y * size + x) * 4;
      pixels.data[index] = value * .96;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value * 1.025;
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 350; i++) {
      ctx.fillStyle = random() < .7 ? 'rgba(9,14,17,.10)' : 'rgba(165,173,175,.055)';
      ctx.fillRect(random() * size, random() * size, .4 + random() * 1.6,
        2 + random() * 10);
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
    for (const [frame, offset, station] of [[a, fromA, u], [a, toA, u],
      [b, fromB, nextU], [b, toB, nextU]]) {
      const lift = typeof height === 'function' ? height(frame, offset) : height;
      const banking = options.bankHeightAt?.(station, offset) ?? 0;
      positions.push(frame.point.x + frame.across.x * offset,
        frame.point.y + banking + lift,
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
  geometry.computeVertexNormals();
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

function terrainHeightSampler(terrain) {
  const points = terrain.geometry.getAttribute('position');
  const z0 = points.getZ(0);
  let columns = 1;
  while (columns < points.count && Math.abs(points.getZ(columns) - z0) < .001)
    columns++;
  const rows = points.count / columns;
  const x0 = points.getX(0), stepX = points.getX(1) - x0;
  const stepZ = points.getZ(columns) - z0;
  return (x, z, fallback) => {
    const ux = (x - x0) / stepX, uz = (z - z0) / stepZ;
    if (ux < 0 || ux > columns - 1 || uz < 0 || uz > rows - 1)
      return fallback;
    const ix = Math.min(columns - 2, Math.floor(ux));
    const iz = Math.min(rows - 2, Math.floor(uz));
    const tx = ux - ix, tz = uz - iz;
    const a = iz * columns + ix;
    const y00 = points.getY(a), y10 = points.getY(a + 1);
    const y01 = points.getY(a + columns);
    const y11 = points.getY(a + columns + 1);
    // Match the actual terrain triangle diagonal so verges meet its surface.
    return tx + tz <= 1
      ? y00 * (1 - tx - tz) + y10 * tx + y01 * tz
      : y10 * (1 - tz) + y01 * (1 - tx) + y11 * (tx + tz - 1);
  };
}

// The venue's maintained park terrain follows the road at the edges and
// merges into the flat Mexico City basin beyond the infield.
function addParkTerrain(THREE, scene, samples, frames, halfWidth, bankHeightAt) {
  const measured = samples.flatMap((point, index) => index % 16 === 0
    ? [{ point, u: index / samples.length }] : []);
  const box = new THREE.Box3().setFromPoints(samples);
  const margin = 360;
  const minX = box.min.x - margin, maxX = box.max.x + margin;
  const minZ = box.min.z - margin, maxZ = box.max.z + margin;
  const nx = Math.ceil((maxX - minX) / 21);
  const nz = Math.ceil((maxZ - minZ) / 21);
  const stepX = (maxX - minX) / nx, stepZ = (maxZ - minZ) / nz;
  const base = Math.min(...measured.map(({ point }) => point.y)) - .86;
  const plainRGB = [.345, .422, .291];
  const plainColor = new THREE.Color().setRGB(...plainRGB);
  const groundMap = parkTexture(THREE);
  const tileMetres = 54;
  const centreX = (minX + maxX) / 2, centreZ = (minZ + maxZ) / 2;
  const textureLeft = centreX - 9000, textureTop = centreZ + 9000;
  // The venue sits in a broad basin. Distant ridges and matching texture UVs
  // break the horizon without a seam at the local terrain boundary.
  const plainGeometry = new THREE.PlaneGeometry(18000, 18000, 120, 120);
  const plainPositions = plainGeometry.getAttribute('position');
  const plainUV = plainGeometry.getAttribute('uv');
  for (let i = 0; i < plainPositions.count; i++) {
    const x = centreX + plainPositions.getX(i);
    const z = centreZ - plainPositions.getY(i);
    const outsideX = Math.max(minX - x, 0, x - maxX);
    const outsideZ = Math.max(minZ - z, 0, z - maxZ);
    const distanceOutside = Math.hypot(outsideX, outsideZ);
    const distantBlend = smoothstep((distanceOutside - 400) / 2350);
    const hills = (valueNoise(x / 2400 + 14, z / 2400 - 7) - .4) * 44
      + (valueNoise(x / 900 - 8, z / 900 + 23) - .5) * 6;
    // PlaneGeometry starts in XY; after its -90° rotation, local Z is world Y.
    plainPositions.setZ(i, distantBlend * Math.max(-4, hills));
    plainUV.setXY(i, (x - textureLeft) / tileMetres,
      (textureTop - z) / tileMetres);
  }
  plainGeometry.computeVertexNormals();
  const plain = new THREE.Mesh(plainGeometry,
    new THREE.MeshStandardMaterial({ color: plainColor, map: groundMap,
      roughness: 1 }));
  plain.name = 'Mexico basin distant ground';
  plain.rotation.x = -Math.PI / 2;
  plain.position.set(centreX, base - .035, centreZ);
  plain.receiveShadow = true;
  scene.add(plain);
  const positions = [], colors = [], uvs = [], indices = [];
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = minX + ix * stepX, z = minZ + iz * stepZ;
    let distanceSquared = Infinity;
    let nearHeight = base;
    for (let k = 0; k < measured.length; k++) {
      const a = measured[k], b = measured[(k + 1) % measured.length];
      const dx = b.point.x - a.point.x, dz = b.point.z - a.point.z;
      const blend = Math.max(0, Math.min(1,
        ((x - a.point.x) * dx + (z - a.point.z) * dz)
          / Math.max(.001, dx * dx + dz * dz)));
      const px = a.point.x + blend * dx, pz = a.point.z + blend * dz;
      const square = (x - px) ** 2 + (z - pz) ** 2;
      if (square < distanceSquared) {
        distanceSquared = square;
        const horizontalLength = Math.max(.001, Math.hypot(dx, dz));
        const lateral = ((x - px) * dz - (z - pz) * dx) / horizontalLength;
        const forwardU = (b.u - a.u + 1) % 1;
        const stationU = (a.u + blend * forwardU) % 1;
        nearHeight = a.point.y + blend * (b.point.y - a.point.y)
          + bankHeightAt(stationU, lateral);
      }
    }
    const distance = Math.sqrt(distanceSquared);
    const edgeDistance = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    const edgeFade = smoothstep(edgeDistance / 135);
    // Sculpt shallow park earthworks well beyond the catch fences. The first
    // 36 m around the road stay smooth so barriers, signs and runoff retain a
    // sound footing. Broad noise rather than short waves keeps the long views
    // natural and gives the stadium approach some readable depth.
    const reliefFade = smoothstep((distance - 36) / 95);
    const ridge = (valueNoise(x / 410, z / 410) - .5) * 2.05
      + (valueNoise(x / 170 + 8, z / 170 - 11) - .5) * .46;
    const undulation = ridge * reliefFade * edgeFade;
    const far = base + undulation;
    const bank = nearHeight - .18 - Math.min(.66, Math.max(0, distance - 10) * .004);
    const following = 1 - smoothstep((distance - 12) / 170);
    positions.push(x, far * (1 - following) + bank * following, z);
    uvs.push((x - textureLeft) / tileMetres,
      (textureTop - z) / tileMetres);
    const meadow = valueNoise(x / 255 + 19, z / 255 - 6) * .58
      + valueNoise(x / 78 - 13, z / 78 + 9) * .42;
    const green = smoothstep((meadow - .29) / .39);
    const soil = smoothstep((valueNoise(x / 140 + 71,
      z / 140 - 29) - .62) / .18);
    const verge = (1 - smoothstep((distance - 16) / 74)) * edgeFade;
    const earth = soil * (1 - verge * .86);
    let r = .38 * (1 - green) + .255 * green;
    let g = .382 * (1 - green) + .438 * green;
    let b = .241 * (1 - green) + .214 * green;
    r = r * (1 - earth * .42) + .49 * earth * .42 - verge * .018;
    g = g * (1 - earth * .42) + .345 * earth * .42 + verge * .024;
    b = b * (1 - earth * .42) + .20 * earth * .42;
    colors.push(
      plainRGB[0] * (1 - edgeFade) + r * edgeFade,
      plainRGB[1] * (1 - edgeFade) + g * edgeFade,
      plainRGB[2] * (1 - edgeFade) + b * edgeFade);
    if (ix < nx && iz < nz) {
      const a = iz * (nx + 1) + ix, b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // A 21 m terrain triangle can span a sharp inside corner and rise through
  // the 1.7 m road ribbon even when its vertices are below the centreline.
  // Carve only the triangles actually under the asphalt and paved shoulder;
  // the mown verge is generated afterwards against this corrected mesh.
  const columns = nx + 1;
  function keepBelowRoad(x, z, roadY, clearance) {
    const ux = (x - minX) / stepX, uz = (z - minZ) / stepZ;
    if (ux < 0 || ux > nx || uz < 0 || uz > nz) return;
    const ix = Math.min(nx - 1, Math.floor(ux));
    const iz = Math.min(nz - 1, Math.floor(uz));
    const tx = ux - ix, tz = uz - iz;
    const a = iz * columns + ix;
    const corners = tx + tz <= 1
      ? [[a, 1 - tx - tz], [a + 1, tx], [a + columns, tz]]
      : [[a + 1, 1 - tz], [a + columns, 1 - tx],
        [a + columns + 1, tx + tz - 1]];
    const surfaceY = corners.reduce((sum, [vertex, weight]) =>
      sum + positions[vertex * 3 + 1] * weight, 0);
    const overlap = surfaceY - (roadY - clearance);
    if (overlap <= 0) return;
    for (const [vertex] of corners) positions[vertex * 3 + 1] -= overlap + .006;
  }
  const shoulderEdge = halfWidth + 3.6;
  const offsets = [-shoulderEdge, -halfWidth - 1.8, -halfWidth,
    -halfWidth * .75, -halfWidth * .5, -halfWidth * .25, 0,
    halfWidth * .25, halfWidth * .5, halfWidth * .75, halfWidth,
    halfWidth + 1.8, shoulderEdge];
  for (const frame of frames) for (const offset of offsets) {
    const pavedShoulder = Math.abs(offset) > halfWidth;
    const roadY = frame.point.y + bankHeightAt(frame.u, offset)
      - (pavedShoulder ? .16 : 0);
    keepBelowRoad(frame.point.x + frame.across.x * offset,
      frame.point.z + frame.across.z * offset, roadY,
      pavedShoulder ? .045 : .08);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: groundMap,
      roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'Mexico City park terrain';
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createMexicoWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('Le tracé de Mexico est incomplet.');
  }
  const { curve, sourcePoints } = prepareMexicoCurve(THREE, mirrorTrackPointsX(TRACK_POINTS),
    TRACK_LENGTH_METERS);
  const { fractions: sourceFractions } = distanceFractions(sourcePoints);
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => curve.getPointAt(i / SAMPLE_COUNT));
  const frames = samples.map((point, i) => {
    // Use the curve derivative, as the replay cars and trackside props do.
    // A chord through neighbouring samples diverged by up to 6.8 degrees at
    // the sharpest corners, amplifying bends in offset edge lines and walls.
    const forward = curve.getTangentAt(i / SAMPLE_COUNT).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x),
      u: i / SAMPLE_COUNT };
  });
  const distances = [0];
  for (let i = 1; i < SAMPLE_COUNT; i++) distances.push(distances[i - 1] + samples[i - 1].distanceTo(samples[i]));
  const half = Math.max(6, Math.min(8.8, Number(TRACK_WIDTH_METERS || 14) / 2));
  // Preserve straight road edges; an invented varying width introduces waves.
  const roadHalfWidthAt = () => half;
  const bankReach = half + 3.6;
  const bankHeightAt = (u, offset) => -Math.tan(trackBankAngleAtFraction(u))
    * Math.max(-bankReach, Math.min(bankReach, offset));

  const terrain = addParkTerrain(THREE, scene, samples, frames, half, bankHeightAt);
  const terrainHeightAt = terrainHeightSampler(terrain);

  const shoulder = new THREE.MeshStandardMaterial({ color: 0x4d5152, roughness: .94, side: THREE.DoubleSide });
  const grassVerge = new THREE.MeshStandardMaterial({ map: terrain.material.map,
    color: 0x829a76, roughness: 1, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xd8d9d9,
    roughness: .91, metalness: .015, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xe9e8e2, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), color: 0xffffff,
    roughness: .87, side: THREE.DoubleSide });
  const pavedRunoff = new THREE.MeshStandardMaterial({ color: 0x626768, roughness: .97,
    side: THREE.DoubleSide });
  const greenExitPaint = new THREE.MeshStandardMaterial({ color: 0x328552, roughness: .97,
    side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x527e5c, transparent: true,
    opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  // A narrow paved strip and a graded grass verge connect the asphalt to the
  // park without letting the rectangular terrain triangles poke through it.
  const vergeHeight = (frame, offset) => {
    const x = frame.point.x + frame.across.x * offset;
    const z = frame.point.z + frame.across.z * offset;
    const ground = terrainHeightAt(x, z, frame.point.y - 1.08);
    const blend = smoothstep((Math.abs(offset) - half - 3.6) / 6);
    const banking = bankHeightAt(frame.u, offset);
    const graded = (frame.point.y + banking - .16) * (1 - blend)
      + (ground + .045) * blend;
    // Keep the complete verge above the coarse terrain triangle, including
    // the midpoint where a triangle can crest between sampled edge vertices.
    const terrainClearance = .045 * blend
      + .19 * blend * (1 - blend);
    const y = Math.max(graded, ground + terrainClearance);
    return y - frame.point.y - banking;
  };
  createRibbon(THREE, scene, 'Mexico paved shoulder', frames, distances,
    -half - 3.6, half + 3.6, shoulder,
    { height: -.16, repeatMetres: 18, bankHeightAt });
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    for (const [index, a, b] of [[1, 3.6, 6.6], [2, 6.6, 9.6]]) {
      createRibbon(THREE, scene, `Mexico ${name} mown safety verge ${index}`,
        frames, distances, side < 0 ? -(half + b) : half + a,
        side < 0 ? -(half + a) : half + b,
        grassVerge,
        { height: vergeHeight, repeatMetres: 18, bankHeightAt });
    }
  }
  createRibbon(THREE, scene, 'Mexico overview circuit silhouette', frames, distances,
    -half - 4.7, half + 4.7, overviewAccent,
    { height: .009, bankHeightAt });
  createRibbon(THREE, scene, 'Autódromo Hermanos Rodríguez racing surface', frames, distances,
    u => -roadHalfWidthAt(u), roadHalfWidthAt, asphalt,
    { repeatMetres: 10, bankHeightAt });
  createRibbon(THREE, scene, 'Mexico left track-limit line', frames, distances,
    u => -roadHalfWidthAt(u) + .08, u => -roadHalfWidthAt(u) + .21,
    white, { height: .018, bankHeightAt });
  createRibbon(THREE, scene, 'Mexico right track-limit line', frames, distances,
    u => roadHalfWidthAt(u) - .21, u => roadHalfWidthAt(u) - .08,
    white, { height: .018, bankHeightAt });

  // Low red/white kerbs and restrained green-exit paint use the same frames
  // as the cars.
  const turns = LANDMARKS?.turns || {};
  for (let corner = 1; corner <= 17; corner++) {
    const info = turns[`T${corner}`];
    if (!info || !Number.isInteger(info.index)) continue;
    const u = sourceFractions[info.index] ?? 0;
    const before = curve.getTangentAt((u - .006 + 1) % 1).setY(0).normalize();
    const after = curve.getTangentAt((u + .006) % 1).setY(0).normalize();
    const clockwise = before.x * after.z - before.z * after.x < 0;
    const side = clockwise ? 1 : -1;
    // End each painted apron before the next apex. The T1–T3 complex and
    // stadium turns are too tightly spaced for a fixed-length rectangle.
    const previous = turns[`T${corner - 1}`]?.distanceMeters ??
      turns.T17.distanceMeters - TRACK_LENGTH_METERS;
    const next = turns[`T${corner + 1}`]?.distanceMeters ??
      turns.T1.distanceMeters + TRACK_LENGTH_METERS;
    const beforeLimit = Math.min(115, Math.max(7,
      (info.distanceMeters - previous) * .45));
    const afterLimit = Math.min(115, Math.max(7,
      (next - info.distanceMeters) * .45));
    const signedDistance = t => wrappedDelta(t, u) * TRACK_LENGTH_METERS;
    const limit = t => signedDistance(t) < 0 ? beforeLimit : afterLimit;
    const include = t => Math.abs(signedDistance(t)) < limit(t);
    const taper = t => Math.max(.001,
      1 - smoothstep(Math.abs(signedDistance(t)) / limit(t)));
    const outside = -side;
    const orderedOffsets = (sign, near, far) => {
      const at = distance => t => sign * (roadHalfWidthAt(t) +
        (typeof distance === 'function' ? distance(t) : distance));
      return sign < 0 ? [at(far), at(near)] : [at(near), at(far)];
    };
    const depth = Math.min([1, 4, 12].includes(corner) ? 24 :
      corner === 6 ? 8 : 10,
      5 + Math.min(beforeLimit, afterLimit) * .24);
    const tapered = distance => t => .75 + (distance - .75) * taper(t);
    const [runoffFrom, runoffTo] = orderedOffsets(outside, .75, tapered(depth));
    createRibbon(THREE, scene, `Mexico turn ${corner} paved runoff`, frames, distances,
      runoffFrom, runoffTo,
      pavedRunoff, { include, height: -.037, bankHeightAt });
    const [stripeFrom, stripeTo] = orderedOffsets(outside,
      tapered(depth - 6), tapered(depth - 3));
    createRibbon(THREE, scene, `Mexico turn ${corner} green exit apron`, frames, distances,
      stripeFrom, stripeTo,
      greenExitPaint, { include, height: -.023, bankHeightAt });
    const [kerbFrom, kerbTo] = orderedOffsets(side, .025, 1.05);
    createRibbon(THREE, scene, `Turn ${corner} striped inside kerb`, frames, distances,
      kerbFrom, kerbTo, curb,
      { include, height: .027, repeatMetres: 3.2, bankHeightAt });
  }

  const grid = addMexicoGridDetails(THREE, scene, curve, sourcePoints, LANDMARKS, 0, half);
  const trackside = addMexicoTrackside(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions,
      pitSide: 1, bankHeightAt });
  const environment = addMexicoEnvironment(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions, pitSide: 1 });
  const bounds = new THREE.Box3().setFromPoints(samples).expandByScalar(180);
  const trackHeightAt = (u, x, z) => {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return point.y;
    const tangent = curve.getTangentAt(wrapped);
    const grade = tangent.y / Math.max(.01, Math.hypot(tangent.x, tangent.z));
    const along = (x - point.x) * tangent.x + (z - point.z) * tangent.z;
    const across = (x - point.x) * tangent.z - (z - point.z) * tangent.x;
    return point.y + along * grade + bankHeightAt(wrapped, across);
  };
  return {
    curve, samples, trackHeightAt, bounds,
    gridU: grid.gridU, gridPoint: grid.gridPoint, gridTangent: grid.gridTangent,
    trackMaterial: asphalt, overviewAccent,
    environment, trackside,
  };
}
