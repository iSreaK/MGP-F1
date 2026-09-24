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

const modelURL = new URL('./rb22_max_verstappen_2026.glb', import.meta.url);

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
    const framing = THREE.MathUtils.lerp(1.02, 0.69, THREE.MathUtils.smoothstep(camera.aspect, 0.8, 1.6));
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
    ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 14, radius * 14), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = box.min.y - radius * 0.008;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  const loader = new GLTFLoader();
  loader.load(
    modelURL.href,
    ({ scene: model }) => {
      try {
        model.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        scene.add(model);
        fitModel(model);
        loaded = true;
        controls.enabled = true;
        spinButton.disabled = false;
        resetButton.disabled = false;
        status.classList.add('is-hidden');
      } catch (error) {
        fail('Le modèle ne peut pas être affiché.', error.message || 'Vérifiez la structure du fichier GLB.');
        console.error(error);
      }
    },
    (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        progressFill.style.width = `${percent}%`;
        statusMessage.textContent = `Chargement du modèle · ${percent} %`;
      } else if (event.loaded > 0) {
        statusMessage.textContent = `Chargement du modèle · ${(event.loaded / 1048576).toFixed(1)} Mo`;
      }
    },
    (error) => {
      fail('Le fichier GLB est introuvable ou illisible.', 'Vérifiez que rb22_max_verstappen_2026.glb se trouve à la racine du site, puis rechargez la page.');
      console.error(error);
    },
  );

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
