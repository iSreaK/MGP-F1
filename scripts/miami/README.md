# Miami International Autodrome

Current 19-turn configuration, 5,412 m, anticlockwise. Standalone static route: `dist/miami/`.

## Sources

- [FIA 2026 Miami Doc 5: circuit and pit-lane maps](https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf), issued 30 April 2026. Turn order, circuit length, start/control-line separation, pit side, and plan chirality were checked against this map.
- [Official Formula 1 circuit guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-miami-international-autodrome.zMEQ1nU4xZKuvc9EsGXDr.zMEQ1nU4xZKuvc9EsGXDr): 19 turns, 5.412 km and the uphill/downhill T14–15 chicane.
- [Formula 1 venue description](https://www.formula1.com/en/latest/article/our-insiders-guide-to-the-all-new-miami-international-autodrome.2oWjVk07i5hakdqkRs8e10.2oWjVk07i5hakdqkRs8e10): Hard Rock Stadium, artificial marina, highway access ramp and flyovers at T13–16.
- [Official 2026 starting grid](https://www.formula1.com/en/results/2026/races/1284/miami/starting-grid) and [race result](https://www.formula1.com/en/results/2026/races/1284/miami/race-result). Hadjar starts from the pit lane; Antonelli wins the 57-lap race. The 308,326 m race distance implies `57 * 5412 - 308326 = 158 m` between control and standing-start lines.
- [OpenF1](https://openf1.org/), race session **11280**, 3 May 2026. Reference path: Norris lap **35**, 91.869 s, start `2026-05-03T18:01:57.833Z`. The small original responses needed for geometry and roster verification are in `source/`.
- [HOK, Hard Rock Stadium modernization](https://www.hok.com/projects/view/miami-dolphins-hard-rock-stadium/): the open-air canopy is the venue's defining architectural feature; stadium volumes in this model are approximations.
- [FIA 2026 Miami media kit](https://www.fia.com/sites/default/files/final_2026_media_kit.pdf): 10–15.4 m road width, 12 left and 7 right turns. The circuit/pit-lane drawing above supplies the 37 garage allocations.
- [Official Miami 2026 MSC Yacht Club announcement](https://f1miamigp.com/news/miami-reveals-msc-yacht-club/): five levels, 264 × 96 × 50 ft overall envelope, nine cabanas and pool. This replaces the older small-yacht marina arrangement in the current campus.
- [Official Miami 2026 campus description](https://f1miamigp.com/news/press-release/neighborhood-inspired-campus-2026/): campus neighborhoods and hospitality context.
- [Bacinger F1 circuits, Miami WGS84 GeoJSON](https://github.com/bacinger/f1-circuits/blob/master/circuits/us-2022.geojson), MIT, archived in `source/us-2022.geojson` with its license. This independent geographic reference is not an FIA survey.
- [OpenStreetMap API geographic extract](https://api.openstreetmap.org/api/0.6/map?bbox=-80.235,25.954,-80.224,25.966): motorway and motorway-link geometry, retained in `source/highways-osm.json`. © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Attribution accompanies the generated road data and must also be visible in the integrated page.

## Geometry and scenery assumptions

The path comes from chronological OpenF1 XY positions of one clean lap, smoothed and calibrated to 5,412 m. A rigid, positive-determinant fit registers that path against the independent WGS84 GeoJSON, using x east and z south at origin longitude −80.2389, latitude 25.9579. The registration RMS is **4.965 m**; its determinant is **+1**. Four independently exported geographic anchors at T1/T8/T16/T17 are respectively 5.203/2.869/11.080/2.632 m from the reconstructed path. See `source/geographic-registration.json` for coordinates and reproducible projection parameters.

This corrects the previous draft's arbitrary rotation to the printed FIA map: geographic north now comes from WGS84 rather than page orientation or assumptions about OpenF1 XY axes. The standing-start phase, chronological point order and handedness are preserved. There is no negative runtime scale, reflection or reversed traversal. All 19 turn markers are checked locally against the FIA sequence: 12 left and 7 right, with T1 right and the T14-left/T15-right chicane. Stadium/marina geometry, palms and their exclusion areas rotate together with the plan; frame-driven road, pits, cars and cameras follow the registered curve. The result is a reconstructed racing line calibrated to centreline length, not a surveyed kerb model.

Miami is mainly flat. The elevation sampler deliberately ignores OpenF1's z channel as a topographic survey. The profile models a modest rise into T14–15, crest between those two turns, followed by a descent under the Turnpike flyovers: approximately 4.2 m physical range, presentation factor **1.15**, under 4.9 m rendered range. These intermediate elevations are conservative visual estimates, not measured levels. A distant 14 km ground disk at y = −4 m continues below the terrain to the horizon.

Road width varies smoothly from the FIA minimum **10 m** at the technical chicane to **15.4 m** at the starting straight; intermediate width stations are visual estimates. The former broad Armco is replaced by 3,531 solid pale/teal street-wall segments and 1,479 catch-fence posts, following variable-width road margins with pit openings. Curbs/runoff windows track the corrected turns. The pit lane entry and exit meet the variable race edge within 15 mm horizontally and 16 mm vertically, with 37 bays and a three-level Paddock Club above the garages. Buildings retain a full 3 m scenery reserve from driving corridors; concrete boundary walls and their attached mesh are intentionally close to the race edge, with at least a 0.5 m reserve. Triangle-level clearance tests treat only those boundary objects separately.

Recognizable procedural volumes include the Hard Rock Stadium's aqua/orange seating bowl, white open canopy, four 92 m corner masts, roof cables/trusses and four video boards. Its field has a race-paddock overlay with **11 team hospitality suites**, shaded terraces and a central avenue. The artificial marina is visibly a painted display deck, not natural water. Its **2026 MSC Yacht Club** has a sculpted **80.47 × 29.26 m** hull, five stepped decks, panoramic glazing, pool, nine ground-level cabanas and captain's canopy, with two small display tenders. Palms, covered grandstands, boardwalks and parasols complete the immediate campus. Stadium mast heights, fine architecture and most venue building positions are approximate, not architectural reproductions.

The former two detached highway slabs are replaced by **41 geographically projected OSM ways** with connected access ramps, asphalt, concrete soffits, parapets, lane paint and piers. The graph shares elevations at common nodes; approach grades are capped at **4%** before millimetre export rounding. A 16 m bridge-road level and descending ramps provide clearance, but elevations and support placements are visual estimates, not OSM altitude measurements or an engineering model. Ground-level links are excluded where they form the race route, and piers are excluded from driving corridors. The shared road curve drives the racing tarmac, curbs, start/grid markings, pit entry/exit, cars and cameras.

## Race and models

The local replay contains actual 2026 OpenF1 lap times, telemetry, position changes, pit events, stints, race-control messages and weather. Longitudinal motion integrates speed and is recalibrated at each lap boundary. Relative lateral movement is map-matched from XY with a confidence channel. Sensor repair and map alignment remain reconstructions; this is not an exact physical racing simulator.

All **22** actual entrants are retained in the classification. **21** have a matching driver asset; Hadjar has no model and is never replaced by Tsunoda. The free simulation and exploration retain all **22 garage models**, including Tsunoda. Tsunoda is hidden during the historical replay. Reused garage liveries can differ from the actual race liveries. The legacy `team2025` JSON property contains actual **2026** team names for compatibility with the existing replay reader.

## Rebuild

Requires Node.js and Python with `requests` and `numpy`. The finished website itself requires no build tools, API key or network API at runtime.

```powershell
python scripts/miami/fetch-source.py
python scripts/miami/generate-track.py
python scripts/miami/generate-highways.py
python scripts/miami/fetch-replay.py
node scripts/miami/process-replay.mjs
node scripts/miami/build-free-speed-profile.mjs
$miamiTests = (Get-ChildItem tests/miami-*.mjs).FullName
node --test $miamiTests
```

The large raw replay cache is kept outside the repository at `%TEMP%/mgp-f1-miami-2026-raw`; the processor also accepts `MIAMI_REPLAY_RAW_DIR`. Requests are cached, retried and spaced to respect API limits. Processed replay size is approximately 9.15 MiB. The small WGS84 and OSM source fixtures are already included, so both geometric generators rebuild without network access.

## Audit and validation

The audit corrected geographic north, displaced T2/T9/T14/T15 markers, unsuitable permanent-circuit Armco, constant-width road and disconnected pit tapers, overbroad runoff at the chicane, the outdated marina, generic paddock tents and detached flyover slabs. Replay and free-simulation speed profiles were regenerated against the registered path.

The six Miami tests cover WGS84 anchors/orientation/positive determinant, 5,412 m closure and all 19 turn signs, chicane grades, actual road widths and upward faces, joined pit tapers, 37 garages, stadium/MSC details, connected geographic highway ramps, real driver identities and pit start, monotone replay motion and 22-car simulation. The surface audit checks **3,308 verge sections** and **3,090 upward-facing runoff/kerb triangles**. The world-space road/pit clearance audit checks **128,946 scenery triangles** through **1,780,584 segment intersection checks**, including elevated highway clearance. The headless world uses a mock canvas; visual browser QA is performed by the parent integration task and is not replaced by these geometric tests.

Final local pass: **6/6 tests pass** and **9/9 edited/generated JavaScript modules pass syntax checks**. The road network renders **1,044 segments and 43 piers** from 41 OSM ways; maximum exported ramp grade is **4.016%** including coordinate rounding. The scene contains **200 palms**. The regenerated free-speed profile uses 716 clean laps at 902 stations, spans 70.9–325.7 km/h and integrates to 94.3 seconds; the historical replay remains 22 real entrants with 21 matching model assets.
