# Replay du Grand Prix d’Abou Dhabi 2025 à Yas Marina

`dist/yas-marina/data/yas-marina-2025-replay.json` contient la reconstruction à 2 Hz de la course du **7 décembre 2025**, à partir de la session OpenF1 **9839**. Les 20 pilotes, l’ordre de départ et le résultat sont vérifiés avec les pages officielles F1 : [grille](https://www.formula1.com/en/results/2025/races/1276/abu-dhabi/starting-grid) et [classement](https://www.formula1.com/en/results/2025/races/1276/abu-dhabi/race-result). OpenF1 fournit tours, positions, vitesse, commandes, arrêts, drapeaux et météo ; il s’agit d’une source non officielle.

Le [circuit officiel](https://www.formula1.com/en/racing/2025/united-arab-emirates) mesure **5 281 m**, comporte **16 virages** et la course compte **58 tours** pour **306 183 m**. La grille est située 115 m après la ligne de contrôle (`58 × 5 281 − 306 183`). La [carte FIA 2025](https://www.fia.com/system/files/decision-document/2025_yas_marina_event_-_circuit_map_-_yas_marina_2025.pdf) fixe l’ordre des virages, secteurs et zones DRS. Le centre de piste est reconstitué depuis un [contour GPS MIT](https://github.com/GulrezQayyum/f1_circuits-_2024_season/blob/main/circuits/circuit_paths.dart), puis recalé à la longueur officielle. Largeur, bordures, bâtiments, voie des stands et trajectoires latérales sont des reconstructions visuelles, pas un relevé topographique.

Le garage possède **19 modèles 2026** correspondant aux pilotes de ce GP. **Isack Hadjar** figure dans le classement historique sans modèle 3D disponible. Les identités et numéros 2025 restent distincts des livrées 2026 dans `dist/yas-marina/replay-roster.js`.

## Régénération

```powershell
node scripts/yas-marina/build-track.mjs
node scripts/yas-marina-replay/fetch-openf1.mjs
node scripts/yas-marina-replay/process-replay.mjs
node scripts/yas-marina-replay/validate-replay.mjs
node scripts/yas-marina-replay/build-free-speed-profile.mjs
```

L’archive OpenF1 se trouve dans `scripts/yas-marina-replay/raw/`, ignoré par Git. Le téléchargement reprend les fenêtres déjà vérifiées. Si l’API requiert un accès autorisé, définir `OPENF1_ACCESS_TOKEN` localement. Le traitement échoue si des tours, positions ou données essentielles manquent. Quelques mesures invalides sont estimées depuis les tours valides du même pilote ; les compteurs et degrés de confiance sont conservés dans `session.telemetryRepair`. La simulation libre utilise `dist/yas-marina/free-speed-profile.js` ; le replay historique lit ses propres échantillons.
