# Silverstone2026 environment

`dist/silverstone/environment.js` exports `addEnvironment(THREE,ctx)` and returns named landmark groups plus placement diagnostics. The parent owns the5891m racing line,18 turns,11.3m physical relief with1.15 presentation factor, road/runoffs/walls, modern pit surface and viewer. The environment does not rotate, reflect, reorder or otherwise change them. It adds no replay or invented historic grid.

Set `config.pit.building=false`: this module builds the recognizable Wing instead of superimposing a generic pit building. Coordinates use the supplied parent WGS84 projection, **X east/Z south**. Building orientation follows measured OSM footprints; the positive local direction of a particular building is independent of racing direction.

## Primary references

- [FIA BritishGP2026 circuit/pit/red-zone map,2July2026](https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf): current18-turn,5.891km layout, HamiltonStraight/Abbey, old NationalPitStraight, Maggotts/Becketts/Chapel, Wing pit relationship and41 numbered garage bays in the2026 pit drawing.
- [BRDC: Opening of the Silverstone Wing,18May2011](https://brdc.co.uk/Opening-of-the-Silverstone-Wing/):390m building,41 garages, race control/media/hospitality and30m architectural blade. Those dimensions anchor the model. The connected faceted roof and its heights between the peaks are a visual reconstruction, not a survey of every roof plane.
- [Silverstone: The Wing renewable-energy project,21April2023](https://www.silverstone.co.uk/news/silverstone-wing-shining-light-renewable-energy), corroborated by the [2025 environmental statement](https://www.silverstone.co.uk/sites/default/files/pdf/Environmental%20Statement%202025.pdf):2764 roof solar modules. The model retains that count as thin instanced panels following the folded roof; it does not render2764 separate objects.
- [Silverstone: Hilton/Wing bridge installation,6April2022](https://www.silverstone.co.uk/news/silverstone-bridges-gap-connect-trackside-hotel-international-conference-and-exhibition-centre):80m covered steel/glass walkway over HamiltonStraight, connecting the hotel and Wing. The model keeps the80m length, checks road clearance and places supports outside both driving corridors. Its modelled clearance is not a measured real bridge height.
- [BRDC clubhouse](https://brdc.co.uk/about/clubhouse/): modern clubhouse, restaurant, roof terrace and garden; opened1999. The facade, terrace and footprint are reconstructed from that reference and OSM.
- [Silverstone Museum: our story](https://www.silverstonemuseum.co.uk/about-us/our-story/) and [museum remembrance article,10November2026](https://www.silverstonemuseum.co.uk/whats-on/latest-news/remembrance-at-silverstone-museum/): present museum occupies a restored WWII RAF hangar. [Its architect](https://www.cube-designltd.co.uk/architecture-projects/silverstone-museum/) documents the curved existing structure and modern cladding. This is represented by a grounded hangar volume and one curved roof mesh.
- [Silverstone official2026 grandstand guide](https://www.silverstone.co.uk/news/silverstones-guide-grandstands) and [2026 grandstand FAQ](https://www.silverstone.co.uk/news/silverstone-grandstands-faqs): contemporary Becketts/Copse/Hamilton/Woodcote/Village/Chapel spectator setting. The model contains representative named stands, not all temporary event seating.
- [Silverstone history](https://www.silverstone.co.uk/about/our-history) and [Buckinghamshire Council historic environment record](https://heritageportal.buckinghamshire.gov.uk/Monument/MBC23730): RAF origins and concrete-runway heritage. Only the geographically identified surviving service/runway fragment is drawn in the infield; there is no invented additional driveable triangular GP layout.
- [Silverstone's new2026 Vale hospitality](https://www.silverstone.co.uk/news/elevated-every-sense-experience-vale-silverstone-2026): source for the optional candidate near the paddock entrance. The unsurveyed candidate footprint is conservatively omitted when it cannot satisfy the road/pit reserve; this is recorded in diagnostics rather than forcing a collision.

## Geographic source snapshots

Map data: **copyright OpenStreetMap contributors**, [ODbL1.0](https://www.openstreetmap.org/copyright). Source bbox: `https://api.openstreetmap.org/api/0.6/map?bbox=-1.035,52.060,-0.998,52.083`, retrieved17November2026. The raw wide-area XML is temporary; only small relevant extracts are included here, with attribution/source metadata and coordinates.

| Landmark | Primary OSM object / fitted centre |
|---|---|
| Wing | way227332429 /-1.0217844,52.06904757 |
| Hilton | way227342443 /-1.02287973,52.06944726 |
| Hotel bridge central span | way1412628538 |
| BRDC clubhouse | way360603862 /-1.01916458,52.07783008 |
| BRDC farm | way359885208 /-1.01897212,52.07300867 |
| Museum | way437429280 /-1.02180511,52.07440815 |
| Old National garage buildings | ways4859937 and4859939 |
| Surviving runway/service fragment | way353812515 |

`landmarks-osm.json`, `bridges-airfield-osm.json`, `grandstands-osm.json` and `national-pits-osm.json` preserve those references. The old National garage blocks are distinct from the modern Wing. Their individual door segmentation is illustrative; no unverified count of old garage allocations is claimed.

## Placement and modelling limits

Rotated plot footprints are sampled against `min(roadDistance,pitDistance)` at2.4m or less with a reserve beyond nominal half-width+4m. A separating-axis rectangle test allows long parallel buildings to coexist: the early broad-circle overlap check incorrectly rejected the Hilton beside the390m Wing, and was corrected before delivery. The Wing remains390m long; a15m lateral geographic fit moves it away from the simplified pit surface. `userData` reports all placement shifts and optional horizontal fits. The bridge's OSM central-span centre is adjusted2m toward the Wing while retaining its sourced80m overall length.

Foundation skirts follow the exact final parent terrain interpolation at4m or less. Roofs, bays, glazing, balconies, trucks and trees use shared primitives and instance batches. Trees stay outside54m of the driving corridors and clear building footprints. The Wing's2764 panels are one batch. Static venue shadow casting is disabled. No GLB, image download, key or runtime network request is needed.

Broad lawns and runoffs are owned by the shared terrain/road engine. The surviving concrete fragment is clipped outside the driving reserve and follows the terrain. Tree placement, facade details, roof facets and service vehicles are recognisable visual reconstructions. The airfield's full wartime runway surfaces are not asserted to survive in2026.

## Reproducible QA

```powershell
node --check dist/silverstone/environment.js
node scripts/silverstone/qa-environment.mjs
```

The mock-canvas runtime constructs the real parent world, asserts main landmarks,390m/41-bay Wing and2764 panels, checks all terrain-following foundation vertices, audits world-space vertices of every repeated primitive against both driving corridors, and fires upward rays from the actual race road into the hotel bridge. It also enforces an environment budget below150 meshes and100000 triangles. Browser QA and full-project tests are coordinated by the parent.

Final runtime result: **96 environment meshes,49,304 triangles,2,460 grounded foundation vertices,10 grandstands,480 trees,2,764 solar panels**. Minimum audited primitive distance from race/pit axes:18.518m (required reserve11m). Minimum hotel-bridge clearance over the supplied road:8.273m. Full construction plus vertex/ray audit took16.4s on the shared machine; this is not a browser FPS measurement. All assertions passed. The optional unregistered Vale candidate remains omitted; all required Wing/Hilton/bridge/BRDC/museum/old-pit landmarks are present.
