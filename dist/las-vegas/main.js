import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { createVegasWorld } from './world.js';
import { GRID_LANE_CENTER, GRID_SLOT_SPACING, PIT_START_LANE_CENTER } from './grid-details.js';
import { createTrackGapLookup } from '../monza/track-gap.js';
import { createRaceController } from './race-motion.js';
import { createFreeRaceField } from './free-race-field.js';
import { createHistoricalReplay, replayLapDistance } from '../monza/historical-replay.js';
import { createReplayFlagTimeline } from '../monza/replay-flags.js';
import { computeReplayPlacements, replayVisualDistance, replayPitOffset, rateLimitReplayOffset } from './replay-lanes.js';
import { resolveEntitySpacing } from './entity-spacing.js';
import { bindWheelSpin } from '../monza/wheel-spin.js';
import { carByKey as garageByKey } from '../car-catalog.js';
import { VEGAS_2025_ROSTER, VEGAS_2025_DISPLAYED } from './replay-roster.js';
import { createVegasSky } from './sky.js';
import { createVegasWeather } from './weather.js';

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
const carCatalog = Object.freeze(VEGAS_2025_DISPLAYED.map(driver => Object.freeze({
  ...garageByKey[driver.modelKey],
  number: driver.replayNumber,
  gridPosition: driver.gridPosition,
  pitLaneStart: !!driver.pitLaneStart,
  pitStartProgressMeters: driver.pitStartProgressMeters,
  pitStartDelaySec: driver.pitLaneStart ? 8 + (driver.gridPosition - 19) * .35 : undefined,
})));
const carByKey = Object.freeze(Object.fromEntries(carCatalog.map(car => [car.key, car])));
const carByNumber = Object.freeze(Object.fromEntries(carCatalog.map(car => [car.number, car])));
const replayNames = Object.freeze(Object.fromEntries(VEGAS_2025_ROSTER.map(driver =>
  [driver.replayNumber, driver.name.split(' ').at(-1)])));
const replayClassifications = Object.freeze(Object.fromEntries(VEGAS_2025_ROSTER.map(driver =>
  [driver.replayNumber, driver.classification || null])));
