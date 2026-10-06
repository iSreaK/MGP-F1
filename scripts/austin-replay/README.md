# Replay du Grand Prix des États-Unis 2025 à Austin

`dist/austin/data/austin-2025-replay.json` contient le Grand Prix du 19 octobre 2025, reconstruit à 2 Hz à partir de la course OpenF1 **session 9888**. Les 20 pilotes historiques, leur grille et leur classement proviennent des pages [grille](https://www.formula1.com/en/results/2025/races/1271/usa/starting-grid) et [résultat](https://www.formula1.com/en/results/2025/races/1271/usa/race-result) de F1 ; la [classification FIA](https://www.fia.com/system/files/decision-document/2025_united_states_grand_prix_-_provisional_race_classification.pdf) confirme les 56 tours de Verstappen et les cinq tours complets de Sainz avant son abandon. Les tours, positions officielles en course, vitesses, pédales, rapports, arrêts, drapeaux et météo proviennent d’OpenF1, source non officielle.

Le [circuit F1](https://www.formula1.com/en/information/united-states-circuit-of-the-americas-austin.5RpZ6us0a3FoaoRxTMpbxI) fait **5 513 m** ; la course mesure **308 405 m**. Ainsi, `56 × 5 513 − 308 405 = 323 m` séparent la ligne de départ de la ligne de contrôle. Le traitement conserve les temps OpenF1 et cale la progression sur chaque passage de cette ligne. Le dernier tour incomplet de Sainz est reconstitué jusqu’à son arrêt à partir des mesures de vitesse et de position ; il reste officiellement crédité de cinq tours. La [carte FIA 2025](https://www.fia.com/system/files/decision-document/2025_united_states_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_map_red_zones_map.pdf) fournit la référence du tracé. Les écarts latéraux OpenF1 sont recalés sur ce tracé avec une confiance par échantillon ; la trajectoire précise dans la voie des stands reste indicative.

Le garage actuel offre 19 modèles 2026 correspondant aux pilotes de ce GP. **Isack Hadjar** figure dans le classement mais n’a pas de modèle 3D local. Les livrées, équipes et numéros affichés sur les modèles sont ceux du garage 2026 ; les identités et numéros du replay historique sont séparés dans `dist/austin/replay-roster.js`.

## Régénération

```powershell
node scripts/austin-replay/fetch-openf1.mjs
node scripts/austin-replay/process-replay.mjs
node scripts/austin-replay/validate-replay.mjs
node scripts/austin-replay/build-free-speed-profile.mjs
```

L’archive source se trouve dans `scripts/austin-replay/raw/`, ignoré par Git. Le téléchargement reprend les fenêtres déjà validées. Si OpenF1 requiert un accès autorisé, définir `OPENF1_ACCESS_TOKEN` dans l’environnement local ; le jeton n’est pas écrit dans les URL ni les fichiers. Le processeur échoue sur les données de tours, de positions et de télémétrie manquantes plutôt que d’inventer une course. Des segments de capteurs invalides peuvent être estimés depuis les autres tours valides du même pilote ; les compteurs figurent dans `session.telemetryRepair`.

Le petit profil `dist/austin/free-speed-profile.js` représente les vitesses typiques de la course pour la simulation libre. Le replay historique conserve ses propres échantillons et ne dépend pas de ce profil.
