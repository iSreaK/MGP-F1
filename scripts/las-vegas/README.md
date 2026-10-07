# Las Vegas Strip Circuit

The 3D centreline in `dist/las-vegas/track-data.js` is extracted from the vector road band on page 2 of the [FIA 2025 circuit map](https://www.fia.com/system/files/decision-document/2025_las_vegas_grand_prix_-_event_notes_-_circuit_map_v2_pit_lane_drawing_emergency_map_exits_quarantine_zone_and_red_zones.pdf). It is a 6,201 m closed loop with 17 corner labels. The separate starting and timing lines are 92 m apart: 50 laps × 6,201 m − the [FIA classified race distance of 309,958 m](https://www.fia.com/system/files/decision-document/2025_las_vegas_grand_prix_-_provisional_race_classification.pdf). The mapped road is level because the public circuit diagram has no elevation survey. Road width, lateral driving line, pit lane and building footprints are visual estimates.

To regenerate the centreline, download the FIA PDF above locally, then run:

```powershell
python scripts/las-vegas/generate-track-data.py path/to/fia-map.pdf
```

The 2025 race archive uses [OpenF1](https://openf1.org/docs/) telemetry and location, plus the official [starting grid](https://www.formula1.com/en/results/2025/races/1274/las-vegas/starting-grid) and [race result](https://www.formula1.com/en/results/2025/races/1274/las-vegas/race-result). Rebuild it with:

```powershell
node scripts/las-vegas-replay/fetch-openf1.mjs
node scripts/las-vegas-replay/process-replay.mjs
node scripts/las-vegas-replay/build-free-speed-profile.mjs
node scripts/las-vegas-replay/validate-replay.mjs
```

The untracked `raw/` directory holds the downloaded OpenF1 JSON. The committed replay is `dist/las-vegas/data/las-vegas-2025-replay.json`. Norris and Piastri ran all 50 laps before their post-race disqualifications. Tsunoda started from the pit lane. Isack Hadjar appears in the classification but has no matching 2026 garage model, so 19 of 20 cars are rendered. The 2025 race is represented with the site's 2026 car models.