const replayFinalPositions = Object.freeze(Object.fromEntries(VEGAS_2025_ROSTER.map(driver =>
  [driver.replayNumber, driver.finalPosition])));
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
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090f1e);
  scene.fog = new THREE.Fog(0x10172c, 2600, 9000);
  const sky = createVegasSky(THREE, scene);

  const camera = new THREE.PerspectiveCamera(41, 1, 0.5, 12000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.01;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  controls.maxDistance = 10000;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.7;

  const ambient = new THREE.HemisphereLight(0xb9d2fc, 0x283044, 1.72);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xdde8ff, 1.65);
  const sunOffset = new THREE.Vector3(-680, 820, 1020);
  sun.position.copy(sunOffset);
  sun.castShadow = false;
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
  let freeRaceField = null;
  let redBullCar = null;
  const carInstances = new Map();
  let lapProgress = 0;
  let cameraMode = 0;
  let introPlayed = false;
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
  let replayTotalLaps = 50;
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
    if (replayButton) replayButton.disabled = !allCarsLoaded;
    raceButton.disabled = !allCarsLoaded || !raceController;
    if (controlHelp) controlHelp.textContent = failedCarName
      ? `La voiture de ${failedCarName} n’a pas pu charger. Rechargez la page pour réessayer.`
      : allCarsLoaded ? defaultControlHelp
        : `Chargement des voitures : ${loadedCount}/${carCatalog.length}. La simulation et le replay seront bientôt disponibles.`;
  }

  function replayPauseAt(timeSec) {
    return historicalReplay?.data.session.pauses?.find(pause => timeSec >= pause.startSec && timeSec < pause.endSec) || null;
  }

  function replayRaceStatus(timeSec, selected) {
    const data = historicalReplay.data;
    if (timeSec >= Math.floor(historicalReplay.durationSec)) return 'ARRIVÉE · Replay terminé';
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
    // The clock displays whole seconds. Show the final verdict throughout its
    // displayed final second, including when the user drags to "01:22:40".
    const classificationsFinal = frame.timeSec >= Math.floor(historicalReplay.durationSec);
    const rankingKey = `${selectedReplayNumber}|${classificationsFinal}|${frame.cars.map(car => `${car.number}:${car.officialPosition}:${car.retired}`).join(',')}`;
    if (replayRankings && rankingKey !== lastReplayRankingKey) {
      lastReplayRankingKey = rankingKey;
      const focusedNumber = replayRankings.contains(document.activeElement)
        ? document.activeElement.closest('[data-replay-number]')?.dataset.replayNumber : null;
      const rankedCars = classificationsFinal
        ? [...frame.cars].sort((a, b) => replayFinalPositions[a.number] - replayFinalPositions[b.number])
        : frame.cars;
      replayRankings.innerHTML = rankedCars.map(car => {
        const disqualified = classificationsFinal && replayClassifications[car.number] === 'DSQ';
        const nonClassified = classificationsFinal && replayClassifications[car.number] === 'NC';
        const status = car.retired ? 'ABANDON' : disqualified ? 'DISQUALIFIÉ APRÈS ARRIVÉE'
          : !carByNumber[car.number] ? 'SANS MODÈLE'
            : classificationsFinal || car.finished ? 'ARRIVÉE' : 'EN PISTE';
        const displayedPosition = classificationsFinal
          ? replayFinalPositions[car.number] : car.officialPosition ?? car.selectedRank;
        const rank = disqualified ? 'DSQ' : nonClassified ? 'NC' : `P${displayedPosition}`;
        const label = car.retired ? `${replayNames[car.number]}, abandon`
          : disqualified ? `${replayNames[car.number]}, disqualifié après l’arrivée`
            : !carByNumber[car.number] ? `${replayNames[car.number]}, modèle 3D indisponible`
              : `Suivre ${replayNames[car.number]}, position officielle ${displayedPosition}`;
        return `<li class="${[car.number === selectedReplayNumber ? 'is-followed' : '', car.retired ? 'is-retired' : '', disqualified ? 'is-disqualified' : '', !carByNumber[car.number] ? 'is-unavailable' : ''].filter(Boolean).join(' ')}"><button type="button" data-replay-number="${car.number}" aria-current="${car.number === selectedReplayNumber}" aria-label="${label}" ${car.retired || disqualified || !carByNumber[car.number] ? 'disabled' : ''}><span>${rank}</span><strong>${replayNames[car.number]}</strong><small>#${car.number} · ${status}</small></button></li>`;
      }).join('');
      if (focusedNumber) {
        const previousButton = replayRankings.querySelector(`[data-replay-number="${focusedNumber}"]`);
        const focusTarget = previousButton?.disabled
          ? replayRankings.querySelector('button:not(:disabled)')
          : previousButton;
        focusTarget?.focus({ preventScroll: true });
      }
    }
    raceHudCode.textContent = `${replayNames[selected.number].toUpperCase()} / ${selected.number}`;
    raceSpeed.textContent = Math.round(selected.speedKph).toString();
    if (quickPause) quickPause.textContent = historicalReplay.playing ? 'Pause' : 'Lecture';
    raceLap.textContent = `TOUR ${selected.lap} / ${replayTotalLaps}`;
    const lapDistance = replayLapDistance(selected.progressMeters, historicalReplay.data.session, selected.finished);
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 6,20 KM`;
    raceProgress.style.width = `${Math.min(100, lapDistance / historicalReplay.trackLengthMeters * 100)}%`;
    if (raceLapTime) raceLapTime.textContent = formatLapTime(selected.lapTimeSec);
    if (raceLastLap) raceLastLap.textContent = formatLapTime(selected.lastLapSec);
    const selectedController = replayCars()[selected.number]?.controller;
    if (raceSection) raceSection.textContent = pause
      ? selected.speedKph > 5 ? 'Retour aux stands' : 'Course interrompue'
      : selectedController?.stats.sectionName || 'Las Vegas Strip';
    if (raceLapLabel) raceLapLabel.textContent = 'TOUR OFFICIEL';
    if (replayGear) replayGear.textContent = selected.gear > 0 ? String(selected.gear) : 'N';
    if (replayThrottle) replayThrottle.textContent = `${Math.round(selected.throttlePct)} %`;
    if (replayBrake) replayBrake.textContent = `${Math.round(selected.brakePct)} %`;
    if (replayOfficialPosition) replayOfficialPosition.textContent = selected.retired ? 'ABANDON'
      : classificationsFinal && replayClassifications[selected.number] === 'DSQ'
        ? 'DSQ APRÈS ARRIVÉE' : `P${classificationsFinal
          ? replayFinalPositions[selected.number] : selected.officialPosition ?? '—'} / 20`;
  }

  function placeReplayFrame(frame, snapCamera = false, snapPlacement = false, cameraDt = .05) {
    if (!historicalReplay || !trackGap) return;
    const selected = frame.byNumber[selectedReplayNumber];
    if (selected?.retired) {
      const replacement = replayFollowFallback(frame, selectedReplayNumber)
        || replayFollowFallback(frame, selectedReplayNumber, true);
      if (replacement) selectedReplayNumber = replacement.number;
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
    const finalMoment = frame.timeSec >= Math.floor(historicalReplay.durationSec);
    const visibleAtThisMoment = car => {
      const finishedEarlier = car.ended
        && frame.timeSec > historicalReplay.data.drivers[car.number].finishSec + 1;
      // At the final result, pin only the followed finisher at the last
      // recorded pose. This keeps the camera meaningful without repopulating
      // the track with cars that have already crossed the line.
      return !finishedEarlier || (finalMoment && car.number === selectedReplayNumber && !car.retired);
    };
    const visibleCars = visualCars.filter(car => carByNumber[car.number] && visibleAtThisMoment(car));
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
      if (model?.controller?.car) model.controller.car.visible = visibleAtThisMoment(car);
    }
    lastReplayPoseTime = frame.timeSec;
    updateReplayControls(frame);
    if (snapCamera || historicalReplay.playing) {
      if (snapCamera) cameraMove = null;
      const followed = replayCars()[selectedReplayNumber]?.controller?.stats;
      if (followed) followRaceCamera(followed, frame.byNumber[selectedReplayNumber]?.speedKph || 0, cameraDt, snapCamera);
    }
    if (finalMoment) controls.enabled = true;
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
      replayButton.textContent = 'Replay GP 2025';
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
        replayDataPromise = fetch('./data/las-vegas-2025-replay.json')
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
      if (VEGAS_2025_ROSTER.some(driver => !replayData.drivers[driver.replayNumber])) {
        throw new Error('Le classement historique est incomplet : 20 pilotes attendus.');
      }
      document.querySelector('.replay-badge').textContent = `${carCatalog.length} MODÈLES / 20 PILOTES`;
      document.querySelector('.replay-rankings').setAttribute('aria-label', 'Classement officiel des 20 pilotes, dont 19 représentés en 3D');
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
    raceDistance.textContent = `${(lapDistance / 1000).toFixed(2).replace('.', ',')} / 6,20 KM`;
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

  function fitOverviewToVisibleArea() {
    if (!world) return;
    const center = world.bounds.getCenter(new THREE.Vector3());
    const size = world.bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    initialTarget.set(center.x, center.y, center.z + span * .12);
    if (atlas.clientWidth > 760) {
      initialPosition.set(center.x + span * .09, span * 1.92, center.z + span * .24);
      return;
    }
    initialPosition.set(center.x + span * .03, span * 2.30, center.z + span * .19);
    const width = atlas.clientWidth, height = atlas.clientHeight;
    const atlasTop = atlas.getBoundingClientRect().top;
    const topbarBottom = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? atlasTop) - atlasTop;
    const dataBottom = (document.querySelector('.circuit-data')?.getBoundingClientRect().bottom ?? atlasTop) - atlasTop;
    const dockTop = (document.querySelector('.toolbar')?.getBoundingClientRect().top ?? atlasTop + height) - atlasTop;
    const safe = {
      left: 18, right: width - 18,
      top: Math.max(topbarBottom + 12, dataBottom + 16),
      bottom: Math.min(height - 18, dockTop - 16),
    };
    if (safe.bottom - safe.top < 155) {
      safe.top = Math.max(80, topbarBottom + 10);
      safe.bottom = Math.max(safe.top + 155, height - 165);
    }
    const position = initialPosition.clone();
    const target = center.clone();
    position.x = center.x + 65;
    position.z = center.z + 95;
    const previousPosition = camera.position.clone();
    const previousRotation = camera.quaternion.clone();
    const projectedBounds = () => {
      camera.position.copy(position);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (let i = 0; i < world.samples.length; i += 6) {
        const projected = world.samples[i].clone().project(camera);
        const x = (projected.x + 1) * width / 2;
        const y = (1 - projected.y) * height / 2;
        bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
      }
      bounds.cx = (bounds.minX + bounds.maxX) / 2;
      bounds.cy = (bounds.minY + bounds.maxY) / 2;
      return bounds;
    };
    let bounds = projectedBounds();
    for (let pass = 0; pass < 5; pass++) {
      const factor = Math.max(1,
        (bounds.maxX - bounds.minX) / (safe.right - safe.left - 20),
        (bounds.maxY - bounds.minY) / (safe.bottom - safe.top - 20));
      if (factor <= 1.001) break;
      position.y *= factor * 1.01;
      bounds = projectedBounds();
    }
    // Move the whole view, not the circuit: the track sits in the actual free
    // area between the characteristics card and the bottom command dock.
    for (let pass = 0; pass < 2; pass++) {
      const base = projectedBounds();
      position.x += 100; target.x += 100;
      const movedX = projectedBounds();
      position.x -= 100; target.x -= 100;
      position.z += 100; target.z += 100;
      const movedZ = projectedBounds();
      position.z -= 100; target.z -= 100;
      const jxx = (movedX.cx - base.cx) / 100, jyx = (movedX.cy - base.cy) / 100;
      const jxz = (movedZ.cx - base.cx) / 100, jyz = (movedZ.cy - base.cy) / 100;
      const determinant = jxx * jyz - jxz * jyx;
      if (Math.abs(determinant) < 1e-5) break;
      const dx = (safe.left + safe.right) / 2 - base.cx;
      const dy = (safe.top + safe.bottom) / 2 - base.cy;
      const shiftX = (dx * jyz - dy * jxz) / determinant;
      const shiftZ = (dy * jxx - dx * jyx) / determinant;
      position.x += shiftX; target.x += shiftX;
      position.z += shiftZ; target.z += shiftZ;
    }
    initialPosition.copy(position);
    initialTarget.copy(target);
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousRotation);
    camera.updateMatrixWorld(true);
  }

  try {
    world = createVegasWorld(THREE, scene);
    trackGap = createTrackGapLookup(world.curve);
    freeRaceField = createFreeRaceField(carCatalog, {
      gridU: world.gridU, trackLengthMeters: trackGap.lengthMeters,
      gridSlotSpacingMeters: GRID_SLOT_SPACING,
    });
    weather = createVegasWeather(THREE, scene, world.curve, world.trackMaterial);
    if (weatherButton) weatherButton.disabled = false;
    fitOverviewToVisibleArea();
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
    for (const entry of carCatalog) {
      const gridDistance = entry.pitLaneStart ? entry.pitStartProgressMeters
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
      }, undefined, error => {
        console.warn(`La monoplace de ${entry.driverName} est indisponible.`, error);
        failedCarName = entry.driverName;
        updateReplayAvailability();
        if (entry.key === focusCarKey && redBullCar) {
          focusCarKey = null;
          showCarIntro(redBullCar,
            trackGap.behind(world.gridU, 14.1 + (carByKey.redbull.gridPosition - 1) * GRID_SLOT_SPACING), -8);
        }
      });
    }

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
    exitReplay();
    exitRace();
    stopFlyover();
    if (world) {
      fitOverviewToVisibleArea();
      moveCamera(initialPosition, initialTarget);
    }
  });

  gridButton.addEventListener('click', () => {
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
    ambient.intensity = wetMode ? 1.44 : 1.72;
    world?.trackside.setWetLighting(wetMode);
    scene.fog.color.set(wetMode ? 0x182238 : 0x10172c);
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
    sky.follow(camera.position);
    weather?.update(motionDt, camera);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
