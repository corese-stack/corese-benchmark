# Spécification Technique & Guide d'Implémentation Frontend — Corese Benchmark Dashboard

Document de référence pour le développeur frontend (**Abdessamad Abdoun**)  
Supervision et architecture : **Rémi Cérès**  
Dépôt : `corese-stack/corese-benchmark`  
Date de publication : 29 octobre 2026

---

## 1. Principes Directeurs & Répartition des Rôles

- **Rémi Cérès (Backend)** : 100 % du moteur de benchmark en Java 21, isolation des sous-processus JVM, streaming sampler de mémoire, conformité formelle W3C, hachage canonique SHA-256 (`SparqlResultHasher`), et génération du rapport JSON auto-suffisant (`site/data/benchmark-report.json`).
- **Abdessamad Abdoun (Frontend)** : 100 % de l'expérience utilisateur, du dashboard web (`site/index.html`, `site/app.js`, `site/styles.css`), et des composants de visualisation Chart.js.

### Règle d'or pour le Frontend
**Le Frontend ne doit réaliser aucun calcul complexe, aucune déduction métier et aucune inférence heuristique.**
Tous les statuts (`PASS`, `MISMATCH`, `TIMEOUT`, `ERROR`), toutes les métriques (médianes, TTFR, deltas mémoire), et toutes les séries temporelles sont fournis calculés et typés par le backend dans le JSON.

---

## 2. Pièges Techniques JavaScript & Règles Impératives

Ces points sont issus des audits de code et doivent être strictement respectés :

1. **Ne jamais tronquer les deltas de mémoire à zéro** :
   - Un passage du Garbage Collector (GC) peut faire baisser la mémoire heap après une exécution. Par conséquent, `memoryDeltaMb` peut être négatif.
   - **Interdit** : `Math.max(0, r.memoryDeltaMb)`.
   - **Requis** : Afficher la valeur réelle formatée (ex. `-12.4 MB`).
2. **Gestion rigoureuse du TTFR non disponible** :
   - Si un moteur ne supporte pas le streaming ou si la requête a échoué, `medianTtfrMs` vaut `-1`.
   - Ne jamais tracer `-1` sur un graphique. Afficher `—` dans les tableaux et ignorer le segment TTFR dans les barres empilées.
