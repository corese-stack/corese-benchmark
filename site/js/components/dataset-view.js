/**
 * Tiled Metric & Comparison Matrix View for Benchmarks
 * Conforms strictly to corese-w3c architecture:
 * 1. Dedicated Benchmark Presentation Card (Domain, Workload Type, Constructs, Citation, and Details modal).
 * 2. Dedicated Scale Tier / Dataset Selector Bar (Controls all results across the page: metrics, matrix, ingestion).
 * 3. Summary metric blocks (.metrics-grid / .metric-block) showing high-level numbers for the active scale.
 * 4. Side-by-side comparison matrix (Query rows, Engine columns, Best engine, Latency ratio).
 * 5. Ingestion performance table scoped to the selected scale.
 * 6. Collapsible Methodology & Environment details (<details>).
 * 7. Native <dialog> modal for detailed SPARQL, repetitions, and CLI reproduction.
 */

import {
	bindBenchmarkCardEvents,
	renderBenchmarkCard,
} from "../components/benchmark-card.js";
import { modalDialog } from "../components/modal.js";
import { DATASET_DESCRIPTORS } from "../descriptors/datasets.js";
import { escapeHtml } from "../engine-id.js";

export class BenchmarkDatasetView {
	constructor(datasetId) {
		this.datasetId = datasetId;
		this.selectedFile = null;
		this.descriptor = DATASET_DESCRIPTORS[datasetId] || {
			id: datasetId,
			name: datasetId.toUpperCase(),
			shortName: datasetId.toUpperCase(),
			subtitle: "Knowledge Graph Benchmark",
			citation: "",
			officialUrl: "",
			scales: [],
			queryDescriptions: {},
			reproduceCli: `./gradlew run --args="--dataset ${datasetId}"`,
		};
	}

	render(container, { data, activeEngines = [] }) {
		this.container = container;
		this.data = data;
		this.activeEngines = activeEngines;

		const scope = this.prepareScope(data, activeEngines);
		const summary = this.computeSummaryMetrics(
			scope.queryRuns,
			scope.activeFileRuns,
			scope.enginesToDisplay,
		);

		container.innerHTML = `
      <div class="benchmark-view-root">
        <!-- 1. Benchmark Presentation Card -->
        ${renderBenchmarkCard(this.descriptor)}

        <!-- 2. Scale Tier Selector Bar -->
        ${this.renderScaleSelector(scope)}

        <!-- 3. Metric Overview Grid -->
        ${this.renderSummaryMetrics(summary)}

        <!-- 4. Side-by-Side Query Comparison Matrix -->
        ${this.renderQueryMatrixSection(scope)}

        <!-- 5. Ingestion & Storage Performance Section -->
        ${this.renderIngestionSection(scope)}

        <!-- 6. Collapsible Methodology & Hardware Footer -->
        ${this.renderMethodologyFooter(scope.env, scope.protocol)}
      </div>
    `;

		bindBenchmarkCardEvents(this.container, this.descriptor);
		this.bindEvents(scope.queryRuns, scope.runs, scope.queries);
	}

	prepareScope(data, activeEngines) {
		const allRuns = (data.runs || []).filter(
			(r) => r.dataset === this.datasetId,
		);
		const allQueryRuns = (data.queryRuns || []).filter(
			(q) => q.dataset === this.datasetId,
		);
		const queries = data.metadata?.datasetQueries?.[this.datasetId] || [];
		const env = data.metadata?.environment || null;
		const protocol = data.metadata?.protocol || null;

		const availableFiles = Array.from(new Set(allRuns.map((r) => r.file)))
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
		if (!this.selectedFile || !availableFiles.includes(this.selectedFile)) {
			this.selectedFile = availableFiles[0] || null;
		}

		const activeKeys = new Set(
			activeEngines.map((e) => (typeof e === "string" ? e : e.raw || e.id)),
		);
		const presentEngines = Array.from(
			new Set([
				...allRuns.map((r) => r.engine),
				...allQueryRuns.map((q) => q.engine),
			]),
		);
		const enginesToDisplay =
			activeKeys.size > 0
				? presentEngines.filter((eng) => activeKeys.has(eng))
				: presentEngines;

		const runs = allRuns.filter((r) => enginesToDisplay.includes(r.engine));
		const queryRuns = allQueryRuns.filter((q) =>
			enginesToDisplay.includes(q.engine),
		);
		const activeFileRuns = this.selectedFile
			? runs.filter((r) => r.file === this.selectedFile)
			: runs;

		const activeRunItem = allRuns.find((r) => r.file === this.selectedFile);
		const activeTriplesText = activeRunItem?.triples
			? `${Number(activeRunItem.triples).toLocaleString("en-US")} triples`
			: "Loaded file";

		return {
			allRuns,
			allQueryRuns,
			queries,
			env,
			protocol,
			availableFiles,
			enginesToDisplay,
			runs,
			queryRuns,
			activeFileRuns,
			activeTriplesText,
		};
	}

