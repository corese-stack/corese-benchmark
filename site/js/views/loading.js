/**
 * Corese Benchmark Dashboard - RDF Loading View (Issue #30 & #37)
 * Evaluates ingestion throughput and memory density across engines (.nt, .ttl, .nq, .trig)
 * Fully aligned with Engine Selector standards: palette, glyphs, order, and cross-highlighting.
 */

import { escapeHtml, formatEngineId, isBranchVersion, parseEngineId } from "../engine-id.js";
import {
	getEngineStyle,
	renderEngineIndicatorSvg,
} from "../engines.js";
import { focusStore, hoverSource } from "../focus-store.js";

const ALL_FORMATS = ["nt", "ttl", "nq", "trig", "rdf", "jsonld", "html"];
const DEFAULT_BASELINE = "corese.4.6.5";
const NEXT_ENGINE = "corese.next";

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

// Keyed by the persistent LoadingView state object, not its rebuilt container.
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

	// Extract measured triple count from actual report runs if available
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


export class LoadingView {
	#root = null;
	#data = null;
	#activeEngines = [];
	#abortController = null;
	#charts = new Map();
	#canvasHover = hoverSource();
	#legendHover = hoverSource();
	#tableHover = hoverSource();
	#state = {
		dataset: "bsbm",
		scale: "small",
		formats: new Set(ALL_FORMATS),
	};

	constructor(container, reportData, activeEngines) {
		this.#root = container;
		this.#data = reportData;
		this.#activeEngines = activeEngines || [];
	}

	updateActiveEngines(engines) {
		this.#activeEngines = engines || [];
		this.render();
	}

	destroy() {
		this.#canvasHover.clear();
		this.#legendHover.clear();
		this.#tableHover.clear();
		if (this.#abortController) {
			this.#abortController.abort();
			this.#abortController = null;
		}
		this.#destroyCharts();
		if (this.#root) {
			this.#root.replaceChildren();
		}
	}

	#destroyCharts() {
		this.#charts.forEach((chart) => {
			try {
				chart.destroy();
			} catch (_) {}
		});
		this.#charts.clear();
	}

	mount() {
		this.destroy();
		this.#abortController = new AbortController();
		const { signal } = this.#abortController;

		// Listen for theme changes to update Chart.js colors
		window.addEventListener(
			"theme-changed",
			() => {
				this.render();
			},
			{ signal }
		);

		// Global Escape key to unpin sticky selection
		window.addEventListener(
			"keydown",
			(e) => {
				if (e.key === "Escape") {
					focusStore.clear();
				}
			},
			{ signal }
		);

		// Listen to unified FocusStore changes (Single Source of Truth)
		focusStore.addEventListener(
			"focus-changed",
			() => {
				this.#syncFocusVisuals();
			},
			{ signal }
		);

		this.render();
	}

	#syncFocusVisuals() {
		const focus = focusStore.effectiveFocus;
		const raw = focusStore.state;
		const isPinned = Boolean(raw.pinned);

		// Dynamic contextual badge: show "Pinned · Esc to reset" only when a selection is pinned
		const badges = this.#root?.querySelectorAll(".badge-pinned");
		badges?.forEach((b) => {
			b.style.display = isPinned ? "inline-flex" : "none";
		});

		// 1. Update Table rows and tbody container
		const tbody = this.#root?.querySelector(".data-table tbody");
		if (tbody) {
			tbody.classList.toggle("has-focus", Boolean(focus));
			const rows = tbody.querySelectorAll("tr[data-measure-key]");
			rows.forEach((tr) => {
				const mKey = tr.dataset.measureKey;
				const eKey = tr.dataset.engineKey;

				let isMatch = false;
				if (focus) {
					if (focus.target.kind === "engine") {
						isMatch = eKey === focus.target.key;
					} else if (focus.target.kind === "measure") {
						isMatch = mKey === focus.target.key;
					}
				}

				const isPinned = Boolean(
					raw.pinned &&
					((raw.pinned.kind === "measure" && mKey === raw.pinned.key) ||
					 (raw.pinned.kind === "engine" && eKey === raw.pinned.key))
				);

				tr.classList.toggle("is-row-highlighted", isMatch);
				tr.classList.toggle("is-row-pinned", isPinned);
			});
		}

		// 2. Snappy single-draw update for Chart.js bar alphas
		this.#syncChartDimming();
	}

	#syncChartDimming() {
		const chart = this.#charts.get("summary") || (window.Chart !== undefined ? window.Chart.getChart("loading-summary-chart") : null);
		if (!chart) return;

		const focus = focusStore.effectiveFocus;
		const activeFormats = chart._activeFormats || ALL_FORMATS.filter((f) => this.#state.formats.has(f));

		chart.data.datasets.forEach((ds) => {
			const eKey = ds._engineKey;
			const baseColor = ds._baseColor || ds.backgroundColor;

			// If no focus, restore solid base color
			if (!focus) {
				ds.backgroundColor = baseColor;
				return;
			}

			// Parse base color to RGB components for alpha blending
			let r = 0, g = 0, b = 0;
			if (typeof baseColor === "string" && baseColor.startsWith("#")) {
				const hex = baseColor.replace("#", "");
				if (hex.length === 6) {
					r = Number.parseInt(hex.substring(0, 2), 16);
					g = Number.parseInt(hex.substring(2, 4), 16);
					b = Number.parseInt(hex.substring(4, 6), 16);
				}
			}

			const toRgba = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

			if (focus.target.kind === "engine") {
				const isEngineMatch = eKey === focus.target.key;
				ds.backgroundColor = isEngineMatch ? baseColor : toRgba(0.22);
			} else if (focus.target.kind === "measure") {
				const [targetEng, targetFmt] = focus.target.key.split("|");
				const colors = activeFormats.map((fmt) => {
					const isExactBar = eKey === targetEng && fmt === targetFmt;
					return isExactBar ? baseColor : toRgba(0.22);
				});
				ds.backgroundColor = colors;
			}
		});

		chart.update();
	}

	render() {
		if (!this.#root) return;
		this.#destroyCharts();
		this.#root.replaceChildren();

		const section = document.createElement("div");
		section.className = "loading-view-container";

		// 1. Controls Header (Dataset, Scale, Multi-Select Format Pills)
		section.appendChild(this.#renderControls());

		// 1.1 Scientific Dataset Presentation Card (Progressive Disclosure)
		const datasetCardHost = document.createElement("div");
		datasetCardHost.className = "dataset-card-host";
		renderDatasetCard(this.#state, datasetCardHost, this.#data);
		section.appendChild(datasetCardHost);

		// 2. Reproducibility Protocol Tile
		section.appendChild(this.#renderProtocolTile());

		// Filter runs by dataset, scale AND format uniformly
		const allLoadingRuns = this.#data?.loadingRuns || [];
		const datasetFilteredRows = allLoadingRuns.filter((r) => {
			const matchDs = r.dataset?.toLowerCase() === this.#state.dataset.toLowerCase();
			const matchScale = this.#matchScale(r.file, this.#state.scale);
			const fmt = r.format || r.file?.split(".").pop();
			const matchFormat = this.#state.formats.has(fmt);
			return matchDs && matchScale && matchFormat;
		});

		// Order engines strictly following the active engine chips toolbar order
		const catalog = this.#data?.enginesCatalog || [];
		const orderedEngineConfigs = this.#resolveOrderedEngines(datasetFilteredRows, catalog);

		// Filter strictly to engines selected in the toolbar for table and chart
		const activeEngineKeys = new Set(orderedEngineConfigs.map((e) => e.key));
		const activeEngineLabels = new Set(orderedEngineConfigs.map((e) => e.label));

		const strictlyFilteredRows = datasetFilteredRows.filter((r) => {
			if (!activeEngineKeys.size) return true;
			return activeEngineLabels.has(r.engine) || activeEngineKeys.has(r.engine);
		});

		// 3. Multi-Format Summary Chart (Grouped Barchart across active formats & selected engines)
		section.appendChild(this.#renderSummaryChart(strictlyFilteredRows, orderedEngineConfigs, catalog));

		// 4. Detailed Data Table (grouped by format with throughput podium)
		section.appendChild(this.#renderTable(strictlyFilteredRows, orderedEngineConfigs, catalog));

		this.#root.appendChild(section);

		// Render Chart.js instance after DOM mounting
		this.#initSummaryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);

		// Synchronize current focus visuals on fresh render
		this.#syncFocusVisuals();
	}

	#resolveOrderedEngines(rows, catalog) {
		if (this.#activeEngines && this.#activeEngines.length > 0) {
			return this.#activeEngines.map((e) => {
				const key = formatEngineId(e);
				const style = getEngineStyle(e, catalog);
				const eng = catalog?.find?.((item) => item.id === e.engineId);
				const isNext = isBranchVersion(e.versionId);
				const versionLabel = isNext ? `${e.versionId} (dev)` : e.versionId;
				const engineName = eng?.shortName || eng?.name || e.engineId;
				const storageLabel = (e.storageId === "in-memory" ? "MEM" : e.storageId || "MEM").toUpperCase();
				const fullLabel = `${engineName} ${versionLabel} [${storageLabel}]`;
				return {
					key,
					engineId: e.engineId,
					versionId: e.versionId,
					storageId: e.storageId,
					storageLabel,
					label: fullLabel,
					style,
				};
			});
		}

		const distinctRawEngines = Array.from(new Set(rows.map((r) => r.engine)));
		const priorityList = ["corese.next", "corese.4.6.5", "jena.6.2.0", "rdf4j.5.3.2"];
		const sorted = [...distinctRawEngines].sort((a, b) => {
			const idxA = priorityList.indexOf(a);
			const idxB = priorityList.indexOf(b);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.localeCompare(b);
		});

		return sorted.slice(0, 4).map((raw) => {
			const parsed = parseEngineId(raw);
			const key = formatEngineId(parsed);
			const style = getEngineStyle(parsed, catalog);
			const eng = catalog?.find?.((item) => item.id === parsed.engineId);
			const isNext = isBranchVersion(parsed.versionId);
			const versionLabel = isNext ? `${parsed.versionId} (dev)` : parsed.versionId;
			const engineName = eng?.shortName || eng?.name || parsed.engineId;
			const storageLabel = (parsed.storageId === "in-memory" ? "MEM" : parsed.storageId || "MEM").toUpperCase();
			const fullLabel = `${engineName} ${versionLabel} [${storageLabel}]`;
			return {
				key,
				engineId: parsed.engineId,
				versionId: parsed.versionId,
				storageId: parsed.storageId,
				storageLabel,
				label: fullLabel,
				style,
			};
		});
	}

	#matchScale(fileName, scale) {
		if (!fileName) return true;
		const lower = fileName.toLowerCase();
		if (scale === "small") {
			return lower.includes("small") || (!lower.includes("large") && !lower.includes("medium"));
		}
		if (scale === "medium") return lower.includes("medium");
		if (scale === "large") return lower.includes("large");
		return true;
	}

	#renderControls() {
		const bar = document.createElement("div");
		bar.className = "view-controls";
		bar.style.display = "flex";
		bar.style.flexWrap = "wrap";
		bar.style.gap = "16px";
		bar.style.alignItems = "center";
		bar.style.justifyContent = "space-between";
		bar.style.marginBottom = "16px";
		bar.style.padding = "14px 18px";
		bar.style.background = "var(--bg)";
		bar.style.border = "1px solid var(--border)";
		bar.style.borderRadius = "8px";

		const leftGroup = document.createElement("div");
		leftGroup.style.display = "flex";
		leftGroup.style.flexWrap = "wrap";
		leftGroup.style.gap = "16px";
		leftGroup.style.alignItems = "center";

		// Dynamic discovery of available datasets from report runs
		const allRuns = this.#data?.loadingRuns || [];
		const discoveredDatasets = [...new Set(allRuns.map((r) => r.dataset?.toLowerCase()).filter(Boolean))];
		const availableDatasets = discoveredDatasets.length > 0 ? discoveredDatasets : ["bsbm", "lubm", "dbpedia", "bowlogna"];

		// Ensure current dataset is valid
		if (!availableDatasets.includes(this.#state.dataset.toLowerCase())) {
			this.#state.dataset = availableDatasets[0];
		}

		// Dataset Segmented Control
		const dsWrap = document.createElement("div");
		dsWrap.style.display = "flex";
		dsWrap.style.alignItems = "center";
		dsWrap.style.gap = "8px";

		const dsLabel = document.createElement("span");
		dsLabel.className = "text-xs text-muted font-medium";
		dsLabel.textContent = "DATASET:";
		dsWrap.appendChild(dsLabel);

		const dsGroup = document.createElement("div");
		dsGroup.className = "segmented-control";

		availableDatasets.forEach((ds) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = `segmented-control__btn ${this.#state.dataset.toLowerCase() === ds ? "is-active" : ""}`;
			btn.textContent = ds.toUpperCase();
			btn.addEventListener("click", () => {
				this.#state.dataset = ds;
				this.render();
			});
			dsGroup.appendChild(btn);
		});
		dsWrap.appendChild(dsGroup);
		leftGroup.appendChild(dsWrap);

		// Dynamic discovery of scales present for the current dataset
		const datasetRuns = allRuns.filter((r) => r.dataset?.toLowerCase() === this.#state.dataset.toLowerCase());
		const discoveredScales = new Set();
		datasetRuns.forEach((r) => {
			const lower = (r.file || "").toLowerCase();
			if (lower.includes("small")) discoveredScales.add("small");
			if (lower.includes("medium")) discoveredScales.add("medium");
			if (lower.includes("large")) discoveredScales.add("large");
		});

		const scaleOrder = ["small", "medium", "large"];
		const availableScales = scaleOrder.filter((s) => discoveredScales.has(s));

		// Show scale selector only if the dataset actually has scale variations
		if (availableScales.length > 1) {
			if (!availableScales.includes(this.#state.scale)) {
				this.#state.scale = availableScales[0];
			}

			const scaleWrap = document.createElement("div");
			scaleWrap.style.display = "flex";
			scaleWrap.style.alignItems = "center";
			scaleWrap.style.gap = "8px";

			const scaleLabel = document.createElement("span");
			scaleLabel.className = "text-xs text-muted font-medium";
			scaleLabel.textContent = "SCALE:";
			scaleWrap.appendChild(scaleLabel);

			const scaleGroup = document.createElement("div");
			scaleGroup.className = "segmented-control";

			availableScales.forEach((sc) => {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = `segmented-control__btn ${this.#state.scale === sc ? "is-active" : ""}`;
				btn.textContent = sc.charAt(0).toUpperCase() + sc.slice(1);
				btn.addEventListener("click", () => {
					this.#state.scale = sc;
					this.render();
				});
				scaleGroup.appendChild(btn);
			});
			scaleWrap.appendChild(scaleGroup);
			leftGroup.appendChild(scaleWrap);
		} else if (availableScales.length === 1) {
			this.#state.scale = availableScales[0];
		} else {
			this.#state.scale = "small";
		}

		// Dynamic discovery of formats available for the current dataset and scale
		const currentViewRuns = datasetRuns.filter((r) => this.#matchScale(r.file, this.#state.scale));
		const discoveredFormats = new Set(
			currentViewRuns.map((r) => r.format || r.file?.split(".").pop()).filter(Boolean)
		);
		const formatsToDisplay = ALL_FORMATS.filter((fmt) => discoveredFormats.size === 0 || discoveredFormats.has(fmt));

		// Multi-Select Format Pills (Togglable)
		const fmtWrap = document.createElement("div");
		fmtWrap.style.display = "flex";
		fmtWrap.style.alignItems = "center";
		fmtWrap.style.gap = "8px";

		const fmtLabel = document.createElement("span");
		fmtLabel.className = "text-xs text-muted font-medium";
		fmtLabel.textContent = "FORMATS:";
		fmtWrap.appendChild(fmtLabel);

		const pillsContainer = document.createElement("div");
		pillsContainer.className = "fmt-pills";
		pillsContainer.setAttribute("role", "group");
		pillsContainer.setAttribute("aria-label", "RDF Formats Multi-select");

		formatsToDisplay.forEach((fmt) => {
			const isPressed = this.#state.formats.has(fmt);
			const pill = document.createElement("button");
			pill.type = "button";
			pill.className = "fmt-pill";
			pill.setAttribute("role", "button");
			pill.setAttribute("aria-pressed", String(isPressed));
			pill.dataset.format = fmt;
			pill.textContent = `.${fmt}`;

			pill.addEventListener("click", () => {
				if (this.#state.formats.has(fmt)) {
					if (this.#state.formats.size === 1) {
						// Guard: keep at least 1 format active
						pill.classList.remove("is-denied");
						pill.getBoundingClientRect();
						pill.classList.add("is-denied");
						return;
					}
					this.#state.formats.delete(fmt);
				} else {
					this.#state.formats.add(fmt);
				}
				this.render();
			});

			pillsContainer.appendChild(pill);
		});

		fmtWrap.appendChild(pillsContainer);
		leftGroup.appendChild(fmtWrap);

		bar.appendChild(leftGroup);
		return bar;
	}

	#renderProtocolTile() {
		const details = document.createElement("details");
		details.className = "protocol-tile";

		const meta = this.#data?.metadata || {};
		const env = meta.environment || {};
		const proto = meta.protocol || {};

		const cpuName = env.cpuModel || "Linux x86_64";
		const jvmVer = env.jvmVersion ? `OpenJDK ${env.jvmVersion}` : "OpenJDK 21";
		const osDist = env.osDistribution || "Linux";
		const jvmFlags = (env.jvmFlags || ["-Xms4g", "-Xmx12g", "-XX:+UseG1GC"]).join(" ");
		const reps = proto.repetitions || 3;
		const warmup = proto.warmup !== undefined ? proto.warmup : 1;
		const datasetName = this.#state.dataset || "bsbm";
		const scaleName = this.#state.scale;
		const scaleArg = scaleName ? ` --scales ${scaleName}` : "";
		const runWorkflowCmd = `python3 python-utils/workflow.py --dataset ${datasetName}${scaleArg}`;
		const repoRef = meta.gitCommit || "main";

		const summary = document.createElement("summary");
		summary.innerHTML = `
			<span class="protocol-title">Measurement Protocol</span>
			<span class="protocol-summary-meta">${reps} measured repetitions · Separate JVM per engine</span>
			<span class="protocol-chevron" aria-hidden="true">▾</span>
		`;
		details.appendChild(summary);

		const body = document.createElement("div");
		body.className = "protocol-body";

		// Column 1: Reproduction Workflow
		const colCmds = document.createElement("div");
		colCmds.className = "protocol-col";
		colCmds.innerHTML = `
			<h4 class="protocol-section-title">Reproduce this benchmark</h4>
			<p class="dataset-card__note" style="margin: 0 0 0.5rem;">
				Run the complete, reproducible pipeline for the active dataset (handles acquisition, multi-format conversion, and isolated engine benchmarks):
			</p>
			<div class="protocol-cmd-box">
				<code>${escapeHtml(runWorkflowCmd)}</code>
				<button type="button" class="btn-copy-cmd" data-cmd="${escapeHtml(runWorkflowCmd)}">Copy</button>
			</div>
			<div style="display:flex;align-items:center;gap:1.25rem;margin-top:0.75rem;font-size:0.8125rem;">
				<a class="protocol-link" href="./data/benchmark-report.json" target="_blank" download="benchmark-report.json" style="font-weight:600;">
					Download report (.json) ⤓
				</a>
				<a class="protocol-link" href="https://github.com/corese-stack/corese-benchmark/blob/${escapeHtml(repoRef)}/src/main/java/fr/inria/corese/benchmark/harness/BenchmarkHarness.java" target="_blank" rel="noopener">
					Harness implementation ↗
				</a>
			</div>
		`;
		const copyBtn = colCmds.querySelector(".btn-copy-cmd");
		copyBtn.addEventListener("click", () => {
			if (!navigator.clipboard?.writeText) {
				copyBtn.textContent = "Error ✗";
				setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
				return;
			}
			navigator.clipboard.writeText(runWorkflowCmd).then(
				() => {
					copyBtn.textContent = "Copied ✓";
					setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
				},
				() => {
					copyBtn.textContent = "Error ✗";
					setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
				}
			);
		});

		// Column 2: Execution Environment (Live data from report metadata)
		const colEnv = document.createElement("div");
		colEnv.className = "protocol-col";
		colEnv.innerHTML = `
			<h4 class="protocol-section-title">Execution environment & measurement settings</h4>
			<dl class="protocol-facts">
				<dt>Operating system</dt>
				<dd>${escapeHtml(osDist)} (${escapeHtml(env.osKernel || "x86_64")})</dd>
				<dt>Java runtime</dt>
				<dd>${escapeHtml(jvmVer)}</dd>
				<dt>Hardware</dt>
				<dd>${escapeHtml(cpuName)} · ${env.cpuCores || 8} cores, ${env.cpuThreads || 8} threads</dd>
				<dt>JVM flags</dt>
				<dd><code>${escapeHtml(jvmFlags)}</code></dd>
				<dt>Isolation</dt>
				<dd>Sequential runs in dedicated child JVM processes per engine</dd>
				<dt>Measurement</dt>
				<dd>Median of ${reps} measured repetitions (warm-up: ${warmup})</dd>
			</dl>
		`;

		body.appendChild(colCmds);
		body.appendChild(colEnv);
		details.appendChild(body);
		return details;
	}



	#renderSummaryChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		const reps = this.#data?.metadata?.protocol?.repetitions ?? 3;
		const dsMeta = `Median of ${reps} runs per engine/format`;

		const header = document.createElement("div");
		header.className = "section-header";
		header.innerHTML = `
			<h3 style="margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;">
				<span>Ingestion Throughput Comparison</span>
				<span class="tag-format">kTriples / s</span>
			</h3>
			<span class="section-meta">
				<span class="meta-label">${escapeHtml(dsMeta)}</span>
				<span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
			</span>
		`;
		section.appendChild(header);

		const body = document.createElement("div");
		body.className = "section-body";
		body.style.position = "relative";
		body.style.height = "360px";

		const canvas = document.createElement("canvas");
		canvas.id = "loading-summary-chart";
		body.appendChild(canvas);

		section.appendChild(body);
		return section;
	}

	#initSummaryChart(rows, orderedEngines, catalog) {
		if (window.Chart === undefined) return;

		const canvas = document.getElementById("loading-summary-chart");
		if (!canvas) return;

		const signal = this.#abortController?.signal;

		// Formats for X-axis (only formats actually present in filtered rows AND selected)
		const rowsFormats = new Set(rows.map((r) => r.format || r.file?.split(".").pop()).filter(Boolean));
		const activeFormats = ALL_FORMATS.filter((f) => this.#state.formats.has(f) && (rowsFormats.size === 0 || rowsFormats.has(f)));
		const formatLabels = activeFormats.map((f) => `.${f.toUpperCase()}`);

		// Datasets strictly ordered and styled following engine selector norms
		const datasets = orderedEngines.map((engConfig) => {
			const color = engConfig.style.color;
			const dataPoints = activeFormats.map((fmt) => {
				const r = rows.find(
					(row) => {
						const rowKey = formatEngineId(parseEngineId(row.engine));
						return (rowKey === engConfig.key || row.engine === engConfig.key) &&
							(row.format === fmt || row.file?.endsWith(`.${fmt}`));
					}
				);
				return r && r.throughputTriplesPerSec > 0 ? Math.round(r.throughputTriplesPerSec / 1000) : null;
			});

			return {
				label: engConfig.label,
				data: dataPoints,
				backgroundColor: color,
				borderRadius: 4,
				maxBarThickness: 36,
				_engineKey: engConfig.key,
				_baseColor: color,
			};
		});

		const isDark = document.documentElement.dataset.theme === "dark";
		const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
		const textColor = isDark ? "#8b949e" : "#656d76";

		try {
			const chart = new window.Chart(canvas, {
				type: "bar",
				data: {
					labels: formatLabels,
					datasets: datasets,
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					animation: false,
					// Note: onHover is intentionally omitted here because Chart.js skips onHover
					// when the pointer is outside chartArea (e.g. over bottom scale/padding ticks).
					// Pointer tracking is handled directly via canvas DOM pointermove below.
					onClick: (e, elements) => {
						if (elements && elements.length > 0) {
							const dsIndex = elements[0].datasetIndex;
							const dataIndex = elements[0].index;
							const dataset = chart.data.datasets[dsIndex];
							const format = activeFormats[dataIndex];
							const measureKey = `${dataset._engineKey}|${format}`;
							focusStore.togglePin({ kind: "measure", key: measureKey });

							const targetRow = this.#root?.querySelector(`tr[data-measure-key="${CSS.escape(measureKey)}"]`);
							targetRow?.scrollIntoView({ behavior: "smooth", block: "nearest" });
						}
					},
					plugins: {
						legend: {
							position: "top",
							onHover: (e, legendItem, legend) => {
								const chart = legend.chart;
								const dataset = chart.data.datasets[legendItem.datasetIndex];
								if (dataset?._engineKey) {
									this.#legendHover.set({ kind: "engine", key: dataset._engineKey });
								}
							},
							onLeave: () => {
								this.#legendHover.clear();
							},
							onClick: (e, legendItem, legend) => {
								const chart = legend.chart;
								const dataset = chart.data.datasets[legendItem.datasetIndex];
								if (dataset?._engineKey) {
									focusStore.togglePin({ kind: "engine", key: dataset._engineKey });
								}
							},
							labels: {
								generateLabels: (c) => {
									const defaultGen = window.Chart.defaults.plugins.legend.labels.generateLabels;
									const items = defaultGen(c);
									const focus = focusStore.effectiveFocus;

									return items.map((item) => {
										const ds = c.data.datasets[item.datasetIndex];
										if (!ds) return item;
										const baseColor = ds._baseColor || "#888";

										let isMatch = true;
										if (focus) {
											if (focus.target.kind === "engine") {
												isMatch = ds._engineKey === focus.target.key;
											} else if (focus.target.kind === "measure") {
												const [targetEng] = focus.target.key.split("|");
												isMatch = ds._engineKey === targetEng;
											}
										}

										let r = 0, g = 0, b = 0;
										if (typeof baseColor === "string" && baseColor.startsWith("#")) {
											const hex = baseColor.replace("#", "");
											if (hex.length === 6) {
												r = Number.parseInt(hex.substring(0, 2), 16);
												g = Number.parseInt(hex.substring(2, 4), 16);
												b = Number.parseInt(hex.substring(4, 6), 16);
											}
										}

										const fill = isMatch ? baseColor : `rgba(${r}, ${g}, ${b}, 0.22)`;
										item.fillStyle = fill;
										item.strokeStyle = fill;
										return item;
									});
								},
								color: (ctx) => {
									const focus = focusStore.effectiveFocus;
									const dsIndex = ctx.datasetIndex;
									const ds = ctx.chart.data.datasets[dsIndex];
									if (!ds || !focus) return textColor;

									if (focus.target.kind === "measure") {
										const [targetEng] = focus.target.key.split("|");
										return ds._engineKey === targetEng ? textColor : "rgba(128, 128, 128, 0.4)";
									}
									if (focus.target.kind === "engine") {
										return ds._engineKey === focus.target.key ? textColor : "rgba(128, 128, 128, 0.4)";
									}
									return textColor;
								},
								font: { family: "Inter, sans-serif", size: 12, weight: 500 },
								usePointStyle: true,
								boxWidth: 8,
								padding: 16,
							},
						},
						tooltip: {
							callbacks: {
								label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} kTriples/s`,
							},
						},
					},
					layout: {
						padding: {
							top: 8,
							bottom: 8,
						},
					},
					scales: {
						x: {
							grid: { color: gridColor },
							ticks: { color: textColor, font: { weight: 600 } },
						},
						y: {
							grace: "15%",
							grid: { color: gridColor },
							ticks: {
								color: textColor,
								callback: (val) => `${val}k`,
							},
							title: {
								display: true,
								text: "Throughput (kTriples / s)",
								color: textColor,
								font: { size: 11, weight: 600 },
							},
						},
					},
				},
			});

			// Canvas boundary exit safety: clear hover and reset Chart.js internal active elements
			const clearCanvasState = () => {
				this.#canvasHover.clear();
				if (chart) {
					chart.setActiveElements([]);
					if (chart.tooltip) {
						chart.tooltip.setActiveElements([], { x: 0, y: 0 });
					}
					chart.update("none");
				}
			};

			// Direct DOM pointer exit: clear when leaving canvas or on pointer cancel
			canvas.addEventListener("pointerleave", clearCanvasState, { signal });
			canvas.addEventListener("pointercancel", clearCanvasState, { signal });
			canvas.addEventListener("mouseout", clearCanvasState, { signal });

			// Helper to find bar element intersecting (x, y) coordinates relative to canvas
			const getBarElementAt = (x, y) => {
				for (let d = 0; d < chart.data.datasets.length; d++) {
					const meta = chart.getDatasetMeta(d);
					if (meta.hidden) continue;
					for (let i = 0; i < meta.data.length; i++) {
						const el = meta.data[i];
						if (el?.inRange(x, y)) {
							return { datasetIndex: d, index: i, element: el };
						}
					}
				}
				return null;
			};

			// Direct DOM pointer movement & hit-testing on the canvas:
			// Using native DOM pointermove guarantees immediate detection whether the pointer is over
			// a bar, in empty chart area, or exiting downward across the X-axis scale ticks.
			canvas.addEventListener(
				"pointermove",
				(e) => {
					const rect = canvas.getBoundingClientRect();
					const x = e.clientX - rect.left;
					const y = e.clientY - rect.top;

					if (!chart.isPointInArea({ x, y })) {
						clearCanvasState();
						return;
					}

					const hit = getBarElementAt(x, y);
					if (hit) {
						const dataset = chart.data.datasets[hit.datasetIndex];
						const format = activeFormats[hit.index];
						if (dataset && format) {
							const measureKey = `${dataset._engineKey}|${format}`;
							this.#canvasHover.set({ kind: "measure", key: measureKey });
							const activeElements = [{ datasetIndex: hit.datasetIndex, index: hit.index }];
							chart.setActiveElements(activeElements);
							if (chart.tooltip) {
								chart.tooltip.setActiveElements(activeElements, { x, y });
							}
							chart.update("none");
						} else {
							clearCanvasState();
						}
					} else {
						clearCanvasState();
					}
				},
				{ signal, passive: true },
			);

			// When scrolling, clear canvas hover so bars don't remain stuck under static pointer
			window.addEventListener("scroll", clearCanvasState, { signal, passive: true });

			chart._activeFormats = activeFormats;
			this.#charts.set("summary", chart);
		} catch (err) {
			console.error("Failed to render Chart.js summary:", err);
		}
	}

	#renderTable(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		// Natural benchmark order: group by Format, then sort by Throughput descending (Podium order)
		const formatOrder = ALL_FORMATS.filter((f) => this.#state.formats.has(f));
		const sortedRows = [...rows].sort((a, b) => {
			const fmtA = a.format || a.file.split(".").pop();
			const fmtB = b.format || b.file.split(".").pop();
			const idxA = formatOrder.indexOf(fmtA);
			const idxB = formatOrder.indexOf(fmtB);
			if (idxA !== idxB) return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
			// Within same format: highest throughput first (podium)
			return (b.throughputTriplesPerSec || 0) - (a.throughputTriplesPerSec || 0);
		});

		const header = document.createElement("div");
		header.className = "section-header";
		const count = sortedRows.length;
		header.innerHTML = `
			<h3 style="margin:0;font-size:15px;font-weight:600;">Ingestion Benchmark Details</h3>
			<span class="section-meta">
				<span class="meta-label">${count} configuration${count > 1 ? "s" : ""} · Grouped by format, sorted by throughput</span>
				<span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
			</span>
		`;
		section.appendChild(header);

		const wrapper = document.createElement("div");
		wrapper.style.overflowX = "auto";

		const table = document.createElement("table");
		table.className = "data-table";

		const thead = document.createElement("thead");
		thead.innerHTML = `
			<tr>
				<th>Format</th>
				<th>Engine</th>
				<th class="text-right">Median Time</th>
				<th class="text-right">Throughput</th>
				<th class="text-right">Net Heap</th>
				<th class="text-right">Repetitions (ms)</th>
			</tr>
		`;
		table.appendChild(thead);

		const tbody = document.createElement("tbody");
		let lastFormat = null;
		if (sortedRows.length === 0) {
			const tr = document.createElement("tr");
			tr.innerHTML = `<td colspan="6" class="text-center text-muted" style="padding:24px;">No data matching active engines and format filters</td>`;
			tbody.appendChild(tr);
		} else {
			sortedRows.forEach((r) => {
				const tr = document.createElement("tr");
				const parsed = parseEngineId(r.engine);
				const engineKey = formatEngineId(parsed);
				const fmt = r.format || r.file.split(".").pop();
				const measureKey = `${engineKey}|${fmt}`;

				// Visually separate format blocks with a clean border
				if (lastFormat !== null && lastFormat !== fmt) {
					tr.classList.add("group-separator");
				}
				lastFormat = fmt;

				tr.dataset.engineKey = engineKey;
				tr.dataset.measureKey = measureKey;

				const style = getEngineStyle(parsed, catalog);
				const indicatorSvg = renderEngineIndicatorSvg(style);

				const repsStr = (r.repetitionsMs || []).join(", ");
				const throughputK = (r.throughputTriplesPerSec / 1000).toFixed(0);

				tr.innerHTML = `
					<td>
						<span class="tag-format" style="font-weight:700;">.${escapeHtml(fmt.toUpperCase())}</span>
					</td>
					<td>
						<span style="display:inline-flex;align-items:center;gap:6px;">
							${indicatorSvg}
							<span class="engine-badge" style="color:${style.color};">${escapeHtml(r.engine)}</span>
						</span>
					</td>
					<td class="text-right font-mono font-medium">${r.loadingTimeMs ? `${r.loadingTimeMs} ms` : "—"}</td>
					<td class="text-right font-mono font-medium" style="color:var(--focus);">${throughputK} k/s</td>
					<td class="text-right font-mono text-muted">${r.memoryDeltaMb ? `${r.memoryDeltaMb.toFixed(1)} MB` : "—"}</td>
					<td class="text-right font-mono text-xs text-muted">[${escapeHtml(repsStr)}]</td>
				`;

				// Hover via deduplicated source (attached AFTER innerHTML)
				tr.addEventListener("mouseenter", () => {
					this.#tableHover.set({ kind: "measure", key: measureKey });
				});
				tr.addEventListener("mouseleave", () => {
					this.#tableHover.clear();
				});

				// Click to toggle pin
				tr.addEventListener("click", () => {
					focusStore.togglePin({ kind: "measure", key: measureKey });
				});

				tbody.appendChild(tr);
			});
		}

		table.appendChild(tbody);
		wrapper.appendChild(table);
		section.appendChild(wrapper);
		return section;
	}
}
