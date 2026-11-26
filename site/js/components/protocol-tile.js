/**
 * Corese Benchmark Dashboard - Protocol & Reproducibility Tile Component
 * Reusable, collapsible scientific disclosure panel across views (RDF Loading, SPARQL Features).
 * Encapsulates:
 *   - Section 1: Benchmark Datasets & Input Graphs (configurable: active dataset or all 5 datasets)
 *   - Section 2: Evaluated Feature Queries catalogue (optional / SPARQL view)
 *   - Section 3: Reproducibility & Execution Protocol (repro CLI command, harness links, params)
 *   - Section 4: Target Execution Environment & Hardware (CPU, RAM, OS, JVM, commit link)
 */

import { DATASET_METADATA } from "../datasets.js";
import { escapeHtml } from "../engine-id.js";

const esc = (s) => escapeHtml(String(s ?? ""));

export const DATASET_CONFIGS = Object.freeze({
	lubm: {
		id: "lubm",
		name: "LUBM",
		fullName: DATASET_METADATA.lubm?.fullName || "Lehigh University Benchmark",
		shortFile: "lubm_small.nt",
		fullFile: "input/lubm/unzip_small/lubm_small.nt",
		format: "N-Triples",
		graph: "Default graph",
		upstreamUrl: DATASET_METADATA.lubm?.artifact?.url || "https://swat.cse.lehigh.edu/projects/lubm/",
		downloadUrl: DATASET_METADATA.lubm?.artifact?.downloadUrl || "https://swat.cse.lehigh.edu/projects/lubm/uba1.7.zip",
	},
	bsbm: {
		id: "bsbm",
		name: "BSBM",
		fullName: DATASET_METADATA.bsbm?.fullName || "Berlin SPARQL Benchmark",
		shortFile: "bsbm_small.nt",
		fullFile: "input/bsbm/unzip_small/bsbm_small.nt",
		format: "N-Triples",
		graph: "Default graph",
		upstreamUrl: DATASET_METADATA.bsbm?.artifact?.url || "https://wbsg.informatik.uni-mannheim.de/bizer/berlinsparqlbenchmark/",
		downloadUrl: DATASET_METADATA.bsbm?.artifact?.downloadUrl || "https://sourceforge.net/projects/bsbmtools/files/latest/download",
	},
	dbpedia: {
		id: "dbpedia",
		name: "DBpedia",
		fullName: "DBpedia 3.5.1",
		shortFile: "persondata_en.nt",
		fullFile: "input/dbpedia/unzip/persondata_en.nt",
		format: "N-Triples",
		graph: "Default graph",
		upstreamUrl: "https://dbpedia.org",
		downloadUrl: "https://s3.slices-be.eu/ilabt.imec.be-project-p16/corese/dbpedia_3.5.1_dump/persondata_en.nt.bz2",
	},
	bowlogna: {
		id: "bowlogna",
		name: "BowlognaBench",
		fullName: DATASET_METADATA.bowlogna?.fullName || "BowlognaBench",
		shortFile: "Department0.nt",
		fullFile: "input/bowlogna/unzip/Department0.nt",
		format: "N-Triples",
		graph: "Default graph",
		upstreamUrl: DATASET_METADATA.bowlogna?.artifact?.url || "https://exascale.info/assets/pdf/BowlognaBenchSIMPDA2011.pdf",
		downloadUrl: DATASET_METADATA.bowlogna?.artifact?.downloadUrl || "https://files.dice-research.org/projects/HOBBIT/benchmarks-data/datasets-dumps/bowlogna-dump.zip",
	},
	"named-graphs": {
		id: "named-graphs",
		name: "Named Graphs",
		fullName: "Named Graphs (LUBM Partition)",
		shortFile: "lubm_named.nq",
		fullFile: "input/queries/v1/named-graphs/prepare_dataset.py",
		format: "N-Quads",
		graph: "2 Named graphs",
		upstreamUrl: DATASET_METADATA.lubm?.artifact?.url || "https://swat.cse.lehigh.edu/projects/lubm/",
		scriptPath: "input/queries/v1/named-graphs/prepare_dataset.py",
	},
});

