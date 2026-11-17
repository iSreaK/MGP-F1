/** Keep the close-view detail without submitting each stair/beam/deck slab
 * separately. Cell-local instance bounds let Three cull distant venue areas
 * and keep the shadow camera from drawing the entire circuit at once. */
export function batchStaticPrimitives(THREE, root, options = {}) {
  const {cellSize = 260, namePrefix = 'Static', exclude = () => false} = options;
  root.updateMatrixWorld(true);
  const buckets = new Map(), origin = new THREE.Vector3();
  root.traverse(object => {
    const primitive = object.userData.staticPrimitive || object.userData.suzukaStaticPrimitive;
    if (!primitive || exclude(object)) return;
    let owner = object.parent;
    while (owner !== root && !owner.userData.staticBatchRoot && !owner.userData.suzukaBatchRoot) owner = owner.parent;
    origin.setFromMatrixPosition(object.matrixWorld);
    const key = [owner.id, primitive, object.geometry.id, object.material.id, object.castShadow,
      object.receiveShadow, Math.floor(origin.x / cellSize),
      Math.floor(origin.z / cellSize)].join('/');
    if (!buckets.has(key)) buckets.set(key, {owner, objects:[]});
    buckets.get(key).objects.push(object);
  });
  let sourceMeshes = 0, batchCount = 0, savedShadowDrawCalls = 0;
  const matrix = new THREE.Matrix4();
  for (const {owner, objects} of buckets.values()) {
    if (objects.length < 2) continue;
    const first = objects[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material,
      objects.length);
    const primitive = first.userData.staticPrimitive || first.userData.suzukaStaticPrimitive;
    batch.name = `${namePrefix} ${primitive} batch ${batchCount}`;
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.userData.sourceNames = objects.map(object => object.name);
    const inverse = new THREE.Matrix4().copy(owner.matrixWorld).invert();
    for (let i = 0; i < objects.length; i++) {
      matrix.multiplyMatrices(inverse, objects[i].matrixWorld);
      batch.setMatrixAt(i, matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    owner.add(batch);
    for (const object of objects) object.removeFromParent();
    sourceMeshes += objects.length;
    batchCount++;
    if (first.castShadow) savedShadowDrawCalls += objects.length - 1;
  }
  return { sourceMeshes, batchCount, savedDrawCalls: sourceMeshes - batchCount,
    savedShadowDrawCalls };
}

export function batchSuzukaPrimitives(THREE, root, cellSize = 260) {
  return batchStaticPrimitives(THREE, root, {cellSize, namePrefix:'Suzuka static',
    exclude:object => object.name === 'Off-track bridge pier'});
}

// Individual spectators are smaller than a pixel from the circuit-wide
// camera. Keep the coloured seating rows at distance; restore every person
// automatically when the camera approaches the stand.
export function addSuzukaSpectatorLOD(THREE, parent, audience) {
  const lod = new THREE.LOD();
  lod.name = 'Suzuka spectator detail distance';
  lod.addLevel(audience, 0);
  lod.addLevel(new THREE.Group(), 650);
  parent.add(lod);
  return lod;
}
