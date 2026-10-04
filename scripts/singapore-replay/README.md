# Replay du Grand Prix de Singapour 2025

Le fichier produit est `dist/singapore/data/singapore-2025-replay.json`. Il utilise les données historiques de la course OpenF1 (session 9896) et les vingt pilotes du classement officiel. La régie peut afficher les vingt lignes, mais dix-neuf pilotes seulement ont un modèle 3D local : Isack Hadjar reste dans le classement sans voiture 3D.

Les numéros et les identités de 2025 sont distincts des modèles de garage 2026. En particulier, Verstappen a le numéro 1 dans cette course et utilise le modèle de garage `redbull` (numéro 3 en 2026), tandis que Norris a le numéro 4 et utilise `mclaren` (numéro 1 en 2026). Le mapping complet est dans `dist/singapore/replay-roster.js`. Les modèles 2026 illustrent un événement 2025 ; certaines livrées et écuries diffèrent de celles vues pendant ce Grand Prix.

## Sources de distance

La [carte FIA 2025](https://www.fia.com/system/files/decision-document/2025_singapore_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_map_and_quarantine_zone.pdf) donne une ligne médiane de **4 927 m**. La [classification FIA après 62 tours](https://www.fia.com/system/files/decision-document/2025_singapore_grand_prix_-_provisional_race_classification.pdf) donne **305 337 m** : `62 × 4 927 − 305 337 = 137 m` entre la ligne de départ et la ligne de contrôle. Certaines pages publiques F1 affichent 4 940 m ; le traitement prend les deux mesures FIA cohérentes entre elles. Le renderer doit convertir la progression du replay vers la longueur réelle de sa courbe avec `trackGap.lengthMeters / 4927`, sans modifier les temps historiques.

La [grille de départ](https://www.formula1.com/en/results/2025/races/1270/singapore/starting-grid) et le [classement final](https://www.formula1.com/en/results/2025/races/1270/singapore/race-result) viennent de F1. Albon et Gasly sont marqués comme partants des stands. Les positions XY OpenF1 pré-départ servent à déduire l'espacement longitudinal de la grille et leur station initiale ; l'écart exact entre la première case et la ligne de départ n'est pas publié ici. Les XY pendant la course fournissent aussi un **écart latéral relatif** par pilote : ils sont recalés sur la carte FIA puis débarrassés du biais commun de cette carte. Chaque échantillon porte un indicateur de confiance ; les mesures incertaines reviennent progressivement à la trajectoire indicative. La position latérale absolue et le trajet précis dans la voie des stands restent approximatifs.

## Génération locale

```powershell
node scripts/singapore-replay/fetch-openf1.mjs
node scripts/singapore-replay/process-replay.mjs
node scripts/singapore-replay/validate-replay.mjs
node scripts/singapore-replay/build-free-speed-profile.mjs
node tests/singapore-gps-lateral.mjs
node tests/singapore-free-race-field.mjs
```

Le téléchargement s'enregistre dans `scripts/singapore-replay/raw/`, ignoré par Git. Il est reprenable : seules les réponses JSON complètes de la bonne session sont mises en cache. OpenF1 peut limiter l'accès historique ; en cas de réponse `401` ou `403`, fournir un jeton autorisé via la variable d'environnement `OPENF1_ACCESS_TOKEN` et relancer. Le jeton n'est ni inscrit dans les URL ni sauvegardé dans les fichiers. Le traitement échoue si des tours, positions, télémétries ou coordonnées indispensables manquent ; il n'écrit pas de replay synthétique. Les segments de capteurs manifestement invalides peuvent être estimés depuis des tours valides du même pilote ; leur nombre est enregistré dans le JSON.

Le générateur `build-free-speed-profile.mjs` extrait séparément 821 vitesses indicatives de 788 tours de course valides, lissées et indexées sur les 4 927 m FIA. `dist/singapore/free-speed-profile.js` alimente la **simulation libre** ; le replay historique conserve ses propres vitesses, temps et rangs. Régénérer ce petit profil après une mise à jour des données historiques.
