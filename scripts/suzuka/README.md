# Suzuka 2026

Local static Three.js circuit at `dist/suzuka/`. No credentials are embedded.

## Geometry and relief

- Official Suzuka guide: [5.807 km, 18 turns, 10–16 m width](https://www.suzukacircuit.jp/eng/course_s/).
- [FIA Japanese GP2026 circuit / pit map](https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf) verifies contemporary corner order, sectors and straight mode locations.
- Plan reconstructed from OpenF1 session11253, Kimi Antonelli #12, lap49 on29March2026. `fastlap-location.json` retains the original356 location samples. This is a racing line, not a kerb survey. `build-track.mjs` uses a closed centripetal spline, resamples at~5m and calibrates the 3D lap to5807m.
- Ground axes are now geographically registered: **x east / z south**. `register-geography.mjs` fits the entire OpenF1 lap to the WGS84 [Suzuka GeoJSON](https://github.com/bacinger/f1-circuits/blob/master/circuits/jp-1962.geojson) using rotation/scale/translation only, without reflection or reordering. The resulting rotation from raw `[X,-Y]` is+0.985217553degrees, RMS4.43m. The previous49degree MultiViewer display rotation was geographically wrong and has been removed. `GEOGRAPHIC_FRAME` exports the WGS84 origin and four independently readable reference anchors. Main straight bearing140.68degrees and west straight112.45degrees agree with geographic endpoints within1.2degrees. MIT attribution/license accompany the GeoJSON. T1 remains a right turn and the exact control-line phase is retained. `multiviewer.json` is the2025 corner annotation archive; corner locations were checked against the2026 FIA map and projected onto the2026 line.
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
node scripts/suzuka/register-geography.mjs
node scripts/suzuka/build-track.mjs
node --test --test-concurrency=1 tests/suzuka-track.mjs tests/suzuka-world.mjs tests/suzuka-replay.mjs tests/suzuka-simulation.mjs tests/suzuka-detail-audit.mjs tests/suzuka-render-budget.mjs
node scripts/suzuka/audit-performance.mjs
```

Tests check5807m calibration, corner direction,52m physical relief, both levels of the crossover, deck and terrain clearance, representative scenery and identity/timing contracts. Visual browser QA is coordinated by the parent task.

## Close-view road / barrier / venue audit

The [official Suzuka course guide, July2026](https://www.suzukacircuit.jp/course_s/pdf/suzuka_courseguide.pdf), its north compass, detailed venue plan and the2026 FIA map were compared with the scene. The model remains a documented visual reconstruction rather than a surveyed digital twin.

Concrete defects and corrections:

- The prior road edges had31 inverted triangles:3 shoulder,26 grass verge and2 chicane runoff triangles. Adaptive inside offsets now respect local curvature, invalid offset triangles are excluded, and real3D vertex normals replace flat upward normals. The pit road's reversed winding is also corrected.
- A continuous4.6m paved shoulder and uniform coloured apron at every bend were inherited from another circuit. Normal shoulders are now0.9m, grass remains dominant through the Esses/200R, and tapered granular gravel beds serve T1/T2, Dunlop/NIPPO, Degner, Hairpin, Spoon and130R. The Astemo/Casio chicane gets a compact asphalt escape area. Exit kerbs identify the S-curve exits, Spoon and chicane. All road/safety triangles are checked for upward winding.
- The old terrain datum was1.3m below the road everywhere, producing a permanent berm and visually floating walls. The local surface now sits about0.45m below the road, with terrain/road clearance still tested over the complete lap. Barriers, posts and braking boards follow the final terrain.
- The previous2D-only barrier filter removed protection on both sides of the lower crossover road. Height-aware clearance now distinguishes the two decks; lower guardrails continue through the crossing. Upper guardrails blend into deck-mounted parapets/catch screens, without fences floating beyond the bridge deck.
- Old braking references included nonexistent T20 and omitted Degner/chicane. Current boards serve turns1/8/9/11/13/16. Impact blocks and layered tyre protection sit outside the gravel areas.
- A15cm opening separated both pit tapers from the racing surface. Both tapers now overlap the road by12cm and have continuous white merge paint, an asphalt divider island and a48-bay pit frontage matching the official permanent-garage count. Neither the300m control/start offset nor historic7.84m grid spacing changed.
- `terrainHeightAt` was not passed to the venue builder, leaving structures as much as13m above the actual ground. Every footprint now samples the final terrain; full skirts join foundations to it. Near-track buildings also reserve the pit lane/garage footprints. Grandstands B andI were on the wrong side and could not be built; all nine intended stands now fit. Seating faces the track on both sides, while foundations remain in their original geographic orientation. Stair treads, rails, the race-control tower, Honda Racing Gallery and Japanese cedar silhouettes improve the near view.
- The replay JSON is unchanged. Geographic calibration rotates the same chronological stations, preserves handedness and control-line phase, and therefore leaves its timing, positions and relative lateral interpretation aligned.


## Render cost audit

The close-view venue initially submitted1,139 scene draws through1,137 meshes and1,132 geometries. Small stairs, deck slabs, buildings and beams each had their own mesh. `static-batches.js` now shares unit primitives and groups identical geometry/material/shadow settings into260m spatial instance batches, preserving world-space dimensions and rotations. Bridge batches remain children of the bridge; individual audited piers and terrain-following foundations remain intact. Full-detail totals stay521,427 triangles, with298 scene draws,14 potential shadow draws (previously53),296 meshes and184 geometries. Counts are CPU scene submissions before camera/light frustum culling, not measured browser FPS.

Individual spectators disappear past650m while the seating tiers remain. All spectators return when approaching a stand. The distant scene has408,867 triangles and289 potential scene draws. The render-budget test checks all nine near/far LODs, preservation of transformed vertices and submission ceilings.

`batchStaticPrimitives` is reused by Miami's venue:671→271 scene draws and425→86 shadow draws, with249,058 triangles unchanged. Its audited structures and named yacht decks/cabanas remain individual objects. Miami's Turnpike was already instanced and is unchanged. `node scripts/suzuka/audit-performance.mjs miami` reports that scene too. Browser responsiveness must still be verified on the target computer.
