/**
 * Corese Benchmark Dashboard - Dataset Catalog
 * Defines dataset provenance, ontology structure, and scales.
 */

const scaledFile = (dataset, scale, parameter, triples) => ({
	parameter,
	triples,
	files: [
		{
			name: `${dataset}_${scale}.nt`,
			description: "Generated input",
		},
	],
});

const bowlognaScale = (departments, triples) => ({
	parameter: `${departments} department${departments === 1 ? "" : "s"}`,
	triples,
	files: Array.from({ length: departments }, (_, index) => ({
		name: `Department${index}.nt`,
		description: "Department component",
	})),
});

export const DATASET_METADATA = {
	bsbm: {
		name: "BSBM",
		fullName: "Berlin SPARQL Benchmark",
		kind: "Synthetic · e-commerce",
		description: "Products, offers, vendors, producers, reviews, and product features.",
		academic: {
			title: "The Berlin SPARQL Benchmark",
			authors: "Christian Bizer, Andreas Schultz",
			year: 2009,
			journal: "International Journal on Semantic Web and Information Systems (IJSWIS)",
			doi: "10.4018/jswis.2009040101",
		},
		artifact: {
			label: "bsbmtools project homepage",
			url: "https://wbsg.informatik.uni-mannheim.de/bizer/berlinsparqlbenchmark/",
			downloadLabel: "bsbmtools archive",
			downloadUrl: "https://sourceforge.net/projects/bsbmtools/files/latest/download",
			note: "The preparation script expects bsbmtools-0.2. The download URL resolves to latest and is not version-pinned.",
			script: "python-utils/datasets/bsbm.py",
		},
		structure: {
			schema: "BSBM vocabulary for e-commerce products, vendors, and reviews.",
			queryPattern: "Product-centered star joins, connecting offers, vendors, and reviews.",
			distribution: "Synthetic data scaled by product-count parameter.",
		},
		preparation:
			"Downloads the BSBM Java generator and produces the source dataset in N-Triples. Multi-format variants (.ttl, .trig, .nq, .rdf, .jsonld) are then canonically derived ahead of measurement using Apache Jena RIOT (./gradlew convertDatasets) so all engines ingest identical files.",
		scales: {
			small: scaledFile("bsbm", "small", "1,000 products", "≈350,000"),
			medium: scaledFile("bsbm", "medium", "5,000 products", "≈1.7 million"),
			large: scaledFile("bsbm", "large", "30,000 products", "≈10.5 million"),
		},
	},

	lubm: {
		name: "LUBM",
		fullName: "Lehigh University Benchmark",
		kind: "Synthetic · universities",
		description: "Universities, departments, faculty, students, courses, and publications.",
		academic: {
			title: "LUBM: A Benchmark for OWL Knowledge Base Systems",
			authors: "Yuanbo Guo, Zhengxiang Pan, Jeff Heflin",
			year: 2005,
			journal: "Journal of Web Semantics",
			doi: "10.1016/j.websem.2005.06.005",
		},
		artifact: {
			label: "Lehigh UBA project homepage",
			url: "https://swat.cse.lehigh.edu/projects/lubm/",
			downloadLabel: "Lehigh UBA 1.7 generator",
			downloadUrl: "https://swat.cse.lehigh.edu/projects/lubm/uba1.7.zip",
			note: "Generated locally with university index 0 and random seed 0.",
			script: "python-utils/datasets/lubm.py",
		},
		structure: {
			schema: "Univ-Bench OWL ontology for universities and academic departments.",
			queryPattern: "Conjunctive university queries combining hierarchical paths and star joins.",
			distribution: "Repeatable synthetic generation parameterized by university count and seed.",
		},
		preparation:
			"Downloads UBA 1.7, runs edu.lehigh.swat.bench.uba.Generator, parses RDF/XML with rdflib, and serializes canonical N-Triples. Multi-format variants are derived via Apache Jena RIOT (./gradlew convertDatasets).",
		scales: {
			small: scaledFile("lubm", "small", "1 university", "≈100,000"),
			medium: scaledFile("lubm", "medium", "10 universities", "≈1 million"),
			large: scaledFile("lubm", "large", "100 universities", "≈10 million"),
		},
	},

	dbpedia: {
		name: "DBpedia 3.5.1",
		fullName: "DBpedia 3.5.1 · English component sample",
		kind: "Extracted · Wikipedia",
		description:
			"Five selected English dump components extracted from Wikipedia. Real-world sample, not the full knowledge graph.",
		academic: {
			title: "DBpedia: A Nucleus for a Web of Open Data",
			authors: "Sören Auer, Christian Bizer, Georgi Kobilarov, Jens Lehmann, Richard Cyganiak, Zachary Ives",
			year: 2007,
			journal: "6th International Semantic Web Conference (ISWC)",
			doi: "10.1007/978-3-540-76298-0_52",
		},
		artifact: {
			label: "DBpedia extraction framework",
			url: "https://github.com/dbpedia/extraction-framework",
			downloadLabel: "SLICES / P16 dump mirror",
			downloadUrl: "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/",
			note: "The academic reference describes DBpedia; the mirror provides the 3.5.1 dump components.",
			script: "python-utils/datasets/dbpedia.py",
		},
		structure: {
			schema: "DBpedia ontology and component properties extracted from English Wikipedia.",
			queryPattern: "Heterogeneous graph joins across categories, homepages, disambiguations, and mapping properties.",
			distribution: "Real-world Wikipedia distributions across heterogeneous predicate counts.",
		},
		preparation:
			"Downloads named .nt.bz2 components from the SLICES mirror and decompresses to input/dbpedia/unzip. Multi-format variants are derived via Apache Jena RIOT (./gradlew convertDatasets).",
		scales: {
			default: {
				parameter: "5 separate components · no scale tiers",
				triples: "2,264,348 summed baseline triples",
				files: [
					{
						name: "category_labels_en.nt",
						description: "Category labels · 565,108 baseline triples",
					},
					{
						name: "disambiguations_en.nt",
						description: "Disambiguation links · 765,124 baseline triples",
					},
					{
						name: "homepages_en.nt",
						description: "Homepage links · 394,590 baseline triples",
					},
					{
						name: "persondata_en.nt",
						description: "Person data · 356,996 baseline triples",
					},
					{
						name: "specific_mappingbased_properties_en.nt",
						description: "Mapping-based properties · 182,530 baseline triples",
					},
				],
			},
		},
	},

	bowlogna: {
		name: "Bowlogna",
		fullName: "BowlognaBench",
		kind: "Synthetic · higher education",
		description: "University and student relationships designed for analytical queries and Bologna process aggregation.",
		academic: {
			title: "BowlognaBench—Benchmarking RDF Analytics",
			authors: "Gianluca Demartini, Iliya Enchev, Marcin Wylot, Joël Gapany, Philippe Cudré-Mauroux",
			year: 2011,
			journal: "International Symposium on Data-Driven Process Discovery and Analysis (SIMPDA)",
			doi: null,
			url: "https://exascale.info/assets/pdf/BowlognaBenchSIMPDA2011.pdf",
		},
		artifact: {
			label: "eXascale Infolab Bowlogna project",
			url: "https://exascale.info/research/bowlognabench/",
			downloadLabel: "DICE Research / HOBBIT dump",
			downloadUrl: "https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip",
			note: "Consumes the pre-generated HOBBIT benchmark dump.",
			script: "python-utils/datasets/bowlogna.py",
		},
		structure: {
			schema: "University domain vocabulary (Bologna process curriculum model).",
			queryPattern: "Complex analytical queries with multi-level joins and heavy SPARQL aggregates.",
			distribution: "Synthetic partitioned dataset across Department0.nt to Department9.nt.",
		},
		preparation:
			"Downloads bowlogna-dump.zip and extracts the requested Department*.nt files.",
		scales: {
			small: bowlognaScale(1, "≈1.2 million across 1 file"),
			medium: bowlognaScale(5, "≈6 million across 5 files"),
			large: bowlognaScale(10, "≈12 million across 10 files"),
		},
	},
};
