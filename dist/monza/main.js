import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { createMonzaWorld } from './world.js';
import { createRaceController } from './race-motion.js';
import { bindWheelSpin } from './wheel-spin.js';

const canvas = document.querySelector('#scene');
const atlas = document.querySelector('#atlas');
const loading = document.querySelector('#loading');
const loadingMessage = document.querySelector('#loading-message');
const overviewButton = document.querySelector('#overview');
const gridButton = document.querySelector('#grid');
const flyoverButton = document.querySelector('#flyover');
const raceButton = document.querySelector('#race');
const raceHud = document.querySelector('#race-hud');
const raceLabel = raceHud.querySelector('.race-label');
const raceSpeed = document.querySelector('#race-speed');
const raceLap = document.querySelector('#race-lap');
const raceDistance = document.querySelector('#race-distance');
const raceProgress = document.querySelector('#race-progress');
const gestureHint = document.querySelector('.gesture-hint');
const exploreHint = gestureHint.innerHTML;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (error) {
  loadingMessage.textContent = 'La 3D est indisponible dans ce navigateur.';
  console.error(error);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x617969);
  scene.fog = new THREE.Fog(0x617969, 3700, 6500);

  const camera = new THREE.PerspectiveCamera(41, 1, 0.5, 6500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 22;
  controls.maxDistance = 5200;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.7;

  scene.add(new THREE.HemisphereLight(0xeaf6f4, 0x385141, 1.2));
  const sun = new THREE.DirectionalLight(0xffefd7, 2.15);
  sun.position.set(-750, 1100, 820);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1250;
  sun.shadow.camera.right = 1250;
  sun.shadow.camera.top = 1250;
  sun.shadow.camera.bottom = -1250;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 3200;
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.7;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  function resize() {
    const width = Math.max(1, atlas.clientWidth);
    const height = Math.max(1, atlas.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  new ResizeObserver(resize).observe(atlas);
  resize();

  let world;
  let initialPosition = new THREE.Vector3();
  let initialTarget = new THREE.Vector3();
  let cameraMove = null;
  let flying = false;
  let racing = false;
  let raceStarted = false;
  let raceController = null;
  let wheelAnimator = null;
  let lastRaceDistance = 0;
  let lapProgress = 0;
  let lastTime = performance.now();

  function updateRaceHud() {
    if (!raceController) return;
    const stats = raceController.stats;
    const lapDistance = stats.distanceMeters % stats.trackLengthMeters;
    raceSpeed.textContent = Math.round(stats.speedKmh).toString();
    raceLap.textContent = `TOUR ${stats.lap + 1}`;
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 5,79 KM`;
    raceProgress.style.width = `${Math.min(100, lapDistance / stats.trackLengthMeters * 100)}%`;
  }

  function pauseRace() {
    if (!racing || !raceController) return;
    racing = false;
    raceController.stop();
    controls.enabled = true;
    raceButton.textContent = '▶  Reprendre';
    raceButton.setAttribute('aria-pressed', 'false');
    raceLabel.textContent = 'COURSE EN PAUSE';
    gestureHint.innerHTML = exploreHint;
  }

  function exitRace() {
    if (!raceController || !raceStarted) return;
    raceController.reset();
    racing = false;
    raceStarted = false;
    lastRaceDistance = 0;
    controls.enabled = true;
    raceHud.hidden = true;
    raceButton.textContent = '▶  Course';
    raceButton.setAttribute('aria-pressed', 'false');
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> SIMULATION DE COURSE';
    gestureHint.innerHTML = exploreHint;
  }

  function startRace() {
    if (!raceController || !world) return;
    stopFlyover();
    if (!raceStarted) {
      raceController.reset();
      lastRaceDistance = 0;
      raceStarted = true;
    }
    raceController.start();
    racing = true;
    cameraMove = null;
    controls.enabled = false;
    raceButton.textContent = 'Ⅱ  Pause';
    raceButton.setAttribute('aria-pressed', 'true');
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> SIMULATION DE COURSE';
    raceHud.hidden = false;
    gestureHint.textContent = 'Caméra de poursuite · Pause pour explorer';
    updateRaceHud();
    lastTime = performance.now();
  }

  function moveCamera(position, target, duration = 950) {
    cameraMove = {
      start: performance.now(), duration,
      fromPosition: camera.position.clone(), toPosition: position.clone(),
      fromTarget: controls.target.clone(), toTarget: target.clone(),
    };
  }

  function stopFlyover() {
    if (!flying) return;
    flying = false;
    controls.enabled = true;
    flyoverButton.setAttribute('aria-pressed', 'false');
    lastTime = performance.now();
  }

  try {
    world = createMonzaWorld(THREE, scene);
    const center = world.bounds.getCenter(new THREE.Vector3());
    const size = world.bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    initialTarget.set(center.x, 0, center.z);
    if (camera.aspect < .8) {
      initialPosition.set(center.x + span * .04, span * 2.10, center.z + span * .08);
    } else {
      initialPosition.set(center.x + span * .60, span * 1.25, center.z + span * .85);
    }
    camera.position.copy(initialPosition);
    controls.target.copy(initialTarget);
    controls.update();
    sun.target.position.copy(initialTarget);
    scene.add(sun.target);

    // The existing RB22 is a small, scale-correct detail at the starting grid.
    // It loads after the circuit so slower connections can explore immediately.
    const carU = (world.gridU - .0025 + 1) % 1;
    const carPoint = world.curve.getPointAt(carU);
    const carDirection = world.curve.getTangentAt(carU).setY(0).normalize();
    const carSide = new THREE.Vector3(carDirection.z, 0, -carDirection.x);
    new GLTFLoader().load('../rb22_max_verstappen_2026.glb', ({ scene: car }) => {
      car.position.copy(carPoint).addScaledVector(carSide, -2.35);
      car.position.y = .34;
      car.rotation.y = Math.atan2(carDirection.z, -carDirection.x);
      car.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(car);
      raceController = createRaceController(THREE, world.curve, car, {
        startU: carU,
        laneOffset: -2.35,
        carY: .34,
      });
      const wheels = bindWheelSpin(THREE, car);
      if (wheels.enabled) wheelAnimator = wheels;
      else wheels.dispose();
      raceButton.disabled = false;
    }, undefined, error => console.warn('La monoplace de démonstration est indisponible.', error));

    overviewButton.disabled = false;
    gridButton.disabled = false;
    flyoverButton.disabled = false;
    loading.classList.add('is-hidden');
  } catch (error) {
    loadingMessage.textContent = 'Le circuit n’a pas pu être affiché.';
    console.error(error);
  }

  overviewButton.addEventListener('click', () => {
    exitRace();
    stopFlyover();
    if (world) moveCamera(initialPosition, initialTarget);
  });

  gridButton.addEventListener('click', () => {
    exitRace();
    stopFlyover();
    if (!world) return;
    const at = world.gridPoint.clone();
    const dir = world.gridTangent.clone().normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const position = at.clone().addScaledVector(dir, -50).addScaledVector(side, -9);
    position.y = 11;
    const target = at.clone().addScaledVector(dir, -8).addScaledVector(side, -2);
    target.y = 2;
    moveCamera(position, target, 1100);
  });

  flyoverButton.addEventListener('click', () => {
    if (!world) return;
    exitRace();
    if (flying) { stopFlyover(); return; }
    flying = true;
    cameraMove = null;
    controls.enabled = false;
    lapProgress = world.gridU;
    flyoverButton.setAttribute('aria-pressed', 'true');
    lastTime = performance.now();
  });
  raceButton.addEventListener('click', () => {
    if (racing) pauseRace();
    else startRace();
  });
  canvas.addEventListener('pointerdown', () => { pauseRace(); stopFlyover(); });

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;

    if (racing && world && raceController) {
      const stats = raceController.update(dt);
      if (wheelAnimator) wheelAnimator.update(stats.distanceMeters - lastRaceDistance);
      lastRaceDistance = stats.distanceMeters;
      const forward = stats.tangent;
      const side = new THREE.Vector3(forward.z, 0, -forward.x);
      const desiredPosition = stats.position.clone().addScaledVector(forward, -13).addScaledVector(side, 3.3);
      desiredPosition.y = 4.6;
      const desiredTarget = stats.position.clone().addScaledVector(forward, 22);
      desiredTarget.y = 1.4;
      const smoothing = 1 - Math.exp(-dt * 3.5);
      camera.position.lerp(desiredPosition, smoothing);
      controls.target.lerp(desiredTarget, smoothing);
      camera.lookAt(controls.target);
      updateRaceHud();
    } else if (flying && world) {
      lapProgress = (lapProgress + dt / 80) % 1;
      const at = world.curve.getPointAt(lapProgress);
      const ahead = world.curve.getPointAt((lapProgress + .008) % 1);
      const dir = ahead.clone().sub(at).normalize();
      camera.position.copy(at).addScaledVector(dir, -48);
      camera.position.y = 31;
      controls.target.copy(ahead);
      controls.target.y = 4;
      camera.lookAt(controls.target);
    } else if (cameraMove) {
      const t = Math.min(1, (now - cameraMove.start) / cameraMove.duration);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(cameraMove.fromPosition, cameraMove.toPosition, eased);
      controls.target.lerpVectors(cameraMove.fromTarget, cameraMove.toTarget, eased);
      controls.update();
      if (t >= 1) cameraMove = null;
    } else {
      controls.update();
    }
    if (world) {
      const distance = camera.position.distanceTo(controls.target);
      world.overviewAccent.opacity = Math.max(0, Math.min(.82, (distance - 950) / 1900));
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
