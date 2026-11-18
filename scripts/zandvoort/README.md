# Zandvoort — dunes and banking

Reference configuration: 4,259m, 14 turns, clockwise in geographic x-east/z-south
coordinates. Plan registration and source archives follow `../season-2026/README.md`.

Primary references:

- [Circuit Zandvoort — corners](https://www.circuitzandvoort.nl/en/corners/):
  Tarzan/Gerlach right, Hugenholtz left with progressive banking up to 18°;
  elevated Hunserug, blind Slotemaker approach and right-hand final Luyendyk
  banking. Pit exit rejoins after Tarzan.
- [Dutch GP — grandstands](https://dutchgp.com/en/tribunes/), with main/pit,
  Ben Pon, Tarzan, Hairpin, Eastside and Arena sections.
- [Official 2026 venue brochure](https://dutchgp.com/app/uploads/2025/03/DGP-Sales-Brochure-2026-NL.pdf):
  venue and stand relationships, wooded areas and access zones.
- [Circuit — Racesquare](https://www.circuitzandvoort.nl/en/at-the-circuit/racesquare/):
  pit-building hospitality context.

The centreline height range of **14m is an estimate**, not a verified maximum.
The two banked corners reach 18° with smooth longitudinal transitions; T3 raises
the driver's right/outer edge and T14 raises the driver's left/outer edge.
The exact progressive cross-section of T3 is simplified to one local bank angle.

Scenery includes sand/grass dunes, marram tufts, the North Sea to the geographic
west, grandstands, pit buildings and the Hunserug lounge. Dunes are generated
only when their entire radius leaves at least 26m from the driving centreline.
Stand footprints are sampled against road/pit clearance. Locations/architecture
are interpretations rather than building surveys. Candidate stands that cannot
fit safely are omitted instead of covering the track.

`node scripts/season-2026/audit-clearance.mjs zandvoort` checks primitive bounds
at car height with four metres of extra route reserve. The shared world test
also checks bank direction, terrain clearance and surface winding.