const LOADING_DATASET_FILES = Object.freeze({
	bsbm: { shortFile: "bsbm_medium.nt", fullFile: "input/bsbm/view_small_medium/bsbm_medium.nt" },
	lubm: { shortFile: "lubm_medium.nt", fullFile: "input/lubm/unzip_medium/lubm_medium.nt" },
	"named-graphs": { shortFile: "named-graphs.nq", format: "N-Quads" },
	dbpedia: { shortFile: "persondata_en.nt", fullFile: "input/dbpedia/unzip/persondata_en.nt" },
	bowlogna: { shortFile: "Department0.nt", fullFile: "input/bowlogna/unzip/Department0.nt" },
});

export function resolveDatasetCardConfig(datasetId, mode = "sparql") {
	const config = DATASET_CONFIGS[datasetId] || {
		name: datasetId,
		fullName: datasetId,
		shortFile: "Not reported",
		fullFile: "Not reported",
		format: "RDF",
		graph: "Default graph",
	};
	if (mode === "loading") return { ...config, ...LOADING_DATASET_FILES[datasetId] };
	return config;
}

function isPositiveTripleCount(triples) {
	return typeof triples === "number" && Number.isFinite(triples) && triples > 0;
}

export function resolveDatasetTripleCount(dataset, reportData, mode = "sparql") {
	const info = resolveDatasetCardConfig(dataset, mode);
	const files = dataset === "named-graphs"
		? ["named-graphs.nq", "corese-feature-lubm.nq", "lubm_named.nq"]
		: [info.shortFile];
	const runs = reportData?.loadingRuns || reportData?.runs || [];
	const counts = runs.filter((run) => run.dataset === dataset
		&& files.includes(run.file) && isPositiveTripleCount(run.triples))
		.map((run) => run.triples).sort((a, b) => a - b);
	if (!counts.length) return null;
	const mid = Math.floor(counts.length / 2);
	if (counts.length % 2) return Math.round(counts[mid]);
	return Math.round(counts[mid - 1] / 2 + counts[mid] / 2);
}

export function formatDatasetSizeBadge(triples, datasetId) {
	if (!isPositiveTripleCount(triples)) return "—";
	const unit = datasetId === "named-graphs" ? "quads" : "triples";
	return `${triples.toLocaleString("en")} ${unit}`;
}

const SPARQL_KEYWORDS = new Set([
	"prefix", "base", "select", "ask", "construct", "describe", "where", "from", "named",
	"graph", "optional", "union", "minus", "filter", "not", "exists", "bind", "as",
	"values", "service", "silent", "distinct", "reduced", "order", "by", "group", "having",
	"limit", "offset", "asc", "desc", "count", "sum", "avg", "min", "max", "sample",
	"group_concat", "contains", "lcase", "year", "month", "str", "concat", "regex",
	"bound", "if", "coalesce", "in", "true", "false"
]);

function classifyWord(word) {
	if (word.startsWith("?") || word.startsWith("$")) return "variable";
	if (word.includes(":")) return "iri";
	if (SPARQL_KEYWORDS.has(word.toLowerCase())) return "keyword";
	return null;
}

const RE_COMMENT = /^#[^\n\r]*/;
const RE_IRI = /^<[^\s<>]+>/;
const RE_LONG_STRING = /^"""[\s\S]*?"""|^'''[\s\S]*?'''/;
const RE_SHORT_STRING = /^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'/;
const RE_WORD = /^[?$]?[\w:-]+/;

function matchNextToken(rest, ch) {
	if (ch === "#") {
		const m = rest.match(RE_COMMENT);
		if (m) return { text: m[0], kind: "comment" };
	}
	if (ch === "<") {
		const m = rest.match(RE_IRI);
		if (m) return { text: m[0], kind: "iri" };
	}
	if (ch === '"' || ch === "'") {
		const mLong = rest.match(RE_LONG_STRING);
		if (mLong) return { text: mLong[0], kind: "string" };
		const mShort = rest.match(RE_SHORT_STRING);
		if (mShort) return { text: mShort[0], kind: "string" };
	}
	if (ch === "?" || ch === "$" || ch === ":" || /[A-Za-z_]/.test(ch)) {
		const m = rest.match(RE_WORD);
		if (m) return { text: m[0], kind: classifyWord(m[0]) };
	}
	return null;
}