	renderScaleSelector(scope) {
		let fileSelectorHtml = `
      <div class="scale-single-file">
        <span class="file-tab-btn is-active" style="cursor: default;">${escapeHtml(this.selectedFile || "single file")}</span>
      </div>
    `;

		if (scope.availableFiles.length > 1) {
			const tabsHtml = scope.availableFiles
				.map((file) => {
					const fRun = scope.allRuns.find((r) => r.file === file);
					const triplesBadge = fRun?.triples
						? ` (${Number(fRun.triples).toLocaleString("en-US")} t)`
						: "";
					const isActive = file === this.selectedFile;
					return `
            <button type="button" role="tab" class="file-tab-btn ${isActive ? "is-active" : ""}" data-file="${escapeHtml(file)}" aria-selected="${isActive}">
              ${escapeHtml(file)}${triplesBadge}
            </button>
          `;
				})
				.join("");

			fileSelectorHtml = `
        <div class="file-selector-tabs" role="tablist" aria-label="Dataset Scales">
          ${tabsHtml}
        </div>
      `;
		}

		return `
      <section class="scale-selector-bar" aria-label="Scale Selection">
        <div class="scale-selector-header">
          <span class="scale-selector-label">Scale Tier & Dataset File</span>
          <span class="scale-selector-active-info font-mono">Active: <strong>${escapeHtml(this.selectedFile || "n/a")}</strong> · ${scope.activeTriplesText}</span>
        </div>
        ${fileSelectorHtml}
      </section>
    `;
	}

	renderSummaryMetrics(summary) {
		let queriesNote = "No queries for dataset";
		if (summary.totalQueries > 0) {
			queriesNote =
				summary.failedQueries === 0
					? "100% completed"
					: `${summary.failedQueries} timeout/mismatch`;
		}
		const queriesEvaluatedText =
			summary.totalQueries > 0
				? `${summary.passedQueries}/${summary.totalQueries}`
				: "n/a";
		const queriesEvaluatedClass =
			summary.totalQueries > 0 && summary.passedQueries === summary.totalQueries
				? "text-success"
				: "";

		const bestGeoMeanText =
			summary.bestGeoMean != null
				? `${summary.bestGeoMean.toFixed(1)} ms`
				: "n/a";
		const bestThroughputText =
			summary.bestThroughput != null
				? `${Math.round(summary.bestThroughput).toLocaleString("en-US")} t/s`
				: "n/a";
		const minHeapDeltaText =
			summary.minHeapDelta != null
				? `${summary.minHeapDelta.toFixed(1)} MB`
				: "n/a";

		return `
      <section class="summary-section" aria-label="Metric Overview">
        <div class="metrics-grid">
          <div class="metric-block" data-metric="queries">
            <div class="metric-block-inner">
              <span class="metric-label">Queries Evaluated</span>
              <span class="metric-num ${queriesEvaluatedClass}">${queriesEvaluatedText}</span>
              <span class="metric-note">${queriesNote}</span>
            </div>
          </div>
          <div class="metric-block" data-metric="latency">
            <div class="metric-block-inner">
              <span class="metric-label">Geo-Mean Latency</span>
              <span class="metric-num highlight-accent">${bestGeoMeanText}</span>
              <span class="metric-note">${summary.bestLatencyEngine ? `Best: ${summary.bestLatencyEngine}` : "Computed on completed queries"}</span>
            </div>
          </div>
          <div class="metric-block" data-metric="throughput">
            <div class="metric-block-inner">
              <span class="metric-label">Peak Ingestion Speed</span>
              <span class="metric-num text-success">${bestThroughputText}</span>
              <span class="metric-note">${summary.bestThroughputEngine ? `Best: ${summary.bestThroughputEngine}` : "Triples per wall-clock second"}</span>
            </div>
          </div>
          <div class="metric-block" data-metric="memory">
            <div class="metric-block-inner">
              <span class="metric-label">Min Heap Delta</span>
              <span class="metric-num">${minHeapDeltaText}</span>
              <span class="metric-note">${summary.minHeapEngine ? `Best: ${summary.minHeapEngine}` : "JVM heap allocation delta"}</span>
            </div>
          </div>
        </div>
      </section>
    `;
	}

