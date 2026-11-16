/**
 * Corese Benchmark Dashboard - Dataset Catalog & Presentation Card
 * Defines dataset provenance, ontology structure, scales, and renders
 * the retractable dataset disclosure card across views (RDF Loading, SPARQL Queries).
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

const datasetCardInstances = new WeakMap();

function cardElement(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function cardLink(label, href) {
	const link = cardElement("a", "", label);
	link.href = href;
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	return link;
}

function cardSection(title, modifier = "") {
	const section = cardElement("section", `dataset-card__section ${modifier}`.trim());
	section.append(cardElement("h3", "dataset-card__heading", title));
	return section;
}

function cardFact(list, label, value) {
	list.append(cardElement("dt", "", label), cardElement("dd", "", value));
}

function computeReportTriples(key, scale, allRuns) {
	if (!scale?.files?.length) return null;
	const targetNames = new Set(scale.files.map((f) => f.name.toLowerCase()));
	const fileTriples = new Map();

	const matchFileName = (file) => {
		const lower = file.toLowerCase();
		if (targetNames.has(lower)) return lower;
		const baseNt = lower.replace(/\.[^.]+$/, ".nt");
		return targetNames.has(baseNt) ? baseNt : null;
	};

	for (const r of allRuns) {
		if (r.dataset?.toLowerCase() !== key || !r.triples || !r.file) continue;
		const matched = matchFileName(r.file);
		if (matched && !fileTriples.has(matched)) {
			fileTriples.set(matched, r.triples);
		}
	}

	if (fileTriples.size === 0) return null;
	return Array.from(fileTriples.values()).reduce((a, b) => a + b, 0);
}

function renderDatasetLeftColumn(metadata, scale, measuredTriplesNumber) {
	const colLeft = cardElement("div", "dataset-card__col");

	const overview = cardSection("Dataset overview");
	overview.append(
		cardElement("p", "font-medium", metadata.fullName),
		cardElement("p", "text-muted", metadata.description)
	);
	colLeft.append(overview);

	const metrics = cardSection("Source input & files (N-Triples)");
	if (scale) {
		const metricFacts = cardElement("dl", "dataset-card__facts");
		cardFact(metricFacts, "Configuration", scale.parameter);
		if (measuredTriplesNumber) {
			cardFact(metricFacts, "Reported triples", `${measuredTriplesNumber.toLocaleString()} (active report)`);
			if (scale.triples) {
				cardFact(metricFacts, "Estimated triples", `${scale.triples} (nominal)`);
			}
		} else {
			cardFact(metricFacts, "Estimated triples", scale.triples);
		}
		cardFact(metricFacts, "Input files", `${scale.files.length} file${scale.files.length > 1 ? "s" : ""} · N-Triples`);
		metrics.append(metricFacts);

		const filesList = cardElement("div", "dataset-card__files");
		for (const file of scale.files) {
			const item = cardElement("div", "dataset-card__file-item");
			item.append(cardElement("code", "", file.name), cardElement("span", "", file.description));
			filesList.append(item);
		}
		metrics.append(filesList);
	} else {
		metrics.append(cardElement("p", "", "No metadata defined for this scale."));
	}
	colLeft.append(metrics);
	return colLeft;
}

function renderDatasetRightColumn(metadata) {
	const colRight = cardElement("div", "dataset-card__col");

	const structure = cardSection("Structure & benchmark context");
	const facts = cardElement("dl", "dataset-card__facts");
	cardFact(facts, "Vocabulary", metadata.structure.schema);
	cardFact(facts, "Query patterns", metadata.structure.queryPattern);
	cardFact(facts, "Data model", metadata.structure.distribution);
	structure.append(facts);
	colRight.append(structure);

	const provenance = cardSection("Provenance & citations");
	const academic = metadata.academic;
	provenance.append(
		cardElement("h4", "dataset-card__subheading", "Academic citation"),
		cardElement("p", "font-medium", academic.title),
		cardElement("p", "text-muted", `${academic.authors} (${academic.year}) — ${academic.journal || ""}`)
	);

	const refParagraph = cardElement("p");
	if (academic.doi) {
		refParagraph.append(cardLink(`DOI: ${academic.doi} ↗`, `https://doi.org/${academic.doi}`));
	} else if (academic.url) {
		refParagraph.append(cardLink("Author manuscript PDF ↗", academic.url));
	}
	provenance.append(refParagraph);

	provenance.append(cardElement("h4", "dataset-card__subheading", "Artifact & project sources"));
	const linksBox = cardElement("div", "flex flex-wrap gap-2");
	if (metadata.artifact.url) {
		linksBox.append(cardLink(`${metadata.artifact.label} ↗`, metadata.artifact.url));
	}
	if (metadata.artifact.downloadUrl) {
		linksBox.append(document.createTextNode(" · "));
		linksBox.append(cardLink(`${metadata.artifact.downloadLabel || "Download archive"} ↗`, metadata.artifact.downloadUrl));
	}
	provenance.append(linksBox);
	if (metadata.artifact.note) {
		provenance.append(cardElement("p", "dataset-card__note", metadata.artifact.note));
	}
	colRight.append(provenance);
	return colRight;
}

function renderDatasetPipeline(metadata, reportData) {
	const preparation = cardSection("Data acquisition & format derivation", "dataset-card__section--full");
	preparation.append(
		cardElement("p", "", metadata.preparation),
		cardElement(
			"p",
			"dataset-card__note",
			"The source dataset is acquired or generated into input/, then converted canonically across all 7 W3C formats ahead of measurement. Existing files are reused."
		)
	);

	const scriptNote = cardElement("p", "dataset-card__note flex items-center gap-2");
	const repoRef = reportData?.metadata?.gitCommit || "main";
	const ghScriptLink = cardLink(
		`${metadata.artifact.script} ↗`,
		`https://github.com/corese-stack/corese-benchmark/blob/${repoRef}/${metadata.artifact.script}`
	);
	scriptNote.append(document.createTextNode("Preparation handler: "), ghScriptLink);
	preparation.append(scriptNote);
	return preparation;
}

/**
 * Render into a dedicated host element.
 * Reuse the same state object across calls to retain disclosure state.
 * Returns the <details> element, or null for an unknown dataset.
 */