/** Single-pass lexer: escape each original token exactly once, including markup in literals. */
export function highlightSparql(source) {
	const src = String(source ?? "");
	let output = "";
	let i = 0;
	const len = src.length;

	while (i < len) {
		const ch = src[i];
		const token = matchNextToken(src.slice(i), ch);
		if (token) {
			output += token.kind ? `<span class="sf-token-${token.kind}">${esc(token.text)}</span>` : esc(token.text);
			i += token.text.length;
		} else {
			output += esc(ch);
			i++;
		}
	}

	return output;
}

/**
 * Reusable HTML helper for a SPARQL source box.
 */
export function renderSourceBox(file, source = null, statusText = null, metaHtml = "") {
	const fileName = esc(file.split("/").pop());
	const initialStatus = statusText || "";
	const innerCode = source !== null ? highlightSparql(source) : "";
	return `
		<div class="sf-source-box">
			<div class="sf-source-toolbar">
				<div class="sf-source-toolbar-meta">
					${metaHtml}
					<span data-sf-source-status style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${esc(initialStatus)}</span>
				</div>
				<div class="sf-dialog-actions">
					<button type="button" class="sf-action-link" data-sf-copy-query>Copy SPARQL</button>
					<a href="data/sparql/v1/${esc(file)}" class="protocol-link" download="${fileName}" style="font-weight: 600;">Download .rq ⤓</a>
				</div>
			</div>
			<pre tabindex="0" role="region" aria-label="SPARQL query code" style="margin: 0; padding: 12px; max-height: 480px; overflow: auto; background: var(--bg-card);"><code style="font-family: var(--font-mono); font-size: 12px; line-height: 1.5; color: var(--text);">${innerCode}</code></pre>
		</div>
	`;
}

function formatRamInfo(env) {
	if (!env.ramTotalGb) return null;
	const swapPart = env.swapTotalGb ? ` · ${env.swapTotalGb} GB swap` : "";
	return `${env.ramTotalGb} GB RAM${swapPart}`;
}

function formatOsDist(env) {
	if (!env.osDistribution) return "Not reported";
	const kernelPart = env.osKernel ? ` · kernel ${env.osKernel}` : "";
	return `${env.osDistribution}${kernelPart}`;
}

function formatHardwareSummary(env) {
	const cpuParts = [env.cpuModel];
	if (env.cpuCores) {
		cpuParts.push(` · ${env.cpuCores} cores, ${env.cpuThreads || env.cpuCores} threads`);
	}
	if (env.cpuArchitecture) {
		cpuParts.push(` (${env.cpuArchitecture})`);
	}
	const cpuName = env.cpuModel ? cpuParts.join("") : "Not reported";
	const ramInfo = formatRamInfo(env);
	const osDist = formatOsDist(env);
	const jvmVendor = env.jvmVendor ? `${env.jvmVendor} ` : "";
	const jvmVer = env.jvmVersion ? `${jvmVendor}${env.jvmVersion}` : "Not reported";

	const jvmFlags = Array.isArray(env.jvmFlags) && env.jvmFlags.length
		? env.jvmFlags.join(" ")
		: "Not reported";

	return { cpuName, ramInfo, osDist, jvmVer, jvmFlags };
}

function resolveRepetitions(mode, proto) {
	if (mode === "sparql") {
		if (proto.queryRepetitions !== undefined) return proto.queryRepetitions;
		return proto.repetitions ?? 3;
	}
	return proto.repetitions ?? 3;
}

