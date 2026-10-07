/** A light, optional rain pass for the Vegas viewer. All distances are metres. */
export function createVegasWeather(THREE, scene, curve, trackMaterial) {
  const dropCount = 1050;
  const volumeWidth = 72;
  const volumeHeight = 42;
  const dropPositions = new Float32Array(dropCount * 6);
  const drops = new Float32Array(dropCount * 5);
  let seed = 260906;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const wrap = (value, size) => ((value % size) + size) % size;

  for (let i = 0; i < dropCount; i++) {
    const k = i * 5;
    drops[k] = (random() - .5) * volumeWidth;
    drops[k + 1] = random() * volumeHeight;
    drops[k + 2] = (random() - .5) * volumeWidth;
    drops[k + 3] = 21 + random() * 13;
    drops[k + 4] = .65 + random() * .9;
  }

  const rainGeometry = new THREE.BufferGeometry();
  const rainAttribute = new THREE.BufferAttribute(dropPositions, 3);
  rainAttribute.setUsage(THREE.DynamicDrawUsage);
  rainGeometry.setAttribute('position', rainAttribute);
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({
    color: 0xdce9ea,
    transparent: true,
    opacity: .21,
    depthWrite: false,
    toneMapped: false,
  }));
  rain.name = 'Pluie près de la caméra';
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  // Small irregular sheets in the outer metre of the racing surface. They do
  // not cross the white edge line or conceal the kerbs/grid paint.
  const puddleVertices = [];
  const puddleUVs = [];
  if (curve && typeof curve.getPointAt === 'function') {
    const normal = new THREE.Vector3();
    for (let i = 0; i < 86; i++) {
      const u = (.015 + (i + random() * .65) / 86 * .965) % 1;
      const side = random() < .5 ? -1 : 1;
      const lateral = side * (4.72 + random() * .32);
      const halfLength = 1.3 + random() * 4.1;
      const halfWidth = .22 + random() * .43;
      const phase = random() * Math.PI * 2;
      const centre = curve.getPointAt(u);
      const direction = curve.getTangentAt(u).setY(0).normalize();
      normal.set(direction.z, 0, -direction.x);
      const centreX = centre.x + normal.x * lateral;
      const centreZ = centre.z + normal.z * lateral;
      const centreY = centre.y + .034;
      const ring = [];
      const ringUV = [];
      for (let j = 0; j <= 16; j++) {
        const angle = j / 16 * Math.PI * 2;
        const irregularity = 1 + .11 * Math.sin(angle * 3 + phase) + .06 * Math.sin(angle * 5 - phase);
        const along = Math.cos(angle) * halfLength * irregularity;
        const across = Math.sin(angle) * halfWidth * irregularity;
        const road = curve.getPointAt(wrap(u + along / 6201, 1));
        ring.push([
          road.x + normal.x * (lateral + across),
          road.y + .035,
          road.z + normal.z * (lateral + across),
        ]);
        ringUV.push([.5 + .5 * Math.cos(angle), .5 + .5 * Math.sin(angle)]);
      }
      for (let j = 0; j < 16; j++) {
        puddleVertices.push(centreX, centreY, centreZ, ...ring[j], ...ring[j + 1]);
        puddleUVs.push(.5, .5, ...ringUV[j], ...ringUV[j + 1]);
      }
    }
  }

  const alphaSize = 64;
  const alphaPixels = new Uint8Array(alphaSize * alphaSize * 4);
  for (let y = 0; y < alphaSize; y++) for (let x = 0; x < alphaSize; x++) {
    const px = (x + .5) / alphaSize * 2 - 1;
    const py = (y + .5) / alphaSize * 2 - 1;
    const radius = Math.hypot(px, py);
    const edge = Math.max(0, Math.min(1, (1 - radius) / .27));
    const softness = edge * edge * (3 - 2 * edge);
    const k = (y * alphaSize + x) * 4;
    alphaPixels[k] = 255;
    alphaPixels[k + 1] = Math.round(255 * softness);
    alphaPixels[k + 2] = 255;
    alphaPixels[k + 3] = 255;
  }
  const alphaMap = new THREE.DataTexture(alphaPixels, alphaSize, alphaSize, THREE.RGBAFormat);
  alphaMap.magFilter = THREE.LinearFilter;
  alphaMap.minFilter = THREE.LinearFilter;
  alphaMap.needsUpdate = true;

  const puddleGeometry = new THREE.BufferGeometry();
  puddleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(puddleVertices, 3));
  puddleGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(puddleUVs, 2));
  puddleGeometry.computeVertexNormals();
  const puddles = new THREE.Mesh(puddleGeometry, new THREE.MeshPhysicalMaterial({
    color: 0x31454c,
    metalness: .08,
    roughness: .16,
    clearcoat: 1,
    clearcoatRoughness: .09,
    transparent: true,
    opacity: .48,
    alphaMap,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }));
  puddles.name = 'Flaques discrètes aux bords de la piste';
  puddles.visible = false;
  puddles.renderOrder = 2;
  scene.add(puddles);

  const dryMaterial = trackMaterial ? {
    color: trackMaterial.color?.clone(),
    roughness: trackMaterial.roughness,
    metalness: trackMaterial.metalness,
  } : null;
  let wet = false;

  function setWet(value) {
    wet = Boolean(value);
    puddles.visible = wet;
    rain.visible = wet;
    if (dryMaterial && trackMaterial) {
      if (dryMaterial.color && trackMaterial.color) {
        trackMaterial.color.copy(dryMaterial.color);
        if (wet) trackMaterial.color.multiplyScalar(.64);
      }
      if (typeof dryMaterial.roughness === 'number') {
        trackMaterial.roughness = wet ? .43 : dryMaterial.roughness;
      }
      if (typeof dryMaterial.metalness === 'number') {
        trackMaterial.metalness = wet ? Math.max(.07, dryMaterial.metalness) : dryMaterial.metalness;
      }
      trackMaterial.needsUpdate = true;
    }
  }

  function update(dt, camera) {
    if (!wet || !camera?.position) return;
    // Aerial inspection stays clean; drops live in a small volume around the
    // moving car/camera and never allocate new geometry during animation.
    rain.visible = camera.position.y < 135;
    if (!rain.visible) return;
    rain.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
    const step = Math.min(Math.max(Number(dt) || 0, 0), .08);
    for (let i = 0; i < dropCount; i++) {
      const k = i * 5;
      const p = i * 6;
      drops[k] = wrap(drops[k] - volumeWidth / 2 + step * 1.9, volumeWidth) - volumeWidth / 2;
      drops[k + 1] = wrap(drops[k + 1] - step * drops[k + 3], volumeHeight);
      const x = drops[k];
      const y = drops[k + 1] - 11;
      const z = drops[k + 2];
      dropPositions[p] = x;
      dropPositions[p + 1] = y;
      dropPositions[p + 2] = z;
      dropPositions[p + 3] = x - .12;
      dropPositions[p + 4] = y - drops[k + 4];
      dropPositions[p + 5] = z;
    }
    rainAttribute.needsUpdate = true;
  }

  function dispose() {
    setWet(false);
    scene.remove(rain, puddles);
    rainGeometry.dispose();
    rain.material.dispose();
    puddleGeometry.dispose();
    puddles.material.dispose();
    alphaMap.dispose();
  }

  return { setWet, update, dispose, get isWet() { return wet; } };
}