	renderQueryMatrixSection(scope) {
		if (scope.queries.length === 0 && scope.queryRuns.length === 0) {
			return "";
		}
		return `
      <section class="benchmark-data-section">
        <div class="section-title-bar">
          <div>
            <h3 class="section-title">Query Performance Matrix</h3>
            <p class="section-desc">Side-by-side median execution latency (ms) per engine. The fastest engine on each query is highlighted. Click [?] or any cell to inspect SPARQL and repetition variance.</p>
          </div>
        </div>
        <div class="table-container">
          ${this.renderCompareMatrix(scope.queryRuns, scope.enginesToDisplay, scope.queries)}
        </div>
      </section>
    `;
	}

	renderIngestionSection(scope) {
		return `
      <section class="benchmark-data-section">
        <div class="section-title-bar">
          <div>
            <h3 class="section-title">Ingestion & Storage Performance</h3>
            <p class="section-desc">Parse wall-clock time, triple throughput, and JVM heap delta for query-ready indexing (${escapeHtml(this.selectedFile || "active dataset")}).</p>
          </div>
        </div>
        <div class="table-container">
          <table class="academic-table" id="table-ingestion">
            <thead>
              <tr>
                <th scope="col">Engine</th>
                <th scope="col">Dataset File</th>
                <th scope="col" class="num-col">Triples</th>
                <th scope="col" class="num-col">Loading Time (ms)</th>
                <th scope="col" class="num-col">Throughput (triples/s)</th>
                <th scope="col" class="num-col">Heap Delta (MB)</th>
                <th scope="col" class="action-col">Inspect</th>
              </tr>
            </thead>
            <tbody>
              ${this.renderIngestionRows(scope.runs, this.selectedFile)}
            </tbody>
          </table>
        </div>
      </section>
    `;
	}

