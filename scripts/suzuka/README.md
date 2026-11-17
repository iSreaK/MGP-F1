# Suzuka 2026

Local static Three.js circuit at `dist/suzuka/`. No credentials are embedded.

## Geometry and relief

- Official Suzuka guide: [5.807 km, 18 turns, 10–16 m width](https://www.suzukacircuit.jp/eng/course_s/).
- [FIA Japanese GP2026 circuit / pit map](https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf) verifies contemporary corner order, sectors and straight mode locations.
- Plan reconstructed from OpenF1 session11253, Kimi Antonelli #12, lap49 on29March2026. `fastlap-location.json` retains the original356 location samples. This is a racing line, not a kerb survey. `build-track.mjs` uses a closed centripetal spline, resamples at~5m and calibrates the 3D lap to5807m.
- Ground conversion rotates the original XY by49degrees, then uses Three.js `[X,-Y]`. There is no display reflection. T1 must turn right; an explicit handedness assertion guards against the previous mirror bug. `multiviewer.json` is the2025 corner annotation archive; corner locations were checked against the2026 FIA map and projected onto the2026 line.
- [Official Super Formula Suzuka course information](https://superformula.net/sf2/circuit/suzuka) documents52m elevation range. OpenF1 Z is low-pass filtered and scaled to this range. Intermediate elevations are a reconstruction rather than a surveyed profile. A1.16 vertical presentation multiplier makes the physical52m range readable (~60.32m in scene).
- OpenF1 Z does not resolve both crossover levels. An explicit smooth correction restores an estimated8m physical road separation. The scene provides~9.28m between surfaces and~8.16m under the1m structural deck. Terrain follows the lower branch and cannot rise through it. Abutments/pillars sit outside the lower road. The8m separation is a plausible modelling dimension, not a sourced measurement.
- Width uses a12m representative centreline band. Pit geometry, building footprints and scenery placement are visual reconstructions.

## Recognisable venue

Figure-eight bridge, S Curves, Dunlop, Degner, hairpin, Spoon,130R and Casio Triangle; V1/V2 main grandstands, hospitality/pit garages, Honda/Suzuka signs, Mie woodland and spring cherry blossom trees. Motopia's Circuit Wheel has coloured cabins, spokes and an A-frame and is modelled to the [official approximately50m overall height](https://www.suzukacircuit.jp/eng/park/attraction/circuit-wheel/). Attractions and grandstands are stylised, with all footprints kept clear of the racing line.

## Historical replay

The replay is the actual29March2026 Japanese GP, OpenF1 session11253. Official [starting grid](https://www.formula1.com/en/results/2026/races/1281/japan/starting-grid) and [result](https://www.formula1.com/en/results/2026/races/1281/japan/race-result) determine the22 starters, identity, finish and retirements. Hadjar #6 remains in the full classification, without substituting an unrelated local3D asset;21 drivers are rendered. Bearman retires after20 completed laps and Stroll after30.

Download/rebuild:

```powershell
node scripts/suzuka/fetch-openf1.mjs
node scripts/suzuka/process-replay.mjs
node scripts/suzuka/build-free-speed-profile.mjs
```

Raw data caches default to the system temporary directory `MGP-F1-suzuka-2026`, or `SUZUKA_REPLAY_RAW_DIR`. An optional `OPENF1_ACCESS_TOKEN` stays in request headers and is never written. Fetches retry rate limits and network failures, and use cached responses on restart. Historical speed, pedal channels, positions, pit stops, lap timing, weather and race-control flags are local after processing. Longitudinal movement is integrated from speed and recalibrated at every lap timing anchor; relative lateral positions are reconstructed from GPS and confidence-weighted. Missing/stale telemetry repairs are counted in replay metadata. Lawson's isolated lap14 start is reported approximately60s late by OpenF1; the correction is independently corroborated by both adjacent starts and official lap durations, and retained in `lapStartRepairs`. The first geometry GPS sample arrives188ms after the control timestamp; periodic seam interpolation anchors station0 correctly instead of shifting every braking point by~15m.

```powershell
node scripts/suzuka/build-track.mjs
node --test --test-concurrency=1 tests/suzuka-track.mjs tests/suzuka-world.mjs tests/suzuka-replay.mjs tests/suzuka-simulation.mjs
```

Tests check5807m calibration, corner direction,52m physical relief, both levels of the crossover, deck and terrain clearance, representative scenery and identity/timing contracts. Visual browser QA is coordinated by the parent task.
