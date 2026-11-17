import * as THREE from 'three';
import { createDeferredModelField } from '../deferred-model-field.js';
import { frameCircuitOverview } from '../circuit-framing.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { createShanghaiWorld } from './world.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING, PIT_START_LANE_CENTER } from './grid-details.js';
import { createTrackGapLookup } from '../monza/track-gap.js';
import { createRaceController } from './race-motion.js';
import { createFreeRaceField } from './free-race-field.js';
import { createHistoricalReplay, replayLapDistance } from './historical-replay.js';
import { createReplayFlagTimeline } from '../monza/replay-flags.js';
import { computeReplayPlacements, replayVisualDistance, replayPitOffset, rateLimitReplayOffset } from './replay-lanes.js';
import { resolveEntitySpacing } from './entity-spacing.js';
import { bindWheelSpin } from '../monza/wheel-spin.js';
import { carByKey as garageByKey } from '../car-catalog.js';
import { SHANGHAI_2026_ROSTER, SHANGHAI_2026_DISPLAYED } from './replay-roster.js';
import { createShanghaiSky } from './sky.js';
import { createShanghaiWeather } from './weather.js';

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
const replayRankings = document.querySelector('#replay-rankings');
const replayStatus = document.querySelector('#replay-status');
const raceFlagAlert = document.querySelector('#race-flag-alert');
const raceFlagTitle = raceFlagAlert?.querySelector('.race-flag-title');
const raceFlagDetail = raceFlagAlert?.querySelector('.race-flag-detail');
const replaySkipPause = document.querySelector('#replay-skip-pause');
const replayGear = document.querySelector('#replay-gear');
const replayThrottle = document.querySelector('#replay-throttle');
const replayBrake = document.querySelector('#replay-brake');
const replayOfficialPosition = document.querySelector('#replay-official-position');
const replayGarageLink = document.querySelector('#replay-garage-link');
const raceHud = document.querySelector('#race-hud');
const raceHudToggle = document.querySelector('#race-hud-toggle');
const raceLabel = raceHud.querySelector('.race-label');
const raceHudCode = raceHud.querySelector('.race-hud-code');
const raceSpeedLabel = raceHud.querySelector('.race-speed-label');
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
const controlHelp = document.querySelector('#control-help');
const defaultControlHelp = controlHelp?.textContent;
const immersiveToggle = document.querySelector('#immersive-toggle');
const compactControls = document.querySelector('#compact-controls');
const controlsToggle = document.querySelector('#controls-toggle');
const quickPause = document.querySelector('#quick-pause');

const cameraModes = ['Poursuite', 'TV', 'Hélico'];
const carCatalog = Object.freeze(SHANGHAI_2026_DISPLAYED.map(driver => Object.freeze({
  ...garageByKey[driver.modelKey],
  number: driver.replayNumber,
  gridPosition: driver.gridPosition,
  pitLaneStart: !driver.dns && !!driver.pitLaneStart,
  pitStartProgressMeters: driver.pitStartProgressMeters,
  pitStartDelaySec: driver.pitLaneStart ? 8 + (driver.gridPosition - 19) * .35 : undefined,
})));
const carByKey = Object.freeze(Object.fromEntries(carCatalog.map(car => [car.key, car])));
const carByNumber = Object.freeze(Object.fromEntries(carCatalog.map(car => [car.number, car])));
const replayNames = Object.freeze(Object.fromEntries(SHANGHAI_2026_ROSTER.map(driver =>
  [driver.replayNumber, driver.name.split(' ').at(-1)])));