	renderMethodologyFooter(env, protocol) {
		return `
      <details class="methodology-details">
        <summary class="methodology-summary">
          <span>Methodology, Environment & Reproduction Reference</span>
          <span class="methodology-arrow" aria-hidden="true">▾</span>
        </summary>
        <div class="methodology-body">
          <div class="methodology-grid">
            <div class="method-col">
              <h4 class="method-title">Academic Citation & Dataset</h4>
              <p class="method-citation">${escapeHtml(this.descriptor.citation || "Official academic specification.")}</p>
              <div class="tile-kv-list">
                <div class="kv-row"><span class="kv-k">Scale Definition:</span><span class="kv-v">${escapeHtml(this.descriptor.scaleFactorMeaning || "n/a")}</span></div>
                <div class="kv-row"><span class="kv-k">Available Scales:</span><span class="kv-v">${this.descriptor.scales.map((s) => s.name).join(", ") || "n/a"}</span></div>
              </div>
            </div>

            <div class="method-col">
              <h4 class="method-title">Execution Environment</h4>
              <div class="tile-kv-list">
                <div class="kv-row"><span class="kv-k">CPU:</span><span class="kv-v font-mono">${escapeHtml(env?.cpuModel || "n/a")} (${env?.cpuCores ? `${env.cpuCores} cores` : "n/a"})</span></div>
                <div class="kv-row"><span class="kv-k">RAM / OS:</span><span class="kv-v font-mono">${env?.ramTotalGb ? `${env.ramTotalGb} GB` : "n/a"} · ${escapeHtml(env?.osDistribution || "n/a")}</span></div>
                <div class="kv-row"><span class="kv-k">JVM:</span><span class="kv-v font-mono">${escapeHtml(env?.jvmVendor || "n/a")} ${escapeHtml(env?.jvmVersion || "n/a")}</span></div>
                <div class="kv-row"><span class="kv-k">JVM Flags:</span><span class="kv-v font-mono">${env?.jvmFlags ? env.jvmFlags.join(" ") : "n/a"}</span></div>
              </div>
            </div>

            <div class="method-col">
              <h4 class="method-title">Measurement Protocol</h4>
              <div class="tile-kv-list">
                <div class="kv-row"><span class="kv-k">Isolation:</span><span class="kv-v">Isolated JVM subprocess per engine</span></div>
                <div class="kv-row"><span class="kv-k">Warmup / Reps:</span><span class="kv-v font-mono">${protocol?.warmup != null ? `${protocol.warmup} discarded` : "n/a"} · ${protocol?.repetitions != null ? `${protocol.repetitions} sequential runs` : "n/a"}</span></div>
                <div class="kv-row"><span class="kv-k">Metric:</span><span class="kv-v font-mono">${escapeHtml(protocol?.metric || "Median (p50)")}</span></div>
              </div>
            </div>
          </div>
        </div>
      </details>
    `;
	}

	computeSummaryMetrics(queryRuns, runs, engines) {
		const uniqueQueries = Array.from(new Set(queryRuns.map((q) => q.queryId)));
		const totalQueries = uniqueQueries.length;
		let passedQueries = 0;
		let failedQueries = 0;

		queryRuns.forEach((q) => {
			if (q.status === "PASS") passedQueries++;
			else if (
				q.status === "FAIL" ||
				q.status === "TIMEOUT" ||
				q.status === "MISMATCH"
			)
				failedQueries++;
		});

		// Compute Geo-Mean latency per engine
		const engineGeoMeans = new Map();
		engines.forEach((eng) => {
			const engRuns = queryRuns.filter(
				(q) => q.engine === eng && q.medianMs != null && q.medianMs > 0,
			);
			if (engRuns.length > 0) {
				const sumLog = engRuns.reduce(
					(acc, q) => acc + Math.log(q.medianMs),
					0,
				);
				const geoMean = Math.exp(sumLog / engRuns.length);
				engineGeoMeans.set(eng, geoMean);
			}
		});

		let bestGeoMean = null;
		let bestLatencyEngine = null;
		engineGeoMeans.forEach((mean, eng) => {
			if (bestGeoMean == null || mean < bestGeoMean) {
				bestGeoMean = mean;
				bestLatencyEngine = eng;
			}
		});

		// Ingestion Throughput & Memory
		let bestThroughput = null;
		let bestThroughputEngine = null;
		let minHeapDelta = null;
		let minHeapEngine = null;

		runs.forEach((r) => {
			if (
				r.throughputTriplesPerSec != null &&
				(bestThroughput == null || r.throughputTriplesPerSec > bestThroughput)
			) {
				bestThroughput = r.throughputTriplesPerSec;
				bestThroughputEngine = r.engine;
			}
			if (
				r.memoryDeltaMb != null &&
				(minHeapDelta == null || r.memoryDeltaMb < minHeapDelta)
			) {
				minHeapDelta = r.memoryDeltaMb;
				minHeapEngine = r.engine;
			}
		});

		return {
			totalQueries,
			passedQueries: Math.min(passedQueries, totalQueries),
			failedQueries,
			bestGeoMean,
			bestLatencyEngine,
			bestThroughput,
			bestThroughputEngine,
			minHeapDelta,
			minHeapEngine,
		};
	}

