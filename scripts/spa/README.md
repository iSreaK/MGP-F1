# Spa-Francorchamps — décor actuel

Le module `dist/spa/environment.js` exporte :

```js
addEnvironment(THREE, ctx) // => { group, landmarks }
```

La route, les murs, la pit lane F1, le profil de 102,2 m et le viewer relèvent
du moteur commun. Ce module ne crée aucun replay et ne modifie pas le tracé.

## Éléments représentés

- La tribune moderne au sommet du Raidillon, avec ses terrasses massives,
  sa grande couverture, ses poutres, ses colonnes et ses fondations.
- La tribune Endurance dans la descente après La Source et le bâtiment
  secondaire des garages Endurance. Celui-ci est fractionné en treize baies
  qui suivent le terrain, plutôt qu'un bloc flottant au-dessus de la pente.
- La **Uhoda Tower actuelle**, inaugurée le **27 juin 2026** : cinq niveaux,
  terrasses arrondies, proue verticale et rooftop. La passerelle piétonne
  surélevée relie la zone paddock et le côté fanzone, avec une descente.
- Une évocation de la Ferme Foguenne restaurée et de l'architecture ardennaise.
- Des gradins à La Source, aux Combes et à Pouhon.
- Le petit cours d'eau de l'Eau Rouge. Les morceaux visibles s'arrêtent à
  l'extérieur de l'emprise routière : le passage sous la piste reste enterré.
- **3 400 arbres** feuillus et conifères, instanciés en six lots, qui suivent
  le terrain et laissent les routes, bâtiments et passerelles dégagés.

L'ancien chalet du Raidillon et l'ancienne tour Uniroyal ne sont pas recréés :
leur présence donnerait une image historique incompatible avec l'état 2026.

## Sources primaires

