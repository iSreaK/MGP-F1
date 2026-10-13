import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { addYasMarinaEnvironment } from './environment.js';
import { addYasMarinaGridDetails } from './grid-details.js';
import { addYasMarinaTrackside } from './trackside-details.js';
import { prepareYasMarinaCurve } from './geometry-smoothing.js';
import { mirrorTrackPointsX } from '../track-orientation.js';

// FIA fixes plan-view corner order and length. Road width and runoff extents
// are conservative visual reconstructions rather than a facility survey.
const SAMPLE_COUNT = 2710;

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

// A small seamless ground tile supplies the dry grass and exposed caliche
// detail seen close to the road. The larger meadow/soil areas come from
// terrain vertex colours, so repetition is not apparent in the aerial view.
function prairieTexture(THREE) {
  const random = seededRandom(122019);
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
      const brightness = 226 + (broad - .5) * 32 + (fine - .5) * 19
        + grain * 24;
      const index = (z * size + x) * 4;
      pixels.data[index] = brightness + 12;
      pixels.data[index + 1] = brightness - 3;
      pixels.data[index + 2] = brightness - 27;
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    for (let i = 0; i < 10500; i++) {
      const dark = random() < .62;
      ctx.fillStyle = dark ? 'rgba(43,56,28,.23)' : 'rgba(238,218,164,.31)';
      ctx.fillRect(random() * size, random() * size,
        .45 + random() * 1.4, .6 + random() * 3.4);
    }
  });
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
      const lift = typeof height === 'function' ? height(frame, offset) : height;
      positions.push(frame.point.x + frame.across.x * offset, frame.point.y + lift,
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
    // Match the actual mesh diagonal (top-right to bottom-left). Bilinear
    // interpolation left gaps of up to 20 cm over uneven Texas ground.
    return tx + tz <= 1
      ? y00 * (1 - tx - tz) + y10 * tx + y01 * tz
      : y10 * (1 - tz) + y01 * (1 - tx) + y11 * (tx + tz - 1);
  };
}

