// All 2026 GLBs group four wheels by material. The brake caliper stays fixed;
// tyres, sidewall graphics, discs and spokes rotate with the wheel.
export const WHEEL_PART_NAMES = Object.freeze([
  'Pirelli slick rubber',
  'Tyre sidewall graphics',
  'Wheel V4 deep inner barrel',
  'Wheel V4 carbon brake rotor',
  'Wheel V4 swept brake face',
  'Wheel V4 brake vent wells',
  'Wheel V4 machined graphite lip',
  'Wheel V4 satin black forged spokes',
]);
const ROTATING_PARTS = new Set(WHEEL_PART_NAMES);

// GLTFLoader sanitizes object.name for animation tracks (spaces become _),
// while userData.name keeps the original node name from the GLB.
export function isRotatingWheelPart(object) {
  if (!object?.isMesh) return false;
  return ROTATING_PARTS.has(object.userData?.name || object.name?.replaceAll('_', ' '));
}

// The 22 models share these axle dimensions. Race placement uses the same
// measurements as the pivots so tyres continue to meet the uneven asphalt.
export const WHEEL_GEOMETRY = Object.freeze({
  frontX: -1.55,
  rearX: 1.70,
  frontZ: .77,
  rearZ: .78,
  centerY: .36,
  radius: .36,
});

const WHEELS = [
  { key: 'front-left', x: WHEEL_GEOMETRY.frontX, y: WHEEL_GEOMETRY.centerY, z: -WHEEL_GEOMETRY.frontZ },
  { key: 'front-right', x: WHEEL_GEOMETRY.frontX, y: WHEEL_GEOMETRY.centerY, z: WHEEL_GEOMETRY.frontZ },
  { key: 'rear-left', x: WHEEL_GEOMETRY.rearX, y: WHEEL_GEOMETRY.centerY, z: -WHEEL_GEOMETRY.rearZ },
  { key: 'rear-right', x: WHEEL_GEOMETRY.rearX, y: WHEEL_GEOMETRY.centerY, z: WHEEL_GEOMETRY.rearZ },
];

const TYRE_RADIUS = WHEEL_GEOMETRY.radius;
const FULL_TURN = Math.PI * 2;
const disabledBinding = () => ({
  enabled: false, triangleCount: 0, pivots: [],
  update() {}, setDistance() {}, dispose() {},
});

// Each source mesh contains all four wheels. Keep only the vertices referenced
// by a wheel's triangles, instead of cloning the full mesh four times per car.
function wheelGeometry(THREE, source, selected, wheel) {
  const remap = new Map();
  const originalIndices = [];
  const indices = selected.map(index => {
    let mapped = remap.get(index);
    if (mapped === undefined) {
      mapped = originalIndices.length;
      remap.set(index, mapped);
      originalIndices.push(index);
    }
    return mapped;
  });
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const sourceArray = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const copied = new THREE.BufferAttribute(
      new sourceArray.constructor(originalIndices.length * attribute.itemSize),
      attribute.itemSize, attribute.normalized,
    );
    for (let i = 0; i < originalIndices.length; i++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        copied.setComponent(i, component, attribute.getComponent(originalIndices[i], component));
      }
    }
    geometry.setAttribute(name, copied);
  }
  geometry.setIndex(indices);
  geometry.translate(-wheel.x, -wheel.y, -wheel.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function bindWheelSpin(THREE, car) {
  const parts = [];
  car.traverse(object => {
    if (isRotatingWheelPart(object)) parts.push(object);
  });
  // A different or damaged asset keeps static wheels and never loses its
  // source tyre meshes; the rest of the race remains usable.
  if (parts.length !== WHEEL_PART_NAMES.length ||
    new Set(parts.map(object => object.userData?.name || object.name?.replaceAll('_', ' '))).size !== WHEEL_PART_NAMES.length ||
    parts.some(object => !object.geometry.getIndex() || !object.geometry.getAttribute('position') ||
      Array.isArray(object.material) || Object.keys(object.geometry.morphAttributes || {}).length)) {
    return disabledBinding();
  }
  car.updateMatrixWorld(true);
  const worldToCar = car.matrixWorld.clone().invert();
  const pivots = WHEELS.map(({ key, x, y, z }) => {
    const pivot = new THREE.Group();
    pivot.name = `Animated wheel ${key}`;
    pivot.position.set(x, y, z);
    car.add(pivot);
    return pivot;
  });

  const sources = [];
  const newGeometries = [];
  let triangleCount = 0;

  for (const object of parts) {
    const source = object.geometry;
    // The tyre is the exterior wheel silhouette. Its inner barrel, brake and
    // spoke meshes sit inside it; drawing each into the shadow map multiplies
    // shadow draw calls by eight for every car without changing the road shadow.
    const shadowCaster = (object.userData?.name || object.name?.replaceAll('_', ' ')) === 'Pirelli slick rubber';

    // GLB nodes are at identity today; baking the relative transform also
    // keeps the split correct if the asset gains nested groups later.
    const relative = worldToCar.clone().multiply(object.matrixWorld);
    const prepared = source.clone().applyMatrix4(relative);
    const position = prepared.getAttribute('position');
    const indexes = prepared.getIndex().array;
    const fourSets = [[], [], [], []];

    for (let i = 0; i < indexes.length; i += 3) {
      const a = indexes[i];
      const quadrant = (position.getX(a) >= 0 ? 2 : 0) +
        (position.getZ(a) >= 0 ? 1 : 0);
      fourSets[quadrant].push(a, indexes[i + 1], indexes[i + 2]);
    }

    fourSets.forEach((selected, wheelIndex) => {
      if (!selected.length) return;
      const geometry = wheelGeometry(THREE, prepared, selected, WHEELS[wheelIndex]);

      const part = new THREE.Mesh(geometry, object.material);
      part.name = `${object.name} ${WHEELS[wheelIndex].key}`;
      part.castShadow = object.castShadow && shadowCaster;
      part.receiveShadow = object.receiveShadow;
      pivots[wheelIndex].add(part);
      newGeometries.push(geometry);
      triangleCount += selected.length / 3;
    });

    prepared.dispose();
    object.visible = false;
    sources.push(object);
  }

  return {
    enabled: sources.length === ROTATING_PARTS.size,
    triangleCount,
    pivots,
    // Signed distance in model metres. The nose points toward local -X;
    // positive rotation about local +Z rolls the tyre forward.
    update(distanceMeters) {
      if (!Number.isFinite(distanceMeters)) return;
      const angle = distanceMeters / TYRE_RADIUS;
      for (const pivot of pivots) {
        pivot.rotation.z = (pivot.rotation.z + angle) % FULL_TURN;
      }
    },
    // Absolute angle keeps the wheels consistent when the replay is scrubbed
    // backwards, jumps to a lap, or resumes after a pause.
    setDistance(distanceMeters) {
      if (!Number.isFinite(distanceMeters)) return;
      const angle = (distanceMeters / TYRE_RADIUS) % FULL_TURN;
      for (const pivot of pivots) pivot.rotation.z = angle;
    },
    dispose() {
      for (const object of sources) object.visible = true;
      for (const pivot of pivots) car.remove(pivot);
      for (const geometry of newGeometries) geometry.dispose();
    },
  };
}
