import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';
import { addSuzukaEnvironment } from './environment.js';
import { addSuzukaGridDetails } from './grid-details.js';
import { addSuzukaTrackside } from './trackside-details.js';
import { prepareSuzukaCurve } from './geometry-smoothing.js';
import { CROSSOVER } from './track-data.js';
import { SUZUKA_SAFETY_AREAS } from './track-sections.js';


// The FIA map fixes the plan-view centreline and corner order. The elevation
// profile models Suzuka's low first sector and higher Spoon hills; widths and
// runoff depths remain estimates checked against the official course guide.
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
      pixels.data[index] = brightness + 3;
      pixels.data[index + 1] = brightness + 2;
      pixels.data[index + 2] = brightness - 5;
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
    const patches = Float32Array.from({ length: 12 * 12 }, () => random() - .5);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const ix = Math.min(11, Math.floor(x / size * 12));
      const iy = Math.min(11, Math.floor(y / size * 12));
      // Interpolate a periodic noise field: hard cells looked like paving
      // tiles when flying above what should be continuous racing asphalt.
      const fx=smoothstep(x/size*12-ix),fy=smoothstep(y/size*12-iy);
      const h=(dx,dy)=>patches[((iy+dy)%12)*12+(ix+dx)%12];
      const shade=(h(0,0)*(1-fx)+h(1,0)*fx)*(1-fy)+(h(0,1)*(1-fx)+h(1,1)*fx)*fy;
      const value = 79 + shade * 8 + (random() - .5) * 25;
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

