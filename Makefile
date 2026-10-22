# corese-benchmark — common workflow commands
# Usage: make <target>
# Requires: conda env 'benchmarkenv' active, or run `make env` first

PYTHON     := python
WORKFLOW   := python-utils/workflow.py
ENGINES    ?= corese.local,corese.4.6.5,jena.6.2.0,rdf4j.5.3.2
DATASET    ?= dbpedia
DATASETS   ?= dbpedia,bowlogna,bsbm,lubm
SCALES     ?= small

# Predefined version sets
ALL_VERSIONS ?= corese.next,corese.4.6.5,jena.6.2.0,jena.6.1.0,rdf4j.5.3.2,rdf4j.5.3.1

.PHONY: help env regression compare next bowlogna lubm bsbm all versions versions-resume corese-all quick site clean-out

help:
	@echo ""
	@echo "  make regression          Detect a Corese regression (local vs 4.6.5)"
	@echo "  make compare             Compare corese + jena + rdf4j on dbpedia"
	@echo "  make next                Benchmark corese.next vs corese.4.6.5"
	@echo "  make versions            All versions: corese(next+3) + jena(3) + rdf4j(3)"
	@echo "  make versions-resume     Idem, reprend là où c'était arrêté"
	@echo "  make corese-all          corese.next + corese.4.6.5 sur tous les datasets"
	@echo "  make bowlogna            Bowlogna dataset with SPARQL queries (corese.local vs 4.6.5)"
	@echo "  make lubm                LUBM dataset with SPARQL queries"
	@echo "  make bsbm                BSBM dataset"
	@echo "  make all                 All datasets (dbpedia + bowlogna + bsbm + lubm) in one run"
	@echo "  make quick               Quick run (1 rep instead of 3) — faster, less accurate"
	@echo "  make site                Serve the dashboard at http://localhost:8080"
	@echo "  make env                 Create conda environment"
	@echo "  make clean-out           Delete all generated reports in out/"
	@echo ""
	@echo "  Override engines:  make regression ENGINES=corese.local,corese.4.6.5"
	@echo "  Override dataset:  make compare DATASET=bowlogna"
	@echo "  Override datasets: make all DATASETS=dbpedia,bowlogna"
	@echo "  Override scales:   make bowlogna SCALES=small,medium"
	@echo ""

env:
	conda env create -f python-utils/environment.yml
	@echo "Run: conda activate benchmarkenv"

regression:
	$(PYTHON) $(WORKFLOW) --engines corese.local,corese.4.6.5 --dataset $(DATASET)

compare:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --dataset $(DATASET)

next:
	$(PYTHON) $(WORKFLOW) --engines corese.next,corese.4.6.5,jena.6.2.0,rdf4j.5.3.2 --datasets dbpedia,bowlogna,bsbm,lubm --scales $(SCALES)

versions:
	$(PYTHON) $(WORKFLOW) --engines $(ALL_VERSIONS) --datasets $(DATASETS) --scales $(SCALES)

versions-resume:
	$(PYTHON) $(WORKFLOW) --engines $(ALL_VERSIONS) --datasets $(DATASETS) --scales $(SCALES) --resume

corese-all:
	$(PYTHON) $(WORKFLOW) --engines corese.next,corese.4.6.5 --datasets dbpedia,bowlogna,bsbm,lubm --scales $(SCALES)

quick:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets $(DATASETS) --scales $(SCALES) --quick

bowlogna:
	$(PYTHON) $(WORKFLOW) --engines corese.local,corese.4.6.5 --dataset bowlogna --scales $(SCALES)

lubm:
	$(PYTHON) $(WORKFLOW) --engines corese.local,corese.4.6.5 --dataset lubm --scales $(SCALES)

bsbm:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --dataset bsbm --scales $(SCALES)

all:
	$(PYTHON) $(WORKFLOW) --engines $(ENGINES) --datasets $(DATASETS) --scales $(SCALES)

site:
	@echo "Dashboard: http://localhost:8080"
	cd site && $(PYTHON) -m http.server 8080

clean-out:
	rm -rf out/json/*.json out/csv/*.csv
	@echo "Reports deleted."