	renderCompareMatrix(queryRuns, engines, _queries) {
		if (engines.length === 0) {
			return `<div class="empty-state">No engines selected for comparison.</div>`;
		}

		// Pivot queryRuns by queryId -> { [engine]: qrun }
		const matrix = new Map();
		queryRuns.forEach((qrun) => {
			if (!matrix.has(qrun.queryId)) {
				matrix.set(qrun.queryId, new Map());
			}
			matrix.get(qrun.queryId).set(qrun.engine, qrun);
		});

		// Sort query IDs numerically (e.g. query_1, query_2 ... query_12)
		const sortedQueryIds = Array.from(matrix.keys()).sort((a, b) => {
			const numA = extractQueryIndex(a) || 0;
			const numB = extractQueryIndex(b) || 0;
			return numA - numB;
		});

		if (sortedQueryIds.length === 0) {
			return `<div class="empty-state">No query execution data available for this dataset.</div>`;
		}

		const headerCols = engines
			.map((eng) => `<th scope="col" class="num-col">${escapeHtml(eng)}</th>`)
			.join("");

		const rowsHtml = sortedQueryIds
			.map((qId) => {
				const engMap = matrix.get(qId);
				const qIndex = extractQueryIndex(qId);
				const qMeta = this.descriptor.queryDescriptions?.[qId] || {
					name: `Query ${qIndex || qId}`,
					desc: "SPARQL benchmark query",
					features: "SPARQL 1.1",
				};

				// Determine the minimum median latency among all engines for this query
				let minLatency = null;
				engines.forEach((eng) => {
					const qrun = engMap.get(eng);
					if (qrun?.medianMs != null && qrun.medianMs > 0) {
						if (minLatency == null || qrun.medianMs < minLatency) {
							minLatency = qrun.medianMs;
						}
					}
				});

				// Build Engine latency columns
				const engineCells = engines
					.map((eng) => {
						const qrun = engMap.get(eng);
						if (!qrun)
							return `<td class="num-col font-mono text-faint">n/a</td>`;
						if (qrun.status === "TIMEOUT") {
							return `<td class="num-col"><span class="status-badge badge-fail">TIMEOUT</span></td>`;
						}
						if (qrun.medianMs == null) {
							return `<td class="num-col font-mono text-faint">n/a</td>`;
						}

						const isFastest =
							minLatency != null && qrun.medianMs === minLatency;
						const cellClass = isFastest
							? "fastest-cell font-mono"
							: "font-mono";

						return `
          <td class="num-col ${cellClass}" data-query-id="${escapeHtml(qId)}" data-query-engine="${escapeHtml(eng)}">
            ${isFastest ? `<strong>${qrun.medianMs} ms</strong>` : `${qrun.medianMs} ms`}
          </td>
        `;
					})
					.join("");

				return `
        <tr class="table-data-row matrix-row" data-query-id="${escapeHtml(qId)}">
          <td class="font-mono matrix-qid"><strong>${escapeHtml(qId)}</strong></td>
          <td>
            <div class="query-cell-title">${escapeHtml(qMeta.name)}</div>
            <div class="query-cell-desc">${escapeHtml(qMeta.desc)}</div>
            <div class="query-cell-features">${escapeHtml(qMeta.features)}</div>
          </td>
          ${engineCells}
          <td class="action-col">
            <button type="button" class="btn btn-xs btn-outline btn-inspect-sparql" data-query-id="${escapeHtml(qId)}" aria-label="Inspect SPARQL for ${escapeHtml(qId)}" title="Inspect SPARQL">ⓘ</button>
          </td>
        </tr>
      `;
			})
			.join("");

		return `
      <table class="academic-table comparison-matrix">
        <thead>
          <tr>
            <th scope="col" style="width: 70px;">Query</th>
            <th scope="col">Description & Features</th>
            ${headerCols}
            <th scope="col" class="action-col">SPARQL</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
	}

	renderIngestionRows(runs, selectedFile) {
		const fileFilteredRuns = selectedFile
			? runs.filter((r) => r.file === selectedFile)
			: runs;

		if (fileFilteredRuns.length === 0) {
			return `<tr><td colspan="7" class="empty-state">No loading runs available for file "${escapeHtml(selectedFile || "all")}".</td></tr>`;
		}

		return fileFilteredRuns
			.map((run) => {
				const timeFormatted =
					run.loadingTimeMs != null
						? `${Number(run.loadingTimeMs).toLocaleString("en-US")} ms`
						: "n/a";
				const throughputFormatted =
					run.throughputTriplesPerSec != null
						? Math.round(run.throughputTriplesPerSec).toLocaleString("en-US") +
							" t/s"
						: "n/a";
				const heapFormatted =
					run.memoryDeltaMb != null
						? `${Number(run.memoryDeltaMb).toFixed(1)} MB`
						: "n/a";
				const triplesFormatted =
					run.triples != null
						? Number(run.triples).toLocaleString("en-US")
						: "n/a";
				const engineLabel = escapeHtml(run.engine || "n/a");

				return `
        <tr class="table-data-row" data-engine="${escapeHtml(run.engine)}" data-file="${escapeHtml(run.file)}">
          <td class="font-mono"><strong>${engineLabel}</strong></td>
          <td class="font-mono">${escapeHtml(run.file || "n/a")}</td>
          <td class="num-col font-mono">${triplesFormatted}</td>
          <td class="num-col font-mono highlight-num">${timeFormatted}</td>
          <td class="num-col font-mono">${throughputFormatted}</td>
          <td class="num-col font-mono">${heapFormatted}</td>
          <td class="action-col">
            <button type="button" class="btn btn-xs btn-outline btn-inspect-run" data-run-engine="${escapeHtml(run.engine)}" data-run-file="${escapeHtml(run.file)}">Inspect</button>
          </td>
        </tr>
      `;
			})
			.join("");
	}

	bindEvents(queryRuns, runs, queries) {
		// File / Scale selector buttons
		this.container.querySelectorAll(".file-tab-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const targetFile = btn.dataset.file;
				if (targetFile && targetFile !== this.selectedFile) {
					this.selectedFile = targetFile;
					// Re-render the view with the new active scale
					this.render(this.container, {
						data: this.data,
						activeEngines: this.activeEngines,
					});
				}
			});
		});

		this.bindInspectRunEvents(runs);

		// Inspect SPARQL Modal
		this.container
			.querySelectorAll(".btn-inspect-sparql, .matrix-row")
			.forEach((el) => {
				el.addEventListener("click", (_e) => {
					const row = el.closest(".matrix-row") || el;
					const qId = row.dataset.queryId;
					const qIndex = extractQueryIndex(qId);
					const qText =
						qIndex != null && queries[qIndex - 1]
							? queries[qIndex - 1]
							: "# SPARQL query definition not available";
					const qMeta = this.descriptor.queryDescriptions?.[qId] || {
						name: `Query ${qId}`,
						desc: "SPARQL benchmark query",
						features: "SPARQL 1.1",
					};

					// Per-engine latencies and repetitions for this query
					const engRuns = queryRuns.filter((q) => q.queryId === qId);
					const engineDetailsHtml = engRuns
						.map((qrun) => {
							const reps =
								Array.isArray(qrun.repetitionsMs) &&
								qrun.repetitionsMs.length > 0
									? `${qrun.repetitionsMs.join(", ")} ms`
									: "n/a";
							const ttfr =
								qrun.medianTtfrMs != null ? `${qrun.medianTtfrMs} ms` : "n/a";

							return `
            <div class="eng-detail-row">
              <div class="eng-name"><strong>${escapeHtml(qrun.engine)}</strong></div>
              <div class="eng-metrics font-mono">Median: <strong>${qrun.medianMs != null ? `${qrun.medianMs} ms` : "n/a"}</strong> · TTFR: ${ttfr} · Reps: [${reps}]</div>
            </div>
          `;
						})
						.join("");

					modalDialog.open({
						title: `${qId.toUpperCase()}: ${qMeta.name}`,
						badge: "SPARQL",
						bodyHtml: `
            <div class="info-row">
              <span class="info-label">Intent & Features</span>
              <div class="info-value">${escapeHtml(qMeta.desc)}</div>
              <div class="info-value font-mono" style="margin-top: 4px; color: var(--accent);">${escapeHtml(qMeta.features)}</div>
            </div>
            <div class="info-row">
              <span class="info-label">SPARQL Query Definition</span>
              <pre class="info-code modal-preview-code"><code>${escapeHtml(formatSparql(qText))}</code></pre>
            </div>
            <div class="info-row">
              <span class="info-label">Engine Latencies & Repetitions</span>
              <div class="eng-details-container">${engineDetailsHtml || '<div class="text-faint">No engine run records.</div>'}</div>
            </div>
            <div class="info-row">
              <span class="info-label">Reproduction Command</span>
              <pre class="info-code modal-preview-code"><code>./gradlew run --args="--dataset ${escapeHtml(this.datasetId)} --query ${escapeHtml(qId)}"</code></pre>
            </div>
          `,
					});
				});
			});
	}

	bindInspectRunEvents(runs) {
		this.container.querySelectorAll(".btn-inspect-run").forEach((btn) => {
			btn.onclick = () => {
				const eng = btn.dataset.runEngine;
				const file = btn.dataset.runFile;
				const run = runs.find((r) => r.engine === eng && r.file === file);
				if (!run) return;

				const repsFormatted =
					Array.isArray(run.repetitionsMs) && run.repetitionsMs.length > 0
						? run.repetitionsMs
								.map(
									(ms, i) =>
										`Run #${i + 1}: ${Number(ms).toLocaleString("en-US")} ms`,
								)
								.join("\n")
						: "n/a";