function resolveTimeout(catalogue, proto) {
	if (catalogue?.defaults?.timeoutSecs) {
		return `${catalogue.defaults.timeoutSecs} s`;
	}
	if (proto.queryTimeoutMs) {
		return `${proto.queryTimeoutMs / 1000} s`;
	}
	return "30 s";
}

function buildDatasetFileLink(info, repoRef) {
	if (info.fullFile?.startsWith("input/")) {
		return `<a href="https://github.com/corese-stack/corese-benchmark/blob/${esc(repoRef)}/${esc(info.fullFile)}" class="protocol-link" target="_blank" rel="noopener"><code>${esc(info.shortFile)}</code> ↗</a>`;
	}
	if (info.scriptPath) {
		return `<a href="https://github.com/corese-stack/corese-benchmark/blob/${esc(repoRef)}/${esc(info.scriptPath)}" class="protocol-link" target="_blank" rel="noopener"><code>${esc(info.shortFile)}</code> ↗</a>`;
	}
	return `<code>${esc(info.shortFile)}</code>`;
}

/**
 * Render the unified Protocol Tile details element.
 *
 * @param {Object} options
 * @param {'loading'|'sparql'} options.mode - View context
 * @param {Object} options.reportData - Complete report data object (with .metadata)
 * @param {Object} [options.state] - Active state (dataset, formats, etc.)
 * @param {Object} [options.catalogue] - SPARQL catalogue if in sparql mode
 * @param {Function} [options.onFetchSource] - Async loader for query sources
 * @param {boolean} [options.isOpen=false] - Initial open state of details
 * @returns {HTMLDetailsElement}
 */