3. **Traitement graphique obligatoire des TIMEOUT** :
   - Ne **JAMAIS** tracer `null` pour un timeout dans Chart.js (ce qui masquerait le moteur et donnerait l'impression trompeuse qu'il n'a eu aucune latence !).
   - Tracer la valeur du plafond de timeout (`queryTimeoutMs` = 60 000 ms) avec une barre hachurée (ou semi-transparente) surmontée de l'étiquette `> 60s (TIMEOUT)`.
4. **Interdiction formelle de victoire pour les requêtes erronées (`MISMATCH`)** :
   - Un moteur ayant produit un résultat faux (`MISMATCH`) ou ayant expiré (`TIMEOUT`) ne doit **JAMAIS** recevoir la couleur verte de victoire ni être désigné vainqueur dans les cartes KPI ou dans les tableaux.
5. **Prévention des fuites mémoire Chart.js** :
   - Avant chaque réinstanciation d'un canvas Chart.js, toujours exécuter :
     ```javascript
     if (currentChartInstance) {
       currentChartInstance.destroy();
     }
     ```
6. **Protection contre les injections XSS** :
   - Les requêtes SPARQL et les messages d'erreur système ne doivent jamais être injectés bruts dans le DOM avec `innerHTML`.
   - Utiliser systématiquement `element.textContent = ...` ou une fonction d'échappement `escapeHtml()`.
7. **Autonomie locale complète (Zéro CDN)** :
   - Télécharger `chart.umd.min.js` et le placer dans `site/vendor/chart.umd.min.js`.
   - Remplacer le tag `<script src="https://cdn.jsdelivr.net/..."></script>` par `<script src="vendor/chart.umd.min.js"></script>`. Le dashboard doit s'ouvrir et fonctionner parfaitement sans connexion Internet.

---

## 3. Architecture de Navigation & Écrans Détaillés

La barre de navigation supérieure est permanente et ne doit jamais masquer d'onglets lors du changement de jeu de données :

```text
[ Overview ] [ Loading & Ingestion ] [ Bowlogna ] [ BSBM ] [ LUBM ] [ DBpedia ] [ W3C Conformance ] [ Machine & Transparency ]
```

---

### Écran 1 : Overview (Synthèse & KPIs Globaux)
- **Header Pill** : Pastille permanente sous le titre du site :
  `📍 Inria SED Sophia · 16c/32t CPU · 64 GB RAM · Linux 6.8 · OpenJDK 21 (-Xms4g -Xmx8g) · Protocole: Warmup + 3 Reps (Médiane)`.
- **Cartes KPI Globales** :
  - Débit moyen global d'ingestion (triplets / s) par moteur.
  - Latence médiane moyenne sur l'ensemble des requêtes validées (`PASS`).
  - Taux global de conformité / validité (% de requêtes `PASS` sur l'ensemble des benchmarks).
- **Graphiques** : Barchart comparatif du débit moyen et barchart de la latence médiane SPARQL.

---

### Écran 2 : Loading & Ingestion (Toutes Sources Confondues)
- **Graphique Bi-Axe Temps Réel (Chart.js LineChart)** :
  - **Axe X** : Temps écoulé en secondes (`Elapsed Time (s)`).
  - **Axe Y1 (Gauche)** : Mémoire Heap utilisée en Mo (`Heap Used (MB)`), courbes pleines par moteur (Bleu Corese `#4472C4`, Orange Jena `#ED7D31`, Vert RDF4J `#70AD47`).
  - **Axe Y2 (Droite)** : Nombre cumulé de triplets ingérés (`Triples Loaded`), courbe pointillée avec aire translucide.
  - **Tooltip synchronisé** : Au survol de la seconde $t$, affiche en direct : débit instantané, triplets cumulés, mémoire consommée et marqueurs des pics GC.
- **Graphique de Débit Moyen (Throughput Bar Chart)** :
  - Barres horizontales du débit (`triplets / s`), avec barre d'erreur min–max sur les 3 répétitions.
- **Tableau détaillé d'ingestion** :
  - Colonnes : `Engine` | `Dataset` | `File` | `Format` | `Triples` | `Median Time (ms)` | `Throughput (t/s)` | `Heap Delta (MB)` | `Repetitions [R1, R2, R3] (ms)` | `CV (%)`.

---

### Écran 3 : Bowlogna Benchmark (Académique / Université, 1.23M triplets, 17 requêtes)

#### Matrice des Familles de Requêtes & Classification :
- **Toutes les requêtes (17)** : Bouton `All (17)`
- **Agrégations massives & GROUP BY (5 requêtes)** : Bouton `Aggregations`  
  *(Cible prioritaire du goulot Q8)* :
  - `query_8` : Échecs par unité d'enseignement (`GROUP BY ?X`)
  - `query_9` : Évaluations par unité d'enseignement (`GROUP BY ?X`)
  - `query_11` : Top 5 des meilleures moyennes d'étudiants (`GROUP BY ?X ORDER BY DESC(?avgMark) LIMIT 5`)
  - `query_12` : Durée moyenne d'achèvement de cursus (`GROUP BY ?T`)
  - `query_13` : Moyenne générale des notes au Semestre 1 (`AVG(?mark)`)
- **Jointures complexes & Parcours de graphe (3 requêtes)** : Bouton `Complex Joins` :
  - `query_5` : Calcul de la somme des crédits ECTS d'un étudiant avec jointures 4-hop.
  - `query_7` : Parcours de chaîne 2-hop d'attributs.
  - `query_14` : Récupération du département et des professeurs affiliés.
- **Filtres temporels & Expressions régulières (5 requêtes)** : Bouton `Temporal & Regex` :
  - `query_3` : Étudiants diplômés d'un Bachelor avant la date actuelle (`xsd:dateTime(?end) < NOW()`).
  - `query_4` : Étudiants inscrits en Master avant la date actuelle.
  - `query_6` : Filtrage d'étudiants par expression régulière sur le nom de famille (`regex(?ln, "^D")`).
  - `query_10` : Thèses supervisées triées par volume (`REGEX(?tType, 'Thesis', 'i') LIMIT 1`).
  - `query_16` / `query_17` : Étudiants inscrits au cours d'un intervalle de dates.
- **Motifs simples & Comptages (4 requêtes)** : Bouton `Simple & Count` :
  - `query_1` : Comptage total des thèses de Master (`COUNT(?X)`).
  - `query_2` : Thèses avec mention.
  - `query_15` : Recherche d'unités enseignées en anglais.

#### Composants de l'écran :
1. **Graphique TTFR empilé** : Segment 1 = `TTFR` (plein) + Segment 2 = Temps de complétion restant (hachuré).
2. **Tableau matriciel des résultats** avec badges `PASS`, `MISMATCH`, `TIMEOUT`, `ERROR`.
3. **Modale d'Inspection de Résultat (Diff Inspector)** :
   - S'ouvre au clic sur n'importe quel badge `MISMATCH` ou sur une cellule du tableau.
   - Contient : Requête SPARQL formatée, rowCount attendu vs obtenu, hash canonique SHA-256 attendu vs obtenu.

---

### Écran 4 : BSBM Benchmark (Berlin SPARQL Benchmark — eCommerce, 12 requêtes)
- **Boutons de filtres par familles** :
  - `All Queries (12)`
  - `Search & Product Features (Q1, Q2, Q3, Q4)`
  - `Simulations & Joins (Q5)`
  - `Reviews & Ratings (Q6, Q9, Q11, Q12)`
  - `Offers & Vendors (Q7, Q8, Q10)`
- **Bascule d'échelle logarithmique** : Bouton `Log Scale` pour analyser les requêtes rapides (< 10 ms) et lourdes (> 1 000 ms) sur un même plan.
- **Matrice des 4 statuts** avec modale d'inspection de diff.

---

### Écran 5 : LUBM Benchmark (Inférence & RDFS, 14 requêtes)
- **Boutons de filtres par familles** :
  - `All Queries (14)`
  - `Large Result Sets (Q2, Q6, Q9)` (stress-test du streaming de résultats)
  - `Selective Graph Patterns (Q1, Q3, Q5, Q7, Q8, Q10, Q14)`
  - `Transitive & SubOrganization (Q4, Q11, Q12, Q13)`
- **Graphique de streaming TTFR** mettant en valeur la latence d'émission du premier tuple.

---

### Écran 6 : DBpedia Scale (Scalabilité sur Données Réelles)
- **Sélecteur de fichiers** :
  - `persondata_en.nt` (356 914 triplets)
  - `homepages_en.nt` (394 897 triplets)
  - `category_labels_en.nt` (565 108 triplets)
  - `disambiguations_en.nt` (768 924 triplets)
  - `specific_mappingbased_properties_en.nt` (182 530 triplets)
- **Courbe de scalabilité bilogarithmique** : Triplets vs Temps de chargement.
- **Graphique d'efficacité mémoire** : Mo consommés par million de triplets par fichier.

---

### Écran 7 : W3C Conformance (Cadrage Précis — Zéro Doublon)
- **Règle** : Ne pas charger le fichier lourd de 2.3 Mo de `corese-w3c` dans `corese-benchmark`.
- **Affichage** :
  - Carte de synthèse : Pass Rate officiel de Corese v5 ($99.38\%$, 2 897 / 2 915 tests réussis).
  - Note explicative : *"La conformité officielle W3C SPARQL 1.0, 1.1 et SHACL est exécutée et certifiée de manière indépendante sur le banc dédié corese-w3c."*
  - Bouton direct : `Consulter le portail officiel de conformité W3C (corese-w3c) ↗` pointant vers `https://corese-stack.github.io/corese-w3c/`.

---

### Écran 8 : Machine & Transparency (Fiche d'Identité SED Complète)
Grille de 6 cartes visuelles professionnelles :
1. **CPU** : Modèle exact (AMD EPYC / Intel Xeon), sockets, cœurs physiques, threads logiques, fréquence, gouverneur CPU (`performance`).
2. **Mémoire & Disque** : RAM physique totale (ex: 64 GB DDR4 ECC), swap actif, swappiness, type de disque.
3. **OS & Noyau** : Distribution Linux (`Ubuntu 24.04.1 LTS`), version exacte du noyau Linux (`Linux 6.8.0-45-generic`).
4. **JVM** : Vendeur, version OpenJDK 21, drapeaux JVM stricts appliqués aux sous-processus isolés (`-Xms4g -Xmx8g -XX:+UseG1GC`).
5. **Traçabilité logicielle** : Commit SHA cliquable de `corese-benchmark`, commit SHA de `corese-core`, versions exactes Jena (6.2.0) et RDF4J (5.3.2).
6. **Protocole de mesure** : Warmup (1 run), répétitions (3 runs), sélection de la médiane, timeouts (60s SPARQL, 120s chargement).

---

## 4. Organisation Recommandée du Code JavaScript (`site/js/`)

Pour éviter de surcharger un fichier monolithique, scinder le code en modules ES6 :

```text
site/
├── index.html
├── styles.css
├── vendor/
│   └── chart.umd.min.js          # Inclus en local
└── js/
    ├── app.js                    # Bootstrap & navigation principale
    ├── data-loader.js            # Chargement JSON et validation de schéma
    ├── state.js                  # État global unique (filtres, moteurs actifs, onglet actif)
    ├── formatters.js             # Formatage des nombres, durées (ms), débits (t/s), mémoire (MB)
    ├── components/
    │   ├── status-badge.js       # Composant Web / Rendu des badges PASS, MISMATCH, TIMEOUT, ERROR
    │   ├── result-table.js       # Tableaux interactifs triables
    │   └── result-dialog.js      # Modale d'inspection de diff et de hachage SHA-256
    ├── charts/
    │   ├── loading-chart.js      # Courbe bi-axe temps x triplets x mémoire
    │   ├── throughput-chart.js   # Diagramme en barres horizontales du débit
    │   └── query-breakdown.js    # Barchart empilé TTFR vs Temps total
    └── pages/
        ├── overview.js
        ├── loading.js
        ├── bowlogna.js
        ├── bsbm.js
        ├── lubm.js
        ├── dbpedia.js
        ├── w3c.js
        └── transparency.js
```

---

## 5. Données de Test Mockées Clés en Main

Un fichier mock complet couvrant tous les cas (`PASS`, `MISMATCH`, `TIMEOUT`, `timeSeries`, métadonnées SED) est disponible directement dans :
`site/data/mock-report-v2.json`.

Abdessamad peut l'utiliser immédiatement pour développer et tester l'ensemble des 8 écrans sans attendre la fin du backend.