const requestedCar = new URLSearchParams(window.location.search).get('car');
const requestedEntry = carByKey[requestedCar] || carByKey.redbull;
const requestedReplayNumber = requestedEntry.number;
let focusCarKey = requestedEntry.key === 'redbull' ? null : requestedEntry.key;
if (raceHudCode) {
  raceHudCode.textContent = `${requestedEntry.shortName.toUpperCase()} / ${requestedEntry.number}`;
}
if (focusCarKey) {
  document.querySelector('.return-link')?.setAttribute('href', `../?car=${encodeURIComponent(focusCarKey)}`);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8bb9d3);
  scene.fog = new THREE.Fog(0xc4c9b8, 8000, 20000);
  const sky = createShanghaiSky(THREE, scene);

  const camera = new THREE.PerspectiveCamera(41, 1, 0.5, 16000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  controls.maxDistance = 11000;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.7;

  const ambient = new THREE.HemisphereLight(0xd8ecf8, 0x80745c, 1.48);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe8bd, 1.65);
  const sunOffset = new THREE.Vector3(-680, 820, 1020);
  sun.position.copy(sunOffset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
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
  let freeRaceField = null;
  let redBullCar = null;
  const carInstances = new Map();
  let fieldLoader = null;
  let carViewRequest = 0;
  let lapProgress = 0;
  let cameraMode = 0;
  let introPlayed = !focusCarKey;
  let lastTime = performance.now();
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); });
  let historicalReplay = null;
  let replayFlagTimeline = null;
  let lastReplayFlagKey = '';
  let replayDataPromise = null;
  let replayActive = false;
  let selectedReplayNumber = requestedReplayNumber;
  let lastReplayRankingKey = '';
  let savedWetModeForReplay = false;
  let lastReplayPoseTime = null;
  let replayTotalLaps = 56;
  let replayRequestId = 0;
  let failedCarName = null;
  const replayLateralOffsets = new Map();
  const replayEntityPositions = new Map();
  const freeEntityPositions = new Map();

  function setRaceHudCompact(compact) {
    raceHud.classList.toggle('is-compact', compact);
    raceHudToggle.setAttribute('aria-expanded', String(!compact));
    raceHudToggle.setAttribute('aria-label', compact ? 'Afficher toutes les statistiques de course' : 'Réduire les statistiques de course');
    raceHudToggle.textContent = compact ? 'Détails' : 'Réduire';
  }

  function setControlsExpanded(expanded) {
    atlas.classList.toggle('controls-expanded', expanded);
    controlsToggle.setAttribute('aria-expanded', String(expanded));
    controlsToggle.textContent = expanded ? 'Fermer' : 'Commandes';
    controlsToggle.setAttribute('aria-label', expanded ? 'Fermer les commandes' : 'Ouvrir les commandes');
  }

  function setImmersive(immersive) {
    atlas.classList.toggle('is-immersive', immersive);
    immersiveToggle.setAttribute('aria-pressed', String(immersive));
    immersiveToggle.setAttribute('aria-label', immersive ? 'Afficher les panneaux et les commandes de course' : 'Masquer les panneaux et les commandes de course');
    immersiveToggle.textContent = immersive ? 'Afficher l’interface' : 'Mode immersion';
    if (immersive) immersiveToggle.focus({ preventScroll: true });
  }

  function beginSessionUI() {
    if (!atlas.classList.contains('is-session')) {
      setControlsExpanded(false);
      setImmersive(false);
      setRaceHudCompact(true);
    }
    atlas.classList.add('is-session');
    immersiveToggle.hidden = false;
    compactControls.hidden = false;
  }

  function endSessionUI() {
    atlas.classList.remove('is-session');
    setControlsExpanded(false);
    setImmersive(false);
    immersiveToggle.hidden = true;
    compactControls.hidden = true;
  }

  function setReplayPanelCompact(compact) {
    if (!replayPanel || !replayPanelToggle) return;
    if (compact && replayPanel.contains(document.activeElement)
      && document.activeElement !== replayPanelToggle) {
      replayPanelToggle.focus({ preventScroll: true });
    }
    replayPanel.classList.toggle('is-compact', compact);
    replayPanelToggle.setAttribute('aria-expanded', String(!compact));
    replayPanelToggle.setAttribute('aria-label', compact ? 'Ouvrir la régie' : 'Fermer la régie');
    replayPanelToggle.textContent = compact ? 'Régie' : 'Fermer';
  }

  function replayCars() {
    return Object.fromEntries([...carInstances].map(([number, instance]) =>
      [number, { controller: instance.controller, wheels: instance.wheels }]));
  }

  function updateReplayAvailability() {
    const loadedCount = carCatalog.filter(car => carInstances.has(car.number)).length;
    const allCarsLoaded = loadedCount === carCatalog.length;
    const waiting = fieldLoader?.started && !allCarsLoaded;
    if (replayButton) replayButton.disabled = !!waiting;
    raceButton.disabled = !!waiting || (!!fieldLoader?.started && !raceController);
    if (controlHelp) controlHelp.textContent = failedCarName
      ? `La voiture de ${failedCarName} n’a pas pu charger. Rechargez la page pour réessayer.`
      : !fieldLoader?.started || allCarsLoaded ? defaultControlHelp
        : `Chargement des voitures : ${loadedCount}/${carCatalog.length}. La simulation et le replay seront bientôt disponibles.`;
  }

  function requestCars(action) {
    if (!fieldLoader) return false;
    if (fieldLoader.ready) return true;
    const request = ++carViewRequest;
    fieldLoader.load().then(() => {
      if (request === carViewRequest) action();
    }).catch(error => console.warn('Chargement du plateau interrompu.', error));
    return false;
  }

  function replayPauseAt(timeSec) {
    return historicalReplay?.data.session.pauses?.find(pause => timeSec >= pause.startSec && timeSec < pause.endSec) || null;
  }

  function replayRaceStatus(timeSec, selected) {
    const data = historicalReplay.data;
    if (timeSec >= historicalReplay.durationSec) return 'ARRIVÉE · Replay terminé';
    const recentRetirement = Object.values(data.drivers).find(driver => driver.status === 'retired'
      && timeSec >= driver.finishSec && timeSec < driver.finishSec + 18);
    if (recentRetirement) return `ABANDON · ${replayNames[recentRetirement.number]}`;
    const pit = data.drivers[selected.number]?.pit?.find(stop =>
      !stop.redFlagTransit && timeSec >= stop.tSec - stop.laneDurationSec && timeSec < stop.tSec + 5);
    if (pit) return `STANDS · ${replayNames[selected.number]} · voie approximative`;
    return null;
  }

  function updateReplayFlagAlert(timeSec) {
    if (!raceFlagAlert || !replayFlagTimeline) return null;
    const flag = replayFlagTimeline.at(timeSec);
    const key = `${flag.kind}|${flag.detail}`;
    if (key === lastReplayFlagKey) return flag;
    lastReplayFlagKey = key;
    raceFlagAlert.hidden = !flag.active;
    raceFlagAlert.classList.toggle('is-yellow', flag.tone === 'yellow');
    raceFlagAlert.classList.toggle('is-red', flag.tone === 'red');
    raceFlagAlert.classList.toggle('is-chequered', flag.tone === 'chequered');
    if (raceFlagTitle) raceFlagTitle.textContent = flag.label;
    if (raceFlagDetail) raceFlagDetail.textContent = flag.detail;
    return flag;
  }

  function replayFollowFallback(frame, previousNumber, includeFinished = false) {
    const previousIndex = frame.cars.findIndex(car => car.number === previousNumber);
    return frame.cars
      .map((car, index) => ({ car, index }))
      .filter(({ car }) => !!carByNumber[car.number] && !car.retired && (includeFinished || !car.ended))
      .sort((a, b) => Math.abs(a.index - previousIndex) - Math.abs(b.index - previousIndex) || a.index - b.index)[0]?.car;
  }

  function updateReplayControls(frame) {
    if (!historicalReplay || !frame) return;
    const selected = frame.byNumber[selectedReplayNumber] || frame.cars[0];
    if (!selected) return;
    if (replayTimeline) {
      replayTimeline.max = String(historicalReplay.durationSec);
      replayTimeline.value = String(frame.timeSec);
    }
    if (replayClock) replayClock.textContent = `${formatReplayClock(frame.timeSec)} / ${formatReplayClock(historicalReplay.durationSec)}`;
    if (replaySpeed) replaySpeed.value = String(historicalReplay.speed);
    if (replayGarageLink) {
      const garageEntry = carByNumber[selectedReplayNumber];
      replayGarageLink.href = `../?car=${encodeURIComponent(garageEntry.key)}`;
      replayGarageLink.textContent = `Voir ${garageEntry.shortName} au garage →`;
      replayGarageLink.setAttribute('aria-label', `Voir la monoplace de ${garageEntry.driverName} au garage`);
    }
    if (replayToggle) {
      replayToggle.textContent = historicalReplay.playing ? 'Pause' : 'Lecture';
      replayToggle.setAttribute('aria-pressed', String(historicalReplay.playing));
      replayToggle.setAttribute('aria-label', historicalReplay.playing ? 'Mettre le replay en pause' : 'Lire le replay');
    }
    const pause = replayPauseAt(frame.timeSec);
    const flag = updateReplayFlagAlert(frame.timeSec);
    const status = flag?.active
      ? `${flag.label}${flag.detail ? ` · ${flag.detail}` : ''}`
      : replayRaceStatus(frame.timeSec, selected);
    if (replayStatus) {
      replayStatus.hidden = !status;
      if (status && replayStatus.textContent !== status) replayStatus.textContent = status;
      replayStatus.dataset.flagTone = flag?.active ? flag.tone : '';
    }
    if (replaySkipPause) replaySkipPause.hidden = !pause;
    const rankingKey = `${selectedReplayNumber}|${frame.cars.map(car => `${car.number}:${car.officialPosition}:${car.retired}`).join(',')}`;
    if (replayRankings && rankingKey !== lastReplayRankingKey) {
      lastReplayRankingKey = rankingKey;
      const focusedNumber = replayRankings.contains(document.activeElement)
        ? document.activeElement.closest('[data-replay-number]')?.dataset.replayNumber : null;
      replayRankings.innerHTML = frame.cars.map(car =>
        `<li class="${[car.number === selectedReplayNumber ? 'is-followed' : '', car.retired ? 'is-retired' : '', !carByNumber[car.number] ? 'is-unavailable' : ''].filter(Boolean).join(' ')}"><button type="button" data-replay-number="${car.number}" aria-current="${car.number === selectedReplayNumber}" aria-label="${car.dns ? `${replayNames[car.number]}, non partant` : car.retired ? `${replayNames[car.number]}, abandon` : !carByNumber[car.number] ? `${replayNames[car.number]}, modèle 3D indisponible` : `Suivre ${replayNames[car.number]}, position officielle ${car.officialPosition ?? 'inconnue'}`}" ${car.retired || !carByNumber[car.number] ? 'disabled' : ''}><span>${car.dns ? 'DNS' : `P${car.officialPosition ?? car.selectedRank}`}</span><strong>${replayNames[car.number]}</strong><small>#${car.number} · ${!carByNumber[car.number] ? 'SANS MODÈLE' : car.dns ? 'NON PARTANT' : car.retired ? 'ABANDON' : car.finished ? 'ARRIVÉE' : 'EN PISTE'}</small></button></li>`
      ).join('');
      if (focusedNumber) {
        const previousButton = replayRankings.querySelector(`[data-replay-number="${focusedNumber}"]`);
        const focusTarget = previousButton?.disabled
          ? replayRankings.querySelector(`[data-replay-number="${selectedReplayNumber}"]`)
          : previousButton;
        focusTarget?.focus({ preventScroll: true });
      }
    }
    raceHudCode.textContent = `${replayNames[selected.number].toUpperCase()} / ${selected.number}`;
    raceSpeed.textContent = Math.round(selected.speedKph).toString();
    if (quickPause) quickPause.textContent = historicalReplay.playing ? 'Pause' : 'Lecture';
    raceLap.textContent = `TOUR ${selected.lap} / ${replayTotalLaps}`;
    const lapDistance = replayLapDistance(selected.progressMeters, historicalReplay.data.session, selected.finished);
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 5,45 KM`;
    raceProgress.style.width = `${Math.min(100, lapDistance / historicalReplay.trackLengthMeters * 100)}%`;
    if (raceLapTime) raceLapTime.textContent = formatLapTime(selected.lapTimeSec);
    if (raceLastLap) raceLastLap.textContent = formatLapTime(selected.lastLapSec);
    const selectedController = replayCars()[selected.number]?.controller;
    if (raceSection) raceSection.textContent = pause
      ? selected.speedKph > 5 ? 'Retour aux stands' : 'Course interrompue'
      : selectedController?.stats.sectionName || 'Shanghai International Circuit';
    if (raceLapLabel) raceLapLabel.textContent = 'TOUR OFFICIEL';
    if (replayGear) replayGear.textContent = selected.gear > 0 ? String(selected.gear) : 'N';
    if (replayThrottle) replayThrottle.textContent = `${Math.round(selected.throttlePct)} %`;
    if (replayBrake) replayBrake.textContent = `${Math.round(selected.brakePct)} %`;
    if (replayOfficialPosition) replayOfficialPosition.textContent = selected.dns ? 'NON PARTANT' : selected.retired ? 'ABANDON' : `P${selected.officialPosition ?? '—'} / 22`;
  }

  function placeReplayFrame(frame, snapCamera = false, snapPlacement = false, cameraDt = .05) {
    if (!historicalReplay || !trackGap) return;
    const selected = frame.byNumber[selectedReplayNumber];
    if (selected?.retired) {
      const replacement = replayFollowFallback(frame, selectedReplayNumber)
        || replayFollowFallback(frame, selectedReplayNumber, true);
      if (replacement) selectedReplayNumber = replacement.number;
    } else if (selected?.ended && frame.timeSec > historicalReplay.data.drivers[selectedReplayNumber].finishSec + 1) {
      const stillRacing = replayFollowFallback(frame, selectedReplayNumber);
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
      const placement = placements.get(car.number);
      placement.offset = replayPitOffset(visualCars.find(visual => visual.number === car.number),
        frame.timeSec, historicalReplay.data.session, historicalReplay.data.drivers[car.number]?.pit, placement.offset);
      const previous = replayLateralOffsets.get(car.number);
      if (!snapPlacement && previous !== undefined) {
        placement.offset = rateLimitReplayOffset(previous, placement.offset, raceDelta,
          placement.offset > 3 || previous > 3 ? 1.2 : .65);
      }
      replayLateralOffsets.set(car.number, placement.offset);
    }
    if (snapPlacement) replayEntityPositions.clear();
    const visibleCars = visualCars.filter(car => carByNumber[car.number]
      && !car.dns && !(car.ended && frame.timeSec > historicalReplay.data.drivers[car.number].finishSec + 1));
    const entityPoses = resolveEntitySpacing(visibleCars.map(car => ({
      number: car.number, gridPosition: car.gridPosition,
      priority: car.progressMeters, ...placements.get(car.number),
    })), trackGap, replayEntityPositions, {
      curve: world.curve,
      lateralStep: snapPlacement ? Infinity : Math.min(2, raceDelta * 2.5),
      releaseStep: snapPlacement ? Infinity : Math.min(1.5, raceDelta * 5),
    });
    for (const car of frame.cars) {
      const model = replayCars()[car.number];
      const placement = placements.get(car.number);
      const entity = entityPoses.get(car.number);
      model?.controller?.placeReplay(placement.u, car.progressMeters, car.speedKph,
        entity?.offset ?? placement.offset, entity?.u ?? placement.u);
      if (entity) replayEntityPositions.set(car.number, entity);
      model?.wheels?.setDistance(car.progressMeters);
      if (model?.controller?.car) model.controller.car.visible = !car.dns && !(car.ended && frame.timeSec > historicalReplay.data.drivers[car.number].finishSec + 1);
    }
    lastReplayPoseTime = frame.timeSec;
    updateReplayControls(frame);
    if (snapCamera || historicalReplay.playing) {
      if (snapCamera) cameraMove = null;
      const followed = replayCars()[selectedReplayNumber]?.controller?.stats;
      if (followed) followRaceCamera(followed, frame.byNumber[selectedReplayNumber]?.speedKph || 0, cameraDt, snapCamera);
    }
    if (frame.timeSec >= historicalReplay.durationSec) {
      controls.enabled = true;
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
    const focusWasInReplay = replayPanel?.contains(document.activeElement);
    if (raceFlagAlert) raceFlagAlert.hidden = true;
    replayFlagTimeline = null;
    lastReplayFlagKey = '';
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
    replayEntityPositions.clear();
    for (const car of Object.values(replayCars())) {
      car.controller?.reset();
      car.wheels?.setDistance(0);
      if (car.controller?.car) car.controller.car.visible = true;
    }
    if (replayPanel) replayPanel.hidden = true;
    setReplayPanelCompact(false);
    endSessionUI();
    if (replayButton) {
      replayButton.textContent = 'Replay GP 2026';
      replayButton.setAttribute('aria-pressed', 'false');
    }
    if (weatherButton) weatherButton.disabled = false;
    if (savedWetModeForReplay && !wetMode) weatherButton?.click();
    savedWetModeForReplay = false;
    raceHud.hidden = true;
    raceHudCode.textContent = `${replayNames[requestedReplayNumber].toUpperCase()} / ${requestedReplayNumber}`;
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> STATS & TEMPS';
    raceSpeedLabel.textContent = 'VITESSE INSTANTANÉE';
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
    if (focusWasInReplay) replayButton?.focus({ preventScroll: true });
  }

  async function startReplay() {
    if (!world || !trackGap || replayButton?.disabled) return;
    const requestId = ++replayRequestId;
    exitRace();
    stopFlyover();
    if (replayButton) replayButton.disabled = true;
    try {
      if (!replayDataPromise) {
        replayDataPromise = fetch('./data/shanghai-2026-replay.json')
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          });
      }
      const replayData = await replayDataPromise;
      if (requestId !== replayRequestId) return;
      historicalReplay = createHistoricalReplay(replayData);
      replayFlagTimeline = createReplayFlagTimeline(replayData);
      lastReplayFlagKey = '';
      if (SHANGHAI_2026_ROSTER.some(driver => !replayData.drivers[driver.replayNumber])) {
        throw new Error('Le classement historique est incomplet : 22 pilotes attendus.');
      }
      document.querySelector('.replay-badge').textContent = `${carCatalog.length} MODÈLES / 22 INSCRITS`;
      document.querySelector('.replay-rankings').setAttribute('aria-label', 'Classement officiel des 22 inscrits, 18 partants');
      replayTotalLaps = Math.max(...historicalReplay.drivers.map(driver => driver.laps?.length || 0));
      replayActive = true;
      lastReplayRankingKey = '';
      lastReplayPoseTime = null;
      replayLateralOffsets.clear();
      replayEntityPositions.clear();
      selectedReplayNumber = requestedReplayNumber;
      historicalReplay.setSpeed(Number(replaySpeed?.value) || 1);
      historicalReplay.seek(0);
      savedWetModeForReplay = wetMode;
      if (wetMode) weatherButton?.click();
      if (replayPanel) replayPanel.hidden = false;
      beginSessionUI();
      setReplayPanelCompact(true);
      if (replayButton) {
        replayButton.textContent = 'Quitter le replay';
        replayButton.setAttribute('aria-pressed', 'true');
      }
      if (weatherButton) weatherButton.disabled = true;
      raceHud.hidden = false;
      raceLabel.textContent = 'STATS & TEMPS';
      raceSpeedLabel.textContent = 'VITESSE TÉLÉMÉTRIE';
      cameraMove = null;
      if (cameraModeButton) {
        cameraModeButton.hidden = false;
        cameraModeButton.disabled = false;
      }
      placeReplayFrame(historicalReplay.frame(), true, true);
      replayPanelToggle?.focus({ preventScroll: true });
      lastTime = performance.now();
    } catch (error) {
      if (requestId !== replayRequestId) return;
      replayDataPromise = null;
      historicalReplay = null;
      replayFlagTimeline = null;
      console.error('Données du replay indisponibles.', error);
      if (replayPanel) replayPanel.hidden = false;
      if (replayStatus) {
        replayStatus.hidden = false;
        replayStatus.textContent = 'Données du replay indisponibles en local.';
      }
    } finally {
      updateReplayAvailability();
    }
  }

  function updateCameraHint() {
    gestureHint.textContent = `Caméra ${cameraModes[cameraMode].toLowerCase()} · Pause pour explorer`;
  }

  function updateRaceHud(stats = raceController?.stats) {
    if (!stats) return;
    // The curve starts at the FIA timing line, whereas each car's travelled
    // distance starts at its own grid box.
    const lapDistance = ((stats.progress % 1) + 1) % 1 * stats.trackLengthMeters;
    raceSpeed.textContent = Math.round(stats.speedKmh).toString();
    raceLap.textContent = `TOUR ${stats.lap + 1}`;
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 5,45 KM`;
    raceProgress.style.width = `${Math.min(100, lapDistance / stats.trackLengthMeters * 100)}%`;
    if (raceLapTime) raceLapTime.textContent = formatLapTime(stats.lapTime);
    if (raceLastLap) raceLastLap.textContent = formatLapTime(stats.lastLapTime);
    if (raceSection) raceSection.textContent = stats.sectionName || 'Ligne droite des stands';
  }

  function placeFreeCar(instance, simulated, entity) {
    const stats = instance.controller.placeReplay(simulated.u,
      simulated.distanceMeters, simulated.speedKmh,
      entity?.offset ?? simulated.offset, entity?.u ?? simulated.u);
    stats.lap = simulated.lap;
    stats.laps = simulated.lap;
    stats.lapTime = simulated.lapTime;
    stats.lastLapTime = simulated.lastLapTime;
    stats.targetSpeedKmh = simulated.speedKmh;
    instance.wheels?.setDistance(simulated.distanceMeters);
  }

  function placeFreeRaceFrame(frame, cameraDt) {
    const visibleCars = frame.cars.filter(car => carInstances.has(car.number));
    const entityPoses = resolveEntitySpacing(visibleCars.map(car => ({
      number: car.number, gridPosition: car.gridPosition,
      priority: car.progressMeters, u: car.u, offset: car.offset,
    })), trackGap, freeEntityPositions, {
      curve: world.curve,
      lateralStep: Math.min(.18, cameraDt * 4),
      releaseStep: Math.min(.35, cameraDt * 7),
    });
    for (const simulated of visibleCars) {
      const instance = carInstances.get(simulated.number);
      const entity = entityPoses.get(simulated.number);
      placeFreeCar(instance, simulated, entity);
      if (entity) freeEntityPositions.set(simulated.number, entity);
    }
    const cameraStats = focusCarKey
      ? carInstances.get(carByKey[focusCarKey].number)?.controller?.stats || raceController?.stats
      : raceController?.stats;
    if (!cameraStats) return;
    followRaceCamera(cameraStats, cameraStats.speedKmh, cameraDt);
    updateRaceHud(cameraStats);
  }

  function pauseRace() {
    if (!racing || !raceController) return;
    racing = false;
    freeRaceField?.pause();
    raceController.stop();
    controls.enabled = true;
    raceButton.textContent = 'Reprendre la simulation';
    raceButton.setAttribute('aria-pressed', 'false');
    raceLabel.textContent = 'STATS · PAUSE';
    quickPause.textContent = 'Reprendre';
    gestureHint.innerHTML = exploreHint;
  }

  function exitRace() {
    if (!raceController || !raceStarted) return;
    for (const instance of carInstances.values()) {
      instance.controller.reset();
      instance.wheels?.setDistance(0);
    }
    racing = false;
    raceStarted = false;
    freeRaceField?.reset();
    freeEntityPositions.clear();
    controls.enabled = true;
    raceHud.hidden = true;
    endSessionUI();
    raceButton.textContent = 'Simulation libre';
    raceButton.setAttribute('aria-pressed', 'false');
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> STATS & TEMPS';
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
    if (!raceController || !world || !freeRaceField) return;
    stopFlyover();
    if (!raceStarted) {
      for (const instance of carInstances.values()) {
        instance.controller.reset();
        instance.wheels?.setDistance(0);
      }
      freeRaceField.reset();
      freeRaceField.setWet(wetMode);
      freeEntityPositions.clear();
      raceStarted = true;
    }
    freeRaceField.start();
    raceController.start();
    racing = true;
    cameraMove = null;
    controls.enabled = false;
    raceButton.textContent = 'Pause simulation';
    raceButton.setAttribute('aria-pressed', 'true');
    raceLabel.innerHTML = '<span class="race-live" aria-hidden="true"></span> STATS & TEMPS';
    raceSpeedLabel.textContent = 'VITESSE INSTANTANÉE';
    raceHud.hidden = false;
    beginSessionUI();
    quickPause.textContent = 'Pause';
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
    world = createShanghaiWorld(THREE, scene);
    trackGap = createTrackGapLookup(world.curve);
    freeRaceField = createFreeRaceField(carCatalog, {
      gridU: world.gridU, trackLengthMeters: trackGap.lengthMeters,
      gridSlotSpacingMeters: GRID_SLOT_SPACING,
    });
    weather = createShanghaiWeather(THREE, scene, world.curve, world.trackMaterial);
    if (weatherButton) weatherButton.disabled = false;
    const center = world.bounds.getCenter(new THREE.Vector3());
    const size = world.bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    frameCircuitOverview(THREE, camera, world.bounds, initialPosition, initialTarget);
    camera.position.copy(initialPosition);
    controls.target.copy(initialTarget);
    controls.update();
    focusSun(initialTarget);

    // The cars load after the circuit so slower connections can explore it
    // immediately. Each model retains its own ground-contact placement.
    function showCarIntro(car, u, cameraSide) {
      if (introPlayed) return;
      introPlayed = true;
      const fromRight = cameraSide > 0;
      const direction = world.curve.getTangentAt(u).setY(0).normalize();
      const side = new THREE.Vector3(direction.z, 0, -direction.x);
      const heroPosition = car.position.clone()
        .addScaledVector(direction, fromRight ? -18 : -27)
        .addScaledVector(side, cameraSide);
      heroPosition.y = car.position.y + (fromRight ? 5 : 8);
      const heroTarget = car.position.clone().addScaledVector(direction, fromRight ? 1 : 12);
      heroTarget.y = car.position.y + (fromRight ? 1 : 1.5);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        camera.position.copy(heroPosition);
        controls.target.copy(heroTarget);
        controls.update();
      } else {
        moveCamera(heroPosition, heroTarget, 2300);
      }
    }

    const carLoader = new GLTFLoader();
    const loadEntry = entry => new Promise((resolve, reject) => {
      const gridDistance = entry.pitLaneStart ? -entry.pitStartProgressMeters
        : 14.1 + (entry.gridPosition - 1) * GRID_SLOT_SPACING;
      const startU = trackGap.behind(world.gridU, gridDistance);
      const laneOffset = entry.pitLaneStart ? PIT_START_LANE_CENTER
        : entry.gridPosition % 2 ? GRID_LANE_CENTER : -GRID_LANE_CENTER;
      const modelUrl = new URL(entry.url, new URL('../', import.meta.url)).href;
      carLoader.load(modelUrl, ({ scene: car }) => {
        car.traverse(object => {
          if (object.isMesh) object.castShadow = true;
        });
        scene.add(car);
        const controller = createRaceController(THREE, world.curve, car, {
          startU, laneOffset, pitLaneStart: entry.pitLaneStart, trackHeightAt: world.trackHeightAt,
        });
        controller.stats.entry = entry;
        controller.setWet(wetMode);
        const wheelBinding = bindWheelSpin(THREE, car);
        const wheels = wheelBinding.enabled ? wheelBinding : null;
        if (!wheels) wheelBinding.dispose();
        const instance = { entry, controller, wheels };
        carInstances.set(entry.number, instance);
        if (entry.key === 'redbull') {
          redBullCar = car;
          raceController = controller;
          focusSun(car.position);
        }
        if (raceStarted && freeRaceField) {
          const simulated = freeRaceField.frame().byNumber[entry.number];
          if (simulated) placeFreeCar(instance, simulated);
        }
        if (entry.key === focusCarKey || (!focusCarKey && entry.key === 'redbull')) {
          showCarIntro(car, startU, entry.pitLaneStart ? -7 : laneOffset > 0 ? 7 : -8);
        }
        updateReplayAvailability();
        resolve(instance);
      }, undefined, error => {
        console.warn(`La monoplace de ${entry.driverName} est indisponible.`, error);
        failedCarName = entry.driverName;
        updateReplayAvailability();
        if (entry.key === focusCarKey && redBullCar) {
          focusCarKey = null;
          showCarIntro(redBullCar,
            trackGap.behind(world.gridU, 14.1 + (carByKey.redbull.gridPosition - 1) * GRID_SLOT_SPACING), -8);
        }
        reject(error);
      });
    });
    fieldLoader = createDeferredModelField(carCatalog, loadEntry, updateReplayAvailability);
    if (focusCarKey) fieldLoader.load().catch(error => console.warn(error));

    overviewButton.disabled = false;
    gridButton.disabled = false;
    flyoverButton.disabled = false;
    loading.classList.add('is-hidden');
    updateReplayAvailability();
  } catch (error) {
    loadingMessage.textContent = 'Le circuit n’a pas pu être affiché.';
    console.error(error);
  }

  overviewButton.addEventListener('click', () => {
    ++carViewRequest;
    exitReplay();
    exitRace();
    stopFlyover();
    if (world) moveCamera(initialPosition, initialTarget);
  });

  gridButton.addEventListener('click', () => {
    if (!requestCars(() => gridButton.click())) return;
    exitReplay();
    exitRace();
    stopFlyover();
    if (!world) return;
    const focusedController = focusCarKey
      ? carInstances.get(carByKey[focusCarKey].number)?.controller : null;
    if (focusedController) {
      const focusedEntry = carByKey[focusCarKey];
      const at = focusedController.stats.position.clone();
      const dir = world.curve.getTangentAt(focusedController.stats.progress).setY(0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      const position = at.clone().addScaledVector(dir, -18)
        .addScaledVector(side, focusedEntry.pitLaneStart ? -7 : 7);
      position.y = at.y + 5;
      const target = at.clone().addScaledVector(dir, 1);
      target.y = at.y + 1;
      moveCamera(position, target, 1100);
      return;
    }
    const at = world.gridPoint.clone();
    const dir = world.gridTangent.clone().normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const position = at.clone().addScaledVector(dir, -60).addScaledVector(side, 8);
    position.y = at.y + 17;
    const target = at.clone().addScaledVector(dir, -8);
    target.y = at.y + 2;
    moveCamera(position, target, 1100);
  });

  flyoverButton.addEventListener('click', () => {
    ++carViewRequest;
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
    if (!requestCars(() => raceButton.click())) return;
    if (replayActive) exitReplay();
    if (racing) pauseRace();
    else startRace();
  });
  replayButton?.addEventListener('click', () => {
    if (!requestCars(() => replayButton.click())) return;
    if (replayActive) exitReplay();
    else startReplay();
  });
  replayPanelToggle?.addEventListener('click', () => {
    const opening = replayPanel.classList.contains('is-compact');
    if (opening) setControlsExpanded(false);
    setReplayPanelCompact(!opening);
  });
  raceHudToggle?.addEventListener('click', () => {
    setRaceHudCompact(!raceHud.classList.contains('is-compact'));
  });
  controlsToggle?.addEventListener('click', () => {
    const opening = !atlas.classList.contains('controls-expanded');
    if (opening && replayPanel && !replayPanel.hidden && !replayPanel.classList.contains('is-compact')) {
      setReplayPanelCompact(true);
    }
    setControlsExpanded(opening);
  });
  quickPause?.addEventListener('click', () => {
    if (replayActive) replayToggle?.click();
    else if (raceStarted) raceButton.click();
  });
  immersiveToggle?.addEventListener('click', () => {
    setImmersive(!atlas.classList.contains('is-immersive'));
  });
  document.addEventListener('keydown', event => {
    if (!atlas.classList.contains('is-session')) return;
    if (event.key === 'Escape' && atlas.classList.contains('is-immersive')) {
      event.preventDefault();
      setImmersive(false);
    } else if (event.key.toLowerCase() === 'i' && !event.altKey && !event.ctrlKey && !event.metaKey
      && !event.target.closest('input, select, textarea, [contenteditable="true"]')) {
      event.preventDefault();
      setImmersive(!atlas.classList.contains('is-immersive'));
    }
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
  replayRankings?.addEventListener('click', event => {
    const button = event.target.closest('[data-replay-number]');
    if (!button || !replayActive || !historicalReplay) return;
    const number = Number(button.dataset.replayNumber);
    if (button.disabled || historicalReplay.frame().byNumber[number]?.retired) return;
    selectedReplayNumber = number;
    placeReplayFrame(historicalReplay.frame(), true);
    if (window.matchMedia('(max-width: 760px)').matches) {
      setReplayPanelCompact(true);
      replayPanelToggle.focus({ preventScroll: true });
    }
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
    freeRaceField?.setWet(wetMode);
    for (const instance of carInstances.values()) instance.controller.setWet(wetMode);
    weatherButton.textContent = wetMode ? 'Météo · Pluie' : 'Météo · Sec';
    weatherButton.setAttribute('aria-pressed', String(wetMode));
    weatherButton.setAttribute('aria-label', wetMode ? 'Désactiver la pluie et sécher la piste' : 'Activer la pluie et la piste mouillée');
    sun.intensity = wetMode ? .96 : 1.65;
    ambient.intensity = wetMode ? 1.2 : 1.48;
    world?.trackside.setWetLighting(wetMode);
    scene.fog.color.set(wetMode ? 0x98a8ae : 0xc4c9b8);
    sky.setWet(wetMode);
  });
  window.addEventListener('keydown', event => {
    const target = event.target;
    if (target instanceof HTMLElement &&
      (target.isContentEditable || target.closest('button, a, input, select, textarea'))) return;
    if (event.key.toLowerCase() !== 'c' || !(raceStarted || replayActive) || event.repeat) return;
    cameraModeButton?.click();
  });
  canvas.addEventListener('pointerdown', () => { pauseRace(); pauseReplay(); stopFlyover(); });

  function followRaceCamera(cameraStats, speedKph, dt, snap = false) {
    const forward = cameraStats.tangent;
    const side = new THREE.Vector3(forward.z, 0, -forward.x);
    const pitLaneView = cameraStats.lateralOffset < -7
      || (cameraStats.entry?.pitLaneStart && cameraStats.distanceMeters < 310);
    const desiredPosition = cameraStats.position.clone();
    const desiredTarget = cameraStats.position.clone();
    const narrowView = camera.aspect < .75;
    let desiredFov;
    if (cameraMode === 1) {
      desiredPosition.addScaledVector(forward, -5)
        .addScaledVector(side, pitLaneView ? -8 : narrowView ? 14 : 19);
      desiredPosition.y += narrowView ? 6.66 : 6.06;
      desiredTarget.addScaledVector(forward, 5);
      desiredTarget.y += 1.01;
      desiredFov = narrowView ? 52 : 42;
    } else if (cameraMode === 2) {
      desiredPosition.addScaledVector(forward, narrowView ? -38 : -43)
        .addScaledVector(side, pitLaneView ? -8 : narrowView ? 12 : 19);
      desiredPosition.y += narrowView ? 71.66 : 65.66;
      desiredTarget.addScaledVector(forward, 24);
      desiredTarget.y += .66;
      desiredFov = narrowView ? 53 : 46;
    } else {
      desiredPosition.addScaledVector(forward, narrowView ? -12.5 : -7.8)
        .addScaledVector(side, pitLaneView ? -1.5 : narrowView ? .65 : 2.4);
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
    const elapsed = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    if (document.hidden) return;
    const motionDt = Math.min(.1, elapsed);

    if (replayActive && historicalReplay?.playing) {
      // Historical playback follows wall time even when a heavy frame takes >50 ms.
      placeReplayFrame(historicalReplay.tick(elapsed), false, false, motionDt);
    } else if (racing && world && raceController && freeRaceField) {
      // Each driver has an independent race state. Render only the final state
      // of the stable simulation steps, then keep the model volumes separated.
      placeFreeRaceFrame(freeRaceField.update(elapsed), motionDt);
    } else if (flying && world) {
      lapProgress = (lapProgress + motionDt / 80) % 1;
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
    world?.trackside.updateLighting(controls.target);
    for (const [number, instance] of carInstances) {
      const car = instance.controller.car;
      const replayDriver = historicalReplay?.data.drivers[number];
      const ended = replayActive && (!replayDriver || replayDriver.status === 'dns' || historicalReplay.timeSec > replayDriver.finishSec + 1);
      car.visible = !ended && camera.position.distanceTo(car.position) < 850;
    }
    sky.follow(camera.position);
    weather?.update(motionDt, camera);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
