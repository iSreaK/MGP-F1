import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';

const canvas = document.querySelector('#scene');
const viewer = document.querySelector('#viewer');
const status = document.querySelector('#status');
const statusKicker = document.querySelector('#status-kicker');
const statusMessage = document.querySelector('#status-message');
const statusDetail = document.querySelector('#status-detail');
const progressTrack = document.querySelector('#progress-track');
const progressFill = document.querySelector('#progress-fill');
const spinButton = document.querySelector('#spin');
const resetButton = document.querySelector('#reset');
const returnButton = document.querySelector('#status-return');
const downloadLink = document.querySelector('#download-model');
const monzaLink = document.querySelector('.scene-link');
const carChoices = [...document.querySelectorAll('[data-car-choice]')];

const cars = {
  redbull: {
    name: 'RB22', team: 'RED BULL RACING', driver: 'MAX VERSTAPPEN', driverName: 'Max Verstappen', number: '03',
    url: './rb22_max_verstappen_2026.glb?v=20260924-2',
  },
  ferrari: {
    name: 'SF-26', team: 'SCUDERIA FERRARI', driver: 'LEWIS HAMILTON', driverName: 'Lewis Hamilton', number: '44',
    url: './ferrari_sf26_hamilton_44.glb?v=20260925-4',
  },
  alpine: {
    name: 'A526', team: 'BWT ALPINE F1 TEAM', driver: 'PIERRE GASLY', driverName: 'Pierre Gasly', number: '10',
    url: './alpine_a526_gasly_10.glb?v=20260925-2',
  },
  mclaren: {
    name: 'MCL40', team: 'MCLAREN FORMULA 1 TEAM', driver: 'LANDO NORRIS', driverName: 'Lando Norris', number: '1',
    url: './mclaren_mcl40_norris_1.glb?v=20260925-2',
  },
  mercedes: {
    name: 'W17', team: 'MERCEDES-AMG PETRONAS F1 TEAM', driver: 'KIMI ANTONELLI', driverName: 'Kimi Antonelli', number: '12',
    url: './mercedes_w17_antonelli_12.glb?v=20260925-2',
  },
  audi: {
    name: 'R26', team: 'AUDI REVOLUT F1 TEAM', driver: 'GABRIEL BORTOLETO', driverName: 'Gabriel Bortoleto', number: '5',
    url: './audi_r26_bortoleto_5.glb?v=20260925-1',
  },
};

function updateCarUI(key) {
  const car = cars[key];
  viewer.dataset.car = key;
  document.querySelector('#team-name').textContent = car.team;
  document.querySelector('#model-name').textContent = car.name;
  document.querySelector('#car-number').textContent = car.number;
  document.querySelector('#driver-label').innerHTML = `<span>PILOTE / ${car.number}</span> ${car.driver}`;
  canvas.setAttribute('aria-label', `Modèle 3D de la ${car.name} de ${car.driverName}`);
  document.title = `${car.name} 2026 · Garage 3D interactif`;
  downloadLink.href = new URL(car.url, import.meta.url).href;
  downloadLink.setAttribute('aria-label', `Télécharger le modèle 3D ${car.name} de ${car.driver}`);
  monzaLink.href = key === 'redbull' ? './monza/' : `./monza/?car=${encodeURIComponent(key)}`;
  for (const choice of carChoices) {
    const selected = choice.dataset.carChoice === key;
    choice.classList.toggle('is-active', selected);
    choice.setAttribute('aria-pressed', String(selected));
  }
}

function fail(message, detail) {
  status.classList.remove('is-hidden');
  status.classList.add('is-error');
  statusKicker.textContent = 'IMPOSSIBLE DE CHARGER LE MODÈLE';
  statusMessage.textContent = message;
  statusDetail.textContent = detail;
  progressTrack.hidden = true;
}

if (location.protocol === 'file:') {
  fail('Ouvrez cette page depuis localhost.', 'Dans le dossier viewer, lancez : node serve.mjs');
} else {
  startViewer();
}

