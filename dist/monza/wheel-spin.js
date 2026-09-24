// The RB22 GLB groups all four wheels by material. Split only their triangles
// into four local pivots; the source meshes remain available for disposal.
const ROTATING_PARTS = new Set([
  'Pirelli slick rubber',
  'Tyre sidewall graphics',
  'Wheel V4 deep inner barrel',
  'Wheel V4 carbon brake rotor',
  'Wheel V4 swept brake face',
  'Wheel V4 brake vent wells',
  'Wheel V4 machined graphite lip',
  'Wheel V4 satin black forged spokes',
]);

const WHEELS = [
  { key: 'front-left', x: -1.55, y: 0.36, z: -0.77 },
  { key: 'front-right', x: -1.55, y: 0.36, z: 0.77 },
  { key: 'rear-left', x: 1.70, y: 0.36, z: -0.78 },
  { key: 'rear-right', x: 1.70, y: 0.36, z: 0.78 },
];

const TYRE_RADIUS = 0.36;
const FULL_TURN = Math.PI * 2;

export function bindWheelSpin(THREE, car) {
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

  car.traverse(object => {
    if (!object.isMesh || !ROTATING_PARTS.has(object.name)) return;
    const source = object.geometry;
    const sourceIndex = source.getIndex();
    if (!sourceIndex || !source.getAttribute('position')) return;

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
      const { x, y, z } = WHEELS[wheelIndex];
      const geometry = prepared.clone();
      geometry.setIndex(selected);
      geometry.translate(-x, -y, -z);

      // Only referenced vertices affect culling. A normal computeBoundingBox()
      // would include unused vertices copied from the other three wheels.
      const local = geometry.getAttribute('position');
      const box = new THREE.Box3().makeEmpty();
      const point = new THREE.Vector3();
      for (const index of selected) {
        point.fromBufferAttribute(local, index);
        box.expandByPoint(point);
      }
      geometry.boundingBox = box;
      geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());

      const part = new THREE.Mesh(geometry, object.material);
      part.name = `${object.name} ${WHEELS[wheelIndex].key}`;
      part.castShadow = object.castShadow;
      part.receiveShadow = object.receiveShadow;
      pivots[wheelIndex].add(part);
      newGeometries.push(geometry);
      triangleCount += selected.length / 3;
    });

    prepared.dispose();
    object.visible = false;
    sources.push(object);
  });

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
    dispose() {
      for (const object of sources) object.visible = true;
      for (const pivot of pivots) car.remove(pivot);
      for (const geometry of newGeometries) geometry.dispose();
    },
  };
}
