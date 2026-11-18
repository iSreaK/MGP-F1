# Monaco2026 venue environment

`dist/monaco/environment.js` exports `addEnvironment(THREE,ctx)` and `MONACO_HARBOUR_POLYGON`. The parent owns the centreline, geographic registration, road, relief, walls, pit surfaces and viewer. This module only adds the venue and returns `{group,landmarks,diagnostics,isWater}`. It has no replay, API key or historical-car simulation.

## Primary references

- [FIA2026 circuit map, pit drawing and emergency map,4June2026](https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf): contemporary19-turn layout,3.337km centreline, harbour/pit relationship and the cut inside Sainte-Devote at pit exit. The pit drawing lists11 teams and13 numbered permanent/temporary garage allocations, rather than a generic long straight pit building.
- [ACM official2026 hospitality plan](https://acm.mc/wp-content/uploads/2025/05/Hospitalites_ACM_F12026_F-3.pdf): venue names, harbour grandstands, pit frontage, Casino district, Piscine and Rascasse. The plan identifies the TribuneT hospitality between Piscine and Rascasse.
- [F1 official Monaco circuit guide,4June2026](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-monaco.vFsmfGHr6RWyLFtxi58wi): climb from Sainte-Devote through BeauRivage/Massenet/Casino and downhill approach to Mirabeau/hairpin. The road's42m range is the parent reconstruction, not a surveyed height profile certified by this article.
- [F1 official corner names,4June2026](https://www.formula1.com/en/latest/article/explained-how-every-monaco-corner-got-its-name.5ClYqWmfpeUpsRJA6mDNaX): Fairmont/GrandHotel hairpin, Mirabeau high/low, Portier, tunnel and swimming-pool sequence.
- [Mairie de Monaco: Stade Nautique RainierIII](https://mairie.mc/le-stade-nautique-rainier-iii): outdoor50by20m seawater pool in PortHercule, diving platforms1/3/5m. This is the dimension used by the architectural pool model regardless of the surrounding site clearance fit.
- [Fairmont MonteCarlo official hotel](https://www.fairmont.com/en/hotels/monte-carlo/fairmont-monte-carlo.html): modern seafront architecture, hairpin-facing private balconies and rooftop pool. The hotel is modelled as a stepped balcony volume; it is not a measured reconstruction of every wing.
- [MonteCarloSBM, LaRascasse renovation release,14April2026](https://fr.montecarlosbm-corporate.com/wp-content/uploads/2026/04/mcsbm-cp-la-rascasse.pdf): reopened9April2026 after four months' works, motorsport theme and red/white decoration, address1QuaiAntoine1er. The model shows a compact white/red terrace bar at that real landmark.
- [MonteCarloSBM corporate architectural history](https://www.montecarlosbm-corporate.com/the-company/history/) and [SBM architectural press dossier](https://fr.montecarlosbm-corporate.com/wp-content/uploads/2015/12/sbm_dossier_presse__fr_14052013.pdf): casino/hotel district and HoteldeParis ornamental facade. The clock, paired towers, domes, cornices and balconies are stylised recognizable details, not fabricated CAD measurements.

## Geographic reference and attribution

Projection uses the exact parent `ctx.config.geography`: `x=(lon-originLon)*metresPerDegreeX*scale`, `z=-(lat-originLat)*metresPerDegreeZ*scale`. X points east and Z south. There is no arbitrary rotation or reflection of the circuit. Landmarks are placed from WGS84 coordinates; tunnel stations are found on the supplied chronological curve, so they do not assume that GeoJSON point0 is the control line.

Local primary OSM snapshots were retrieved17November2026. Map data: **copyright OpenStreetMap contributors**, [ODbL1.0](https://www.openstreetmap.org/copyright). Files retain their exact API source URL. This attribution also appears in scene metadata.

| Reference | Coordinate or OSM object |
|---|---|
| Casino entrance | node4416197079:7.428023,43.7391605 |
| HoteldeParis | node11339077004:7.4274682,43.7390094 |
| Fairmont | node9944534420:7.4299421,43.7399902 |
| Fairmont hairpin viewpoint | node6418400802:7.4297996,43.740206 |
| LaRascasse | [node3944391375](https://www.openstreetmap.org/node/3944391375):7.4231940,43.7325614 |
| RainierIII facility | [way197170037](https://www.openstreetmap.org/way/197170037) |
| Race tunnel | [way4230891](https://www.openstreetmap.org/way/4230891) + exit continuation1230247123 |

`landmarks-osm.json`, `building-footprints-osm.json`, `rascasse-osm.json`, `pool-osm.json` and `tunnel-osm.json` retain supporting coordinates. Some monument anchor points in the model are deliberately moved a few metres within their real site to fit simplified rectangular volumes clear of the racing corridor. Each built site reports its chosen horizontal scale, geographic anchor and extra clearance adjustment in `userData`; omitted sites are reported by `diagnostics.skipped`. These fits affect buildings only.

## Geometry, clearance and render cost

Casino paired towers/clock/domes, HoteldeParis mansard/rotundas, Fairmont balconies/rooftop pool, SainteDevote chapel, LaRascasse, the RainierIII pool, PortHercule yachts and stepped apartment blocks give the site its identity. Foundation skirts sample the terrain around each footprint at4m or less; plots are sampled at2.4m or less against the minimum race/pit distance. The extra sample reserve keeps entire walls outside nominal half-width+4m. City plots that cannot fit are rejected, rather than crossing the road.

Tunnel entrance is7.4303262,43.7403619 and exit7.4279727,43.7377783, directly from OSM. The segmented full-width soffit is7.2m above the supplied road curve; light fixtures remain above7m. This is an explicit modelling clearance, not a certified real tunnel-height measurement. The land-side wall and open sea-side arcade follow the curved road, with supports outside the driving reserve. Landmarks never change the road height.

Repeated windows, balcony slabs, buildings, yacht parts and tree silhouettes use shared unit primitives and instanced material batches. No external GLB or texture download is required; only a few local canvas signs are generated. Shadow casting is disabled for these distant static details. Draw and triangle counts are measured after the final module is integrated by the parent.

`isWater(x,z)` exposes the same extended Mediterranean coastal polygon as the visible constant-level water, with road/pit and built-footprint guards. The parent terrain must honour it to avoid covering the water with land. The coast and harbour berths are visual approximations, not a hydrographic survey.

## Pit-lane geographic aid

`pit-lane.json` contains58 WGS84 points in driving order, assembled from OSM way850261588(Voiedesstands), the middle public-road axis on way166399479(BoulevardAlbert1er), and way1388331347(Sortiedesstands). Raw primary snapshots are in `pit-roads-osm.json` and `pit-public-road-osm.json`. The pit-exit cut inside SainteDevote agrees with the FIA drawing.

**This is a geographic aid, not a homologated pit-centreline survey.** Indices0-30 are the first pit way,31-46 are the shared public-road portion,47-57 are the exit cut. The public-road middle section is shared with the race-road axis in OSM and needs the parent's approximately8m rightward lane offset. The first point is the branch after Rascasse, so the upstream entry transition also needs reconstruction from the FIA plan. The parent alone owns those surface corrections. Set `config.pit.building=false`; this environment places separate compact garage modules using the finished pit samples, with each full module checked against both driving corridors.


## Runtime validation,17November2026

Using the parent shared engine and its actual geographic pit lane:220 environment draw objects,69,492 triangles,13 compact garage modules,18 apartment blocks, all main monuments present. The K grandstand is omitted because its approximate candidate footprint cannot meet the stricter road/pit clearance reserve; N/P andT harbour stands are present. No additional replay is generated.

A mock-canvas Node runtime checked all1,580 foundation bottom vertices against the exact parent terrain callback (within5mm), mandatory landmark groups, finite geometry, and upward rays from the true road into the tunnel roof. The minimum measured centreline roof clearance is7.199999m. The pool retains physical50by20m dimensions independently of its fitted surrounding site. `node --check dist/monaco/environment.js` passes. The full scene took approximately9.5s to construct on the shared machine during concurrent work; this is not a browser frame-rate measurement.

The harbour terrain mask preserves built quay footprints around the N/P stand; the constant-level water stays below them. Architecture placement shifts/scale and the one omitted stand are exposed in diagnostics for review. Final browser QA and whole-project checks are handled by the parent.


## Final coastal correction

The overview initially showed PortHercule as an isolated lake in the green horizon. The single constant-level water mesh now uses `MONACO_MEDITERRANEAN_WATER_POLYGON`, a simplified geographic coast interpretation extending from Monaco-Ville around the port, Fairmont and Mareterra to the open sea east/southeast and beyond the visible horizon. There is one connected sea/harbour surface, avoiding overlapping coplanar water meshes. The original small harbour polygon remains exported as a reference.

`isWater` uses the identical extended polygon and preserves the road/pit bed within nominal half-width+4.5m and all built quay footprints. Northern/western land and the Mareterra landward side remain outside the ocean mask. This coast extension is explicitly a visual interpretation of the documented geographic site, not a newly fetched or surveyed2026 coastline. The water sits at the existing sea level, above the core horizon at-5m and below the quays/roads.

Validation of the coastal correction: Node syntax passed; eight geographic samples passed (port, east/southeast sea are water; Monaco-Ville, northern/western city, Casino and the landward side of Mareterra stay land). Browser overview QA remains with the parent.