function startViewer() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    fail('WebGL est indisponible dans ce navigateur.', 'Activez l’accélération graphique ou essayez Chrome ou Edge.');
    console.error(error);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x080d16, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.54;
  controls.rotateSpeed = 0.72;
  controls.zoomSpeed = 0.85;
  controls.enabled = false;

  try {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(room).texture;
    scene.environmentIntensity = 0.58;
    room.dispose();
    pmrem.dispose();
  } catch (error) {
    console.warn('Éclairage ambiant simplifié :', error);
  }

  scene.add(new THREE.HemisphereLight(0xd7e6ff, 0x1b2431, 1.1));
  const key = new THREE.DirectionalLight(0xfff5e8, 2.25);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.025;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x679cf8, 1.1);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffb97d, 0.45);
  scene.add(fill);

  let initialPosition = new THREE.Vector3(6, 4, 8);
  let initialTarget = new THREE.Vector3();
  let loaded = false;
  let ground = null;
  let activeModel = null;
  let activeKey = null;
  let requestId = 0;
  const cachedModels = new Map();

  function resize() {
    const width = Math.max(1, viewer.clientWidth);
    const height = Math.max(1, viewer.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  new ResizeObserver(resize).observe(viewer);
  resize();

  function fitModel(model) {
    model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) throw new Error('Le fichier ne contient aucune géométrie visible.');

    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    box.setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.1);

    const verticalFOV = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFOV = 2 * Math.atan(Math.tan(verticalFOV / 2) * camera.aspect);
    // The monoplace is long and low, so a sphere-fit leaves too much empty space.
    // Keep a little more breathing room on narrow screens, where width is limiting.
    // Leave the nose and front wing visible beside the garage selector.
    const framing = THREE.MathUtils.lerp(1.02, 0.79, THREE.MathUtils.smoothstep(camera.aspect, 0.8, 1.6));
    const distance = (radius / Math.sin(Math.min(verticalFOV, horizontalFOV) / 2)) * framing;
    const view = new URLSearchParams(location.search).get('view');
    let direction;
    if (view === 'side') direction = new THREE.Vector3(0, 0.13, 1);
    else if (view === 'top') direction = new THREE.Vector3(0, 1, 0.001);
    else if (view === 'cockpit') direction = new THREE.Vector3(-0.55, 0.88, 1);
    else if (view === 'front') direction = new THREE.Vector3(-1, 0.22, 0.001);
    else if (view === 'rear') direction = new THREE.Vector3(1, 0.22, 0.001);
    else if (size.x >= size.z) direction = new THREE.Vector3(-0.8, 0.47, 1.3);
    else direction = new THREE.Vector3(1.3, 0.47, -0.8);
    camera.up.set(0, 1, 0);
    if (view === 'top') camera.up.set(0, 0, -1);

    if (view === 'cockpit') initialTarget.set(-.16-center.x, .79-center.y, 0);
    else if (view === 'front') initialTarget.set(-1.70-center.x, .52-center.y, 0);
    else if (view === 'rear') initialTarget.set(1.65-center.x, .58-center.y, 0);
    else initialTarget.set(0, 0, 0);
    initialPosition = direction.normalize().multiplyScalar(
      view === 'cockpit' ? radius * 1.15
        : view === 'front' || view === 'rear' ? radius * 1.65 : distance
    ).add(initialTarget);
    camera.position.copy(initialPosition);
    camera.near = Math.max(radius / 1000, 0.001);
    camera.far = distance * 12;
    camera.updateProjectionMatrix();
    controls.target.copy(initialTarget);
    controls.minDistance = radius * 0.75;
    controls.maxDistance = distance * 3.5;
    controls.update();
    controls.saveState();

    key.position.set(-radius * 1.8, radius * 3.2, radius * 2.1);
    key.target.position.set(0, 0, 0);
    scene.add(key.target);
    key.shadow.camera.left = -radius * 2.1;
    key.shadow.camera.right = radius * 2.1;
    key.shadow.camera.top = radius * 2.1;
    key.shadow.camera.bottom = -radius * 2.1;
    key.shadow.camera.near = radius * 0.1;
    key.shadow.camera.far = radius * 8;
    key.shadow.camera.updateProjectionMatrix();
    rim.position.set(radius * 1.6, radius * 1.6, -radius * 2.3);
    fill.position.set(radius * 1.4, radius * 1.5, radius * 2.0);

    const groundMaterial = new THREE.ShadowMaterial({ color: 0x02050c, opacity: 0.48 });
    if (ground) {
      scene.remove(ground);
      ground.geometry.dispose();
      ground.material.dispose();
    }
    ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 14, radius * 14), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = box.min.y - radius * 0.008;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  const loader = new GLTFLoader();
  function activateCar(key, model) {
    const previousModel = activeModel;
    try {
      if (!model.parent) scene.add(model);
      model.visible = true;
      fitModel(model);
      if (previousModel && previousModel !== model) previousModel.visible = false;
      activeModel = model;
      activeKey = key;
      loaded = true;
      controls.enabled = true;
      spinButton.disabled = false;
      resetButton.disabled = false;
      controls.autoRotate = false;
      spinButton.setAttribute('aria-pressed', 'false');
      updateCarUI(key);
      status.classList.add('is-hidden');
      const url = new URL(location.href);
      if (key === 'redbull') url.searchParams.delete('car');
      else url.searchParams.set('car', key);
      history.replaceState(null, '', url);
    } catch (error) {
      model.visible = false;
      if (previousModel) previousModel.visible = true;
      fail('Le modèle ne peut pas être affiché.', error.message || 'Vérifiez la structure du fichier GLB.');
      returnButton.hidden = !activeModel;
      console.error(error);
    }
  }

  function loadCar(key) {
    if (!cars[key]) return;
    const token = ++requestId;
    status.classList.remove('is-hidden', 'is-error');
    statusKicker.textContent = 'CHARGEMENT DU MODÈLE';
    statusMessage.textContent = `Préparation de la ${cars[key].name}…`;
    statusDetail.textContent = 'Le premier chargement peut prendre quelques instants.';
    progressTrack.hidden = false;
    progressFill.style.width = '5%';
    returnButton.hidden = true;
    controls.enabled = false;
    if (cachedModels.has(key)) {
      activateCar(key, cachedModels.get(key));
      return;
    }
    loader.load(
      new URL(cars[key].url, import.meta.url).href,
      ({ scene: model }) => {
        model.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        cachedModels.set(key, model);
        if (token === requestId) activateCar(key, model);
      },
      (event) => {
        if (token !== requestId) return;
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          progressFill.style.width = `${percent}%`;
          statusMessage.textContent = `Chargement de la ${cars[key].name} · ${percent} %`;
        } else if (event.loaded > 0) {
          statusMessage.textContent = `Chargement de la ${cars[key].name} · ${(event.loaded / 1048576).toFixed(1)} Mo`;
        }
      },
      (error) => {
        if (token !== requestId) return;
        fail('Le fichier GLB est introuvable ou illisible.', `Impossible d'ouvrir ${cars[key].name}. Réessayez dans quelques instants.`);
        returnButton.hidden = !activeModel;
        if (activeModel) {
          controls.enabled = true;
          updateCarUI(activeKey);
        } else if (key !== 'redbull') {
          loadCar('redbull');
        }
        console.error(error);
      },
    );
  }

  carChoices.forEach((choice) => {
    choice.addEventListener('click', () => {
      if (choice.dataset.carChoice !== activeKey) loadCar(choice.dataset.carChoice);
    });
  });
  returnButton.addEventListener('click', () => status.classList.add('is-hidden'));
  const initialKey = new URLSearchParams(location.search).get('car');
  loadCar(cars[initialKey] ? initialKey : 'redbull');

  spinButton.addEventListener('click', () => {
    const active = spinButton.getAttribute('aria-pressed') !== 'true';
    spinButton.setAttribute('aria-pressed', String(active));
    controls.autoRotate = active;
    controls.autoRotateSpeed = 0.65;
  });

  controls.addEventListener('start', () => {
    if (controls.autoRotate) {
      controls.autoRotate = false;
      spinButton.setAttribute('aria-pressed', 'false');
    }
  });

  resetButton.addEventListener('click', () => {
    if (!loaded) return;
    controls.autoRotate = false;
    spinButton.setAttribute('aria-pressed', 'false');
    camera.position.copy(initialPosition);
    controls.target.copy(initialTarget);
    controls.update();
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}
