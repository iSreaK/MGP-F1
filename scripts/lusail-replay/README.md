# Replay du Grand Prix du Qatar 2025 à Lusail

`dist/lusail/data/lusail-2025-replay.json` contient une reconstruction à 2 Hz de la course du **30 novembre 2025**, issue de la session OpenF1 **9850**. Les 20 pilotes, leur grille et leur classement viennent des pages officielles F1 : [grille](https://www.formula1.com/en/results/2025/races/1275/qatar/starting-grid) et [résultat](https://www.formula1.com/en/results/2025/races/1275/qatar/race-result). Les tours, positions en course, vitesses, pédales, rapports, arrêts, drapeaux et météo proviennent d’OpenF1, source non officielle.

Le [tracé officiel F1](https://www.formula1.com/en/racing/2025/qatar) mesure **5 419 m**, pour **57 tours** et une distance de course de **308 611 m**. Les lignes de départ et de contrôle sont distinctes : `57 × 5 419 − 308 611 = 272 m`. La [carte FIA 2025](https://www.fia.com/system/files/decision-document/2025_lusail_event_-_circuit_map_-_qatar_2025.pdf) donne leur ordre et le sens de roulage. Le traitement cale la progression de chaque pilote sur ses passages de ligne mesurés par OpenF1. Les écarts latéraux OpenF1 sont recalés sur le tracé avec une confiance par échantillon ; leur position absolue et la voie des stands restent approximatives.

Le garage possède 19 modèles 2026 correspondant aux pilotes de ce GP. **Isack Hadjar** reste présent dans le classement historique sans modèle 3D local. Les livrées des modèles sont celles de 2026 ; `dist/lusail/replay-roster.js` garde séparées les identités, numéros et résultats de 2025.

## Régénération

```powershell
node scripts/lusail-replay/fetch-openf1.mjs
node scripts/lusail-replay/process-replay.mjs
node scripts/lusail-replay/validate-replay.mjs
node scripts/lusail-replay/build-free-speed-profile.mjs
```

L’archive source se trouve dans `scripts/lusail-replay/raw/`, ignoré par Git. Le téléchargement reprend les fenêtres déjà validées. Si OpenF1 requiert un accès autorisé, définir `OPENF1_ACCESS_TOKEN` dans l’environnement local ; le jeton n’est pas écrit dans les URL ni les fichiers. Le processeur échoue sur les données de tours, de positions et de télémétrie manquantes plutôt que d’inventer une course. Des segments de capteurs invalides peuvent être estimés depuis les autres tours valides du même pilote ; les compteurs figurent dans `session.telemetryRepair`.

`dist/lusail/free-speed-profile.js` fournit une vitesse typique à la simulation libre. Le replay historique utilise ses propres échantillons et ne dépend pas de ce profil.
