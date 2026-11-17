// Shanghai's identity: the monumental main grandstand and bridges, lotus-leaf
// satellite roofs and the garden-water paddock. Architecture is a recognisable
// procedural reconstruction, not a dimensional model of the real buildings.
export function addShanghaiEnvironment(THREE, venue, curve, samples, bounds) {
  const group = new THREE.Group();
  group.name = 'Shanghai landmark architecture and water gardens';
  venue.add(group);
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xadb0aa, roughness: .86 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xd9dfdf, roughness: .43, metalness: .42, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6d9dab, roughness: .25, metalness: .48 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa7353d, roughness: .75 }),
    seats: new THREE.MeshStandardMaterial({ color: 0x357c87, roughness: .82 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3f7778, roughness: .29, metalness: .2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x4e5659, roughness: .75 }),
  };
  const obstacles = [];
  function frame(u) {
    const p = curve.getPointAt(((u % 1) + 1) % 1);
    const f = curve.getTangentAt(((u % 1) + 1) % 1).setY(0).normalize();
    const a = new THREE.Vector3(f.z, 0, -f.x);
    return { p, f, a };
  }
  function orient(u, offset = 0) {
    const { p, f, a } = frame(u), local = new THREE.Group();
    local.position.copy(p).addScaledVector(a, offset);
    local.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.clone().negate(),
      new THREE.Vector3(0, 1, 0), a));
    group.add(local);
    return local;
  }
  function box(parent, name, x, y, z, sx, sy, sz, mat, collision = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (collision) obstacles.push(mesh);
    return mesh;
  }
  function roof(parent, name, length, depth, height, wing = 0) {
    const positions = [], indices = [], nx = 32, nz = 12;
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = (ix / nx - .5) * length, z = (iz / nz - .5) * depth;
      const y = height + Math.pow(Math.abs(x) / (length / 2), 1.7) * wing
        + 5.3 * Math.pow(z / (depth / 2), 2);
      positions.push(x, y, z);
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mats.roof);
    mesh.name = name; mesh.castShadow = true; parent.add(mesh);
    return mesh;
  }

  const main = orient(0, -68);
  main.name = 'Shanghai main grandstand A, silver wing roof';
  for (let row = 0; row < 18; row++) {
    box(main, `Grandstand A concrete terrace ${row + 1}`, 0, 1.0 + row * .74,
      -row * 1.85, 390, .8, 2.05, mats.concrete);
    box(main, `Grandstand A seat row ${row + 1}`, 0, 1.6 + row * .74,
      -row * 1.85, 387, .32, 1.15, row % 5 === 0 ? mats.red : mats.seats);
  }
  roof(main, 'Monumental silver wing grandstand roof', 440, 76, 29, 7.5);
  for (let x = -200; x <= 200; x += 40) {
    box(main, 'Grandstand roof supporting pier', x, 15, -29, 2.3, 30, 2.3, mats.concrete);
    box(main, 'Grandstand upper glazing', x, 22, -24, 38, 6, 1, mats.glass);
  }
  const complex = orient(0);
  complex.name = 'Shanghai main straight pit and media complex';
  box(complex, 'Pit building continuous garage block', -15, 4.6, 35, 455, 9.2, 24, mats.concrete);
  box(complex, 'Pit building glass hospitality', -15, 11, 35, 455, 4.2, 23, mats.glass);
  box(complex, 'Pit building red fascia', -15, 8.8, 22.5, 458, .65, .5, mats.red);
  for (let x = -230; x < 210; x += 12) {
    box(complex, 'Garage roller door', x, 2.3, 22.7, 9.5, 4.4, .35, mats.dark);
    box(complex, 'Pit wall segment', x, .63, 11, 11.5, 1.25, .35, mats.concrete);
  }
  for (const x of [-194, 194]) {
    // The elevated hospitality/media bridges are intentionally well above the
    // racing envelope. No supporting column is placed on the road or pit lane.
    box(complex, 'Shanghai iconic elevated media bridge', x, 29, -8, 22, 7, 123, mats.glass);
    box(complex, 'Media bridge silver roof', x, 33, -8, 27, .7, 128, mats.roof);
    box(complex, 'Media bridge outer support', x, 14, -69, 4, 28, 4, mats.concrete);
    box(complex, 'Media bridge paddock support', x, 14, 52, 4, 28, 4, mats.concrete);
  }

  // The water gardens are a defining feature of the large Shanghai paddock.
  const garden = orient(0, 155);
  garden.name = 'Shanghai paddock water gardens and island pavilions';
  box(garden, 'Paddock reflecting basin embankment', 10, -1.6, 0, 400, 1, 104, mats.concrete, false);
  box(garden, 'Paddock reflecting water basin', 10, -.95, 0, 395, .12, 99, mats.water, false);
  for (let i = 0; i < 10; i++) {
    const x = -160 + (i % 5) * 82, z = i < 5 ? -25 : 25;
    box(garden, 'Garden pavilion stone island', x, -.7, z, 42, .7, 30, mats.concrete);
    box(garden, 'Traditional paddock pavilion glazing', x, 2.4, z, 29, 5.2, 18, mats.glass);
    const pavilion = new THREE.Group(); pavilion.position.set(x, 0, z); garden.add(pavilion);
    roof(pavilion, 'Garden pavilion curved silver roof', 39, 26, 5.8, 1.8);
    box(garden, 'Pavilion garden footbridge', x, -.25, 0, 4, .5, 98, mats.concrete, false);
  }

  function satellite(u, side, name, length) {
    const stand = orient(u, side * 105); stand.name = name;
    for (let row = 0; row < 10; row++) box(stand, 'Satellite grandstand seating',
      0, row * .7 + 1, side * row * 1.5, length, .7, 1.8, row % 4 === 0 ? mats.red : mats.seats);
    // Lotus leaves: repeated tapered, concave discs on single stems.
    const petals = Math.ceil(length / 32);
    for (let i = 0; i < petals; i++) {
      const leaf = new THREE.Group(); leaf.position.set((i - (petals - 1) / 2) * 29, 0, side * 5);
      stand.add(leaf);
      roof(leaf, 'Shanghai lotus-leaf canopy', 35, 32, 12, 2);
      box(leaf, 'Lotus canopy stem', 0, 6, side * 8, .8, 12, .8, mats.concrete);
    }
  }
  satellite(4803 / 5451, 1, 'Grandstand K at the T14 hairpin', 140);
  satellite(1603 / 5451, 1, 'Lotus-leaf grandstand at T6', 125);

  function nearestDistance(x, z) {
    let best = Infinity;
    for (let i = 0; i < samples.length; i += 3) best = Math.min(best,
      Math.hypot(samples[i].x - x, samples[i].z - z));
    return best;
  }
  // Instancing keeps the venue inexpensive. Trees never occupy the racing
  // ribbon, pits or the architectural complex.
  group.updateMatrixWorld(true);
  const trunkGeometry = new THREE.CylinderGeometry(.35, .48, 3.5, 5);
  const crownGeometry = new THREE.IcosahedronGeometry(3.4, 1);
  const trees = [], random = (() => { let state = 20260315;
    return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  for (let attempt = 0; attempt < 1800 && trees.length < 240; attempt++) {
    const x = bounds.min.x - 180 + random() * (bounds.max.x - bounds.min.x + 360);
    const z = bounds.min.z - 180 + random() * (bounds.max.z - bounds.min.z + 360);
    const d = nearestDistance(x, z);
    if (d < 38 || d > 220) continue;
    const local = complex.worldToLocal(new THREE.Vector3(x, 0, z));
    if (Math.abs(local.x) < 260 && local.z > -125 && local.z < 225) continue;
    trees.push({ x, z, scale: .65 + random() * .8 });
  }
  const trunks = new THREE.InstancedMesh(trunkGeometry,
    new THREE.MeshStandardMaterial({ color: 0x66513c, roughness: 1 }), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeometry,
    new THREE.MeshStandardMaterial({ color: 0x376a42, roughness: .96 }), trees.length);
  trunks.name = 'Shanghai park tree trunks'; crowns.name = 'Shanghai park tree canopy';
  const helper = new THREE.Object3D();
  trees.forEach((tree, i) => {
    helper.scale.setScalar(tree.scale); helper.position.set(tree.x, 1.5, tree.z);
    helper.updateMatrix(); trunks.setMatrixAt(i, helper.matrix);
    helper.position.y = 4.6 * tree.scale; helper.updateMatrix(); crowns.setMatrixAt(i, helper.matrix);
  });
  group.add(trunks, crowns);
  group.updateMatrixWorld(true);
  return { group, obstacles, trees, documentedReliefMeters: 7.4,
    reconstruction: 'Procedural architecture and interpolated physical relief' };
}
