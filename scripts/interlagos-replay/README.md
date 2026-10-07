# Interlagos 3D et replay de São Paulo 2025

La page locale `dist/interlagos/` affiche l'Autódromo José Carlos Pace, un mode course libre et le Grand Prix de São Paulo du **9 novembre 2025**. Le replay provient de la session OpenF1 **9869**. Les 20 pilotes historiques sont conservés dans le classement ; 19 disposent d'un modèle 3D du garage 2026. Isack Hadjar n'a pas de modèle local. Les livrées 2026 ne correspondent donc pas à celles de la course 2025.

La [carte FIA 2025](https://www.fia.com/system/files/decision-document/2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map.pdf) fournit l'ordre des virages, les lignes de départ et de contrôle et le plan de la voie des stands. Le [tour de 4,309 km](https://www.formula1.com/en/information/brazil-autodromo-jose-carlos-pace-sao-paulo.5z2RfrmiTTfEP6Wnxv1yIW) et le [dénivelé proche de 43 m](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc.7I9JEcBw3R2AqXbnJ6hyvc) fixent l'échelle. Le profil intermédiaire de hauteur, la largeur et les abords restent des estimations visuelles. Pour éviter les déformations du dessin schématique, la ligne médiane horizontale de la scène est déduite de 15 tours GPS OpenF1 propres, lissée, puis les grandes lignes droites sont contraintes à rester droites. Le traitement conserve la longueur officielle de 4 309 m.

La [grille](https://www.formula1.com/en/results/2025/races/1273/brazil/starting-grid) et le [résultat](https://www.formula1.com/en/results/2025/races/1273/brazil/race-result) F1 fixent les partants, les départs des stands, les abandons et le classement. Norris a remporté 71 tours ; `71 × 4 309 − 305 879 = 60 m` séparent la ligne de contrôle de la ligne de départ. Les tours, vitesses, pédales, rapports, arrêts, drapeaux et météo sont issus d'[OpenF1](https://openf1.org/docs/), source non officielle. La progression est intégrée depuis la vitesse puis recalée à chaque passage de ligne, à 2 Hz. Les écarts latéraux représentent un mouvement **relatif** à une médiane GPS avec indicateur de confiance ; ce n'est pas un relevé exact des bords de piste ni des voies de dépassement. Le tracé de la voie des stands et les positions de ses garages sont approximatifs.

## Reproduire les données

```powershell
node scripts/interlagos-replay/fetch-openf1.mjs
node scripts/interlagos-replay/build-gps-track.mjs
node scripts/interlagos-replay/process-replay.mjs
node scripts/interlagos-replay/build-free-speed-profile.mjs
node scripts/interlagos-replay/validate-replay.mjs
node tests/interlagos-track.mjs
node tests/interlagos-scenery-clearance.mjs
node tests/interlagos-entity-spacing.mjs
```

L'archive source `scripts/interlagos-replay/raw/` est ignorée par Git. `scripts/interlagos/hand-trace.js` conserve le relevé schématique utilisé seulement pour orienter le tracé GPS dans la scène. Les fichiers générés dans `dist/interlagos/` sont autonomes pour la page web. Les mesures de pédalier invalides peuvent être estimées à partir de tours valides du même pilote ; le replay conserve les compteurs de correction dans `session.telemetryRepair`.
