import { TRACK_LENGTH_METERS } from './track-data.js';

// Night race infrastructure: continuous urban barriers, light poles and
// fencing. Repeated items are instanced, so the six-kilometre lap remains
// inexpensive to draw. The pit-side wall is supplied by grid-details.js.
export function addVegasTrackside(THREE, scene, curve, frames, landmarks,
  { halfWidth = 6.5 } = {}) {
  const group = new THREE.Group();
  group.name = 'Las Vegas concrete barriers and floodlighting';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xc8c9cc,
    roughness: .85, metalness: .02 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xee2238 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x798a97,
    metalness: .54, roughness: .46 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0bf });
  const black = new THREE.MeshStandardMaterial({ color: 0x18202b, roughness: .81 });

  function pitOpening(station) {
    return station > TRACK_LENGTH_METERS - 430 || station < 360;
  }
  function pose(mesh, index, frame, offset, height, dimensions) {
    helper.position.copy(frame.point).addScaledVector(frame.across, offset);
    helper.position.y += height;
    helper.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      frame.across, up, frame.forward));
    helper.scale.set(...dimensions);
    helper.updateMatrix();
    mesh.setMatrixAt(index, helper.matrix);
  }
  function finish(mesh, name) {
    mesh.name = name;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const barrierStations = [];
  for (let station = 0; station < TRACK_LENGTH_METERS; station += 6.2) {
    const u = station / TRACK_LENGTH_METERS;
    const frame = frames[Math.floor(u * frames.length) % frames.length];
    for (const side of [-1, 1]) {
      if (side < 0 && pitOpening(station)) continue;
      barrierStations.push({ frame, side, station });
    }
  }
  const concrete = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    barrierMat, barrierStations.length);
  const redPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    stripeMat, Math.ceil(barrierStations.length / 5));
  let panel = 0;
  barrierStations.forEach(({ frame, side }, index) => {
    pose(concrete, index, frame, side * (halfWidth + 5.8), .47,
      [.73, 1.05, 6.63]);
    if (index % 5 === 0) {
      pose(redPanels, panel++, frame, side * (halfWidth + 5.42), .67,
        [.04, .34, 5.7]);
    }
  });
  redPanels.count = panel;
  finish(concrete, 'Continuous low concrete safety wall');
  finish(redPanels, 'Sparse red night race barrier panels');

  const fenceStations = [];
  for (let station = 0; station < TRACK_LENGTH_METERS; station += 24) {
    if (pitOpening(station)) continue;
    const frame = frames[Math.floor(station / TRACK_LENGTH_METERS * frames.length) % frames.length];
    for (const side of [-1, 1]) fenceStations.push({ frame, side });
  }
  const fencePosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.062, .075, 4.5, 6),
    fenceMat, fenceStations.length);
  fenceStations.forEach(({ frame, side }, i) => pose(fencePosts, i, frame,
    side * (halfWidth + 6.1), 2.32, [1, 1, 1]));
  finish(fencePosts, 'Urban catch fence steel posts');

  const wireVertices = [];
  for (let station = 0; station < TRACK_LENGTH_METERS; station += 12) {
    const next = station + 12;
    if (pitOpening(station) || pitOpening(next % TRACK_LENGTH_METERS)) continue;
    for (const side of [-1, 1]) {
      const at = metre => {
        const frame = frames[Math.floor((metre % TRACK_LENGTH_METERS) /
          TRACK_LENGTH_METERS * frames.length) % frames.length];
        return frame.point.clone().addScaledVector(frame.across,
          side * (halfWidth + 6.1));
      };
      const a = at(station), b = at(next);
      for (const height of [2.25, 3.45, 4.52]) {
        wireVertices.push(a.x, height, a.z, b.x, height, b.z);
      }
    }
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireVertices, 3));
  const wires = new THREE.LineSegments(wireGeometry,
    new THREE.LineBasicMaterial({ color: 0x8b929a, transparent: true, opacity: .57 }));
  wires.name = 'Three horizontal catch-fence cables';
  group.add(wires);

  const lamps = [];
  for (let station = 18; station < TRACK_LENGTH_METERS; station += 87) {
    if (pitOpening(station)) continue;
    const frame = frames[Math.floor(station / TRACK_LENGTH_METERS * frames.length) % frames.length];
    lamps.push({ frame, side: station > 4020 && station < 5230 ? 1 : -1 });
  }
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .23, 15, 7),
    black, lamps.length);
  const luminaire = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, .36, 1.6),
    lampMat, lamps.length);
  lamps.forEach(({ frame, side }, i) => {
    pose(poleMesh, i, frame, side * (halfWidth + 13), 7.5, [1, 1, 1]);
    pose(luminaire, i, frame, side * (halfWidth + 10.8), 15.2, [1, 1, 1]);
  });
  finish(poleMesh, 'Tall race night floodlight poles');
  finish(luminaire, 'Race-night illuminated floodlight heads');

  const circuitLights = [0, 650, 1580, 2260, 3170, 4130, 4770, 5450]
    .map(station => frames[Math.floor(station / TRACK_LENGTH_METERS * frames.length)]);
  const localLights = [];
  for (const frame of circuitLights) {
    const light = new THREE.PointLight(0xffe7b8, 27, 170, 2);
    light.position.copy(frame.point).add(new THREE.Vector3(0, 22, 0));
    light.castShadow = false;
    group.add(light);
    localLights.push(light);
  }

  return {
    group,
    setWetLighting(wet) {
      barrierMat.color.setHex(wet ? 0x969eaa : 0xc8c9cc);
      lampMat.color.setHex(wet ? 0xdce8ff : 0xfff0bf);
    },
    updateLighting(target) {
      for (const light of localLights) {
        light.visible = light.position.distanceToSquared(target) < 420 * 420;
      }
    },
  };
}
