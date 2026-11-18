# Red Bull Ring — environnement 3D actuel

`dist/spielberg/environment.js` exporte `addEnvironment(THREE, ctx)` et renvoie
`{ group, landmarks, stats }`. Il conserve le tracé, la route, les murs,
les dégagements et la pit lane du moteur commun.

## Repères représentés

- Le **taureau d'acier**, à sa position géographique OSM : corps en panneaux
  Corten ajourés, quatre membres en mouvement, queue, deux cornes dorées et
  arche métallique. La hauteur arche comprise est **17,2 m au-dessus du socle**.
- Le **Red Bull Wing**, avec une silhouette métallique courbe évoquant un
  aileron, le Welcome Center vitré et ses appuis sur le terrain. Il se trouve
  face aux garages, côté public de la ligne droite.
- Les deux blocs de la tribune **Start–Ziel**, couverts ; **Steiermark** à
  l'extérieur de T1 ; huit secteurs de la **Red Bull grandstand** sur la montée,
  chacun avec sa propre assise ; les gradins **T3**, **Nord/T4**, **Mitte** et **T10**.
  Les autres gradins ne reçoivent pas une toiture inventée.
- Une évocation du **Schönberghof agrandi en 2026**, sur son emplacement OSM,
  avec rez-de-chaussée, cinq étages, terrasses, vitrages et bar panoramique
  au cinquième étage. Cette répartition est une évocation, pas un relevé des plans.
- **2 100 arbres**, majoritairement des conifères, autour de l'emprise du
  circuit. L'infield reste ouvert en prairie, avec un petit bosquet au nord-est.
- Trois couches de crêtes boisées lointaines, hors de l'emprise du circuit.
  Ce paysage de fond donne le contexte de Styrie sans changer le profil de piste.

## Sources primaires consultées le 17 novembre 2026

