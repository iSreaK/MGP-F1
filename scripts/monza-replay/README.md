# Replay local du GP d’Italie 2026

Le site lit `dist/monza/data/monza-2026-replay.json`, un extrait local à 2 Hz pour les six pilotes visibles. Les données historiques de position, télémétrie, tours et contrôle de course proviennent de [l’API OpenF1](https://openf1.org/docs/) ; les places de grille proviennent de la [grille officielle](https://www.formula1.com/en/results/2026/races/1293/italy/starting-grid). OpenF1 est une source non officielle.

Pour régénérer le fichier depuis le dépôt, lancer sous Windows :

```powershell
node scripts/monza-replay/fetch-openf1.mjs
node scripts/monza-replay/process-replay.mjs
node tests/monza-historical-replay.mjs
```

`fetch-openf1.mjs` crée les réponses brutes dans `scripts/monza-replay/raw/` (ignoré par Git). `process-replay.mjs` reconstruit une distance longitudinale monotone et conserve les rangs officiels du peloton complet. Le tracé 3D n’étant pas géoréférencé, la ligne latérale et les passages aux stands sont approximés. Le retour aux stands sous drapeau rouge est figé. Le site ne publie rien pendant cette procédure.
