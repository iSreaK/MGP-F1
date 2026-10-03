import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { createMonzaWorld } from './world.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING } from './grid-details.js';
import { createTrackGapLookup } from './track-gap.js';
import { createRaceController } from './race-motion.js';
import { createHistoricalReplay, replayLapDistance } from './historical-replay.js';
import { computeReplayPlacements, replayVisualDistance, replayPitOffset, rateLimitReplayOffset } from './replay-lanes.js';
import { bindWheelSpin } from './wheel-spin.js';
import { createMonzaSky } from './sky.js';
import { createMonzaWeather } from './weather.js';

const canvas = document.querySelector('#scene');
const atlas = document.querySelector('#atlas');
const loading = document.querySelector('#loading');
const loadingMessage = document.querySelector('#loading-message');
const overviewButton = document.querySelector('#overview');
const gridButton = document.querySelector('#grid');
const flyoverButton = document.querySelector('#flyover');
const raceButton = document.querySelector('#race');
const replayButton = document.querySelector('#replay');
const replayPanel = document.querySelector('#replay-panel');
const replayPanelToggle = document.querySelector('#replay-panel-toggle');
const replayToggle = document.querySelector('#replay-toggle');
const replayTimeline = document.querySelector('#replay-timeline');
const replayClock = document.querySelector('#replay-clock');
const replaySpeed = document.querySelector('#replay-speed');
const replayDriver = document.querySelector('#replay-driver');
const replayRankings = document.querySelector('#replay-rankings');
const replayStatus = document.querySelector('#replay-status');
const replaySkipPause = document.querySelector('#replay-skip-pause');
const replayGear = document.querySelector('#replay-gear');
const replayThrottle = document.querySelector('#replay-throttle');
const replayBrake = document.querySelector('#replay-brake');
const replayOfficialPosition = document.querySelector('#replay-official-position');
const replaySpeedKph = document.querySelector('#replay-speed-kph');
const raceHud = document.querySelector('#race-hud');
const raceLabel = raceHud.querySelector('.race-label');
const raceHudCode = raceHud.querySelector('.race-hud-code');
const raceSpeed = document.querySelector('#race-speed');
const raceLap = document.querySelector('#race-lap');
const raceLapLabel = document.querySelector('#race-lap-label');
const raceDistance = document.querySelector('#race-distance');
const raceProgress = document.querySelector('#race-progress');
const raceLapTime = document.querySelector('#race-lap-time');
const raceLastLap = document.querySelector('#race-last-lap');
const raceSection = document.querySelector('#race-section');
const cameraModeButton = document.querySelector('#camera-mode');
const weatherButton = document.querySelector('#weather');
const gestureHint = document.querySelector('.gesture-hint');
const exploreHint = gestureHint.innerHTML;

const cameraModes = ['Poursuite', 'TV', 'Hélico'];
const replayNames = Object.freeze({
  3: 'Verstappen', 44: 'Hamilton', 10: 'Gasly',
  1: 'Norris', 12: 'Antonelli', 5: 'Bortoleto',
});
const requestedCar = new URLSearchParams(window.location.search).get('car');
const requestedReplayNumber = ({ ferrari: 44, alpine: 10, mclaren: 1, mercedes: 12, audi: 5 })[requestedCar] || 3;
let focusFerrari = requestedCar === 'ferrari';
let focusAlpine = requestedCar === 'alpine';
let focusMcLaren = requestedCar === 'mclaren';
let focusMercedes = requestedCar === 'mercedes';
let focusAudi = requestedCar === 'audi';
if (raceHudCode) {
  raceHudCode.textContent = ({
    ferrari: 'HAMILTON / 44',
    alpine: 'GASLY / 10',
    mclaren: 'NORRIS / 1',
    mercedes: 'ANTONELLI / 12',
    audi: 'BORTOLETO / 5',
  })[requestedCar] || 'VERSTAPPEN / RB22';
}
if (focusFerrari || focusAlpine || focusMcLaren || focusMercedes || focusAudi) {
  document.querySelector('.return-link')?.setAttribute('href', `../?car=${requestedCar}`);
}

function formatLapTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${rest}`;
}

function formatReplayClock(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(whole / 3600).toString().padStart(2, '0')}:${Math.floor(whole / 60 % 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

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
  scene.background = new THREE.Color(0x9cbdd0);
  scene.fog = new THREE.Fog(0xbfd3d4, 3600, 7600);
  const sky = createMonzaSky(THREE, scene);

  const camera = new THREE.PerspectiveCamera(41, 1, 0.5, 6500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  controls.maxDistance = 5200;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.7;

  const ambient = new THREE.HemisphereLight(0xf0f8ff, 0x63745c, 1.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffebce, 2.7);
  const sunOffset = new THREE.Vector3(-980, 780, 1080);
  sun.position.copy(sunOffset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -135;
  sun.shadow.camera.right = 135;
  sun.shadow.camera.top = 135;
  sun.shadow.camera.bottom = -135;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 3200;
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  function focusSun(position) {
    sun.position.copy(position).add(sunOffset);
    sun.target.position.copy(position);
    sun.target.updateMatrixWorld();
  }

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
  let trackGap;
  let weather;
  let wetMode = false;
  let initialPosition = new THREE.Vector3();
  let initialTarget = new THREE.Vector3();
  let cameraMove = null;
  let flying = false;
  let racing = false;
  let raceStarted = false;
  let raceController = null;
  let redBullCar = null;
  let wheelAnimator = null;
  let lastRaceDistance = 0;
  let ferrariRaceController = null;
  let ferrariWheelAnimator = null;
  let lastFerrariRaceDistance = 0;
  let alpineRaceController = null;
  let alpineWheelAnimator = null;
  let lastAlpineRaceDistance = 0;
  let mclarenRaceController = null;
  let mclarenWheelAnimator = null;
  let lastMcLarenRaceDistance = 0;
  let mercedesRaceController = null;
  let mercedesWheelAnimator = null;
  let lastMercedesRaceDistance = 0;
  let audiRaceController = null;
  let audiWheelAnimator = null;
  let lastAudiRaceDistance = 0;
  let lapProgress = 0;
  let cameraMode = 0;
  let introPlayed = false;
  let lastTime = performance.now();
  let historicalReplay = null;
  let replayDataPromise = null;
  let replayActive = false;
  let selectedReplayNumber = requestedReplayNumber;
  let lastReplayRankingKey = '';
  let savedWetModeForReplay = false;
  let lastReplayPoseTime = null;
  let replayTotalLaps = 53;
  let replayRequestId = 0;
  const replayLateralOffsets = new Map();

  function replayCars() {
    return {
      3: { controller: raceController, wheels: wheelAnimator },
      44: { controller: ferrariRaceController, wheels: ferrariWheelAnimator },
      10: { controller: alpineRaceController, wheels: alpineWheelAnimator },
      1: { controller: mclarenRaceController, wheels: mclarenWheelAnimator },
      12: { controller: mercedesRaceController, wheels: mercedesWheelAnimator },
      5: { controller: audiRaceController, wheels: audiWheelAnimator },
    };
  }

  function updateReplayAvailability() {
    if (replayButton) replayButton.disabled = !Object.values(replayCars()).every(car => car.controller);
  }

  function replayPauseAt(timeSec) {
    return historicalReplay?.data.session.pauses?.find(pause => timeSec >= pause.startSec && timeSec < pause.endSec) || null;
  }

  function replayRaceStatus(timeSec, selected) {
    const data = historicalReplay.data;
    if (replayPauseAt(timeSec)) return 'DRAPEAU ROUGE · Course interrompue';
    if (timeSec >= historicalReplay.durationSec) return 'ARRIVÉE · Replay terminé';
    const pit = data.drivers[selected.number]?.pit?.find(stop =>
      !stop.redFlagTransit && timeSec >= stop.tSec - stop.laneDurationSec && timeSec < stop.tSec + 5);
    if (pit) return `STANDS · ${replayNames[selected.number]} · voie approximative`;
    const eventTime = (message, after = -1) => data.events?.find(event => event.message === message && event.tSec > after)?.tSec;
    const vscStart = eventTime('VSC DEPLOYED');
    const vscEnd = eventTime('VSC ENDING', vscStart);
    if (timeSec >= vscStart && timeSec < vscEnd) return 'VSC · Voiture de sécurité virtuelle';
    const safetyCar = eventTime('SAFETY CAR DEPLOYED');
    if (timeSec >= safetyCar && timeSec < data.session.pauses[0]?.startSec) return 'VOITURE DE SÉCURITÉ';
    const resume = eventTime('SESSION STARTED', 1);
    const extraLap = eventTime('EXTRA FORMATION LAP');
    const overtaking = eventTime('OVERTAKE ENABLED', resume);
    if (timeSec >= resume && timeSec < overtaking) {
      return timeSec >= extraLap && timeSec < extraLap + 48
        ? 'REPRISE · Tour de formation supplémentaire'
        : 'PROCÉDURE DE REPRISE';
    }
    return historicalReplay.playing ? 'REPLAY EN COURS' : 'REPLAY EN PAUSE';
  }

  function updateReplayControls(frame) {
    if (!historicalReplay || !frame) return;
    const selected = frame.byNumber[selectedReplayNumber] || frame.cars[0];
    if (!selected) return;
    if (replayTimeline) {
      replayTimeline.max = historicalReplay.durationSec.toFixed(1);
      replayTimeline.value = frame.timeSec.toFixed(1);
    }
    if (replayClock) replayClock.textContent = `${formatReplayClock(frame.timeSec)} / ${formatReplayClock(historicalReplay.durationSec)}`;
    if (replaySpeed) replaySpeed.value = String(historicalReplay.speed);
    if (replayDriver) replayDriver.value = String(selectedReplayNumber);
    if (replayToggle) {
      replayToggle.textContent = historicalReplay.playing ? 'Ⅱ  Pause' : '▶  Lecture';
      replayToggle.setAttribute('aria-pressed', String(historicalReplay.playing));
      replayToggle.setAttribute('aria-label', historicalReplay.playing ? 'Mettre le replay en pause' : 'Lire le replay');
    }
    const pause = replayPauseAt(frame.timeSec);
    const status = replayRaceStatus(frame.timeSec, selected);
    if (replayStatus && replayStatus.textContent !== status) replayStatus.textContent = status;
    if (replaySkipPause) replaySkipPause.hidden = !pause;
    const rankingKey = `${selectedReplayNumber}|${frame.cars.map(car => `${car.number}:${car.officialPosition}`).join(',')}`;
    if (replayRankings && rankingKey !== lastReplayRankingKey) {
      lastReplayRankingKey = rankingKey;
      replayRankings.innerHTML = frame.cars.map(car =>
        `<li class="${car.number === selectedReplayNumber ? 'is-followed' : ''}"><button type="button" data-replay-number="${car.number}" aria-label="Suivre ${replayNames[car.number]}, position officielle ${car.officialPosition ?? 'inconnue'}"><span>${car.selectedRank}</span><strong>${replayNames[car.number]}</strong><small>#${car.number} · P${car.officialPosition ?? '—'} officielle</small></button></li>`
      ).join('');
    }
    raceHudCode.textContent = `${replayNames[selected.number].toUpperCase()} / ${selected.number}`;
    raceSpeed.textContent = Math.round(selected.speedKph).toString();
    if (replaySpeedKph) replaySpeedKph.textContent = Math.round(selected.speedKph).toString();
    raceLap.textContent = `TOUR ${selected.lap} / ${replayTotalLaps}`;
    const lapDistance = replayLapDistance(selected.progressMeters, historicalReplay.data.session, selected.finished);
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 5,79 KM`;
    raceProgress.style.width = `${Math.min(100, lapDistance / historicalReplay.trackLengthMeters * 100)}%`;
    if (raceLapTime) raceLapTime.textContent = formatLapTime(selected.lapTimeSec);
    if (raceLastLap) raceLastLap.textContent = formatLapTime(selected.lastLapSec);
    const selectedController = replayCars()[selected.number]?.controller;
    if (raceSection) raceSection.textContent = pause ? 'Course interrompue' : selectedController?.stats.sectionName || 'Monza';
    if (raceLapLabel) raceLapLabel.textContent = 'TOUR OFFICIEL';
    if (replayGear) replayGear.textContent = selected.gear > 0 ? String(selected.gear) : 'N';
    if (replayThrottle) replayThrottle.textContent = `${Math.round(selected.throttlePct)} %`;
    if (replayBrake) replayBrake.textContent = `${Math.round(selected.brakePct)} %`;
    if (replayOfficialPosition) replayOfficialPosition.textContent = `P${selected.officialPosition ?? '—'} / 22`;
  }

  function placeReplayFrame(frame, snapCamera = false, snapPlacement = false) {
    if (!historicalReplay || !trackGap) return;
    const selected = frame.byNumber[selectedReplayNumber];
    if (selected?.finished && frame.timeSec > historicalReplay.data.drivers[selectedReplayNumber].finishSec + 1) {
      const stillRacing = frame.cars.find(car => !car.finished);
      if (stillRacing) selectedReplayNumber = stillRacing.number;
    }
    // GPS/timing calibration aligns both restart grids. The small residual
    // from the FIA control-line offset is eased across the full race.
    const visualCars = frame.cars.map(car => ({
      ...car,
      progressMeters: replayVisualDistance(car.progressMeters, historicalReplay.data.session, replayTotalLaps),
    }));
    const placements = computeReplayPlacements(visualCars, world.gridU, trackGap, historicalReplay.trackLengthMeters);
    const raceDelta = lastReplayPoseTime === null ? 0 : Math.max(0, frame.timeSec - lastReplayPoseTime);
    for (const car of frame.cars) {
      const model = replayCars()[car.number];
      const placement = placements.get(car.number);
      placement.offset = replayPitOffset(visualCars.find(visual => visual.number === car.number),
        frame.timeSec, historicalReplay.data.session, historicalReplay.data.drivers[car.number]?.pit, placement.offset);
      const previous = replayLateralOffsets.get(car.number);
      if (!snapPlacement && previous !== undefined) {
        placement.offset = rateLimitReplayOffset(previous, placement.offset, raceDelta,
          placement.offset > 3 || previous > 3 ? 1.2 : .65);
      }
      replayLateralOffsets.set(car.number, placement.offset);
      model?.controller?.placeReplay(placement.u, car.progressMeters, car.speedKph, placement.offset);
      model?.wheels?.setDistance(car.progressMeters);
      if (model?.controller?.car) model.controller.car.visible = !(car.finished && frame.timeSec > historicalReplay.data.drivers[car.number].finishSec + 1);
    }
    lastReplayPoseTime = frame.timeSec;
    updateReplayControls(frame);
    if (snapCamera || historicalReplay.playing) {
      if (snapCamera) cameraMove = null;
      const followed = replayCars()[selectedReplayNumber]?.controller?.stats;
      if (followed) followRaceCamera(followed, frame.byNumber[selectedReplayNumber]?.speedKph || 0, .05, snapCamera);
    }
    if (frame.timeSec >= historicalReplay.durationSec) {
      controls.enabled = true;
      replayPanel?.classList.remove('is-compact');
      if (replayPanelToggle) {
        replayPanelToggle.textContent = '−';
        replayPanelToggle.setAttribute('aria-expanded', 'true');
        replayPanelToggle.setAttribute('aria-label', 'Réduire le panneau du replay');
      }
      moveCamera(initialPosition, initialTarget, 1400);
    }
  }

  function pauseReplay() {
    if (!replayActive || !historicalReplay) return;
    historicalReplay.pause();
    controls.enabled = true;
    gestureHint.innerHTML = exploreHint;
    updateReplayControls(historicalReplay.frame());
  }

  function exitReplay() {
    replayRequestId++;
    if (!replayActive) {
      if (replayPanel) replayPanel.hidden = true;
      updateReplayAvailability();
      return;
    }
    historicalReplay?.pause();
    replayActive = false;
    historicalReplay = null;
    lastReplayRankingKey = '';
    lastReplayPoseTime = null;
    replayLateralOffsets.clear();
    for (const car of Object.values(replayCars())) {
      car.controller?.reset();
      car.wheels?.setDistance(0);
      if (car.controller?.car) car.controller.car.visible = true;
    }
    if (replayPanel) replayPanel.hidden = true;
    replayPanel?.classList.remove('is-compact');
    if (replayPanelToggle) {
      replayPanelToggle.setAttribute('aria-expanded', 'true');
      replayPanelToggle.setAttribute('aria-label', 'Réduire le panneau du replay');
      replayPanelToggle.textContent = '−';
    }
    if (replayButton) {
      replayButton.textContent = '↺  Replay GP 2026';
      replayButton.setAttribute('aria-pressed', 'false');
    }
    if (weatherButton) weatherButton.disabled = false;
    if (savedWetModeForReplay && !wetMode) weatherButton?.click();
    savedWetModeForReplay = false;
    raceHud.hidden = true;
    raceHudCode.textContent = `${replayNames[requestedReplayNumber].toUpperCase()} / ${requestedReplayNumber}`;
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> SIMULATION DE COURSE';
    if (raceLapLabel) raceLapLabel.textContent = 'TOUR';
    controls.enabled = true;
    gestureHint.innerHTML = exploreHint;
    camera.fov = 41;
    camera.updateProjectionMatrix();
    if (cameraModeButton) {
      cameraModeButton.hidden = true;
      cameraModeButton.disabled = true;
      cameraModeButton.textContent = 'Caméra · Poursuite';
    }
    cameraMode = 0;
  }

  async function startReplay() {
    if (!world || !trackGap || replayButton?.disabled) return;
    const requestId = ++replayRequestId;
    exitRace();
    stopFlyover();
    if (replayButton) replayButton.disabled = true;
    try {
      if (!replayDataPromise) {
        replayDataPromise = fetch('./data/monza-2026-replay.json')
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          });
      }
      const replayData = await replayDataPromise;
      if (requestId !== replayRequestId) return;
      historicalReplay = createHistoricalReplay(replayData);
      replayTotalLaps = Math.max(...historicalReplay.drivers.map(driver => driver.laps?.length || 0));
      replayActive = true;
      lastReplayRankingKey = '';
      lastReplayPoseTime = null;
      replayLateralOffsets.clear();
      selectedReplayNumber = requestedReplayNumber;
      historicalReplay.setSpeed(Number(replaySpeed?.value) || 20);
      historicalReplay.seek(0);
      savedWetModeForReplay = wetMode;
      if (wetMode) weatherButton?.click();
      if (replayPanel) replayPanel.hidden = false;
      if (replayButton) {
        replayButton.textContent = '✕  Quitter le replay';
        replayButton.setAttribute('aria-pressed', 'true');
      }
      if (weatherButton) weatherButton.disabled = true;
      raceHud.hidden = false;
      raceLabel.textContent = 'REPLAY · MONZA 2026';
      cameraMove = null;
      if (cameraModeButton) {
        cameraModeButton.hidden = false;
        cameraModeButton.disabled = false;
      }
      placeReplayFrame(historicalReplay.frame(), true, true);
      lastTime = performance.now();
    } catch (error) {
      if (requestId !== replayRequestId) return;
      replayDataPromise = null;
      historicalReplay = null;
      console.error('Données du replay indisponibles.', error);
      if (replayPanel) replayPanel.hidden = false;
      if (replayStatus) replayStatus.textContent = 'Données du replay indisponibles en local.';
    } finally {
      updateReplayAvailability();
    }
  }

  function updateCameraHint() {
    gestureHint.textContent = `Caméra ${cameraModes[cameraMode].toLowerCase()} · Pause pour explorer`;
  }

  function updateRaceHud() {
    if (!raceController) return;
    const stats = raceController.stats;
    const lapDistance = stats.distanceMeters % stats.trackLengthMeters;
    raceSpeed.textContent = Math.round(stats.speedKmh).toString();
    raceLap.textContent = `TOUR ${stats.lap + 1}`;
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 5,79 KM`;
    raceProgress.style.width = `${Math.min(100, lapDistance / stats.trackLengthMeters * 100)}%`;
    if (raceLapTime) raceLapTime.textContent = formatLapTime(stats.lapTime);
    if (raceLastLap) raceLastLap.textContent = formatLapTime(stats.lastLapTime);
    if (raceSection) raceSection.textContent = stats.sectionName || 'Ligne droite des stands';
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
    ferrariRaceController?.reset();
    alpineRaceController?.reset();
    mclarenRaceController?.reset();
    mercedesRaceController?.reset();
    audiRaceController?.reset();
    racing = false;
    raceStarted = false;
    lastRaceDistance = 0;
    lastFerrariRaceDistance = 0;
    lastAlpineRaceDistance = 0;
    lastMcLarenRaceDistance = 0;
    lastMercedesRaceDistance = 0;
    lastAudiRaceDistance = 0;
    controls.enabled = true;
    raceHud.hidden = true;
    raceButton.textContent = '▶  Course';
    raceButton.setAttribute('aria-pressed', 'false');
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> SIMULATION DE COURSE';
    gestureHint.innerHTML = exploreHint;
    camera.fov = 41;
    camera.updateProjectionMatrix();
    focusSun(raceController.stats.position);
    if (cameraModeButton) {
      cameraModeButton.hidden = true;
      cameraModeButton.disabled = true;
      cameraModeButton.textContent = 'Caméra · Poursuite';
      cameraModeButton.removeAttribute('aria-label');
    }
    cameraMode = 0;
  }

  function startRace() {
    if (!raceController || !world) return;
    stopFlyover();
    if (!raceStarted) {
      raceController.reset();
      ferrariRaceController?.reset();
      alpineRaceController?.reset();
      mclarenRaceController?.reset();
      mercedesRaceController?.reset();
      audiRaceController?.reset();
      lastRaceDistance = 0;
      lastFerrariRaceDistance = 0;
      lastAlpineRaceDistance = 0;
      lastMcLarenRaceDistance = 0;
      lastMercedesRaceDistance = 0;
      lastAudiRaceDistance = 0;
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
    updateCameraHint();
    if (cameraModeButton) {
      cameraModeButton.hidden = false;
      cameraModeButton.disabled = false;
    }
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
    trackGap = createTrackGapLookup(world.curve);
    weather = createMonzaWeather(THREE, scene, world.curve, world.trackMaterial);
    if (weatherButton) weatherButton.disabled = false;
    const center = world.bounds.getCenter(new THREE.Vector3());
    const size = world.bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    initialTarget.set(center.x, center.y, center.z);
    if (camera.aspect < .8) {
      initialPosition.set(center.x + span * .04, span * 2.10, center.z + span * .08);
    } else {
      initialPosition.set(center.x + span * .60, span * 1.25, center.z + span * .85);
    }
    camera.position.copy(initialPosition);
    controls.target.copy(initialTarget);
    controls.update();
    focusSun(initialTarget);

    // The cars load after the circuit so slower connections can explore it
    // immediately. Each model retains its own ground-contact placement.
    const carU = trackGap.behind(world.gridU, 14.1);
    const ferrariU = trackGap.behind(carU, GRID_SLOT_SPACING);
    const alpineU = trackGap.behind(carU, 2 * GRID_SLOT_SPACING);
    const mclarenU = trackGap.behind(carU, 3 * GRID_SLOT_SPACING);
    const mercedesU = trackGap.behind(carU, 4 * GRID_SLOT_SPACING);
    const audiU = trackGap.behind(carU, 5 * GRID_SLOT_SPACING);
    function showCarIntro(car, u, cameraSide) {
      if (introPlayed) return;
      introPlayed = true;
      const ferrariFrame = cameraSide > 0;
      const direction = world.curve.getTangentAt(u).setY(0).normalize();
      const side = new THREE.Vector3(direction.z, 0, -direction.x);
      const heroPosition = car.position.clone()
        .addScaledVector(direction, ferrariFrame ? -18 : -27)
        .addScaledVector(side, cameraSide);
      heroPosition.y = car.position.y + (ferrariFrame ? 5 : 8);
      const heroTarget = car.position.clone().addScaledVector(direction, ferrariFrame ? 1 : 12);
      heroTarget.y = car.position.y + (ferrariFrame ? 1 : 1.5);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        camera.position.copy(heroPosition);
        controls.target.copy(heroTarget);
        controls.update();
      } else {
        moveCamera(heroPosition, heroTarget, 2300);
      }
    }
    new GLTFLoader().load('../rb22_max_verstappen_2026.glb', ({ scene: car }) => {
      redBullCar = car;
      car.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(car);
      raceController = createRaceController(THREE, world.curve, car, {
        startU: carU,
        laneOffset: -GRID_LANE_CENTER,
        trackHeightAt: world.trackHeightAt,
      });
      focusSun(car.position);
      raceController.setWet(wetMode);
      const wheels = bindWheelSpin(THREE, car);
      if (wheels.enabled) wheelAnimator = wheels;
      else wheels.dispose();
      raceButton.disabled = false;
      updateReplayAvailability();
      if (!focusFerrari && !focusAlpine && !focusMcLaren && !focusMercedes && !focusAudi) showCarIntro(car, carU, -8);
    }, undefined, error => console.warn('La monoplace de démonstration est indisponible.', error));

    // Slot two is staggered 9.05 m behind the RB22, on the opposite half of
    // the 12 m track. Following at that longitudinal gap keeps both cars
    // clear of one another through the first corner and the rest of the lap.
    new GLTFLoader().load('../ferrari_sf26_hamilton_44.glb?v=20260925-4', ({ scene: ferrari }) => {
      ferrari.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(ferrari);
      ferrariRaceController = createRaceController(THREE, world.curve, ferrari, {
        startU: ferrariU,
        laneOffset: GRID_LANE_CENTER,
        trackHeightAt: world.trackHeightAt,
      });
      ferrariRaceController.setWet(wetMode);
      const wheels = bindWheelSpin(THREE, ferrari);
      if (wheels.enabled) ferrariWheelAnimator = wheels;
      else wheels.dispose();
      updateReplayAvailability();
      if (raceStarted && raceController) {
        const leader = raceController.stats;
        ferrariRaceController.placeAt(
          trackGap.behind(leader.progress, GRID_SLOT_SPACING),
          leader.distanceMeters,
        );
        lastFerrariRaceDistance = leader.distanceMeters;
      }
      if (focusFerrari) showCarIntro(ferrari, ferrariU, 7);
    }, undefined, error => {
      console.warn('La Ferrari SF-26 est indisponible.', error);
      focusFerrari = false;
      if (redBullCar && !focusAlpine && !focusMcLaren && !focusMercedes && !focusAudi) showCarIntro(redBullCar, carU, -8);
    });

    // Gasly occupies the third staggered grid box, 18.1 m behind pole on
    // the same half of the track. The geometric lookup preserves this gap
    // around Monza's tighter bends when all the cars are moving.
    new GLTFLoader().load('../alpine_a526_gasly_10.glb?v=20260925-2', ({ scene: alpine }) => {
      alpine.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(alpine);
      alpineRaceController = createRaceController(THREE, world.curve, alpine, {
        startU: alpineU,
        laneOffset: -GRID_LANE_CENTER,
        trackHeightAt: world.trackHeightAt,
      });
      alpineRaceController.setWet(wetMode);
      const wheels = bindWheelSpin(THREE, alpine);
      if (wheels.enabled) alpineWheelAnimator = wheels;
      else wheels.dispose();
      updateReplayAvailability();
      if (raceStarted && raceController) {
        const leader = raceController.stats;
        alpineRaceController.placeAt(
          trackGap.behind(leader.progress, 2 * GRID_SLOT_SPACING),
          leader.distanceMeters,
        );
        lastAlpineRaceDistance = leader.distanceMeters;
      }
      if (focusAlpine) showCarIntro(alpine, alpineU, 7);
    }, undefined, error => {
      console.warn('L’Alpine A526 est indisponible.', error);
      focusAlpine = false;
      if (redBullCar && !focusFerrari && !focusMcLaren && !focusMercedes && !focusAudi) showCarIntro(redBullCar, carU, -8);
    });

    // Norris starts from the fourth marked box, on Ferrari's half of the
    // straight. The same curve-distance lookup holds the staggered gap in
    // bends instead of approximating it with a fixed spline parameter.
    new GLTFLoader().load('../mclaren_mcl40_norris_1.glb?v=20260925-2', ({ scene: mclaren }) => {
      mclaren.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(mclaren);
      mclarenRaceController = createRaceController(THREE, world.curve, mclaren, {
        startU: mclarenU,
        laneOffset: GRID_LANE_CENTER,
        trackHeightAt: world.trackHeightAt,
      });
      mclarenRaceController.setWet(wetMode);
      const wheels = bindWheelSpin(THREE, mclaren);
      if (wheels.enabled) mclarenWheelAnimator = wheels;
      else wheels.dispose();
      updateReplayAvailability();
      if (raceStarted && raceController) {
        const leader = raceController.stats;
        mclarenRaceController.placeAt(
          trackGap.behind(leader.progress, 3 * GRID_SLOT_SPACING),
          leader.distanceMeters,
        );
        lastMcLarenRaceDistance = leader.distanceMeters;
      }
      if (focusMcLaren) showCarIntro(mclaren, mclarenU, 7);
    }, undefined, error => {
      console.warn('La McLaren MCL40 est indisponible.', error);
      focusMcLaren = false;
      if (redBullCar && !focusFerrari && !focusAlpine && !focusMercedes && !focusAudi) showCarIntro(redBullCar, carU, -8);
    });

    // Antonelli lines up in the fifth staggered box, on the same half as
    // Verstappen and Gasly. Geometric track distance maintains the gap
    // through bends while each wheel follows the asphalt height independently.
    new GLTFLoader().load('../mercedes_w17_antonelli_12.glb?v=20260925-2', ({ scene: mercedes }) => {
      mercedes.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(mercedes);
      mercedesRaceController = createRaceController(THREE, world.curve, mercedes, {
        startU: mercedesU,
        laneOffset: -GRID_LANE_CENTER,
        trackHeightAt: world.trackHeightAt,
      });
      mercedesRaceController.setWet(wetMode);
      const wheels = bindWheelSpin(THREE, mercedes);
      if (wheels.enabled) mercedesWheelAnimator = wheels;
      else wheels.dispose();
      updateReplayAvailability();
      if (raceStarted && raceController) {
        const leader = raceController.stats;
        mercedesRaceController.placeAt(
          trackGap.behind(leader.progress, 4 * GRID_SLOT_SPACING),
          leader.distanceMeters,
        );
        lastMercedesRaceDistance = leader.distanceMeters;
      }
      if (focusMercedes) showCarIntro(mercedes, mercedesU, 7);
    }, undefined, error => {
      console.warn('La Mercedes W17 est indisponible.', error);
      focusMercedes = false;
      if (redBullCar && !focusFerrari && !focusAlpine && !focusMcLaren && !focusAudi) showCarIntro(redBullCar, carU, -8);
    });

    // Bortoleto occupies box six on Ferrari and Norris's side. Keeping the
    // gap in metres, rather than in curve parameters, preserves staggered
    // spacing through the first chicane and the rest of Monza.
    new GLTFLoader().load('../audi_r26_bortoleto_5.glb?v=20260925-1', ({ scene: audi }) => {
      audi.traverse(object => {
        if (object.isMesh) object.castShadow = true;
      });
      scene.add(audi);
      audiRaceController = createRaceController(THREE, world.curve, audi, {
        startU: audiU,
        laneOffset: GRID_LANE_CENTER,
        trackHeightAt: world.trackHeightAt,
      });
      audiRaceController.setWet(wetMode);
      const wheels = bindWheelSpin(THREE, audi);
      if (wheels.enabled) audiWheelAnimator = wheels;
      else wheels.dispose();
      updateReplayAvailability();
      if (raceStarted && raceController) {
        const leader = raceController.stats;
        audiRaceController.placeAt(
          trackGap.behind(leader.progress, 5 * GRID_SLOT_SPACING),
          leader.distanceMeters,
        );
        lastAudiRaceDistance = leader.distanceMeters;
      }
      if (focusAudi) showCarIntro(audi, audiU, 7);
    }, undefined, error => {
      console.warn('L’Audi R26 est indisponible.', error);
      focusAudi = false;
      if (redBullCar && !focusFerrari && !focusAlpine && !focusMcLaren && !focusMercedes) showCarIntro(redBullCar, carU, -8);
    });

    overviewButton.disabled = false;
    gridButton.disabled = false;
    flyoverButton.disabled = false;
    loading.classList.add('is-hidden');
  } catch (error) {
    loadingMessage.textContent = 'Le circuit n’a pas pu être affiché.';
    console.error(error);
  }

  overviewButton.addEventListener('click', () => {
    exitReplay();
    exitRace();
    stopFlyover();
    if (world) moveCamera(initialPosition, initialTarget);
  });

  gridButton.addEventListener('click', () => {
    exitReplay();
    exitRace();
    stopFlyover();
    if (!world) return;
    const focusedController = focusAudi ? audiRaceController
      : focusMercedes ? mercedesRaceController
      : focusMcLaren ? mclarenRaceController
      : focusAlpine ? alpineRaceController : focusFerrari ? ferrariRaceController : null;
    if (focusedController) {
      const at = focusedController.stats.position.clone();
      const dir = world.curve.getTangentAt(focusedController.stats.progress).setY(0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      const position = at.clone().addScaledVector(dir, -18).addScaledVector(side, 7);
      position.y = at.y + 5;
      const target = at.clone().addScaledVector(dir, 1);
      target.y = at.y + 1;
      moveCamera(position, target, 1100);
      return;
    }
    const at = world.gridPoint.clone();
    const dir = world.gridTangent.clone().normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const position = at.clone().addScaledVector(dir, -50).addScaledVector(side, -9);
    position.y = at.y + 11;
    const target = at.clone().addScaledVector(dir, -8).addScaledVector(side, -2);
    target.y = at.y + 2;
    moveCamera(position, target, 1100);
  });

  flyoverButton.addEventListener('click', () => {
    if (!world) return;
    exitReplay();
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
    if (replayActive) exitReplay();
    if (racing) pauseRace();
    else startRace();
  });
  replayButton?.addEventListener('click', () => {
    if (replayActive) exitReplay();
    else startReplay();
  });
  replayPanelToggle?.addEventListener('click', () => {
    const compact = replayPanel.classList.toggle('is-compact');
    replayPanelToggle.setAttribute('aria-expanded', String(!compact));
    replayPanelToggle.setAttribute('aria-label', compact ? 'Afficher les détails du replay' : 'Réduire le panneau du replay');
    replayPanelToggle.textContent = compact ? '+' : '−';
  });
  replayToggle?.addEventListener('click', () => {
    if (!replayActive || !historicalReplay) return;
    if (historicalReplay.playing) pauseReplay();
    else {
      historicalReplay.play();
      if (historicalReplay.timeSec === 0) {
        cameraMove = null;
        placeReplayFrame(historicalReplay.frame(), true, true);
      }
      controls.enabled = false;
      updateCameraHint();
      updateReplayControls(historicalReplay.frame());
      lastTime = performance.now();
    }
  });
  replaySpeed?.addEventListener('change', () => {
    historicalReplay?.setSpeed(Number(replaySpeed.value));
  });
  replayTimeline?.addEventListener('input', () => {
    if (!replayActive || !historicalReplay) return;
    const requestedTime = Number(replayTimeline.value);
    pauseReplay();
    placeReplayFrame(historicalReplay.seek(requestedTime), true, true);
  });
  replayDriver?.addEventListener('change', () => {
    if (!replayActive || !historicalReplay) return;
    selectedReplayNumber = Number(replayDriver.value);
    placeReplayFrame(historicalReplay.frame(), true);
  });
  replayRankings?.addEventListener('click', event => {
    const button = event.target.closest('[data-replay-number]');
    if (!button || !replayActive || !historicalReplay) return;
    selectedReplayNumber = Number(button.dataset.replayNumber);
    placeReplayFrame(historicalReplay.frame(), true);
  });
  replaySkipPause?.addEventListener('click', () => {
    if (!replayActive || !historicalReplay) return;
    const pause = replayPauseAt(historicalReplay.timeSec);
    if (pause) placeReplayFrame(historicalReplay.seek(pause.endSec + .1), true, true);
  });
  cameraModeButton?.addEventListener('click', () => {
    cameraMode = (cameraMode + 1) % cameraModes.length;
    cameraModeButton.textContent = `Caméra · ${cameraModes[cameraMode]}`;
    cameraModeButton.setAttribute('aria-label', `Vue de course : ${cameraModes[cameraMode]}. Changer de caméra`);
    if (racing || historicalReplay?.playing) updateCameraHint();
    if (replayActive && historicalReplay && !historicalReplay.playing) placeReplayFrame(historicalReplay.frame(), true);
  });
  weatherButton?.addEventListener('click', () => {
    if (!weather) return;
    wetMode = !wetMode;
    weather.setWet(wetMode);
    raceController?.setWet(wetMode);
    ferrariRaceController?.setWet(wetMode);
    alpineRaceController?.setWet(wetMode);
    mclarenRaceController?.setWet(wetMode);
    mercedesRaceController?.setWet(wetMode);
    audiRaceController?.setWet(wetMode);
    weatherButton.textContent = wetMode ? 'Météo · Pluie' : 'Météo · Sec';
    weatherButton.setAttribute('aria-pressed', String(wetMode));
    weatherButton.setAttribute('aria-label', wetMode ? 'Désactiver la pluie et sécher la piste' : 'Activer la pluie et la piste mouillée');
    sun.intensity = wetMode ? 1.65 : 2.7;
    ambient.intensity = wetMode ? 1.28 : 1.55;
    scene.fog.color.set(wetMode ? 0x9dabb4 : 0xbfd3d4);
    sky.setWet(wetMode);
  });
  window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'c' || !(raceStarted || replayActive) || event.repeat) return;
    cameraModeButton?.click();
  });
  canvas.addEventListener('pointerdown', () => { pauseRace(); pauseReplay(); stopFlyover(); });

  function followRaceCamera(cameraStats, speedKph, dt, snap = false) {
    const forward = cameraStats.tangent;
    const side = new THREE.Vector3(forward.z, 0, -forward.x);
    const desiredPosition = cameraStats.position.clone();
    const desiredTarget = cameraStats.position.clone();
    const narrowView = camera.aspect < .75;
    let desiredFov;
    if (cameraMode === 1) {
      desiredPosition.addScaledVector(forward, -5).addScaledVector(side, narrowView ? 14 : 19);
      desiredPosition.y += narrowView ? 6.66 : 6.06;
      desiredTarget.addScaledVector(forward, 5);
      desiredTarget.y += 1.01;
      desiredFov = narrowView ? 52 : 42;
    } else if (cameraMode === 2) {
      desiredPosition.addScaledVector(forward, narrowView ? -38 : -43).addScaledVector(side, narrowView ? 12 : 19);
      desiredPosition.y += narrowView ? 71.66 : 65.66;
      desiredTarget.addScaledVector(forward, 24);
      desiredTarget.y += .66;
      desiredFov = narrowView ? 53 : 46;
    } else {
      desiredPosition.addScaledVector(forward, narrowView ? -12.5 : -7.8).addScaledVector(side, narrowView ? .65 : 2.4);
      desiredPosition.y += narrowView ? 3.56 : 2.61;
      desiredTarget.addScaledVector(forward, narrowView ? 12 : 17);
      desiredTarget.y += .71;
      desiredFov = (narrowView ? 46 : 41) + Math.min(narrowView ? 4 : 6, speedKph / 325 * (narrowView ? 4 : 6));
    }
    const smoothing = snap ? 1 : 1 - Math.exp(-dt * (cameraMode === 0 ? 15 : cameraMode === 1 ? 10 : 7));
    camera.position.lerp(desiredPosition, smoothing);
    controls.target.lerp(desiredTarget, smoothing);
    camera.lookAt(controls.target);
    focusSun(cameraStats.position);
    if (snap || Math.abs(camera.fov - desiredFov) > .05) {
      camera.fov += (desiredFov - camera.fov) * smoothing;
      camera.updateProjectionMatrix();
    }
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;

    if (replayActive && historicalReplay?.playing) {
      placeReplayFrame(historicalReplay.tick(dt));
    } else if (racing && world && raceController) {
      const stats = raceController.update(dt);
      if (wheelAnimator) wheelAnimator.update(stats.distanceMeters - lastRaceDistance);
      lastRaceDistance = stats.distanceMeters;
      if (ferrariRaceController) {
        ferrariRaceController.placeAt(
          trackGap.behind(stats.progress, GRID_SLOT_SPACING),
          stats.distanceMeters,
        );
        if (ferrariWheelAnimator) ferrariWheelAnimator.update(stats.distanceMeters - lastFerrariRaceDistance);
        lastFerrariRaceDistance = stats.distanceMeters;
      }
      if (alpineRaceController) {
        alpineRaceController.placeAt(
          trackGap.behind(stats.progress, 2 * GRID_SLOT_SPACING),
          stats.distanceMeters,
        );
        if (alpineWheelAnimator) alpineWheelAnimator.update(stats.distanceMeters - lastAlpineRaceDistance);
        lastAlpineRaceDistance = stats.distanceMeters;
      }
      if (mclarenRaceController) {
        mclarenRaceController.placeAt(
          trackGap.behind(stats.progress, 3 * GRID_SLOT_SPACING),
          stats.distanceMeters,
        );
        if (mclarenWheelAnimator) mclarenWheelAnimator.update(stats.distanceMeters - lastMcLarenRaceDistance);
        lastMcLarenRaceDistance = stats.distanceMeters;
      }
      if (mercedesRaceController) {
        mercedesRaceController.placeAt(
          trackGap.behind(stats.progress, 4 * GRID_SLOT_SPACING),
          stats.distanceMeters,
        );
        if (mercedesWheelAnimator) mercedesWheelAnimator.update(stats.distanceMeters - lastMercedesRaceDistance);
        lastMercedesRaceDistance = stats.distanceMeters;
      }
      if (audiRaceController) {
        audiRaceController.placeAt(
          trackGap.behind(stats.progress, 5 * GRID_SLOT_SPACING),
          stats.distanceMeters,
        );
        if (audiWheelAnimator) audiWheelAnimator.update(stats.distanceMeters - lastAudiRaceDistance);
        lastAudiRaceDistance = stats.distanceMeters;
      }
      const cameraStats = focusAudi && audiRaceController ? audiRaceController.stats
        : focusMercedes && mercedesRaceController ? mercedesRaceController.stats
        : focusMcLaren && mclarenRaceController ? mclarenRaceController.stats
        : focusAlpine && alpineRaceController ? alpineRaceController.stats
        : focusFerrari && ferrariRaceController ? ferrariRaceController.stats : stats;
      followRaceCamera(cameraStats, stats.speedKmh, dt);
      updateRaceHud();
    } else if (flying && world) {
      lapProgress = (lapProgress + dt / 80) % 1;
      const at = world.curve.getPointAt(lapProgress);
      const ahead = world.curve.getPointAt((lapProgress + .008) % 1);
      const dir = ahead.clone().sub(at).normalize();
      camera.position.copy(at).addScaledVector(dir, -48);
      camera.position.y = at.y + 31;
      controls.target.copy(ahead);
      controls.target.y = ahead.y + 4;
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
    sky.follow(camera.position);
    weather?.update(dt, camera);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
