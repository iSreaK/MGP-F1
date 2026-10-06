# Replay du Grand Prix de Mexico 2025

`dist/mexico/data/mexico-2025-replay.json` contient la course du 26 octobre 2025, reconstruite à 2 Hz à partir de la session OpenF1 **9877**. Les 20 pilotes, leur grille et le classement final correspondent aux pages officielles [grille](https://www.formula1.com/en/results/2025/races/1272/mexico/starting-grid) et [résultat](https://www.formula1.com/en/results/2025/races/1272/mexico/race-result) de F1. Les passages de ligne, vitesses, pédales, rapports, positions en course, arrêts, drapeaux et météo viennent d’OpenF1, source non officielle.

Le [circuit F1](https://www.formula1.com/en/information/mexico-autodromo-hermanos-rodriguez-mexico-city.1K2WPfBcI8kTXjcTHcbsBM) mesure **4 304 m**. Pour les 71 tours et les **305 354 m** de distance officielle, `71 × 4 304 − 305 354 = 230 m` séparent la ligne de départ de la ligne de contrôle. Les temps sont conservés et la progression 3D est recalée à chaque passage de cette ligne. La [carte FIA 2025](https://www.fia.com/system/files/decision-document/2025_mexico_city_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_quarantine_zone_area.pdf) fixe la forme du circuit, les 17 virages et le sens des stands. Les écarts latéraux OpenF1 sont ajustés à cette carte ; les bordures, la voie des stands et les objets du décor restent des estimations visuelles, faute de relevé 3D public complet.

Le garage dispose de 19 modèles 2026 correspondant aux pilotes de cette course. **Isack Hadjar** est présent dans la classification mais n’a pas de modèle 3D local. Les modèles portent les livrées 2026 ; l’identité, le numéro et les résultats de 2025 sont définis séparément dans `dist/mexico/replay-roster.js`.

## Régénération

```powershell
node scripts/mexico-replay/fetch-openf1.mjs
node scripts/mexico-replay/process-replay.mjs
node scripts/mexico-replay/validate-replay.mjs
node scripts/mexico-replay/build-free-speed-profile.mjs
node scripts/mexico/validate-track.mjs
```

Les données source téléchargées se trouvent dans `scripts/mexico-replay/raw/`, ignoré par Git. Le téléchargement reprend les fenêtres déjà validées. Si OpenF1 demande un accès autorisé, définir `OPENF1_ACCESS_TOKEN` dans l’environnement local. Le traitement refuse les mesures essentielles manquantes et estime les segments de capteur invalides à partir d’autres tours valides du même pilote ; les compteurs figurent dans `session.telemetryRepair`.

`dist/mexico/free-speed-profile.js` sert à la simulation libre. Le replay historique utilise ses propres échantillons.
