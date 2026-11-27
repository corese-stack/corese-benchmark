# Corese SPARQL Feature Benchmark v1

15 multiline `SELECT` queries covering the 9 SPARQL 1.1 feature categories in `catalogue.json`.
Query file paths are relative to the catalogue directory; dataset paths are relative to the repository root.
All queries target Simple Entailment (`entailment: "none"`) under [W3C SPARQL 1.1](https://www.w3.org/TR/sparql11-query/), using standard RDF/RDFS/XSD IRIs and dataset namespaces (`ub`, `bsbm`, `foaf`, `dbp`) without `SERVICE`, engine extensions, `NOW()`, `RAND()`, or relative IRIs.

## Canonical Input Datasets

- **LUBM** (`Q01`, `Q04`, `Q05`): `input/lubm/unzip/lubm_small.nt` in the default graph.
- **BSBM & Topology** (`Q02`, `Q03`, `Q06`, `Q07`, `Q09`, `Q13`): `input/bsbm/unzip/bsbm_small.nt` in the default graph.
- **BowlognaBench** (`Q10`, `Q11`, `Q12`): `input/bowlogna/unzip/Department0.nt` in the default graph.
- **DBpedia 3.5.1** (`Q08`): `input/dbpedia/unzip/persondata_en.nt` in the default graph.
- **Named Graphs** (`Q14`, `Q15`): N-Quads file generated from LUBM with contexts preserved and an empty default graph:

```bash
python3 input/queries/v1/named-graphs/prepare_dataset.py \
  input/lubm/unzip/lubm_small.nt /tmp/corese-feature-lubm.nq
```

`prepare_dataset.py` requires the destination file to be absent and reads canonical N-Triples line by line.
Triples with predicates `ub:takesCourse` or `ub:teacherOf` are placed into `urn:corese:benchmark:v1:courses`; all other triples go into `urn:corese:benchmark:v1:people`.
Q14 joins across both named graphs and Q15 checks their triple and distinct subject cardinalities.

## Query Design Notes

- **BGP patterns** (`Q01`, `Q02`, `Q04`, `Q05`): selective stars (`Q01`, `Q02`), chain join (`Q04`), and student/advisor/course triangle (`Q05`).
- **Negation equivalence** (`Q03`, `Q09`): `MINUS` and `FILTER NOT EXISTS` sharing the same join variable `?product` and producing equal multisets.
- **Property paths** (`Q06`, `Q07`): strict transitive closure over `rdfs:subClassOf` (`Q06`) and bidirectional alternation (`Q07`).
- **Optional joins** (`Q08`): `foaf:Person`, `foaf:name`, `dbp:birth`, `dbp:death`, and `dbp:birthPlace` over DBpedia, with death date nested as optional inside birth place.
- **Aggregates & subqueries** (`Q10`, `Q11`): `COUNT`/`SUM` with `HAVING` (`Q10`) and an uncorrelated aggregated subquery joined on `?unit` (`Q11`).
- **Typed filters & casts** (`Q12`, `Q03`, `Q09`, `Q13`): Bowlogna dates (`xsd:string` `YYYY-MM-DD`) normalized via `CONCAT` and cast to `xsd:dateTime` (`Q12`), and BSBM `bsbm:USD` prices cast via `xsd:decimal(STR(?rawPrice))`.
- **Solution modifiers** (`Q13`): `DISTINCT`, deterministic `ORDER BY`, `LIMIT 20 OFFSET 20`; all other queries return full result multisets.

## Validation Contract

The benchmark harness (`SparqlResultHasher`) computes canonical SHA-256 multiset hashes preserving duplicates, datatypes, language tags, and unbound variables.
Results containing blank nodes are flagged as `INCONCLUSIVE` rather than compared by label; all v1 projections return IRIs or literals.
The static site mirror under `site/data/sparql/v1/` is synchronized from this directory via `site/scripts/export-sparql-catalogue.py`.