export function createProtocolTile({
	mode = "loading",
	reportData = null,
	state = {},
	catalogue = null,
	isOpen = false,
} = {}) {
	const details = document.createElement("details");
	details.className = "protocol-tile";
	if (isOpen) details.open = true;

	const meta = reportData?.metadata || {};
	const env = meta.environment || {};
	const proto = meta.protocol || {};

	const { cpuName, ramInfo, osDist, jvmVer, jvmFlags } = formatHardwareSummary(env);
	const reps = resolveRepetitions(mode, proto);
	const warmup = proto.warmup !== undefined ? `${proto.warmup} run` : "0 (none)";
	const timeout = resolveTimeout(catalogue, proto);
	const entailment = catalogue?.entailment
		? "None (Simple Entailment / SPARQL 1.1 Direct Evaluation)"
		: "Not reported";

	const activeDataset = (state.dataset || "bsbm").toLowerCase();
	const runCmd = mode === "sparql"
		? "python3 python-utils/workflow.py --datasets lubm,bsbm,dbpedia,bowlogna --benchmark-type query"
		: `python3 python-utils/workflow.py --dataset ${activeDataset} --benchmark-type load`;

	const rawCommit = meta.gitCommit || "";
	const shortCommit = rawCommit.length >= 7 ? rawCommit.slice(0, 7) : rawCommit;
	const repoRef = rawCommit || "main";

	// Summary Title & Meta
	const summaryMeta = mode === "sparql"
		? "15 queries · 5 dataset configurations · SPARQL 1.1"
		: `${reps} measured repetitions · Separate JVM per engine`;

	details.innerHTML = `
		<summary class="protocol-tile__summary">
			<span class="protocol-title">Datasets, Measurement Protocol &amp; Reproducibility</span>
			<span class="protocol-summary-meta" data-protocol-meta data-sf-protocol-meta>${esc(summaryMeta)}</span>
			<span class="protocol-chevron" aria-hidden="true">▾</span>
		</summary>
		<div class="protocol-body">
			<!-- Section 1: Benchmark Datasets -->
			<div class="protocol-section" id="section-loading-dataset">
				<h4 class="protocol-section-title">1. Benchmark Datasets &amp; Input Graphs</h4>
				<p class="dataset-card__note">
					${mode === "sparql"
						? "The 15 SPARQL feature queries evaluate engines across 5 standardized dataset configurations. Each dataset is isolated in a clean repository instance:"
						: "Standardized RDF benchmark datasets used to evaluate ingestion throughput, memory overhead, and parse scalability:"}
				</p>
				<div data-protocol-datasets data-sf-inputs></div>
			</div>

			${mode === "sparql" ? `
			<!-- Section 2: Feature Queries -->
			<div class="protocol-section" style="border-top: 1px solid var(--border); padding-top: 14px;">
				<div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 0.5rem;">
					<h4 class="protocol-section-title" style="margin: 0;">2. Evaluated Feature Queries</h4>
					<a class="protocol-link" href="data/sparql/v1/catalogue.json" target="_blank" download="catalogue.json" style="font-weight: 600; font-size: 0.8125rem;">
						Download query catalogue (.json) ⤓
					</a>
				</div>
				<p class="dataset-card__note">
					Comprehensive catalogue of 15 queries covering essential SPARQL 1.1 features, bound to their target dataset and validated for determinism:
				</p>
				<div data-protocol-queries data-sf-catalog-list></div>
			</div>` : ""}

			<!-- Section 3: Reproducibility & Protocol -->
			<div class="protocol-section" id="section-loading-protocol" style="border-top: 1px solid var(--border); padding-top: 18px;">
				<h4 class="protocol-section-title">${mode === "sparql" ? "3." : "2."} Reproducibility &amp; Execution Protocol</h4>
				<p class="dataset-card__note">
					${mode === "sparql"
						? "Run the isolated, multi-repetition loading and SPARQL catalogue benchmark pipeline across configured datasets and baseline engines:"
						: "Run the complete, reproducible pipeline for the active dataset (handles acquisition, multi-format conversion, and isolated engine benchmarks):"}
				</p>
				<div class="protocol-cmd-box">
					<code>${esc(runCmd)}</code>
					<button type="button" class="btn-copy-cmd" data-copy-cmd="${esc(runCmd)}">Copy</button>
				</div>
				<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin: 0.75rem 0 1rem; font-size: 0.8125rem;">
					<a class="protocol-link" href="https://github.com/corese-stack/corese-benchmark/blob/${esc(repoRef)}/python-utils/workflow.py" target="_blank" rel="noopener">
						Workflow script ↗
					</a>
					<a class="protocol-link" href="https://github.com/corese-stack/corese-benchmark/blob/${esc(repoRef)}/src/main/java/fr/inria/corese/benchmark/harness/BenchmarkHarness.java" target="_blank" rel="noopener">
						Benchmark harness ↗
					</a>
					<a class="protocol-link" href="./data/benchmark-report.json" target="_blank" download="benchmark-report.json" style="font-weight: 600;">
						Download report (.json) ⤓
					</a>
				</div>
				<dl class="protocol-facts">
					<dt>Repetitions</dt><dd>Median of ${esc(reps)} measured repetitions (warm-up: ${esc(warmup)})</dd>
					${mode === "sparql" ? `
					<dt>Timeout</dt><dd>${esc(timeout)} per query, unless overridden in catalogue</dd>
					<dt>Entailment</dt><dd>${esc(entailment)}</dd>
					<dt>Result validation</dt><dd>Canonical multiset SHA-256 hash comparison across engine results</dd>
					` : `
					<dt>Isolation</dt><dd>Sequential runs in dedicated child JVM processes per engine</dd>
					<dt>Target formats</dt><dd>Turtle (.ttl), TriG (.trig), N-Triples (.nt), N-Quads (.nq), RDF/XML (.rdf), JSON-LD (.jsonld)</dd>
					<dt>Metric</dt><dd>Median throughput (kTriples/s) &amp; retained heap</dd>
					`}
				</dl>
			</div>

			<!-- Section 4: Execution Environment & Hardware -->
			<div class="protocol-section" style="border-top: 1px solid var(--border); padding-top: 18px;">
				<h4 class="protocol-section-title">${mode === "sparql" ? "4." : "3."} Execution Environment &amp; Hardware</h4>
				<p class="dataset-card__note">
					Machine hardware specifications and JVM runtime settings recorded during benchmark execution:
				</p>
				<dl class="protocol-facts">
					<dt>Operating system</dt><dd>${esc(osDist)}</dd>
					<dt>Hardware</dt><dd>${esc(cpuName)}${ramInfo ? ` · ${esc(ramInfo)}` : ""}</dd>
					<dt>Java runtime</dt><dd>${esc(jvmVer)}</dd>
					<dt>JVM flags</dt><dd><code>${esc(jvmFlags)}</code></dd>
					<dt>Process isolation</dt><dd>Sequential runs in dedicated child JVM processes per engine</dd>
					<dt>Benchmark commit</dt><dd>${shortCommit ? `<a href="https://github.com/corese-stack/corese-benchmark/commit/${esc(rawCommit)}" class="protocol-link" target="_blank" rel="noopener"><code>${esc(shortCommit)}</code> ↗</a>` : "Not reported"}</dd>
				</dl>
			</div>
		</div>
	`;

	// Setup copy button
	const copyBtn = details.querySelector("[data-copy-cmd]");
	if (copyBtn) {
		copyBtn.addEventListener("click", () => {
			const cmd = copyBtn.dataset.copyCmd;
			if (!navigator.clipboard?.writeText) {
				copyBtn.textContent = "Error ✗";
				setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
				return;
			}
			navigator.clipboard.writeText(cmd).then(
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
	}

	// Attach fluid accordion animation to the protocol tile
	attachDetailsAnimation(details, { duration: 280 });

	return details;
}

function renderDatasetQueryFacts(queries) {
	if (!queries.length) return "";
	const badges = queries.map((query) => {
		const key = JSON.stringify([query.dataset, query.id]);
		return `<button type="button" class="sf-badge sf-badge--query" style="cursor: pointer;" data-sf-jump-query="${esc(key)}" title="${esc(query.id)}: ${esc(query.name)}">${esc(query.id)}</button>`;
	}).join("");
	return `<dt>Queries</dt><dd><div style="display: flex; flex-wrap: wrap; gap: 4px;">${badges}</div></dd>`;
}

function renderDatasetLinks(info, repoRef) {
	const upstream = info.upstreamUrl
		? `<a href="${esc(info.upstreamUrl)}" class="protocol-link" target="_blank" rel="noopener">Upstream ↗</a>` : "";
	const download = info.downloadUrl
		? `<a href="${esc(info.downloadUrl)}" class="protocol-link" target="_blank" rel="noopener" style="font-weight: 600;">Download ⤓</a>` : "";
	const script = info.scriptPath
		? `<a href="https://github.com/corese-stack/corese-benchmark/blob/${esc(repoRef)}/${esc(info.scriptPath)}" class="protocol-link" target="_blank" rel="noopener">Script ↗</a>` : "";
	return upstream + download + script;
}

function renderDatasetCardHtml(ds, { queries, repoRef, activeDataset, mode, reportData }) {
	const info = resolveDatasetCardConfig(ds, mode);
	const queryFacts = renderDatasetQueryFacts(queries.filter((query) => query.dataset === ds));
	const fileLink = buildDatasetFileLink(info, repoRef);
	const links = renderDatasetLinks(info, repoRef);
	const sizeLabel = formatDatasetSizeBadge(resolveDatasetTripleCount(ds, reportData, mode), ds);
	const isCurrentActive = activeDataset?.toLowerCase() === ds.toLowerCase();
	const cardModifier = isCurrentActive ? 'style="border-color: var(--focus); box-shadow: 0 0 0 1px var(--focus);"' : "";

	return `
		<div class="sf-dataset-card" id="dataset-${esc(ds)}" data-sf-dataset-id="${esc(ds)}" tabindex="-1" ${cardModifier}>
			<div class="sf-dataset-card-header">
				<h5 class="sf-dataset-card-title">${esc(info.fullName || info.name)}</h5>
				<span class="tag-format">${esc(info.format || "RDF")}</span>
			</div>
			<dl class="sf-dataset-card-facts">
				<dt>File</dt><dd>${fileLink}</dd>
				<dt>Graph</dt><dd><span class="sf-badge sf-badge--other">${esc(info.graph)}</span></dd>
				<dt>Size</dt><dd><span class="sf-badge sf-badge--other" style="font-family: var(--font-mono);" data-sf-dataset-size="${esc(ds)}">${esc(sizeLabel)}</span></dd>
				${queryFacts}
			</dl>
			<div class="sf-dataset-card-footer">
				<div class="sf-dataset-links">${links}</div>
			</div>
		</div>
	`;
}

/**
 * Populate Section 1 dataset cards into container.
 */
export function populateDatasetCards(container, {
	datasets = ["lubm", "bsbm", "dbpedia", "bowlogna", "named-graphs"],
	queries = [],
	repoRef = "main",
	activeDataset = null,
	mode = "sparql",
	reportData = null,
} = {}) {
	if (!container) return;
	const options = { queries, repoRef, activeDataset, mode, reportData };
	const cards = datasets.map((ds) => renderDatasetCardHtml(ds, options)).join("");
	container.innerHTML = `<div class="sf-dataset-grid">${cards}</div>`;
}

/**
 * Attaches a fluid accordion slide animation to a <details> element
 * using the Web Animations API (WAAPI).
 * Works 100% reliably across all browsers (Firefox, Chrome, Safari).
 *
 * @param {HTMLDetailsElement} details
 * @param {Object} [options]
 * @param {number} [options.duration=250] - Duration in ms
 * @param {string} [options.easing='cubic-bezier(0.25, 1, 0.5, 1)'] - Easing function
 */
export function attachDetailsAnimation(details, { duration = 250, easing = "cubic-bezier(0.25, 1, 0.5, 1)" } = {}) {
	if (!details || details._hasAccordionAnim) return;
	details._hasAccordionAnim = true;

	const summary = details.querySelector(":scope > summary");
	if (!summary) return;

	let animation = null;
	let isClosing = false;
	let isExpanding = false;

	summary.addEventListener("click", (e) => {
		// Do not intercept clicks on child interactive links or buttons inside summary
		if (e.target.closest("a, button, input, select, textarea")) return;
		e.preventDefault();

		const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (prefersReducedMotion) {
			details.open = !details.open;
			return;
		}

		if (isClosing || !details.open) {
			openAccordion();
		} else if (isExpanding || details.open) {
			closeAccordion();
		}
	});

	function openAccordion() {
		details.style.overflow = "hidden";
		const startHeight = details.offsetHeight;
		details.open = true;
		const endHeight = details.scrollHeight;

		if (animation) animation.cancel();
		isExpanding = true;
		isClosing = false;

		animation = details.animate(
			{ height: [`${startHeight}px`, `${endHeight}px`] },
			{ duration, easing }
		);

		animation.onfinish = () => onAnimationEnd(true);
		animation.oncancel = () => { isExpanding = false; };
	}

	details._adjustHeight = () => {
		if (isExpanding && animation) {
			const currentH = details.getBoundingClientRect().height;
			const targetH = details.scrollHeight;
			animation.cancel();
			animation = details.animate(
				{ height: [`${currentH}px`, `${targetH}px`] },
				{ duration: 150, easing }
			);
			animation.onfinish = () => onAnimationEnd(true);
			animation.oncancel = () => { isExpanding = false; };
		}
	};

	function closeAccordion() {
		details.style.overflow = "hidden";
		const startHeight = details.offsetHeight;
		const endHeight = summary.offsetHeight;

		if (animation) animation.cancel();
		isClosing = true;
		isExpanding = false;

		animation = details.animate(
			{ height: [`${startHeight}px`, `${endHeight}px`] },
			{ duration, easing }
		);

		animation.onfinish = () => onAnimationEnd(false);
		animation.oncancel = () => { isClosing = false; };
	}

	function onAnimationEnd(isOpen) {
		details.open = isOpen;
		if (animation) animation = null;
		isClosing = false;
		isExpanding = false;
		details.style.height = "";
		details.style.overflow = "";
	}
}