				modalDialog.open({
					title: `Ingestion Details: ${eng} (${file})`,
					badge: "INGESTION",
					bodyHtml: `
            <div class="info-row">
              <span class="info-label">Triple Count</span>
              <div class="info-value font-mono">${run.triples != null ? `${Number(run.triples).toLocaleString("en-US")} triples` : "n/a"}</div>
            </div>
            <div class="info-row">
              <span class="info-label">Wall-Clock Loading Time (Median)</span>
              <div class="info-value font-mono"><strong>${run.loadingTimeMs != null ? `${Number(run.loadingTimeMs).toLocaleString("en-US")} ms` : "n/a"}</strong></div>
            </div>
            <div class="info-row">
              <span class="info-label">Throughput</span>
              <div class="info-value font-mono">${run.throughputTriplesPerSec != null ? `${Math.round(run.throughputTriplesPerSec).toLocaleString("en-US")} triples/sec` : "n/a"}</div>
            </div>
            <div class="info-row">
              <span class="info-label">Repetitions (Sequential Runs)</span>
              <pre class="info-code modal-preview-code"><code>${escapeHtml(repsFormatted)}</code></pre>
            </div>
            <div class="info-row">
              <span class="info-label">JVM Heap Footprint</span>
              <div class="info-value font-mono">Before: ${run.memoryBeforeMb != null ? `${run.memoryBeforeMb.toFixed(1)} MB` : "n/a"} ➔ After: ${run.memoryAfterMb != null ? `${run.memoryAfterMb.toFixed(1)} MB` : "n/a"} (Δ ${run.memoryDeltaMb != null ? `${run.memoryDeltaMb.toFixed(1)} MB` : "n/a"})</div>
            </div>
          `,
				});
			};
		});
	}
}

function extractQueryIndex(qId) {
	if (!qId) return null;
	let i = qId.length - 1;
	while (i >= 0) {
		const code = qId.codePointAt(i);
		if (code == null || code < 48 || code > 57) break;
		i--;
	}
	const numStr = qId.slice(i + 1);
	return numStr ? Number.parseInt(numStr, 10) : null;
}

function formatSparql(query) {
	if (!query) return "";
	return query
		.replace(/[ \t]+/g, " ")
		.replaceAll("PREFIX ", "\nPREFIX ")
		.replaceAll("SELECT ", "\nSELECT ")
		.replaceAll("WHERE {", "WHERE {\n  ")
		.replaceAll("} ORDER BY", "\n}\nORDER BY")
		.replaceAll("} GROUP BY", "\n}\nGROUP BY")
		.replaceAll(" . ", " .\n  ")
		.trim();
}
