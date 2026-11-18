# Barcelona-Catalunya — 3D reconstruction

The 2026 GP configuration has 14 turns and 4,657m. The fast final two bends
replace the obsolete chicane; the shared WGS84 registration fixes handedness.
The reference 29.6m elevation range is shown at ×1.12; intermediate heights,
road widths and safety zones are interpreted. See `../season-2026/README.md`.

Characteristic scenery includes the main grandstand with curved silver canopy,
scoring pylon, stadium-sector stands, pit hospitality and the 2024 Rooftop.

Primary architectural references:

- [Circuit announcement, 20 June 2024](https://www.circuitcat.com/ca/noticies/formula-1/el-rooftop-ya-se-alza-como-nuevo-emblema-del-circuit/):
  the bridge connects paddock/stadium over the back straight, with a 30m south
  tower; it identifies the scoring pylon and the distinctive main-stand canopy.
- [Torrella, architect and engineering firm](https://www.torrellaingenieria.com/rooftop-circuit-de-barcelona-catalunya/):
  75m bridge before Turn 10, three-level glazed hospitality and terraces.
- [2026 FIA circuit map](https://www.fia.com/system/files/decision-document/2026_barcelona_event_-_circuit_map_-_barcelona_2026.pdf):
  current 14-corner layout and reference length.

The buildings are original procedural interpretations, not licensed or measured
architectural models. Stands are approximate locations tied to circuit stations.
Rooftop is represented by its long bridge, south tower, projecting white slabs
and glass, with clear track underneath. The paddock uses eight separate terrain
foundations. Gantry supports avoid both racing and pit lanes.

`node scripts/barcelona/validate-world.mjs` audits the actual shared world,
car-height route and pit reserve, footing edges and bridge clearance.
