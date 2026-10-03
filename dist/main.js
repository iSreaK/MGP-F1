import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { carCatalog, carByKey } from './car-catalog.js';

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
const cars = carByKey;
const garage = document.querySelector('.garage');
const garageSearch = document.querySelector('#garage-search');
const garageResults = document.querySelector('#garage-results');
const garageEmpty = document.querySelector('#garage-empty');
const switcher = document.querySelector('.car-switcher');
const teams = new Map();
for (const car of carCatalog) {
  if (!teams.has(car.teamKey)) teams.set(car.teamKey, []);
  teams.get(car.teamKey).push(car);
}
switcher.innerHTML = [...teams.entries()].map(([teamKey, teamCars]) => `
  <section class="team-group" data-team-group="${teamKey}">
    <h2 class="team-heading">${teamCars[0].team}</h2>
    ${teamCars.map(car => `
      <button class="car-choice" type="button" data-car-choice="${car.key}" data-team="${car.teamKey}" aria-pressed="false">
        <span class="car-choice-number">N° ${car.number}</span>
        <span class="car-choice-person"><strong>${car.driverName}</strong><small>${car.name}</small></span>
        <span class="car-choice-arrow" aria-hidden="true">›</span>
      </button>`).join('')}
  </section>`).join('');
document.querySelector('#garage-count').textContent = `${carCatalog.length} voitures`;
const carChoices = [...switcher.querySelectorAll('[data-car-choice]')];
const teamGroups = [...switcher.querySelectorAll('[data-team-group]')];
const narrowScreen = window.matchMedia('(max-width: 760px)');
if (narrowScreen.matches) garage.open = false;
function updateGarageToggleLabel() {
  document.querySelector('#garage-toggle-label').textContent = garage.open ? 'Masquer' : 'Voitures';
}
updateGarageToggleLabel();

function normalizeSearch(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
}

function filterGarage() {
  const query = normalizeSearch(garageSearch.value);
  switcher.scrollTop = 0;
  let visibleCars = 0;
  let visibleTeams = 0;
  for (const group of teamGroups) {
    const teamMatches = normalizeSearch(group.querySelector('.team-heading').textContent).includes(query);
    let groupCars = 0;
    for (const choice of group.querySelectorAll('.car-choice')) {
      const car = cars[choice.dataset.carChoice];
      const matches = teamMatches || normalizeSearch(`${car.driverName} ${car.name} ${car.number}`).includes(query);
      choice.hidden = !matches;
      if (matches) groupCars++;
    }
    group.hidden = groupCars === 0;
    visibleCars += groupCars;
    if (groupCars) visibleTeams++;
  }
  garageResults.textContent = `${visibleCars} voiture${visibleCars === 1 ? '' : 's'} · ${visibleTeams} écurie${visibleTeams === 1 ? '' : 's'}`;
  garageEmpty.hidden = visibleCars !== 0;
}

garageSearch.addEventListener('input', filterGarage);
garageSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && garageSearch.value) {
    garageSearch.value = '';
    filterGarage();
  }
});
function revealActiveChoice() {
  const choice = switcher.querySelector('.car-choice.is-active');
  if (!choice || !garage.open) return;
  const list = switcher.getBoundingClientRect();
  const item = choice.getBoundingClientRect();
  switcher.scrollTop += item.top - list.top - Math.max(8, (list.height - item.height) / 2);
}
garage.addEventListener('toggle', () => {
  updateGarageToggleLabel();
  garage.scrollTop = 0;
  if (garage.open && !garageSearch.value) requestAnimationFrame(revealActiveChoice);
});

function closeMobileGarage() {
  if (narrowScreen.matches) garage.open = false;
}

function updateCarUI(key) {
  const car = cars[key];
  viewer.dataset.car = car.teamKey;
  document.querySelector('#team-name').textContent = car.team;
  document.querySelector('#model-name').textContent = car.name;
  document.querySelector('#car-number').textContent = car.displayNumber;
  document.querySelector('#driver-label').innerHTML = `<span>PILOTE / ${car.number}</span> ${car.driver}`;
  document.querySelector('#garage-current').textContent = `${car.driverName} · ${car.name}`;
  canvas.setAttribute('aria-label', `Modèle 3D de la ${car.name} de ${car.driverName}`);
  document.title = `${car.driverName} · ${car.name} 2026 · Garage 3D`;
  downloadLink.href = new URL(car.url, import.meta.url).href;
  downloadLink.setAttribute('aria-label', `Télécharger le modèle 3D ${car.name} de ${car.driverName} au format GLB`);
  monzaLink.href = key === 'redbull' ? './monza/' : `./monza/?car=${encodeURIComponent(key)}`;
  monzaLink.setAttribute('aria-label', `Voir la ${car.name} de ${car.driverName} sur le circuit de Monza`);
  for (const choice of carChoices) {
    const selected = choice.dataset.carChoice === key;
    choice.classList.toggle('is-active', selected);
    choice.setAttribute('aria-pressed', String(selected));
  }
  if (garage.open && !garageSearch.value) revealActiveChoice();
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
      if (garageSearch.value) {
        garageSearch.value = '';
        filterGarage();
      }
      if (choice.dataset.carChoice !== activeKey) loadCar(choice.dataset.carChoice);
      closeMobileGarage();
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
