# corese-benchmark — common workflow commands
# Usage: make <target>
# Requires: conda env 'benchmarkenv' active, or run `make env` first

PYTHON     := python
WORKFLOW   := python-utils/workflow.py
ENGINES    ?= corese.local,corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
DATASETS   ?= dbpedia
FORMATS    ?=
MODE       ?= all

# Predefined version sets
ALL_VERSIONS ?= corese.next,corese.4.6.5,jena.6.2.0,jena.6.1.0,rdf4j.6.1.0,rdf4j.5.3.2

.PHONY: help env regression compare next bowlogna lubm bsbm all versions dev corese-all quick site clean-out

help:
	@echo ""
	@echo "  make regression          Detect a Corese regression (local vs 4.6.5)"
	@echo "  make compare             Compare corese + jena + rdf4j on dbpedia"
	@echo "  make next                Benchmark corese.next vs corese.4.6.5"
	@echo "  make versions            Compare all configured engine versions"
	@echo "  make corese-all          corese.next + corese.4.6.5 sur tous les datasets"
	@echo "  make bowlogna            Bowlogna dataset with SPARQL queries (corese.local vs 4.6.5)"
	@echo "  make lubm                LUBM dataset with SPARQL queries"
	@echo "  make bsbm                BSBM dataset"
	@echo "  make all                 Run the selected DATASETS"
	@echo "  make quick               Quick run (1 rep instead of 3) — faster, less accurate"
	@echo "  make site                Serve the dashboard at http://localhost:8080"
	@echo "  make env                 Create conda environment"
	@echo "  make clean-out           Delete all generated reports in out/"
	@echo ""
	@echo "  Override engines:  make regression ENGINES=corese.local,corese.4.6.5"
	@echo "  Development: make dev FORMATS=nt MODE=load ENGINES=corese.local"
	@echo "  Override datasets: make all DATASETS=dbpedia,bowlogna"
	@echo ""

env:
	conda env create -f python-utils/environment.yml
	@echo "Run: conda activate benchmarkenv"

regression:
	$(PYTHON) $(WORKFLOW) --engines corese.local,corese.4.6.5 --datasets $(DATASETS) --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

compare:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets $(DATASETS) --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

next:
	$(PYTHON) $(WORKFLOW) --engines corese.next,corese.4.6.5,jena.6.2.0,rdf4j.6.1.0 --datasets dbpedia,bowlogna,bsbm,lubm --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

versions:
	$(PYTHON) $(WORKFLOW) --engines $(ALL_VERSIONS) --datasets $(DATASETS) --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

corese-all:
	$(PYTHON) $(WORKFLOW) --engines corese.next,corese.4.6.5 --datasets dbpedia,bowlogna,bsbm,lubm --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

quick:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets $(DATASETS) --quick --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

bowlogna:
	$(PYTHON) $(WORKFLOW) --engines corese.local,corese.4.6.5 --datasets bowlogna --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

lubm:
	$(PYTHON) $(WORKFLOW) --engines corese.local,corese.4.6.5 --datasets lubm --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

bsbm:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets bsbm --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

all:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets $(DATASETS) --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),)

site:
	@echo "Dashboard: http://localhost:8080"
	cd site && $(PYTHON) -m http.server 8080

clean-out:
	rm -rf out/json/*.json out/csv/*.csv
	@echo "Reports deleted."

dev:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets $(DATASETS) --mode $(MODE) $(if $(FORMATS),--formats $(FORMATS),) --reuse none --no-export
