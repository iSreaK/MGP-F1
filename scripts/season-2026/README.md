# Eight additional 3D venues

Montréal, Monaco, Barcelona-Catalunya, Spielberg, Silverstone, Spa-Francorchamps,
Hungaroring and Zandvoort are integrated into the existing static site. The
shared navigation now contains 23 circuits, including the 15 previous venues.

## Geometry and provenance

- WGS84 plans: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits),
  MIT licence copied into each `scripts/<slug>/source/` directory.
- Chronological lap origin and numbered corner references: MultiViewer's
  circuit API, archived as `corner-reference.json`. Requests use `/2026`;
  `candidateLap` can identify an older underlying session. This is not an
  assertion that the positions are 2026 race telemetry.
- `register-geography.py` fits a proper similarity transformation, then the
  two chronological shapes are compared. Determinant is +1; no reflection is
  permitted. Registration RMS is approximately 4–7 metres. The result is saved
  as `registered-reference.json` for offline reproduction.
- The registered plan is smoothed at approximately 5–7m, combined with a
  closed monotone height profile, then calibrated to the reference **3D** lap
  length. Coordinates are metres, x east / y up / z south.
- Current reference lengths/corner counts: [Formula 1's 2026 venue pages](https://www.formula1.com/en/racing/2026).
  Barcelona uses **14 turns and 4,657m**, without the obsolete final chicane;
  Spielberg uses the **2026 FIA 4,326m** reference.

Total relief references are from [Formula 1's elevation comparison](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc):
Montréal 5.2m, Monaco 42m, Barcelona 29.6m, Spielberg 63.5m, Silverstone 11.3m,
Spa 102.2m, Hungary 34.7m. Intermediate heights are an **interpretation**, not a
survey or a DEM. The small presentation multipliers are disclosed in the UI.
Zandvoort's 14m centreline range is explicitly an **estimate**; its two 18°
banked corners are referenced to the [circuit's corner guide](https://www.circuitzandvoort.nl/en/corners/).

The pit lane of Monaco uses archived OSM roads, with the common Albert-I
centreline separated from the race surface on the driver's right. Other new
pit lanes are approximate, with open entry/exit tapers. Street widths, kerbs,
barriers, runoffs and intermediate terrain are reconstructed, not certified
FIA infrastructure. Individual venue READMEs explain architectural sources,
omissions and reconstruction limits.

## Runtime

`dist/circuits-2026/` shares geometry, road infrastructure, terrain construction,
viewer, a lightweight car field and an explicitly illustrative free simulation.
Each venue retains its own `track-data.js`, `config.json` and `environment.js`.
There are no network API keys or runtime dependencies on the source services.
All existing historical replay files and circuit viewers remain intact. New
venues do **not** fabricate historical replays; garage identities and the new
demonstration grid do not claim to be an official roster or starting order.

Terrain heights used by foundations interpolate the exact rendered triangles.
The terrain is capped under all neighbouring road phases, including close
parallel streets at Monaco. Geographic water masks prevent terrain covering
harbours and rivers. Repeated scenery is instanced; only the selected detailed
garage GLB is loaded on request. The camera near plane follows view distance
to preserve depth precision from aerial overview to close car inspection.

## Reproduction

The committed archives are sufficient to regenerate without fetching sources:

```powershell
python scripts/season-2026/register-geography.py
node scripts/season-2026/build-tracks.mjs
node scripts/season-2026/build-pages.mjs
```

Registration needs Python and NumPy. Runtime/generation use the vendored Three
module and Node; the deployed site is plain HTML/CSS/ES modules. Optional source
refresh: `fetch-geography.mjs`, `inspect-geography.mjs`, `fetch-turns.mjs`, then
registration/build. The inspection script creates its ignored API listing cache.

## Verification

```powershell
node --test tests/season-2026-geography.mjs tests/season-2026-world.mjs
node scripts/season-2026/audit-clearance.mjs zandvoort
node scripts/barcelona/validate-world.mjs
node scripts/spa/validate-world.mjs
node scripts/spielberg/validate-world.mjs
node scripts/silverstone/qa-environment.mjs
```

The shared tests cover orientation, reference turn handedness, length, closed
relief, bank direction, upward/unbroken road surfaces, road/pit terrain clearance,
named monuments and scene complexity. The clearance script conservatively
audits primitive bounds; custom dune meshes are protected by a separate minimum
centre-distance constraint during generation. Browser QA covers all eight
pages and shared controls. This does not establish survey-level fidelity.