1. [Red Bull Ring — histoire officielle](https://www.redbullring.com/en/history/).
   Confirme l'installation du taureau en 2012, **17,2 m** arche comprise et
   **68 tonnes**. Décrit le Wing comme une architecture inspirée de l'aileron
   arrière d'une voiture et son ouverture en **2015**. Signale pour **2026**
   quatre garages supplémentaires et la modernisation du Medical Center.
2. [Red Bull Ring — circuit F1 et MotoGP](https://www.redbullring.com/en/track/red-bull-ring-f1-motogp-track/)
   et [présentation des pistes](https://www.redbullring.com/en/experiences/tracks/).
   Référence actuelle de longueur **4,326 km**, montée maximale de 12 %,
   descente maximale de 9,3 % et implantation générale.
3. [FIA — plan du GP d'Autriche 2026, document 7 du 25 juin](https://www.fia.com/system/files/decision-document/2026_austrian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf).
   Plan F1 version 3 du 22 juin, **4,326 km**, dix virages, sens de course,
   ligne de contrôle et dessin de la pit lane. Le tracé F1 conserve le grand
   enchaînement T1–T3 ; la chicane MotoGP n'est pas la trajectoire F1.
4. [Red Bull Ring — plan officiel des tribunes](https://www.redbullring.com/en/wp-content/uploads/sites/1/2024/03/SPG2024_0007_RBRClassics_Tribuenenplan_mit_Camping_EN_240226.pdf)
   et [brochure officielle des installations](https://www.redbullring.com/en/wp-content/uploads/sites/1/2022/11/Fahrerlebnisse-Red-Bull-Ring-Spielberg-buchen-Broschuere-220804.pdf).
   Références d'implantation et de toiture pour Start–Ziel, Steiermark, Red Bull,
   Nord, Mitte, le Wing et l'hôtel. Ces documents sont datés : les installations
   temporaires et secteurs ouverts lors d'un événement peuvent varier.
5. [Red Bull Ring — Schönberghof, annonce du 2 février 2026](https://www.redbullring.com/en/news/tauroa/).
   Précise une réouverture le **30 janvier 2026**, après quatorze mois de travaux,
   et l'agrandissement des chambres, du restaurant et des terrasses.
   [La page actuelle du lieu](https://www.redbullring.com/en/hotels-restaurants/landhotel-schonberghof/)
   mentionne le bar TAURUS au cinquième étage. Le modèle représente donc
   une architecture agrandie, pas simplement l'ancien petit hôtel.
6. [FIA — modifications et notes du directeur de course 2026](https://www.fia.com/system/files/decision-document/2026_austrian_grand_prix_-_race_directors_competition_notes.pdf).
   Les changements de barrières, kerbs et accès sont transmis à l'intégrateur.
   Le présent module de décor ne remplace pas les géométries du moteur commun.
7. [Formula 1 — galerie du circuit et de la sculpture](https://www.formula1.com/en/latest/article/in-pictures-the-best-from-spielberg.5FCXtphd2PDTGg2MkPl1HE).
   Référence visuelle du corps Corten ajouré, de l'arche et des cornes dorées.
8. **© OpenStreetMap contributors, ODbL 1.0** :
   [nœud 5443064309 — taureau](https://www.openstreetmap.org/node/5443064309),
   [chemin 155581853 — Schönberghof](https://www.openstreetmap.org/way/155581853).
   Les deux petits relevés sont archivés sous `sources/`. Les dates éventuelles
   des tags OSM ne servent pas à dater les bâtiments ; les sources du circuit
   font autorité pour l'état 2026.

## Géographie, assises et limites

Le module respecte **x vers l'est, z vers le sud**, `across` positif vers la
gauche du pilote. Ses repères locaux ont un déterminant positif. Aucune
symétrie ou rotation globale ne corrige artificiellement le tracé.

Le taureau est fixé à **14.7611031° E, 47.2232459° N** ; le centre OSM de
l'hôtel à **14.7592202° E, 47.2278696° N**. Les points sont projetés avec
`ctx.config.geography`, incluant l'échelle du tracé. L'orientation précise de
la sculpture, les dimensions des bâtiments, la découpe des panneaux, les
couleurs et le nombre de secteurs du modèle restent des **approximations
procédurales**. La valeur 17,2 m ne sert pas à agrandir tous les objets voisins.

Chaque emprise est sondée tous les 6 m et doit laisser **14 m jusqu'à l'axe de
la piste ou des pits**. Les rectangles architecturaux sont contrôlés entre
eux pour éviter que les tribunes et bâtiments se recouvrent. Les gradins longs
sont fractionnés afin d'épouser la montée, avec des rangées, des allées et
des fondations qui descendent au terrain exact fourni par le moteur.
Les arbres restent à **48 m** de la piste et des pits, et hors des bâtiments.

La longueur reste **4 326 m**. Le moteur possède un profil relatif de **63,5 m**
avec amplification visuelle **×1,08** dans sa configuration actuelle : ce
module ne change ni ce profil ni son échelle. Il n'utilise pas le bruit des
coordonnées OpenF1 comme altitude et ne crée aucun replay.

Les montagnes sont un **horizon stylisé**, pas un DEM ni une reproduction de
sommets identifiés. Leur premier pied se trouve à plus d'un kilomètre de la
piste. Les garages F1 et le Medical Center restent la représentation générique
du moteur ; l'extension de quatre garages signalée en 2026 est documentée,
pas présentée comme un relevé architectural exact.

## Vérifications

```powershell
node --check dist/spielberg/environment.js
node scripts/spielberg/validate-world.mjs
```

Le validateur construit le monde complet sans renderer, avec un canvas simulé.
Il contrôle indépendamment les bases contre les vrais triangles du terrain,
le signe des transformations, les emprises, la hauteur de la sculpture et
la distance des crêtes lointaines. Il sonde aussi la piste et les pits à hauteur
de voiture, sur leur largeur complète et avec une réserve de **4 m** de part
et d'autre. Le rendu dans le navigateur est centralisé par l'intégrateur.

Résultats : 12 groupes représentatifs, **125 appels de rendu** pour le décor,
**100 560 triangles**, 2 100 arbres, 584 appuis de fondation et
**7 753 sondes routières sans collision**. Les troncs touchent le terrain à
environ 1,2 cm près ; les fondations sont enterrées d'environ 15 cm.

Pour rafraîchir les deux coordonnées de référence, facultativement :

```powershell
node scripts/spielberg/fetch-references.mjs
```

Le viewer ne dépend pas de ces appels réseau au chargement.
