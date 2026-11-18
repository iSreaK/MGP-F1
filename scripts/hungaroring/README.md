# Hungaroring — installations et paysage 2026

`dist/hungaroring/environment.js` exports `addEnvironment(THREE, ctx)` and returns `{group, landmarks, stats}`. The shared `createCircuitWorld` owns the WGS84-registered road, 4,381 m length, relief, circuit limits, pit lane and viewer. The scenery does not reflect, rotate or reverse the track and adds no replay or simulated telemetry presented as real racing data.

The shared config must set **`pit.building=false`**: the environment supplies the specific new paddock, while the shared pit lane remains active on the driver's right (`side=-1`). Major start-straight building locations are checked against a small retained OSM reference; all geometry then follows the registered road frames and the shared visible-terrain sampler.

## New recognizable buildings

The previous pit complex and Millennium Tower were demolished during the redevelopment. This reconstruction represents the new **2025–2026** facilities instead:

- A roughly **338.5 × 21.5 m** paddock body, a slightly longer overhanging roof, white terrace bands, dark garage openings, vertical façade frames, panoramic glazing, circulation cores, upper hospitality and rooftop pavilion. The 40 front bays represent **36 numbered garages plus four service bays**, consistent with the 2026 FIA pit drawing; it is not an exact functional room plan. The source architect describes a building over 340 m long and five storeys; basement and partial roof levels make this a distinct measurement from the main body envelope. The procedural model approximates that tiered silhouette rather than claiming exact floor areas or surveyed roof levels.
- The new reinforced-concrete **Hungaroring main grandstand**, with a wide cantilevered roof split into **21 sections**, its rear support portals, triangular roof webbing, stepped concrete terraces, tricolour seating sectors and readable venue name. The real building has more than 10,000 seats; individual seat count is not reproduced. The 21-section roof follows the constructor's technical description. Its footprint, canopy profile and steel-member sizes are visual estimates.
- Temporary viewing grandstands in several T1, chicane and final-sector viewing zones, with seating rows, support legs and railings. Their approximate footprints can move outwards, and an unsuitable candidate is omitted, to preserve all driving corridors. These objects are a venue reconstruction, not a seating or ticketing plan.
- A paved event area behind the main stand, small concessions, and 11 approximate two-level team hospitality volumes behind the paddock. Their arrangement is indicative; no team-logo textures or copyrighted photographs are bundled.

## Landscape, geography and ground

The Hungarian Grand Prix sits in the **Valley of the Three Springs** near Mogyoród. Existing parent terrain supplies the circuit's roughly 34.7 m relief, with its stated presentation factor. This environment does not invent additional road elevation. It adds contour-following spectator promenades, **1,900 instanced deciduous trees**, and an outer terrain apron that matches the detailed 360 m terrain boundary before blending into modest rural hills and the far ground. The apron has a hole over the entire detailed circuit terrain; it cannot cover the racing road.

All plinths, garage foundations, grandstand supports, trees and paths use `ctx.groundHeightAt`, the same triangular interpolation as the rendered ground. Long buildings use level podiums with segmented foundations extending into the graded terrain. Grandstand legs have separately computed foot heights. Building and stand footprints are sampled against both road and pit lane; structures and full tree crowns preserve at least **4 m beyond the nominal 6 m road half-width**. Promenades are set further back and follow the visible terrain.

The fourteen corner-name signs use the official names announced **24 July 2026**: Piquet, Hamilton, Spring, Mansell, Mogyoród, Driving Center (T6–7), Buda, Pest, Danube, Alesi, Schumacher, Senna and Szisz. Names are scenery labels; the parent controls the viewer's own turn list. Advertising, roof geometry, visitor furniture, outlying hills and temporary hospitality are approximate procedural volumes.

## Primary references and licensing

Accessed 17 November 2026. Primary sources were preferred; artwork, building photographs and the FIA PDF are used only as references and are not included as textures.

- [DVM Group — Hungaroring renewal](https://dvmgroup.com/en/references/projects/hungaroring): DVM/S.A.M.O. design, completion of the main facilities in June 2025, 25,000 m² paddock, over-340 m building, five storeys, 10,000+ grandstand seats and the reinforced-concrete architecture.
- [Market Építő — Hungaroring construction](https://www.market.hu/en/reference/hungaroring/): phased 2023–2026 project, 21-section main-grandstand steel roof, new pedestrian tunnels, renewed fan area and demolition of the former Millennium Tower. The exact geometry and support sizing of the roof remain approximations.
- [Hungaroring — January 2025 construction update](https://hungaroring.hu/site/en/media/news/half-a-year-in-between): earthworks around the paddock, third-floor construction and installation of precast grandstand beams/elements.
- [Hungarian Chamber of Engineers, January–February 2026, pp. 26 onward](https://mernokvagyok.hu/wp-content/uploads/2026/03/Mernok-Ujsag-260102.pdf): technical overview of the renewed paddock and approximately 338.5 × 21.5 m main envelope.
- [FIA — 2026 Hungarian Grand Prix circuit/pit maps, Doc 5, 23 July 2026](https://www.fia.com/system/files/decision-document/2026_hungarian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf): 4.381 km, turn sequence, pit-side arrangement and 36 numbered bays plus lettered/service areas.
- [Hungaroring — official corner names, 24 July 2026](https://hungaroring.hu/site/en/media/news/the-hungarorings-corners-have-officially-been-named): current corner identities, valley name, nearby Mogyoród and local motorsport history.
- [Formula 1 — redevelopment update](https://www.formula1.com/en/latest/article/hungaroring-provide-update-on-circuit-upgrades-ahead-of-2025-grand-prix.32HUGk7Bfe22SOoEx8EwyJ) and [official 2026 Hungary venue page](https://www.formula1.com/en/racing/2026/hungary): project phases and venue context.
- [OpenStreetMap API reference extract](https://api.openstreetmap.org/api/0.6/map?bbox=19.237,47.575,19.261,47.592), selectively retained as `source/osm-building-reference.json` (~4 kB). **© OpenStreetMap contributors**, [attribution/copyright](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Used for broad building-location checks; older footprints do not prove the exact geometry of the 2025 rebuild. Derived location data remains under ODbL, and the shared public viewer must display attribution.

Parent-owned GeoJSON, corner references and registration metadata describe the circuit's WGS84 alignment separately. No coordinate changes are made by the environment.

## Verification

Run `node tests/hungaroring-environment.mjs`. It constructs the actual shared world with a mock canvas, checks the new buildings and roof counts, trees, sector stands, corner signs and hospitality, then audits world-space solid vertices (including instances) against the shared road/pit sampler. Conservative bounding volumes safely exclude distant objects before the exact vertex audit. The parent integration task performs browser QA and checks the complete viewer; these headless measurements do not replace visual review.

Final local pass: **40 garage/service bays, 21 main-roof sections, 10 grandstand volumes, 1,900 trees, 310 promenade sections, all 14 corner signs and 11 hospitality suites**. The final world-space audit checks **15,518 near-corridor solid vertices** after conservative bounds; the minimum reserve is **6.048 m beyond the nominal road edge**, exceeding the required 4 m. The environment has **105 solid draw meshes** after shared batching; 138 source meshes become 15 batches, saving **123 draw calls**. No road/pit obstacle was found by these checks.
