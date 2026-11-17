# Shanghai geometry and venue revision

The [FIA 2026 circuit and pit drawing](https://www.fia.com/system/files/decision-document/2026_chinese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf)
and [Formula 1's circuit description](https://www.formula1.com/en/racing/2026/china)
remain the references for the 16-corner layout, the right-hand T1–2 snail,
left-hand T3–4, T13 exit/back straight, T14 hairpin, pit side and timing lines.
The GeoJSON retains its real east/south orientation; no mirror or arbitrary
rotation was used. The centreline and the 2026 replay remain 5,451 m per lap.

## Actual defects found and fixed

1. **Hand-traced polygon kinks.** Densifying a polygon had preserved very
   sharp changes of heading: the local centreline radius fell to 3.24 m,
   less than half the road width. Twenty symmetric periodic fairing passes
   remove those kinks. Minimum radius is now 11.26 m at the tight hairpin.
   Plan changes are local (maximum 6.96 m, RMS 4.03 m against the former
   centreline). No new vertical hills or geography transformations were added.
   The main straight bows at most 0.54 m and the sampled back straight 1.48 m.
2. **Return triangles across open surfaces.** Local kerbs and the pit road
   had been meshed as closed loops, connecting their final frame to their
   first. Open strips now have exactly N−1 spans. Tests reject a return
   triangle and inverted faces.
3. **Uniform asphalt bands and folded runoff.** Constant-width shoulders
   looked like a second racing road and crossed the inner hairpin radius.
   Paved runoff now widens outside the important braking/corner areas and
   narrows before adjacent track branches or a tight inside radius. A green
   boundary, red/white kerbs and a T14 gravel area distinguish the surfaces.
   Gravel sits between paved runoff and the safety barrier, rather than
   behind a barrier. All strip faces are checked for folding.
4. **Disconnected guardrail stubs.** Rails measuring 5.8 m had been repeated
   every 18 m, leaving regular 12 m gaps. The new guardrail runs sample the
   boundaries every 2 m, overlap at joints, leave pit openings clear and
   omit unsafe inside-island locations. Every actual instanced end is
   checked against all nearby road branches. Posts reach the shaped terrain.
5. **An isolated pit strip.** The lane had no entry/exit tapers. The rebuilt
   lane branches before T16, reaches the garage fast lane and rejoins the
   T1 approach. Its working apron and fast-lane divider meet the garage
   frontage. The historical replay calls the same lateral offset function.
   Exact pit-route dimensions remain an illustration, not surveyed geometry.
6. **Grid paint contradicted the car lanes.** Pole and the second grid
   column were painted on opposite sides from their displayed cars. Paint
   now uses the same alternating ±2.4 m offsets and 8 m slot spacing.
   The oversized 4.4 m start stripe is now 0.36 m thick.
7. **Terrain intersected the back straight.** A complete audit found the
   higher neighbouring branch pushed the terrain 39 cm through the road.
   The terrain is now 128×128 cells, and cells under every road/runoff/pit
   vertex are capped below that surface. Minimum measured clearance beneath
   the centreline is now 54 cm. Every centreline sample and surface vertex
   is tested, replacing the former sparse-only check.
8. **Architecture and planting lacked physical support/detail.** Roofs now
   have structural rims and the main wing has diagonal struts. Eleven team
   garage fascias and legible labels identify the pit building; the water
   gardens have promenades, decks and planted islands. Tree bases now use
   the actual terrain height rather than a fixed world height that buried
   some trunks.

## Validation

```powershell
node --test tests/shanghai-circuit.mjs tests/shanghai-surface-audit.mjs
```

These cover geography, T1 direction, length, relief, all surface face
orientations and open ends, straightness, pit/replay consistency, guardrail
continuity and road clearance, planted tree bases, grid/car alignment,
terrain clearance, driver identities, DNS handling and replay progression.
The detailed historical replay file and its original timing data were not
modified. Browser visual review is performed by the coordinating agent.
