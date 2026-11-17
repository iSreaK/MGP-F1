# Miami International Autodrome

Current 19-turn configuration, 5,412 m, anticlockwise. Standalone static route: `dist/miami/`.

## Sources

- [FIA 2026 Miami Doc 5: circuit and pit-lane maps](https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf), issued 30 April 2026. Turn order, circuit length, start/control-line separation, pit side, and plan chirality were checked against this map.
- [Official Formula 1 circuit guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-miami-international-autodrome.zMEQ1nU4xZKuvc9EsGXDr.zMEQ1nU4xZKuvc9EsGXDr): 19 turns, 5.412 km and the uphill/downhill T14–15 chicane.
- [Formula 1 venue description](https://www.formula1.com/en/latest/article/our-insiders-guide-to-the-all-new-miami-international-autodrome.2oWjVk07i5hakdqkRs8e10.2oWjVk07i5hakdqkRs8e10): Hard Rock Stadium, artificial marina, highway access ramp and flyovers at T13–16.
- [Official 2026 starting grid](https://www.formula1.com/en/results/2026/races/1284/miami/starting-grid) and [race result](https://www.formula1.com/en/results/2026/races/1284/miami/race-result). Hadjar starts from the pit lane; Antonelli wins the 57-lap race. The 308,326 m race distance implies `57 * 5412 - 308326 = 158 m` between control and standing-start lines.
- [OpenF1](https://openf1.org/), race session **11280**, 3 May 2026. Reference path: Norris lap **35**, 91.869 s, start `2026-05-03T18:01:57.833Z`. The small original responses needed for geometry and roster verification are in `source/`.
- [HOK, Hard Rock Stadium modernization](https://www.hok.com/projects/view/miami-dolphins-hard-rock-stadium/): the open-air canopy is the venue's defining architectural feature; stadium volumes in this model are approximations.

## Geometry and scenery assumptions

The path comes from chronological OpenF1 XY positions of one clean lap. It is converted to Three.js x/z, rotated 30 degrees to the FIA map view, centered, smoothed, and calibrated to 5,412 m. This preserves the FIA map's chirality and race direction. There is no negative runtime scale or reflection. This is a reconstruction of a racing line calibrated to the official centreline length, not a surveyed kerb model. Turn marker stations and track widths are approximate.

Miami is mainly flat. The elevation sampler deliberately ignores OpenF1's z channel as a topographic survey. The profile models a modest rise into T14–15 followed by a descent under the Turnpike flyovers: approximately 4.2 m physical range, presentation factor **1.15**, under 4.9 m rendered range. These intermediate elevations are conservative visual estimates, not measured levels.

Recognizable procedural volumes include the Hard Rock Stadium's rectangular aqua seating bowl, football field/race paddock, white open canopy, four 92 m corner masts and roof cables; the artificial marina with six sculpted yachts, boardwalks and parasols; 200 tropical palms with instanced fronds; six covered grandstands; and two elevated Turnpike decks. Venue buildings and their broad positions are approximate. Flyover piers are excluded from driving corridors. The shared road curve drives the tarmac, curbs, start/grid markings, pit entry/exit, cars and cameras.

## Race and models

The local replay contains actual 2026 OpenF1 lap times, telemetry, position changes, pit events, stints, race-control messages and weather. Longitudinal motion integrates speed and is recalibrated at each lap boundary. Relative lateral movement is map-matched from XY with a confidence channel. Sensor repair and map alignment remain reconstructions; this is not an exact physical racing simulator.

All **22** actual entrants are retained in the classification. **21** have a matching driver asset; Hadjar has no model and is never replaced by Tsunoda. The free simulation and exploration retain all **22 garage models**, including Tsunoda. Tsunoda is hidden during the historical replay. Reused garage liveries can differ from the actual race liveries. The legacy `team2025` JSON property contains actual **2026** team names for compatibility with the existing replay reader.

## Rebuild

Requires Node.js and Python with `requests` and `numpy`. The finished website itself requires no build tools, API key or network API at runtime.

```powershell
python scripts/miami/fetch-source.py
python scripts/miami/generate-track.py
python scripts/miami/fetch-replay.py
node scripts/miami/process-replay.mjs
node scripts/miami/build-free-speed-profile.mjs
$miamiTests = (Get-ChildItem tests/miami-*.mjs).FullName
node --test $miamiTests
```

The large raw replay cache is kept outside the repository at `%TEMP%/mgp-f1-miami-2026-raw`; the processor also accepts `MIAMI_REPLAY_RAW_DIR`. Requests are cached, retried and spaced to respect API limits. Processed replay size is approximately 9.15 MiB. Tests cover plan closure/length/chirality, chicane grades, real driver identities and pit start, monotone replay motion, 22-car simulation, joined upward-facing surfaces, and world-space triangle clearance against both racing road and pit lane.