export function renderDatasetCard(state, container, reportData = null) {
	const key = String(state.dataset ?? "").trim().toLowerCase();
	const metadata = Object.hasOwn(DATASET_METADATA, key) ? DATASET_METADATA[key] : null;

	if (!metadata) {
		container.replaceChildren();
		container.hidden = true;
		return null;
	}

	container.hidden = false;

	let instance = datasetCardInstances.get(state);
	if (!instance) {
		const details = cardElement("details", "dataset-card");
		const summary = cardElement("summary", "dataset-card__summary");
		const title = cardElement("span", "dataset-card__title");
		const context = cardElement("span", "dataset-card__context");
		const chevron = cardElement("span", "dataset-card__chevron", "▾");
		chevron.setAttribute("aria-hidden", "true");
		const body = cardElement("div", "dataset-card__body");

		summary.append(title, context, chevron);
		details.append(summary, body);
		instance = { details, title, context, body, signature: null };
		datasetCardInstances.set(state, instance);
	}

	const { details, title, context, body } = instance;
	const scaleKey = Object.hasOwn(metadata.scales, "default")
		? "default"
		: String(state.scale ?? "").trim().toLowerCase();
	const scale = Object.hasOwn(metadata.scales, scaleKey) ? metadata.scales[scaleKey] : null;
	const reportId = reportData?.metadata?.gitCommit || reportData?.metadata?.timestamp || "default";
	const signature = `${key}:${scaleKey}:${reportId}`;

	if (details.parentNode !== container) container.replaceChildren(details);
	if (instance.signature === signature) return details;
	instance.signature = signature;

	const allRuns = reportData?.loadingRuns || [];
	const measuredTriplesNumber = computeReportTriples(key, scale, allRuns);
	let measuredTriplesLabel = measuredTriplesNumber ? `${measuredTriplesNumber.toLocaleString()} source triples` : null;

	if (!measuredTriplesLabel && scale?.triples) {
		measuredTriplesLabel = `${scale.triples} triples`;
	}

	title.textContent = metadata.name;
	const contextParts = [metadata.kind];
	if (scale?.parameter) contextParts.push(scale.parameter);
	if (measuredTriplesLabel) contextParts.push(measuredTriplesLabel);
	context.textContent = contextParts.join(" · ");

	const colLeft = renderDatasetLeftColumn(metadata, scale, measuredTriplesNumber);
	const colRight = renderDatasetRightColumn(metadata);
	const preparation = renderDatasetPipeline(metadata, reportData);

	body.replaceChildren(colLeft, colRight, preparation);
	return details;
}
