# Spécification Technique : Optimisation CI, Détection Automatique des Releases & Rigueur Scientifique

Ce document formalise les décisions d'architecture et les spécifications techniques pour l'évolution du banc de test `corese-benchmark`, à convertir en tickets / issues pour Abdesamad Abdoun.

## 1. Contexte & Diagnostic de Performance

L'analyse chronométrée du workflow complet `benchmark-node` (octobre 2026, 53 minutes au total) a révélé que 99 % du temps est consommé par l'exécution redondante de moteurs figés :

- Corese 4.6.5 sur Bowlogna : ~39 minutes (dont 29 min 25s d'ingestion liée à l'ancien parseur mono-thread et 9 min de requêtes).
- Apache Jena 6.2.0 : ~5 min 38s.
- Eclipse RDF4J 5.3.2 : ~3 min 11s.
- DBpedia (ensemble des moteurs) : ~5 minutes.

Les versions officielles publiées sur Maven (Jena 6.2.0, RDF4J 5.3.2, Corese 4.6.5) étant strictement immuables, recalculer leurs scores à chaque commit de développement sur `main` constitue un gaspillage de ressources sans valeur ajoutée scientifique.

## 2. Principes Fondamentaux & Rigueur Scientifique

### Principe d'Isolation Absolue (Zéro Parallélisation Inter-Moteurs sur la Même Machine)

Pour garantir la reproductibilité et la comparabilité scientifique des mesures de recherche (Wimmics / Inria / ISWC) :

- Les moteurs ne doivent **jamais** s'exécuter en parallèle sur la même machine.
- La parallélisation entraîne une compétition destructrice sur le bus mémoire (contention RAM), une pollution des lignes du cache processeur L3 (*cache thrashing*), et des perturbations dues aux pauses du Garbage Collector (GC) concurrent.
- Chaque moteur doit disposer de 100 % des ressources de la machine lors de sa mesure.

### Découplage CI Rapide vs Run de Référence Officiel

- En journée sur chaque commit (`push` sur `main`) : objectif de feedback rapide (~5 minutes) en mesurant uniquement `corese.next` et en le comparant à la baseline.
- Périodiquement (nuit/weekend) : run de contrôle complet pour surveiller la stabilité matérielle.

## 3. Feuilles de Route & Spécification des Futures Issues

### Issue A : Découplage Baseline & Exécution Rapide CI (`corese.next` uniquement)

**Objectif** : Faire passer le temps de CI de 53 minutes à moins de 6 minutes par commit.

- Extraire les résultats des moteurs stables (Corese 4.6.5, Jena 6.2.0, RDF4J 5.3.2) dans un fichier de référence versionné `site/data/baseline.json`.
- Dans le workflow `benchmark-node` de `.github/workflows/ci.yml`, exécuter uniquement le moteur en développement (`corese.next`).
- Dans `python-utils/workflow.py`, fusionner automatiquement la baseline avec les nouveaux résultats de `corese.next` lors de la génération du rapport final `site/data/benchmark-report.json`.
- Conserver l'option CLI `--force-all-engines` pour forcer le recalcul complet lorsque nécessaire.

### Issue B : Déclenchement Automatique lors d'une Nouvelle Release Corese

**Objectif** : Intégrer et benchmarker toute nouvelle version officielle sans intervention manuelle.

- Mettre en place un déclencheur GitHub Actions `repository_dispatch` (ou webhook de release) écoutant les publications du dépôt `corese-stack/corese-core`.
- À chaque nouvelle release (ex. `v5.0.0` ou `v4.6.6`) :
  - Déclencher automatiquement le job de benchmark avec la version ciblée.
  - Enregistrer définitivement les résultats dans l'historique `site/data/history/`.
  - Mettre à jour automatiquement le portail comparatif GitHub Pages.

### Issue C : Run Hebdomadaire Programmé & Détection de Dérive Matérielle (*Drift Control*)

**Objectif** : Garantir la reproductibilité scientifique et la stabilité de l'infrastructure SED.

- Configurer un cron GitHub Actions hebdomadaire (par exemple le dimanche à 02h00 UTC).
- Exécuter l'intégralité des moteurs (Jena, RDF4J, Corese 4.x, Corese 5.x) dans des conditions isolées.
- Vérifier que les résultats des versions stables restent dans un intervalle de confiance strict ($\pm 2 \%$) pour valider l'absence de dérive matérielle de l'hyperviseur OpenStack.
- Réaligner les baselines lors des montées de version du système ou du runtime OpenJDK.