// The terrain follows the elevated road without cutting through the tarmac.
// Its continuous, coarse-scale colours model YAS MARINA's mown infield, dry prairie
// and exposed soil. One small tiled texture handles close ground detail.
function addRollingTerrain(THREE, scene, samples) {
  const measured = samples.filter((_, index) => index % 19 === 0);
  const box = new THREE.Box3().setFromPoints(samples);
  const margin = 420;
  const minX = box.min.x - margin, maxX = box.max.x + margin;
  const minZ = box.min.z - margin, maxZ = box.max.z + margin;
  const nx = Math.ceil((maxX - minX) / 32);
  const nz = Math.ceil((maxZ - minZ) / 32);
  const stepX = (maxX - minX) / nx, stepZ = (maxZ - minZ) / nz;
  const base = Math.min(...measured.map(point => point.y)) - 1.12;
  const plainRGB = [.53, .49, .43];
  const plainColor = new THREE.Color().setRGB(...plainRGB);
  const groundMap = prairieTexture(THREE);
  const tileMetres = 68;
  const centreX = (minX + maxX) / 2, centreZ = (minZ + maxZ) / 2;
  const textureLeft = centreX - 9000, textureTop = centreZ + 9000;
  // Matching world-space UVs keep the local terrain and distant ground in
  // phase, avoiding the rectangular seam visible from the overview camera.
  // Low sculpted landscape outside the run-off is inspired by Yas Marina's
  // 2023 landscaped public realm; the racing line and flat desert horizon
  // keep their existing elevations. The envelope fades at the outer mesh.
  const plainGeometry = new THREE.PlaneGeometry(18000, 18000, 64, 64);
  const plainPositions = plainGeometry.getAttribute('position');
  const plainUV = plainGeometry.getAttribute('uv');
  for (let i = 0; i < plainPositions.count; i++) {
    const x = centreX + plainPositions.getX(i);
    const z = centreZ - plainPositions.getY(i);
    // Abu Dhabi's low desert horizon remains level instead of borrowing COTA hills.
    plainPositions.setZ(i, 0);
    plainUV.setXY(i, (x - textureLeft) / tileMetres,
      (textureTop - z) / tileMetres);
  }
  plainGeometry.computeVertexNormals();
  const plain = new THREE.Mesh(plainGeometry,
    new THREE.MeshStandardMaterial({ color: plainColor, map: groundMap,
      roughness: 1 }));
  plain.name = 'Yas Marina desert horizon';
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
    const edgeFade = smoothstep(edgeDistance / 165);
    const far = base;
    const bank = nearHeight - 1.08 - Math.min(3.8,
      Math.max(0, distance - 24) * .024);
    const following = 1 - smoothstep((distance - 14) / 270);
    const dune = (valueNoise(x / 185 + 39, z / 185 - 16) - .5) * 3.0
      + (valueNoise(x / 410 - 13, z / 410 + 28) - .5) * 2.2;
    const mound = dune * smoothstep((distance - 38) / 115) * edgeFade;
    positions.push(x, far * (1 - following) + bank * following + mound, z);
    uvs.push((x - textureLeft) / tileMetres,
      (textureTop - z) / tileMetres);
    const meadow = valueNoise(x / 275 + 19, z / 275 - 6) * .61
      + valueNoise(x / 88 - 13, z / 88 + 9) * .39;
    const green = smoothstep((meadow - .28) / .46)
      * (1 - smoothstep((distance - 35) / 265)) * edgeFade;
    const soil = smoothstep((valueNoise(x / 162 + 71,
      z / 162 - 29) - .55) / .22);
    // Mown grass beside the racing surface grades into tawny grass and
    // caliche-coloured exposed patches away from the verge.
    const verge = (1 - smoothstep((distance - 18) / 105)) * edgeFade;
    const earth = soil * (1 - verge * .72);
    let r = .53 * (1 - green) + .24 * green;
    let g = .47 * (1 - green) + .39 * green;
    let b = .38 * (1 - green) + .235 * green;
    r = r * (1 - earth * .24) + .42 * earth * .24;
    g = g * (1 - earth * .24) + .33 * earth * .24;
    b = b * (1 - earth * .24) + .225 * earth * .24;
    colors.push(
      plainRGB[0] * (1 - edgeFade) + r * edgeFade,
      plainRGB[1] * (1 - edgeFade) + g * edgeFade,
      plainRGB[2] * (1 - edgeFade) + b * edgeFade);
    if (ix < nx && iz < nz) {
      const a = iz * (nx + 1) + ix, b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
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
  mesh.name = 'Yas Marina level desert terrain';
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createYasMarinaWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('Le tracé de Yas Marina est incomplet.');
  }
  const { curve, sourcePoints } = prepareYasMarinaCurve(THREE, mirrorTrackPointsX(TRACK_POINTS),
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

  const terrain = addRollingTerrain(THREE, scene, samples);
  const terrainHeightAt = terrainHeightSampler(terrain);

  const shoulder = new THREE.MeshStandardMaterial({ color: 0x485057, roughness: .94, side: THREE.DoubleSide });
  const grassVerge = new THREE.MeshStandardMaterial({ map: terrain.material.map,
    color: 0xc9a982, roughness: 1, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xd8d9d9,
    roughness: .91, metalness: .015, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xe9e8e2, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), color: 0xffffff,
    roughness: .87, side: THREE.DoubleSide });
  const blueRunoff = new THREE.MeshStandardMaterial({ color: 0x247d9d, roughness: .97,
    side: THREE.DoubleSide });
  const turquoiseRunoff = new THREE.MeshStandardMaterial({ color: 0x4aa6b8, roughness: .97,
    side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x3f6986, transparent: true,
    opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  // Most YAS MARINA straights have a narrow paved edge followed by grass before
  // the catch fence. The old 11 m asphalt shoulder on both sides read as one
  // enormous grey slab, especially from the T1 approach camera.
  const vergeHeight = (frame, offset) => {
    const x = frame.point.x + frame.across.x * offset;
    const z = frame.point.z + frame.across.z * offset;
    const ground = terrainHeightAt(x, z, frame.point.y - 1.08);
    const blend = smoothstep((Math.abs(offset) - half - 4.6) / 6.4);
    const y = (frame.point.y - .16) * (1 - blend)
      + (ground + .045) * blend;
    return y - frame.point.y;
  };
  createRibbon(THREE, scene, 'YAS MARINA paved shoulder', frames, distances,
    -half - 4.6, half + 4.6, shoulder, { height: -.16, repeatMetres: 18 });
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    for (const [index, a, b] of [[1, 4.6, 7.8], [2, 7.8, 11]]) {
      createRibbon(THREE, scene, `YAS MARINA ${name} mown safety verge ${index}`,
        frames, distances, side < 0 ? -(half + b) : half + a,
        side < 0 ? -(half + a) : half + b,
        grassVerge,
        { height: vergeHeight, repeatMetres: 18 });
    }
  }
  createRibbon(THREE, scene, 'Overview circuit silhouette', frames, distances,
    -half - 5.5, half + 5.5, overviewAccent, { height: .009 });
  createRibbon(THREE, scene, 'Yas Marina Circuit racing surface', frames, distances,
    u => -roadHalfWidthAt(u), roadHalfWidthAt, asphalt, { repeatMetres: 10 });
  createRibbon(THREE, scene, 'YAS MARINA left track-limit line', frames, distances,
    u => -roadHalfWidthAt(u) + .08, u => -roadHalfWidthAt(u) + .21,
    white, { height: .018 });
  createRibbon(THREE, scene, 'YAS MARINA right track-limit line', frames, distances,
    u => roadHalfWidthAt(u) - .21, u => roadHalfWidthAt(u) - .08,
    white, { height: .018 });

  // Low striped kerbs and broad paved exits use the same frames as the cars.
  const turns = LANDMARKS?.turns || {};
  for (let corner = 1; corner <= 16; corner++) {
    const info = turns[`T${corner}`];
    if (!info || !Number.isInteger(info.index)) continue;
    const u = sourceFractions[info.index] ?? 0;
    const before = curve.getTangentAt((u - .006 + 1) % 1).setY(0).normalize();
    const after = curve.getTangentAt((u + .006) % 1).setY(0).normalize();
    const clockwise = before.x * after.z - before.z * after.x < 0;
    const side = clockwise ? 1 : -1;
    const include = t => Math.abs(wrappedDelta(t, u)) * TRACK_LENGTH_METERS < (corner === 1 ? 85 : 46);
    const outside = -side;
    const orderedOffsets = (sign, near, far) => {
      const at = distance => t => sign * (roadHalfWidthAt(t) + distance);
      return sign < 0 ? [at(far), at(near)] : [at(near), at(far)];
    };
    const [runoffFrom, runoffTo] = orderedOffsets(outside, .75,
      corner === 1 || corner === 12 ? 35 : 19);
    createRibbon(THREE, scene, `YAS MARINA turn ${corner} paved runoff`, frames, distances,
      runoffFrom, runoffTo,
      blueRunoff, { include, height: -.037 });
    const [stripeFrom, stripeTo] = orderedOffsets(outside,
      corner === 1 || corner === 12 ? 22 : 12,
      corner === 1 || corner === 12 ? 25 : 14);
    createRibbon(THREE, scene, `YAS MARINA turn ${corner} turquoise runoff stripe`, frames, distances,
      stripeFrom, stripeTo,
      turquoiseRunoff, { include, height: -.023 });
    const [kerbFrom, kerbTo] = orderedOffsets(side, .025, 1.05);
    createRibbon(THREE, scene, `Turn ${corner} striped inside kerb`, frames, distances,
      kerbFrom, kerbTo, curb,
      { include, height: .027, repeatMetres: 3.2 });
  }

  const grid = addYasMarinaGridDetails(THREE, scene, curve, sourcePoints, LANDMARKS, 0, half);
  const trackside = addYasMarinaTrackside(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions, pitSide: 1 });
  const originalEnvironmentCurve = prepareYasMarinaCurve(THREE, TRACK_POINTS,
    TRACK_LENGTH_METERS).curve;
  const originalEnvironmentFrames = Array.from({ length: SAMPLE_COUNT }, (_, i) => {
    const point = originalEnvironmentCurve.getPointAt(i / SAMPLE_COUNT);
    const forward = originalEnvironmentCurve.getTangentAt(i / SAMPLE_COUNT).setY(0).normalize();
    return { point, forward, across: new THREE.Vector3(forward.z, 0, -forward.x) };
  });
  const environment = addYasMarinaEnvironment(THREE, scene, originalEnvironmentCurve,
    originalEnvironmentFrames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions,
      pitSide: 1, terrainHeightAt: (x, z, fallback) => terrainHeightAt(-x, z, fallback) });
  environment.group.scale.x = -1;
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