function gravelTexture(THREE){
  const random=seededRandom(196203);
  return textureFromPixels(THREE,384,(ctx,size)=>{
    const data=ctx.createImageData(size,size);
    for(let i=0;i<size*size;i++){
      const value=195+random()*55;
      data.data[i*4]=value;data.data[i*4+1]=value;data.data[i*4+2]=value-3;data.data[i*4+3]=255;
    }
    ctx.putImageData(data,0,0);
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
    // Offset ribbons can fold inside the hairpin/chicane when their lateral
    // extent exceeds the local radius. Reject any degenerate/folded triangle
    // as a final guard; the adaptive offsets below prevent this in normal use.
    for(const tri of [[first,first+2,first+1],[first+1,first+2,first+3]]){
      const [ia,ib,ic]=tri.map(v=>v*3);
      const areaY=(positions[ib+2]-positions[ia+2])*(positions[ic]-positions[ia])-(positions[ib]-positions[ia])*(positions[ic+2]-positions[ia+2]);
      if(areaY>1e-7)indices.push(...tri);
    }
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
  const outsideY=points.getY(0)-.025;
  return (x, z, fallback) => {
    const ux = (x - x0) / stepX, uz = (z - z0) / stepZ;
    if (ux < 0 || ux > columns - 1 || uz < 0 || uz > rows - 1)
      return outsideY;
    const ix = Math.min(columns - 2, Math.floor(ux));
    const iz = Math.min(rows - 2, Math.floor(uz));
    const tx = ux - ix, tz = uz - iz;
    const a = iz * columns + ix;
    const y00 = points.getY(a), y10 = points.getY(a + 1);
    const y01 = points.getY(a + columns);
    const y11 = points.getY(a + columns + 1);
    // Match the actual mesh diagonal (top-right to bottom-left). Bilinear
    // interpolation left gaps of up to 20 cm over uneven Mie ground.
    return tx + tz <= 1
      ? y00 * (1 - tx - tz) + y10 * tx + y01 * tz
      : y10 * (1 - tz) + y01 * (1 - tx) + y11 * (tx + tz - 1);
  };
}

// The terrain follows the elevated road without cutting through the tarmac.
// Its continuous, coarse-scale colours model Suzuka's mown infield, dry prairie
// and exposed soil. One small tiled texture handles close ground detail.
function addRollingTerrain(THREE, scene, samples) {
 const measured=samples.filter((_,i)=>i%5===0).map((p,i)=>({p,station:i*5/samples.length*5807}));
 const box=new THREE.Box3().setFromPoints(samples).expandByScalar(220);
 const nx=Math.ceil((box.max.x-box.min.x)/10),nz=Math.ceil((box.max.z-box.min.z)/10);
 const positions=[],colors=[],indices=[];
 const base=Math.min(...samples.map(p=>p.y))-4;
 // A distant ground disk continues well beyond every overview camera. Match
 // the near mesh's boundary height and linear vertex colour to this datum so
 // the sculpted terrain never reads as a rectangular island over empty sky.
 const farY=base-1,farColor=new THREE.Color(0x57734a);
 const far=new THREE.Mesh(new THREE.CircleGeometry(14000,160),new THREE.MeshStandardMaterial({color:farColor,roughness:1}));
 far.rotation.x=-Math.PI/2;far.position.y=farY;far.name='Suzuka Mie countryside';scene.add(far);
 for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const x=box.min.x+ix/nx*(box.max.x-box.min.x),z=box.min.z+iz/nz*(box.max.z-box.min.z);
  let best=Infinity,height=base;
  for(let k=0;k<measured.length;k++){
   const a=measured[k],b=measured[(k+1)%measured.length];
   // The bridge is a separate structure. Its upper deck must never pull the
   // ground up through the lower Degner-to-hairpin road at the crossover.
   if(Math.abs(a.station-CROSSOVER.upperStation)<55)continue;
   const dx=b.p.x-a.p.x,dz=b.p.z-a.p.z,t=Math.max(0,Math.min(1,((x-a.p.x)*dx+(z-a.p.z)*dz)/Math.max(.01,dx*dx+dz*dz)));
   const d=(x-a.p.x-t*dx)**2+(z-a.p.z-t*dz)**2;
   if(d<best){best=d;height=a.p.y+(b.p.y-a.p.y)*t;}
  }
  const distance=Math.sqrt(best),fade=1-smoothstep((distance-20)/170);
  const ridge=Math.sin(x/230)*Math.cos(z/310)*2;
  const sculptedY=(base+ridge)*(1-fade)+(height-.45-Math.min(4,Math.max(0,distance-15)*.025))*fade;
  const edgeDistance=Math.min(x-box.min.x,box.max.x-x,z-box.min.z,box.max.z-z);
  const edgeBlend=smoothstep(edgeDistance/160);
  const y=farY+.025+(sculptedY-farY-.025)*edgeBlend;
  positions.push(x,y,z);const n=valueNoise(x/160,z/160);
  colors.push(farColor.r+(.24+n*.08-farColor.r)*edgeBlend,
   farColor.g+(.36+n*.14-farColor.g)*edgeBlend,
   farColor.b+(.17+n*.07-farColor.b)*edgeBlend);
  if(ix<nx&&iz<nz){const a=iz*(nx+1)+ix,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));mesh.name='Suzuka rolling terrain with lower-level crossover';mesh.receiveShadow=true;scene.add(mesh);return mesh;
}

export function createSuzukaWorld(THREE, scene) {
  if (!Array.isArray(TRACK_POINTS) || TRACK_POINTS.length < 80) {
    throw new Error('Le tracé d’Suzuka est incomplet.');
  }
  const { curve, sourcePoints } = prepareSuzukaCurve(THREE, TRACK_POINTS,
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
    color: 0x859168, roughness: 1, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(THREE), color: 0xd8d9d9,
    roughness: .91, metalness: .015, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xe9e8e2, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ map: curbTexture(THREE), color: 0xffffff,
    roughness: .87, side: THREE.DoubleSide });
  const gravel = new THREE.MeshStandardMaterial({ color: 0xc6b494, map:gravelTexture(THREE),roughness: 1,
    side: THREE.DoubleSide });
  const escapeAsphalt = new THREE.MeshStandardMaterial({ color: 0x4f6960, roughness: .97,
    side: THREE.DoubleSide });
  const overviewAccent = new THREE.MeshBasicMaterial({ color: 0x3f6986, transparent: true,
    opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  // Most Suzuka straights have a narrow paved edge followed by grass before
  // the catch fence. The old 11 m asphalt shoulder on both sides read as one
  // enormous grey slab, especially from the T1 approach camera.
  const bridgeSpan = u => Math.abs(u * 5807 - CROSSOVER.upperStation) < 65;
  const curvatureAt=u=>{
    const a=curve.getTangentAt((u-3/5807+1)%1).setY(0).normalize();
    const b=curve.getTangentAt((u+3/5807)%1).setY(0).normalize();
    return Math.atan2(a.x*b.z-a.z*b.x,a.dot(b))/6;
  };
  const safeLateral=(u,offset)=>{
    const k=curvatureAt(u);
    if(offset*k<0&&Math.abs(k)>.0001)return Math.sign(offset)*Math.min(Math.abs(offset),Math.max(half+.12,.78/Math.abs(k)));
    return offset;
  };
  const shoulderWidth=u=>bridgeSpan(u)?1.3:.9;
  const vergeHeight = (frame, offset) => {
    const x = frame.point.x + frame.across.x * offset;
    const z = frame.point.z + frame.across.z * offset;
    const ground = terrainHeightAt(x, z, frame.point.y - 1.08);
    const blend = smoothstep((Math.abs(offset) - half - .9) / 9.1);
    const y = (frame.point.y - .025) * (1 - blend)
      + (ground + .045) * blend;
    return y - frame.point.y;
  };
  createRibbon(THREE, scene, 'Suzuka paved shoulder', frames, distances,
    u => safeLateral(u,-half-shoulderWidth(u)), u => safeLateral(u,half+shoulderWidth(u)), shoulder, { height: -.025, repeatMetres: 18 });
  const pitEntryU=sourceFractions[LANDMARKS.pitStraight.entryIndex],pitExitU=sourceFractions[LANDMARKS.pitStraight.exitIndex];
  const pitSpan=(pitExitU-pitEntryU+1)%1;
  createRibbon(THREE,scene,'Suzuka paved pit divider island',frames,distances,
    -half-2.3,-half-.9,shoulder,{height:-.025,repeatMetres:18,
      include:u=>{const distance=((u-pitEntryU+1)%1)*5807;return distance>65&&distance<pitSpan*5807-65;}});
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    for (const [index, a, b] of [[1, .9, 4.5], [2, 4.5, 10]]) {
      createRibbon(THREE, scene, `Suzuka ${name} mown safety verge ${index}`,
        frames, distances, u=>safeLateral(u,side < 0 ? -(half + b) : half + a),
        u=>safeLateral(u,side < 0 ? -(half + a) : half + b),
        grassVerge,
        { height: vergeHeight, repeatMetres: 18, include: u => !bridgeSpan(u) });
    }
  }
  createRibbon(THREE, scene, 'Overview circuit silhouette', frames, distances,
    -half - 5.5, half + 5.5, overviewAccent, { height: .009 });
  createRibbon(THREE, scene, 'Suzuka International Racing Course racing surface', frames, distances,
    u => -roadHalfWidthAt(u), roadHalfWidthAt, asphalt, { repeatMetres: 10 });
  createRibbon(THREE, scene, 'Suzuka left track-limit line', frames, distances,
    u => -roadHalfWidthAt(u) + .08, u => -roadHalfWidthAt(u) + .21,
    white, { height: .018 });
  createRibbon(THREE, scene, 'Suzuka right track-limit line', frames, distances,
    u => roadHalfWidthAt(u) - .21, u => roadHalfWidthAt(u) - .08,
    white, { height: .018 });

  // Low striped kerbs and broad paved exits use the same frames as the cars.
  const turns = LANDMARKS?.turns || {};
  for (let corner = 1; corner <= 18; corner++) {
    const info = turns[`T${corner}`];
    if (!info || !Number.isInteger(info.index)) continue;
    const u = sourceFractions[info.index] ?? 0;
    const before = curve.getTangentAt((u - .006 + 1) % 1).setY(0).normalize();
    const after = curve.getTangentAt((u + .006) % 1).setY(0).normalize();
    const clockwise = before.x * after.z - before.z * after.x < 0;
    const side = clockwise ? 1 : -1;
    const span=corner>=3&&corner<=6?38:corner===7?74:corner===1?85:46;
    const include = t => Math.abs(wrappedDelta(t, u)) * TRACK_LENGTH_METERS < span&&!bridgeSpan(t);
    const outside = -side;
    const orderedOffsets = (sign, near, far) => {
      const at = distance => t => sign * (roadHalfWidthAt(t) + distance);
      return sign < 0 ? [at(far), at(near)] : [at(near), at(far)];
    };
    const [kerbFrom, kerbTo] = orderedOffsets(side, .025, 1.05);
    createRibbon(THREE, scene, `Turn ${corner} striped inside kerb`, frames, distances,
      t=>safeLateral(t,kerbFrom(t)),t=>safeLateral(t,kerbTo(t)),curb,
      { include, height: .045, repeatMetres: 3.2 });
    // Distinct exit kerbs make the Esses and Spoon readable close to the car.
    if([2,4,6,9,14,17].includes(corner)){
      const [from,to]=orderedOffsets(outside,.025,.92);
      createRibbon(THREE,scene,`Suzuka T${corner} red white exit kerb`,frames,distances,
       t=>safeLateral(t,from(t)),t=>safeLateral(t,to(t)),curb,
       {include:t=>{const d=wrappedDelta(t,u)*5807;return d>10&&d<82&&!bridgeSpan(t);},height:.042,repeatMetres:3.2});
    }
  }

  // Suzuka is predominantly grass/gravel. The previous generic coloured
  // apron at every bend both hid the Esses and folded over the chicane.
  for(const area of SUZUKA_SAFETY_AREAS){
    const u=sourceFractions[turns[`T${area.turn}`].index];
    const k=curvatureAt(u),outside=k>0?1:-1;
    const envelope=t=>smoothstep(1-Math.abs(wrappedDelta(t,u))*5807/area.span);
    const near=t=>outside*(half+area.near);
    const far=t=>outside*(half+area.near+(area.far-area.near)*envelope(t));
    const include=t=>{
      const d=Math.abs(wrappedDelta(t,u))*5807;if(d>=area.span||bridgeSpan(t))return false;
      return !SUZUKA_SAFETY_AREAS.some(other=>other!==area&&other.kind===area.kind&&Math.abs(wrappedDelta(t,sourceFractions[turns[`T${other.turn}`].index]))*5807<d);
    };
    createRibbon(THREE,scene,`Suzuka T${area.turn} ${area.kind} safety bed`,frames,distances,
      outside<0?far:near,outside<0?near:far,area.kind==='gravel'?gravel:escapeAsphalt,
      {include,height:(f,offset)=>{
        const x=f.point.x+f.across.x*offset,z=f.point.z+f.across.z*offset;
        const ground=terrainHeightAt(x,z,f.point.y-.45),mix=smoothstep((Math.abs(offset)-half-2)/(area.far-2));
        return -.035*(1-mix)+(ground+.035-f.point.y)*mix;
      },repeatMetres:8});
  }

  const grid = addSuzukaGridDetails(THREE, scene, curve, sourcePoints, LANDMARKS, 0, half);
  const trackside = addSuzukaTrackside(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions, pitSide: -1, terrainHeightAt });
  const environment = addSuzukaEnvironment(THREE, scene, curve, frames, LANDMARKS,
    { trackY: 0, halfWidth: half, gridU: grid.gridU, sourceFractions, pitSide: -1, terrainHeightAt });
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
    environment, trackside, terrainHeightAt,grid,frames,sourceFractions,
  };
}