1. Circuit de Spa-Francorchamps, **4 mai 2022**, [inauguration des nouvelles infrastructures](https://www.spa-francorchamps.be/fr/news/262_inauguration-des-nouvelles-infrastructures-du-circuit-de-spa-francorchamps).
   Confirme la tribune de 4 600 places au sommet du Raidillon, les travaux de
   sécurité et le programme de reconstruction de la zone Endurance.
2. Circuit de Spa-Francorchamps, **22 mars 2022**, [une saison tournée vers le futur](https://www.spa-francorchamps.be/fr/news/258_2022-une-saison-tournee-vers-le-futur-en-piste-et-hors-piste).
   Confirme les dégagements rénovés, les nouveaux bacs à gravier et le projet
   des tribunes/gradins de la descente pour 2023.
3. Circuit de Spa-Francorchamps, [espaces de réception actuels](https://www.spa-francorchamps.be/fr/evenement-locationdesalles).
   Confirme la loge sous la tribune Raidillon et la nouvelle loge Endurance
   entre La Source et le Raidillon.
4. Circuit de Spa-Francorchamps, **27 juin 2026**, [inauguration officielle de la Uhoda Tower](https://www.spa-francorchamps.be/fr/news/609_uhoda-tower-la-nouvelle-tour-du-circuit-de-spa-francorchamps-est-inauguree-ce-samedi-27-juin).
   Source de sa date, de ses cinq niveaux et du rooftop panoramique.
5. **Lacomble Architecture / Point B-ar**, publication à l'Ordre des
   Architectes, [La Tour Uhoda — réalisation 2026](https://ordredesarchitectes.be/projets/la-tour-uhoda-circuit-de-spa-francorchamps).
   Décrit les anneaux/terrasses, la proue demi-cylindrique, le béton et le
   métal, le podium circulaire ainsi que le lien avec la Ferme Foguenne.
6. **Point B-ar**, [Uhoda Tower et passerelle vers la fanzone](https://ordredesarchitectes.be/projets/2418-spa-francorchamps).
   Confirme la fonction de la nouvelle passerelle, plutôt qu'une passerelle
   publicitaire inventée.
7. Circuit, **24 novembre 2025**, [présentation de la saison 2026](https://www.spa-francorchamps.be/fr/news/574_le-circuit-de-spa-francorchamps-leve-le-voile-sur-son-calendrier-2026).
   Documente le chantier tour/passerelle et la nouvelle entrée de Ster.
8. Formula 1, [fiche officielle du GP de Belgique 2026](https://www.formula1.com/en/racing/2026/belgium)
   et [guide des noms des virages, juillet 2026](https://www.formula1.com/en/latest/article/explained-how-every-corner-at-the-circuit-de-spa-francorchamps-got-its-name.1o6cyXf5F6q9VFFcgMqTqs.1o6cyXf5F6q9VFFcgMqTqs).
   Références pour La Source et l'enchaînement Eau Rouge–Raidillon.
9. Formula 1, [guide des dénivelés](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc).
   Confirme **102,2 m**, sommet à Malmedy/T7 et minimum vers Paul Frère/T15.
   La vallée de l'Eau Rouge est un creux local, pas le minimum global.
10. Aston Martin F1, [guide du GP de Belgique 2026](https://www.astonmartinf1.com/en-GB/races/2026-belgian-gp).
    Donne les mêmes extrema, environ 467,8 m et 365,6 m absolus, et confirme
    que le ruisseau Eau Rouge passe sous la piste à son virage éponyme.

## Repères et approximations assumées

Le moteur conserve **x vers l'est, z vers le sud** et un `across` positif
à gauche du pilote. Les groupes utilisent un repère local de déterminant +1 ;
aucune symétrie globale n'est appliquée.

Les premières estimations de stations venaient du GeoJSON de référence. Le
module les recale sur **La Source/T1 dans `ctx.config.turns`**, car le zéro de
contrôle MultiViewer n'est pas le premier point de ce GeoJSON. Dans la config
actuelle, cela donne approximativement :

| Élément | Station depuis le contrôle |
|---|---:|
| Tribune La Source | 364 m |
| Tribune Endurance | 759 m |
| Uhoda Tower et passerelle | 954 m |
| Eau Rouge / ruisseau | 1 065 m |
| Tribune Raidillon | 1 244 m |
| Tribune Les Combes | 2 364 m |
| Terrasse Pouhon | 3 924 m |

Les emprises précises, couleurs de sièges, longueurs de toiture, positions
des bâtiments, forme détaillée de la ferme et hauteur de la passerelle sont
des **évocations procédurales**, pas un relevé photogrammétrique. Le modèle
de la tour mesure environ 26 m ; seuls les cinq niveaux sont une mesure
confirmée dans la source officielle utilisée. La capacité publiée de la
tribune Raidillon n'est pas un comptage de sièges du modèle.

Les emprises sont contrôlées sur une grille de 7 m, avec au moins **14 m
entre leur bord et l'axe de la piste ou des pits**. Si une courbe adjacente s'approche,
l'emprise est reculée du côté choisi. Chaque poteau/fondation descend jusqu'à
`groundHeightAt`, sans modifier l'altitude de la route. La passerelle est la
seule exception au dégagement horizontal : son tablier passe au moins
9,5 m au-dessus du point routier et porte `allowOverTrack = true`.

Les bacs à gravier et les dégagements 2022+ sont réalisés par le moteur commun ;
ils ne sont pas dupliqués ici. Les arbres restent à 39 m des routes/pits et
hors des emprises architecturales pour ne pas obstruer ces surfaces.

## Validation

```powershell
node --check dist/spa/environment.js
node scripts/spa/validate-environment.mjs
node scripts/spa/validate-world.mjs
```

Le premier validateur crée un contexte sans renderer à partir des vrais
`dist/spa/track-data.js` et `config.json`. Le second construit le monde complet
avec le moteur commun, les pits et le mesh de terrain. Il vérifie :

- les transformations sans réflexion de chaque mesh/instance ;
- **12 470 points de contrôle**, à hauteur de voiture, sur toute la largeur
  de la piste et des pits, ainsi qu'une marge latérale supplémentaire de 4 m ;
- la base des 3 400 troncs, des 345 fondations et des deux piles de passerelle,
  contre une interpolation indépendante des vrais triangles de terrain ;
- le budget de géométrie après instanciation/regroupement.

Résultat intégré : **11 groupes**, **95 appels de rendu** pour le décor,
**136 968 triangles**, aucune intersection avec les réserves routières.
La base des troncs diffère du terrain entre −2,7 cm et +0,9 cm ; les fondations
sont enterrées d'environ 12 cm au maximum et aucune ne flotte de plus de
0,1 mm. Les petits écarts viennent des matrices/positions Float32.
La QA visuelle dans le navigateur reste centralisée par l'agent intégrateur.
