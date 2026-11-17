# Shanghai International Circuit

Viewer: `dist/shanghai/`. It includes exploration, the starting grid, flyover,
optional wet weather, a free simulation and the historical 2026 Chinese GP.
The production viewer is static and needs no API key.

## Geometry and direction

- Official 2026 specification: **5,451 m, 16 corners, 56 laps**.
- The georeferenced centreline is derived from Tomislav Bacinger's
  [cn-2004 GeoJSON](https://github.com/bacinger/f1-circuits/blob/master/circuits/cn-2004.geojson),
  MIT licensed; the source and licence are retained beside these scripts.
- The unchanged Shanghai Grand Prix layout and the corner order were checked
  against the [FIA 2026 circuit map](https://www.fia.com/system/files/decision-document/2026_chinese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf).
- Coordinates use **x east / z south**. A positive signed area and a right hand
  first corner confirm the clockwise direction. No mirror transformation is
  applied. The GeoJSON is densified before smoothing so long straights remain
  straight, then calibrated to the official length.
- Corner stations and the control-line phase are registered against
  [MultiViewer's F1 circuit data](https://api.multiviewer.app/api/v1/circuits/49/2026).
  That endpoint returns its 2019 Shanghai reference lap, not a 2026 lap; this
  is used only for the unchanged plan and corner stations. The similarity fit
  has 3.74 m RMS error and requires no reflection.
- The standing-start line is 190 m after the control line: 56 × 5,451 minus
  the official race distance of 305,066 m. Road width, grid spacing and pit
  tapers are visual approximations, not a surveyed safety drawing.

## Elevation and recognisable architecture

[Formula 1's elevation guide](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)
documents **7.4 m** between the T2 high point and the back-straight low point.
The intermediate profile is smoothly interpolated. Vertical presentation is
scaled by 1.2 to keep this small relief legible. OpenF1's z channel is not
treated as an absolute altitude survey. The ground follows the same profile.

The scene recreates the monumental silver-wing main grandstand, the pair of
elevated media/hospitality bridges, the pit block, paddock water gardens with
island pavilions, lotus-leaf satellite roofs at T6 and T14, seating terraces
and park trees. Their dimensions and exact placements are approximate.
The lotus motif is documented in the
[FIA Shanghai media kit](https://www.fia.com/sites/default/files/media_kit-formula_1_heineken_chinese_grand_prix_2026.pdf).
Shanghai is in Jiading, well away from central Pudong; an artificial downtown
skyline has therefore not been placed beside the circuit.

## Historical replay

- OpenF1 race session **11245**, 15 March 2026.
- [Official starting grid](https://www.formula1.com/en/results/2026/races/1280/china/starting-grid)
  and [classification](https://www.formula1.com/en/results/2026/races/1280/china/race-result).
- All 22 entrants are preserved in the classification. Norris, Piastri,
  Bortoleto and Albon did not start and are hidden from the historical track
  scene. The 18 starters are represented by 17 available local models.
  Hadjar remains in the classification without a substitute model.
- Actual speed, throttle, brake, gear, lap/sector timing, official positions,
  stints, pit events, race-control messages and weather come from
  [OpenF1](https://openf1.org/docs/). The compact replay is sampled at 2 Hz.
- Longitudinal progress is reconstructed by integrating measured speed and
  constraining each sector to its actual timing boundaries and the FIA sector
  lengths. This is a reconstruction, not a replay of raw GPS coordinates.
  The racing line, lateral passing separation and pit-stall location are
  illustrative. Retirement stopping points are estimated from the telemetry.
- The independent free simulation uses the available 21 personal models and
  estimated dynamics; it does not recreate the historical DNS decisions.

## Rebuild and checks

From the repository root:

```powershell
node scripts/shanghai/fetch-metadata.mjs
node scripts/shanghai/fetch-telemetry.mjs
node scripts/shanghai/register.mjs
node scripts/shanghai/generate-track.mjs
node scripts/shanghai/build-replay.mjs
node --test tests/shanghai-circuit.mjs
```

The metadata and source geometry are retained for reproducibility. The larger
compact telemetry download cache is `scripts/shanghai/telemetry/`; it is not
needed at runtime. Telemetry downloading retries rate limits and interrupted
requests and resumes files already cached.

Tests cover closure/length/chirality and T1 direction, the documented relief,
headless scene/sky/weather construction, car-height scenery clearance,
ground/road continuity, every replay's monotone progress and finite telemetry,
the four DNS decisions, correct driver/model identities and free simulation.
Browser visual QA is performed by the coordinating agent.

The later geometry/venue revision and its measured defects are documented in [SURFACE-AUDIT.md](./SURFACE-AUDIT.md). Run both Shanghai test files for the complete surface and safety audit.
