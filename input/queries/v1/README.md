# Corese SPARQL Feature Benchmark v1

15 requêtes SELECT multiligne, réparties sur les neuf fonctionnalités du plan.
Le catalogue `catalogue.json` décrit les fichiers, données, variables projetées,
fonctionnalités principales et secondaires, délais et modes de comparaison.
Les fichiers de requête sont relatifs au catalogue ; les chemins de données sont
relatifs à la racine du dépôt. Aucune requête ne nécessite d'inférence.

Référence normative : [SPARQL 1.1, recommandation W3C](https://www.w3.org/TR/sparql11-query/).
Les préfixes RDF/RDFS/XSD ont leurs IRI W3C officielles ; UB, BSBM, Bowlogna,
FOAF et DBpedia utilisent les espaces de noms réellement présents dans les dumps.
Aucun SERVICE distant, fonction Corese, NOW(), RAND() ou IRI relative.

## Chargement

- LUBM : `input/lubm/unzip_small/lubm_small.nt` en graphe par défaut.
- BSBM et topology : `input/bsbm/unzip_small/bsbm_small.nt` en graphe par défaut.
- Bowlogna : `input/bowlogna/unzip/Department0.nt` en graphe par défaut.
- DBpedia : `input/dbpedia/unzip/persondata_en.nt` en graphe par défaut.
- Named graphs : créer le fichier N-Quads ci-dessous puis le charger en conservant
  les contextes ; laisser le graphe par défaut vide.

Depuis la racine du dépôt :

```bash
python3 input/queries/v1/named-graphs/prepare_dataset.py \
  input/lubm/unzip_small/lubm_small.nt /tmp/corese-feature-lubm.nq
```

La destination doit être absente. Le script traite le fichier canonique N-Triples
ligne par ligne ; il ne convertit pas du Turtle. Les prédicats `ub:takesCourse`
et `ub:teacherOf` vont dans `urn:corese:benchmark:v1:courses`, les autres triplets
dans `urn:corese:benchmark:v1:people`. Aucun triplet RDF n'est inventé. Q14 joint
ces deux contextes ; Q15 vérifie leurs cardinalités. Les compteurs du script
mesurent les lignes émises ; les doublons du fichier source disparaissent au
chargement RDF. Ne pas charger plusieurs sérialisations du même jeu simultanément.

Les échelles medium/large peuvent remplacer small en gardant le même profil de
chargement. Les constantes sélectives de Q01/Q02 sont vérifiées sur les données
locales ; une autre génération peut nécessiter de nouveaux paramètres documentés.

## Choix sémantiques

- Q01/Q02 : étoiles sélectives ; Q04 : chaîne ; Q05 : triangle étudiant/directeur/cours.
- Q03/Q09 : paire MINUS / FILTER NOT EXISTS avec la même seule variable partagée,
  `?product`. Leurs résultats doivent être égaux comme multiensembles.
- Q06 : fermeture transitive réelle des `rdfs:subClassOf` BSBM ; Q07 : inversion et
  alternative sur cette hiérarchie avec revisites possibles.
- Q08 : les données DBpedia 3.5.1 emploient `foaf:Person`, `foaf:name`, `dbp:birth`,
  `dbp:death`, `dbp:birthPlace`. Le décès est optionnel à l'intérieur du bloc naissance.
- Q10 : agrégats entiers et HAVING ; Q11 : sous-requête agrégée indépendante jointe
  par sa variable projetée `?unit` au bloc externe. Pas de corrélation implicite.
- Q12 : les dates Bowlogna sont des `xsd:string` au format YYYY-MM-DD. CONCAT ajoute
  minuit UTC avant le cast `xsd:dateTime`, les bornes, YEAR et MONTH.
- Q03/Q09/Q13 : le type de prix BSBM est `bsbm:USD`, pas `xsd:decimal`.
  `xsd:decimal(STR(?rawPrice))` permet des comparaisons et un tri numériques standards.
- Q13 : DISTINCT, ORDER BY total sur les variables projetées, LIMIT 20 OFFSET 20.
  Les autres requêtes n'ont pas de LIMIT arbitraire : leur multiensemble est complet.

Chaque requête a une fonctionnalité principale ; les opérateurs nécessaires pour
exprimer le cas réel restent documentés comme fonctionnalités secondaires.
Les modes exacts conservent doublons et variables non liées. Le banc doit qualifier
les résultats contenant des blank nodes comme INCONCLUSIVE s'il ne sait pas les
comparer par isomorphisme. Les projections actuelles portent sur IRI et littéraux.

## Validation effectuée

Les 15 fichiers passent les parseurs de Jena 6.2.0 en mode SPARQL 1.1, RDF4J 5.3.2
et la compilation Corese 4.6.5. Les 15 requêtes ont été exécutées avec Jena, sans
inférence, sur les dumps locaux : toutes produisent des résultats non vides.
Q03 et Q09 produisent exactement le même multiensemble (908 produits).
`validation/results.json` contient les cardinalités et les SHA-256 des données.
Ce contrôle ne constitue pas une mesure de performance, ni une validation
inter-moteurs de l'exécution. Les versions ci-dessus concernent les dépendances
utilisées lors du contrôle.

Le validateur Java ayant servi au contrôle est fourni. Avec les dépendances runtime
Corese 4.6.5, Jena 6.2.0 et RDF4J 5.3.2 dans `BENCHMARK_CLASSPATH` :

```bash
java -Xmx5g -cp "$BENCHMARK_CLASSPATH" \
  input/queries/v1/validation/ValidateFeatureQueries.java \
  input/queries/v1 "$PWD" /tmp/corese-feature-lubm.nq
```

Le catalogue et les modes de validation constituent le contrat pour le futur
chargeur. Le harness historique, fondé sur les fichiers de requêtes par ligne,
n'est pas modifié par ces lots de création du corpus.
