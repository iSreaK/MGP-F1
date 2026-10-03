# Replay local du GP d’Italie 2026

Le site lit `dist/monza/data/monza-2026-replay.json`, un extrait local à 2 Hz pour les 22 pilotes. Les données historiques de position, télémétrie, tours et contrôle de course proviennent de [l’API OpenF1](https://openf1.org/docs/) ; les places de grille proviennent de la [grille officielle](https://www.formula1.com/en/results/2026/races/1293/italy/starting-grid). OpenF1 est une source non officielle.

Pour régénérer le fichier depuis le dépôt, lancer sous Windows :

```powershell
node scripts/monza-replay/fetch-openf1.mjs
node scripts/monza-replay/process-replay.mjs
node tests/monza-historical-replay.mjs
node tests/monza-replay-continuity.mjs
node tests/monza-sentinel-repair.mjs
node tests/monza-grid-phase.mjs
node tests/monza-braking-alignment.mjs
node tests/monza-entity-spacing.mjs
```

`fetch-openf1.mjs` crée les réponses brutes dans `scripts/monza-replay/raw/` (ignoré par Git). `process-replay.mjs` remplace les blocs de capteurs invalides par des profils de tours valides du même pilote, alignés par secteur, ou par interpolation quand aucun tour comparable n’existe. Il intègre ensuite les vitesses et recale chaque segment sur les temps de tour, les deux grilles de reprise et les 22 rangs historiques. Le retour aux stands sous drapeau rouge utilise les vitesses mesurées ; les voitures restent ensuite dans la file d’attente jusqu’à la reprise.

La ligne d’arrivée et la grille de départ sont séparées de 309 m sur le circuit 3D. Le tracé source n’étant pas géoréférencé avec les positions OpenF1, la trajectoire latérale et les emplacements exacts dans la voie des stands restent estimés. Le rendu écarte visuellement les voitures proches selon leur station sur la piste et leur vitesse de rapprochement, même quand elles ont un tour d’écart ; cet écart latéral n’est pas une mesure historique. La régénération met à jour les fichiers locaux et ne publie rien.
