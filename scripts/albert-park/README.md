# Albert Park, configuration 2026

Page statique Three.js : `dist/albert-park/`. Elle réutilise les modèles GLB du garage et les modules de lecture de course existants, sans nouvelle dépendance ni clé API.

## Tracé et relief

- Plan géographique moderne : [bacinger/f1-circuits, au-1953.geojson](https://github.com/bacinger/f1-circuits/blob/master/circuits/au-1953.geojson), conservé dans `source/circuit-geo.json`. Projection locale x vers l'est, z vers le sud ; aucun miroir. Longueur recalée à 5 278 m, 14 virages, sens horaire et premier virage à droite.
- [Plan FIA Australie 2026](https://www.fia.com/system/files/decision-document/2026_australian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_quarantine_zone.pdf) : tracé, secteurs, départ et stands. [Visa FIA](https://www.fia.com/system/files/decision-document/2026_australian_grand_prix_-_competition_visa.pdf) : 58 tours, départ et contrôle sur la même ligne.
- [F1, comparaison du relief des circuits](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) : 2,6 m de variation totale. Le profil intermédiaire est une approximation douce, avec un facteur de présentation de 1,25 (3,25 m affichés). Il ne s'agit pas d'un relevé topographique. Albert Park reste donc presque plat.
- Lac et îles : [relation OpenStreetMap 346429](https://www.openstreetmap.org/relation/346429), parcelle du MSAC : [way 15867023](https://www.openstreetmap.org/way/15867023). Sources JSON conservées ; attribution visible sur la page. Données © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
- [Parks Victoria](https://www.parks.vic.gov.au/places-to-see/parks/albert-park) et [guide officiel du circuit](https://program.grandprix.com.au/issue-0-formula-1/track-guide/) : lac, pontons, MSAC, Lakeside Stadium, golf, tribunes et végétation.
- [Aménagements officiels 2026](https://www.grandprix.com.au/en/news/4558028/major-fan-experience-upgrades-for-the-formula-1-qatar-airways-australian-grand-prix-2026) : pont Gate 1 élargi, pontons et Clubhouse surélevé face au virage 8.

Les bâtiments, hauteurs de tribunes, largeur de piste, échappatoires, voie des stands, végétation et skyline sont des représentations procédurales indicatives. Le plan du lac est géographique ; les bâtiments sont des silhouettes reconnaissables, sans modèle architectural exact. Le terrain reste sous la chaussée et se raccorde par des bandes de terre plantées. Les passages supérieurs disposent d'au moins 7,4 m sous leur tablier.

## Replay et simulation

[OpenF1](https://openf1.org/), course 11234, 8 mars 2026 ; [grille officielle F1](https://www.formula1.com/en/results/2026/races/1279/australia/starting-grid), [résultat](https://www.formula1.com/en/results/2026/races/1279/australia/race-result).

22 inscrits, 20 partants. Piastri et Hülkenberg sont non-partants : aucune voiture en mouvement ne leur est inventée. Hadjar reste au classement, sans modèle 3D de remplacement ; 19 partants sont représentés avec les GLB existants. Les livrées du garage peuvent différer de l'engagement réel 2026.

La progression intègre les vitesses réelles et se recale aux passages de ligne. Les arrêts, pneus, classements et abandons viennent des données de course. Les réparations des segments manquants sont comptées dans `session.telemetryRepair`. Le calage latéral XY a été **rejeté** au seuil de qualité : les trajectoires latérales sont illustratives, avec confiance GPS nulle, et cette limite est enregistrée dans le JSON. Les positions longitudinales de départ sont estimées à partir des XY pré-départ (8,19 m entre cases successives). Le décalage précis de la première case reste indicatif.

La simulation libre utilise un profil de vitesse mesuré sur 52 tours propres de Russell, puis applique le comportement des voitures du garage ; elle ne prétend pas rejouer la course.

## Régénération

Depuis la racine, avec Node.js récent et Python pour le téléchargement si indiqué par le script :

```powershell
node scripts/albert-park/build-geography.mjs
node scripts/albert-park/prepare-viewer.mjs
node scripts/albert-park/fetch-replay.mjs
node scripts/albert-park/prepare-replay-processor.mjs
node scripts/albert-park/process-replay.mjs
node scripts/albert-park/build-speed-profile.mjs
node --test tests/albert-park-*.mjs
```

Les sources JSON de petite taille sont versionnées. Les réponses de télémétrie brutes dans `raw/`, PDF et images de référence sont exclus de Git ; le replay final et le profil de vitesse sont livrés dans `dist/`. Les générateurs de coque et de processeur réutilisent les modules d'Austin comme base technique ; les modules de géographie et de décor sont propres à Albert Park.

## Vérifications

Les tests couvrent fermeture et longueur du plan, orientation géographique, premier virage, relief, simulation, lac et îles, repères principaux, terrain sous la route, passages supérieurs, recul des murs et troncs, grille, DNS, progression des 202 760 échantillons de replay et classement final.
