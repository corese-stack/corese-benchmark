/**
 * Benchmark Dataset Descriptors
 * Standardized academic specifications for BSBM, LUBM, Bowlogna, and DBpedia.
 * Harmonized metadata: title, description, 4 core characteristics, and short citation.
 */

export const DATASET_DESCRIPTORS = {
	bsbm: {
		id: "bsbm",
		name: "Berlin SPARQL Benchmark (BSBM)",
		shortName: "BSBM",
		description:
			"Measures SPARQL query latency and RDF loading throughput over scalable synthetic e-commerce data describing products, offers, and consumer reviews.",
		characteristics: [
			{ label: "Queries", value: "12 adapted queries" },
			{ label: "Workload", value: "Product search · Review analysis" },
			{ label: "Dataset", value: "Synthetic e-commerce · Scalable" },
			{ label: "Focus", value: "Query latency · Loading throughput" },
		],
		shortCitation: "Bizer & Schultz (2009)",
		citation:
			"Bizer, C. & Schultz, A. (2009). The Berlin SPARQL Benchmark. Int. Journal on Semantic Web and Information Systems (IJSWIS), 5(2), 1-24.",
		paperUrl: "https://doi.org/10.4018/jswis.2009081901",
		officialUrl:
			"http://wbsg.informatik.uni-mannheim.de/bizer/berlinsparqlbenchmark/", // NOSONAR: Academic server without TLS
		githubUrl: "https://github.com/dice-group/bsbm",
		workloadProfile: {
			domain: "E-Commerce (products, offers, vendors, consumer reviews)",
			expressivity: "Pure SPARQL 1.0/1.1 (No ontology reasoning required)",
			stressFocus:
				"Multi-pattern graph joins, OPTIONAL clauses, UNION branches, numeric FILTERs, pagination",
			workloadType: "Synthetic transactional & consumer exploration",
		},
		implementationNotes:
			"12 adapted queries with frozen deterministic URIs, designed for repeatable single-JVM performance testing. Does not reproduce the randomized multi-client transaction mix of the original driver.",
		scaleFactorMeaning:
			"Product count multiplier (e.g. 1k, 50k, 500k products).",
		generatorCli: "./generate -pc 1000 -s nt -fn bsbm_small",
		namespaces: {
			bsbm: "http://www4.wiwiss.fu-berlin.de/bizer/bsbm/v01/vocabulary/", // NOSONAR: Normative RDF IRI
			"bsbm-inst": "http://www4.wiwiss.fu-berlin.de/bizer/bsbm/v01/instances/", // NOSONAR: Normative RDF IRI
			rdfs: "http://www.w3.org/2000/01/rdf-schema#", // NOSONAR: Normative RDF IRI
			rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", // NOSONAR: Normative RDF IRI
		},
		scales: [
			{
				name: "Small",
				param: "1,000 products",
				triples: "374,911",
				file: "bsbm_small.nt",
				tested: true,
			},
			{
				name: "Medium",
				param: "50,000 products",
				triples: "18,369,400",
				file: "bsbm_medium.nt",
				tested: false,
			},
			{
				name: "Large",
				param: "500,000 products",
				triples: "183,694,000",
				file: "bsbm_large.nt",
				tested: false,
			},
		],
		queryDescriptions: {
			query_1: {
				name: "Find Products by Features",
				desc: "Find products matching specific feature constraints and price range.",
				features: "Triple Pattern, FILTER, ORDER BY, LIMIT",
			},
			query_2: {
				name: "Product Details Retrieval",
				desc: "Retrieve basic attributes, label, and description for a given product.",
				features: "Basic Graph Pattern, OPTIONAL",
			},
			query_3: {
				name: "Filtered Features & Offset",
				desc: "Find products matching feature 1, excluding feature 2, ordered by label.",
				features: "FILTER (!bound), OPTIONAL, ORDER BY",
			},
			query_4: {
				name: "Multi-Product Comparison",
				desc: "Find products matching multiple conjunctional features with union fallbacks.",
				features: "UNION, FILTER, ORDER BY",
			},
			query_5: {
				name: "Cross-Product Feature Matching",
				desc: "Find other products sharing at least two features with a target product.",
				features: "Self-Join, FILTER inequality, DISTINCT",
			},
			query_6: {
				name: "String Search (Word Matching)",
				desc: "Find products whose label contains a target substring.",
				features: "REGEX / String Filter",
			},
			query_7: {
				name: "Product & Offers In Stock",
				desc: "Retrieve offers, vendor names, country, and price for in-stock items.",
				features: "OPTIONAL, Multi-Join, FILTER date",
			},
			query_8: {
				name: "Recent Reviews Retrieval",
				desc: "Fetch the 10 most recent reviews for a product with reviewer name and ratings.",
				features: "ORDER BY DESC, LIMIT, OPTIONAL",
			},
			query_9: {
				name: "Review Descriptors",
				desc: "Retrieve all descriptors and contextual comments for a given review.",
				features: "Single Subject Pattern, Graph Traversal",
			},
			query_10: {
				name: "Offers for Given Delivery Mode",
				desc: "Find vendor offers delivering within target timeframe sorted by USD price.",
				features: "Multi-Join, FILTER comparison, ORDER BY",
			},
			query_11: {
				name: "Product Cross-References",
				desc: "Traverse owl:sameAs and external entity links.",
				features: "Identity Links, Graph Traversal",
			},
			query_12: {
				name: "Export Product Data",
				desc: "Construct full RDF graph serialization for a given product and its offers.",
				features: "CONSTRUCT / Multi-Subject BGP",
			},
		},
		reproduceCli:
			'./gradlew run --args="--engine corese --dataset bsbm --file bsbm_small.nt --repetitions 3"',
	},

	lubm: {
		id: "lubm",
		name: "Lehigh University Benchmark (LUBM)",
		shortName: "LUBM",
		description:
			"Measures SPARQL query latency and RDF loading throughput over scalable synthetic university data modeled using the Univ-Bench ontology.",
		characteristics: [
			{ label: "Queries", value: "14 adapted queries" },
			{ label: "Dataset", value: "Synthetic university · Scalable" },
			{ label: "Focus", value: "Query latency · Loading throughput" },
			{ label: "Ontology", value: "Univ-Bench · OWL Lite" },
		],
		shortCitation: "Guo, Pan & Heflin (2005)",
		citation:
			"Guo, Y., Pan, Z., & Heflin, J. (2005). LUBM: A Benchmark for OWL Knowledge Base Systems. Journal of Web Semantics, 3(2-3), 158-182.",
		paperUrl: "https://doi.org/10.1016/j.websem.2005.06.005",
		officialUrl: "https://swat.cse.lehigh.edu/projects/lubm/",
		workloadProfile: {
			domain:
				"Higher Education & Academia (universities, departments, professors, students, publications)",
			expressivity:
				"Univ-Bench ontology (OWL Lite / SHIF(D)). Evaluated in pattern-matching mode (inference disabled by default)",
			stressFocus:
				"Class hierarchies, star & chain joins, query planning on scalable university topologies",
			workloadType: "Synthetic university evaluation (14 adapted queries)",
		},
		implementationNotes:
			"Executes 14 adapted queries based on the original LUBM suite. Runs in standard pattern-matching mode (the optional --inference flag for RDFS/OWL-RL reasoning is disabled by default in this report).",
		scaleFactorMeaning:
			"Number of universities generated (e.g. LUBM-1, LUBM-10, LUBM-50).",
		generatorCli:
			"java edu.lehigh.swat.bench.uba.Generator -univ 1 -onto http://swat.cse.lehigh.edu/onto/univ-bench.owl", // NOSONAR
		namespaces: {
			ub: "http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#", // NOSONAR: Normative RDF IRI
			rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", // NOSONAR: Normative RDF IRI
			rdfs: "http://www.w3.org/2000/01/rdf-schema#", // NOSONAR: Normative RDF IRI
		},
		scales: [
			{
				name: "LUBM-1",
				param: "1 university",
				triples: "100,573",
				file: "lubm_small.nt",
				tested: true,
			},
			{
				name: "LUBM-10",
				param: "10 universities",
				triples: "1,272,953",
				file: "lubm_medium.nt",
				tested: true,
			},
			{
				name: "LUBM-50",
				param: "50 universities",
				triples: "13,409,395",
				file: "lubm_large.nt",
				tested: true,
			},
		],
		queryDescriptions: {
			query_1: {
				name: "Graduate Student Course",
				desc: "Find graduate students taking a specific course (low selectivity).",
				features: "BGP, Single Class/Property",
			},
			query_2: {
				name: "Student University Affiliation",
				desc: "Triangle join between student, department, and university.",
				features: "Multi-Join, Cyclic Pattern",
			},
			query_3: {
				name: "Publications of Professor",
				desc: "Find all publications authored by a specific assistant professor.",
				features: "BGP with specific URI subject",
			},
			query_4: {
				name: "Faculty Contact Details",
				desc: "Retrieve name, email, and telephone for faculty members.",
				features: "Star Join (Single Subject, 4 Properties)",
			},
			query_5: {
				name: "Department Members",
				desc: "Find all members of a department (requires subClassOf inference: Person).",
				features: "Taxonomy / SubClass Inference",
			},
			query_6: {
				name: "All Students",
				desc: "Retrieve all students (subClassOf: UndergraduateStudent + GraduateStudent).",
				features: "High Cardinality, Class Hierarchy",
			},
			query_7: {
				name: "Student Course and Teacher",
				desc: "Find students and the course they take taught by a specific teacher.",
				features: "Join across Student, Course, and Faculty",
			},
			query_8: {
				name: "Student Email & Department",
				desc: "Find students enrolled in department with university affiliation and email.",
				features: "Deep Join, Projection",
			},
			query_9: {
				name: "Triangle Join (Student-Advisor-Course)",
				desc: "Find student taking course taught by their own advisor.",
				features: "Multi-Join Cycle (Student, Advisor, Course)",
			},
			query_10: {
				name: "Students in Graduate Course",
				desc: "Find students taking both GraduateCourse0 and GraduateCourse1.",
				features: "Shared Subject Conjunction",
			},
			query_11: {
				name: "Research Groups in University",
				desc: "Find research groups that are sub-organizations of a university.",
				features: "Transitive SubOrganization",
			},
			query_12: {
				name: "Department Chairs",
				desc: "Find department chairs worksFor department in university.",
				features: "Role specialization join",
			},
			query_13: {
				name: "Alumni of University",
				desc: "Find persons who have an alumnus relationship with university.",
				features: "Inverse / Symmetric Property",
			},
			query_14: {
				name: "Undergraduate Course Students",
				desc: "Find all students taking undergraduate course 0.",
				features: "Simple BGP",
			},
		},
		reproduceCli:
			'./gradlew run --args="--engine corese --dataset lubm --file lubm_small.nt --repetitions 3"',
	},

	bowlogna: {
		id: "bowlogna",
		name: "BowlognaBench (Bowlogna)",
		shortName: "Bowlogna",
		description:
			"Measures SPARQL 1.1 analytical query latency over synthetic academic data modeled on the European Bologna process.",
		characteristics: [
			{ label: "Queries", value: "17 analytical queries" },
			{ label: "Workload", value: "Aggregation · Temporal filtering" },
			{ label: "Dataset", value: "Synthetic university" },
			{ label: "Focus", value: "Analytical query latency" },
		],
		shortCitation: "Demartini et al. (2012)",
		citation:
			"Demartini, G., Enchev, I., Wylot, M., Gapany, J., & Cudré-Mauroux, P. (2012). BowlognaBench—Benchmarking RDF Analytics. In Data-Driven Process Discovery and Analysis (LNBIP 116), pp. 82–102.",
		paperUrl: "https://doi.org/10.1007/978-3-642-34044-4_5",
		officialUrl: "https://doi.org/10.1007/978-3-642-34044-4_5",
		workloadProfile: {
			domain:
				"University Bologna Reform (curricula, courses, evaluations, grades)",
			expressivity:
				"Light RDFS + SPARQL 1.1 Analytics (GROUP BY, HAVING, subqueries, aggregates)",
			stressFocus:
				"Analytical OLAP aggregations, multi-level join paths, nested subqueries, sorting",
			workloadType: "Synthetic analytical & decision-support OLAP (17 queries)",
		},
		implementationNotes:
			"Evaluates 17 SPARQL 1.1 analytical queries featuring intensive OLAP aggregations (COUNT, AVG, MAX, GROUP BY, HAVING) and nested subqueries on Bologna reform curriculum data.",
		scaleFactorMeaning:
			"Number of academic departments and faculties generated.",
		generatorCli: "./generate_bowlogna -dept 10",
		namespaces: {
			bb: "http://www.owl-ontologies.com/Ontology1324312315.owl#", // NOSONAR: Normative RDF IRI
			rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", // NOSONAR: Normative RDF IRI
			xsd: "http://www.w3.org/2001/XMLSchema#", // NOSONAR: Normative RDF IRI
		},
		scales: [
			{
				name: "Department 0",
				param: "1 faculty department",
				triples: "1,233,512",
				file: "Department0.nt",
				tested: true,
			},
			{
				name: "Department 1",
				param: "Faculty department 1",
				triples: "1,241,828",
				file: "Department1.nt",
				tested: true,
			},
			{
				name: "Department 2",
				param: "Faculty department 2",
				triples: "1,253,055",
				file: "Department2.nt",
				tested: true,
			},
		],
		queryDescriptions: {
			query_1: {
				name: "Master Theses Count",
				desc: "Count total master theses submitted.",
				features: "SPARQL 1.1 Aggregation: COUNT",
			},
			query_2: {
				name: "Master Theses with Distinction",
				desc: "Count master theses with distinction awarded.",
				features: "Join + COUNT",
			},
			query_3: {
				name: "Completed Bachelor Degrees",
				desc: "Find students who completed bachelor studies before current timestamp.",
				features: "FILTER dateTime < NOW()",
			},
			query_4: {
				name: "Master Enrollments",
				desc: "Count students enrolled for master studies prior to current date.",
				features: "FILTER dateTime comparison",
			},
			query_5: {
				name: "Student ECTS Credits Sum",
				desc: "Calculate total ECTS credits earned by a specific student across evaluations.",
				features: "SPARQL 1.1 Aggregation: SUM(?credits)",
			},
			query_6: {
				name: "Student Family Name Prefix",
				desc: "Find students whose family name begins with letter D.",
				features: "FILTER regex pattern matching",
			},
			query_7: {
				name: "2-Hop Student Neighbor Exploration",
				desc: "Retrieve 2-hop neighborhood properties for target student.",
				features: "Path traversal (?S ?P1 ?O1 . ?O1 ?P2 ?O2)",
			},
			query_8: {
				name: "Teaching Unit Failure Rates",
				desc: "Group by teaching unit and count failed evaluations (mark < 3).",
				features: "FILTER, GROUP BY, COUNT",
			},
			query_9: {
				name: "Evaluations per Teaching Unit",
				desc: "Count evaluations grouped by teaching unit.",
				features: "GROUP BY, COUNT(?E)",
			},
			query_10: {
				name: "Top Thesis Supervisor",
				desc: "Find professor supervising the highest number of theses.",
				features: "GROUP BY, ORDER BY DESC, LIMIT 1",
			},
			query_11: {
				name: "Top 5 Students by Average Mark",
				desc: "Compute average mark per student in study track and return top 5.",
				features: "AVG(?M), GROUP BY, ORDER BY DESC, LIMIT 5",
			},
		},
		reproduceCli:
			'./gradlew run --args="--engine corese --dataset bowlogna --file Department0.nt --repetitions 3"',
	},

	dbpedia: {
		id: "dbpedia",
		name: "DBpedia Knowledge Graph",
		shortName: "DBpedia",
		description:
			"Measures RDF loading time, throughput, and JVM heap delta using five selected N-Triples files from the Wikipedia-derived DBpedia 3.5.1 dataset.",
		characteristics: [
			{ label: "Workload", value: "Bulk RDF loading (5 files)" },
			{ label: "Dataset", value: "Real-world · Wikipedia-derived" },
			{ label: "Focus", value: "Loading throughput · JVM heap delta" },
			{ label: "Queries", value: "None (Ingestion benchmark)" },
		],
		shortCitation: "Auer et al. (2007)",
		citation:
			"Auer, S., Bizer, C., Kobilarov, G., Lehmann, J., Cyganiak, R., & Ives, Z. (2007). DBpedia: A Nucleus for a Web of Open Data. In The Semantic Web (ISWC 2007), pp. 722-735.",
		paperUrl: "https://doi.org/10.1007/978-3-540-76298-0_52",
		officialUrl: "https://www.dbpedia.org/",
		workloadProfile: {
			domain:
				"Encyclopedic General Knowledge (Wikipedia entity extracts, open web graph)",
			expressivity:
				"RDF/RDFS with light DBpedia OWL ontology; heterogeneous real-world vocabulary",
			stressFocus:
				"RDF parsing throughput, JVM heap footprint, streaming ingestion, multilingual literals",
			workloadType: "Real-world RDF ingestion & memory analysis",
		},
		implementationNotes:
			"Measures streaming RDF loading throughput (triples/s) and differential JVM heap footprint (before/after double GC) across 5 selected real-world Wikipedia slices. Not a standardized SPARQL query benchmark.",
		scaleFactorMeaning:
			"Dumps extracted by property subset (disambiguations, mappingbased properties, persondata, labels).",
		generatorCli: "curl -O https://downloads.dbpedia.org/3.5.1/en/...",
		namespaces: {
			dbo: "http://dbpedia.org/ontology/", // NOSONAR: Normative RDF IRI
			dbr: "http://dbpedia.org/resource/", // NOSONAR: Normative RDF IRI
			rdfs: "http://www.w3.org/2000/01/rdf-schema#", // NOSONAR: Normative RDF IRI
		},
		scales: [
			{
				name: "Persondata",
				param: "Biographical info",
				triples: "356,914",
				file: "persondata_en.nt",
				tested: true,
			},
			{
				name: "Category Labels",
				param: "Wikipedia categories",
				triples: "565,108",
				file: "category_labels_en.nt",
				tested: true,
			},
			{
				name: "Disambiguations",
				param: "Disambiguation links",
				triples: "765,124",
				file: "disambiguations_en.nt",
				tested: true,
			},
			{
				name: "Homepages",
				param: "External homepages",
				triples: "394,897",
				file: "homepages_en.nt",
				tested: true,
			},
			{
				name: "Specific Properties",
				param: "Mapping-based triples",
				triples: "182,530",
				file: "specific_mappingbased_properties_en.nt",
				tested: true,
			},
		],
		queryDescriptions: {},
		reproduceCli:
			'./gradlew run --args="--engine corese --dataset dbpedia --file persondata_en.nt --repetitions 3"',
	},
};
