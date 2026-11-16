/**
 * Corese Benchmark Dashboard - RDF Loading View (Issue #30 & #37)
 * Evaluates ingestion throughput, retained heap, and JVM heap telemetry across engines.
 */

import { attachChartPointerInteraction, colorWithAlpha, findBarElement } from "../chart-utils.js";
import { renderDatasetCard } from "../datasets.js";
import { escapeHtml, formatEngineId, isBranchVersion, parseEngineId } from "../engine-id.js";
import {
	getEngineStyle,
	renderEngineIndicatorSvg,
} from "../engines.js";
import { focusStore, hoverSource } from "../focus-store.js";
import { parseUrlLoading, updateUrlLoading } from "../router.js";

const ALL_FORMATS = ["nt", "ttl", "nq", "trig", "rdf", "jsonld", "html"];

export class LoadingView {
	#root = null;
	#data = null;
	#activeEngines = [];
	#abortController = null;
	#renderAbortController = null;
	#charts = new Map();
	#canvasHover = hoverSource();
	#legendHover = hoverSource();
	#tableHover = hoverSource();
	#state = {
		dataset: "bsbm",
		scale: "small",
		formats: new Set(ALL_FORMATS),
		telemetryFormat: null,
		section: null,
		pin: null,
	};

	constructor(container, reportData, activeEngines) {
		this.#root = container;
		this.#data = reportData;
		this.#activeEngines = activeEngines || [];

		if (typeof window !== "undefined") {
			const urlState = parseUrlLoading(window.location.search);
			this.restoreState(urlState, activeEngines);
		}
	}

	updateActiveEngines(engines) {
		this.#activeEngines = engines || [];
		this.render();
	}

	restoreState(newState, engines) {
		if (engines) {
			this.#activeEngines = engines;
		}
		if (newState) {
			this.#state.dataset = newState.dataset || "bsbm";
			this.#state.scale = newState.scale || "small";
			this.#state.formats = newState.formats || new Set(ALL_FORMATS);
			this.#state.telemetryFormat = newState.telemetryFormat || null;
			this.#state.section = newState.section || null;
			this.#state.pin = newState.pin || null;
			if (newState.pin) {
				focusStore.pin(newState.pin);
			} else if (focusStore.state.pinned) {
				focusStore.unpin();
			}
		}
		this.render();
	}

	#updateState(patch, { history = "replace" } = {}) {
		Object.assign(this.#state, patch);
		updateUrlLoading(this.#state, { history });
		this.render();
	}

	destroy() {
		this.#canvasHover.clear();
		this.#legendHover.clear();
		this.#tableHover.clear();
		if (this.#renderAbortController) {
			this.#renderAbortController.abort();
			this.#renderAbortController = null;
		}
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

		// Re-apply URL pin if present
		if (this.#state.pin) {
			focusStore.pin(this.#state.pin);
		}

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
				const currentPinned = focusStore.state.pinned;
				this.#state.pin = currentPinned ? { kind: currentPinned.kind, key: currentPinned.key } : null;
				updateUrlLoading(this.#state, { history: "replace" });
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

		// Update table rows and tbody container
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

		// Update Chart.js bar alphas without re-rendering geometry
		this.#syncChartDimming();
	}

	#syncChartDimming() {
		const focus = focusStore.effectiveFocus;

		this.#charts.forEach((chart, chartKey) => {
			if (!chart?.data?.datasets) return;

			if (chartKey === "memory") {
				// Horizontal bar chart: 1 dataset, each bar = 1 engine
				const ds = chart.data.datasets[0];
				if (!ds || !chart._engineKeys) return;
				const baseColors = ds._baseColors || ds.backgroundColor;

				const colors = chart._engineKeys.map((eKey, idx) => {
					const baseColor = Array.isArray(baseColors) ? baseColors[idx] : baseColors;
					if (!focus) return baseColor;

					if (focus.target.kind === "engine") {
						return eKey === focus.target.key ? baseColor : colorWithAlpha(baseColor, 0.22);
					}
					if (focus.target.kind === "measure") {
						const [targetEng] = focus.target.key.split("|");
						return eKey === targetEng ? baseColor : colorWithAlpha(baseColor, 0.22);
					}
					return baseColor;
				});

				ds.backgroundColor = colors;
				chart.update();
				return;
			}

			if (chartKey === "telemetry") {
				// Line chart: datasets represent engines
				const format = this.#state.telemetryFormat;
				chart.data.datasets.forEach((ds) => {
					const eKey = ds._engineKey;
					const baseColor = ds._baseColor || "#888";

					if (!focus) {
						ds.borderColor = baseColor;
						ds.borderWidth = 2;
						return;
					}

					let isMatch = false;
					if (focus.target.kind === "engine") {
						isMatch = eKey === focus.target.key;
					} else if (focus.target.kind === "measure") {
						const [targetEng, targetFmt] = focus.target.key.split("|");
						isMatch = eKey === targetEng && (!format || format === targetFmt);
					}

					if (isMatch) {
						ds.borderColor = baseColor;
						ds.borderWidth = 3;
					} else {
						ds.borderColor = colorWithAlpha(baseColor, 0.2);
						ds.borderWidth = 1.5;
					}
				});
				chart.update();
				return;
			}

			// Grouped bar chart (Summary Throughput)
			const activeFormats = chart._activeFormats || ALL_FORMATS.filter((f) => this.#state.formats.has(f));

			chart.data.datasets.forEach((ds) => {
				const eKey = ds._engineKey;
				const baseColor = ds._baseColor || ds.backgroundColor;

				if (!focus) {
					ds.backgroundColor = baseColor;
					return;
				}

				if (focus.target.kind === "engine") {
					const isEngineMatch = eKey === focus.target.key;
					ds.backgroundColor = isEngineMatch ? baseColor : colorWithAlpha(baseColor, 0.22);
				} else if (focus.target.kind === "measure") {
					const [targetEng, targetFmt] = focus.target.key.split("|");
					const colors = activeFormats.map((fmt) => {
						const isExactBar = eKey === targetEng && fmt === targetFmt;
						return isExactBar ? baseColor : colorWithAlpha(baseColor, 0.22);
					});
					ds.backgroundColor = colors;
				}
			});

			chart.update();
		});
	}

	render() {
		if (!this.#root) return;
		this.#canvasHover.clear();
		this.#tableHover.clear();
		this.#legendHover.clear();
		if (this.#renderAbortController) {
			this.#renderAbortController.abort();
		}
		this.#renderAbortController = new AbortController();
		this.#destroyCharts();
		this.#root.replaceChildren();

		const section = document.createElement("div");
		section.className = "loading-view-container";

		// Controls Header (Dataset, Scale, Format selectors)
		section.appendChild(this.#renderControls());

		// Scientific Dataset Presentation Card
		const datasetCardHost = document.createElement("div");
		datasetCardHost.id = "section-loading-dataset";
		datasetCardHost.className = "dataset-card-host";
		renderDatasetCard(this.#state, datasetCardHost, this.#data);
		section.appendChild(datasetCardHost);

		// Reproducibility Protocol Tile
		const protocolEl = this.#renderProtocolTile();
		protocolEl.id = "section-loading-protocol";
		section.appendChild(protocolEl);

		// Filter runs by dataset, scale AND format uniformly
		const allLoadingRuns = this.#data?.loadingRuns || [];
		const isDbpedia = this.#state.dataset.toLowerCase() === "dbpedia";
		const datasetFilteredRows = allLoadingRuns.filter((r) => {
			const matchDs = r.dataset?.toLowerCase() === this.#state.dataset.toLowerCase();
			const matchScale = this.#matchScale(r.file, this.#state.scale);
			const fmt = r.format || r.file?.split(".").pop();
			const matchFormat = this.#state.formats.has(fmt);

			// For DBpedia, use the canonical cross-format slice (persondata_en) across all views
			if (isDbpedia && !r.file?.startsWith("persondata_en.")) {
				return false;
			}

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
			const normalizedKey = formatEngineId(parseEngineId(r.engine));
			return activeEngineLabels.has(r.engine) || activeEngineKeys.has(r.engine) || activeEngineKeys.has(normalizedKey);
		});

		// Multi-Format Throughput Summary Chart
		const throughputEl = this.#renderSummaryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		throughputEl.id = "section-loading-throughput";
		section.appendChild(throughputEl);

		// Retained Heap After Ingestion Chart
		const memoryEl = this.#renderMemoryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		memoryEl.id = "section-loading-retained-heap";
		section.appendChild(memoryEl);

		// Dynamic Ingestion Telemetry Profile
		const telemetryEl = this.#renderTelemetryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		telemetryEl.id = "section-loading-telemetry";
		section.appendChild(telemetryEl);

		// Detailed Data Table
		const tableEl = this.#renderTable(strictlyFilteredRows, orderedEngineConfigs, catalog);
		tableEl.id = "section-loading-table";
		section.appendChild(tableEl);

		this.#root.appendChild(section);

		// Render Chart.js instances after DOM mounting
		this.#initSummaryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		this.#initMemoryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		this.#initTelemetryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);

		// Synchronize current focus visuals on fresh render
		this.#syncFocusVisuals();

		// Scroll to targeted section only once at initial mount/navigation
		if (this.#state.section) {
			const targetId = `section-loading-${this.#state.section}`;
			this.#state.section = null;
			requestAnimationFrame(() => {
				const target = this.#root?.querySelector(`#${targetId}`);
				if (target) {
					target.scrollIntoView({ behavior: "smooth", block: "start" });
				}
			});
		}
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
				this.#updateState({ dataset: ds }, { history: "push" });
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
					this.#updateState({ scale: sc }, { history: "push" });
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
				const nextFormats = new Set(this.#state.formats);
				if (nextFormats.has(fmt)) {
					if (nextFormats.size === 1) {
						// Guard: keep at least 1 format active
						pill.classList.remove("is-denied");
						pill.getBoundingClientRect();
						pill.classList.add("is-denied");
						return;
					}
					nextFormats.delete(fmt);
				} else {
					nextFormats.add(fmt);
				}
				this.#updateState({ formats: nextFormats }, { history: "replace" });
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
		const isDbpedia = this.#state.dataset.toLowerCase() === "dbpedia";
		const sliceNote = isDbpedia ? " · Slice: persondata_en" : "";
		const dsMeta = `Selected engines and formats · Median of ${reps} runs per engine/format${sliceNote} · Grouped by format`;

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

		const signal = this.#renderAbortController?.signal || this.#abortController?.signal;

		// Formats for X-axis (only formats actually present in filtered rows AND selected)
		const rowsFormats = new Set(rows.map((r) => r.format || r.file?.split(".").pop()).filter(Boolean));
		const activeFormats = ALL_FORMATS.filter((f) => this.#state.formats.has(f) && (rowsFormats.size === 0 || rowsFormats.has(f)));
		const formatLabels = activeFormats.map((f) => `.${f.toUpperCase()}`);

		// Datasets strictly ordered and styled following engine selector norms
		const datasets = orderedEngines.map((engConfig) => {
			const color = engConfig.style.color;
			const dataPoints = activeFormats.map((fmt) => {
				const isDbpedia = this.#state.dataset.toLowerCase() === "dbpedia";
				const matchingRows = rows.filter((row) => {
					const rowKey = formatEngineId(parseEngineId(row.engine));
					const matchEng = rowKey === engConfig.key || row.engine === engConfig.key;
					const matchFmt = row.format === fmt || row.file?.endsWith(`.${fmt}`);
					return matchEng && matchFmt;
				});

				const r = isDbpedia
					? matchingRows.find((row) => row.file?.startsWith("persondata_en.")) || matchingRows[0]
					: matchingRows[0];

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

			attachChartPointerInteraction(chart, canvas, activeFormats, this.#canvasHover, signal);

			chart._activeFormats = activeFormats;
			this.#charts.set("summary", chart);
		} catch (err) {
			console.error("Failed to render Chart.js summary:", err);
		}
	}

	#renderMemoryChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		const dsMeta = "Selected in-memory engines · Median across selected formats · Sorted by retained heap ascending";

		const header = document.createElement("div");
		header.className = "section-header";
		header.innerHTML = `
			<div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;">
				<h3 style="margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;">
					<span>Retained Heap After Ingestion</span>
					<span class="tag-format">B / triple</span>
				</h3>
			</div>
			<span class="section-meta">
				<span class="meta-label">${escapeHtml(dsMeta)}</span>
				<span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
			</span>
		`;

		section.appendChild(header);

		const body = document.createElement("div");
		body.className = "section-body";
		body.style.position = "relative";
		body.style.height = "280px";

		const canvas = document.createElement("canvas");
		canvas.id = "loading-memory-chart";
		body.appendChild(canvas);

		section.appendChild(body);
		return section;
	}

	#initMemoryChart(rows, orderedEngines, catalog) {
		if (window.Chart === undefined) return;

		const canvas = document.getElementById("loading-memory-chart");
		if (!canvas) return;

		const signal = this.#renderAbortController?.signal || this.#abortController?.signal;

		// Strictly in-memory engines: on-disk engines (TDB2, Native, LMDB) manage storage outside JVM heap
		const filteredEngines = orderedEngines.filter((eng) => {
			const isDisk = eng.storageId === "tdb2" || eng.storageId === "native" || eng.storageId === "lmdb";
			return !isDisk;
		});

		// Compute per-engine summary across active formats
		const engineSummaries = filteredEngines.map((engConfig) => {
			const engineRows = rows.filter((r) => {
				const rowKey = formatEngineId(parseEngineId(r.engine));
				const fmt = r.format || r.file?.split(".").pop();
				return (rowKey === engConfig.key || r.engine === engConfig.key) &&
					this.#state.formats.has(fmt) &&
					typeof r.memoryDeltaMb === "number" &&
					Number.isFinite(r.memoryDeltaMb) &&
					r.memoryDeltaMb > 0 &&
					r.triples > 0;
			});

			const bValues = engineRows.map((r) => {
				const bPerTriple = Math.round((r.memoryDeltaMb * 1024 * 1024) / r.triples);
				const fmt = r.format || r.file?.split(".").pop();
				return { format: fmt, bPerTriple, mib: r.memoryDeltaMb };
			}).sort((a, b) => a.bPerTriple - b.bPerTriple);

			let medianB = null;
			let minB = null;
			let maxB = null;
			let medianMib = null;

			if (bValues.length > 0) {
				const mid = Math.floor(bValues.length / 2);
				if (bValues.length % 2 === 1) {
					medianB = bValues[mid].bPerTriple;
					medianMib = bValues[mid].mib;
				} else {
					medianB = Math.round((bValues[mid - 1].bPerTriple + bValues[mid].bPerTriple) / 2);
					medianMib = (bValues[mid - 1].mib + bValues[mid].mib) / 2;
				}
				minB = bValues[0].bPerTriple;
				maxB = bValues[bValues.length - 1].bPerTriple;
			}

			return {
				engineKey: engConfig.key,
				label: engConfig.label,
				color: engConfig.style.color,
				medianB,
				minB,
				maxB,
				medianMib,
				details: bValues,
			};
		}).filter((item) => item.medianB !== null);

		// Sort engines by median B / triple ascending (lower is better)
		engineSummaries.sort((a, b) => (a.medianB ?? 999999) - (b.medianB ?? 999999));

		const labels = engineSummaries.map((s) => s.label);
		const dataValues = engineSummaries.map((s) => s.medianB);
		const colors = engineSummaries.map((s) => s.color);
		const engineKeys = engineSummaries.map((s) => s.engineKey);

		const isDark = document.documentElement.dataset.theme === "dark";
		const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
		const textColor = isDark ? "#8b949e" : "#656d76";

		try {
			const chart = new window.Chart(canvas, {
				type: "bar",
				data: {
					labels: labels,
					datasets: [
						{
							label: "Median Retained Heap",
							data: dataValues,
							backgroundColor: colors,
							borderRadius: 4,
							barThickness: 24,
							_baseColors: colors,
						},
					],
				},
				options: {
					indexAxis: "y",
					responsive: true,
					maintainAspectRatio: false,
					animation: false,
					onClick: (e, elements) => {
						if (elements && elements.length > 0) {
							const index = elements[0].index;
							const summary = engineSummaries[index];
							if (summary) {
								focusStore.togglePin({ kind: "engine", key: summary.engineKey });
							}
						}
					},
					plugins: {
						legend: {
							display: false,
						},
						tooltip: {
							callbacks: {
								label: (ctx) => {
									const summary = engineSummaries[ctx.dataIndex];
									if (!summary) return "";
									const mibStr = summary.medianMib ? ` (${summary.medianMib.toFixed(1)} MiB)` : "";
									const rangeStr = summary.minB !== summary.maxB ? ` [range: ${summary.minB} – ${summary.maxB} B/t]` : "";
									return ` Median: ${summary.medianB} B / triple${mibStr}${rangeStr}`;
								},
								afterBody: (items) => {
									if (!items || items.length === 0) return [];
									const summary = engineSummaries[items[0].dataIndex];
									if (!summary?.details || summary.details.length <= 1) return [];
									return [
										"",
										"Across formats:",
										...summary.details.map((d) => `  .${d.format}: ${d.bPerTriple} B/t (${d.mib.toFixed(1)} MiB)`),
									];
								},
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
							beginAtZero: true,
							grid: { color: gridColor },
							ticks: {
								color: textColor,
								font: { weight: 600 },
								callback: (val) => `${val} B`,
							},
							title: {
								display: true,
								text: "Retained Heap (Bytes / Triple) — Lower is better",
								color: textColor,
								font: { size: 11, weight: 600 },
							},
						},
						y: {
							grid: { display: false },
							ticks: {
								color: textColor,
								font: { weight: 600, size: 12 },
							},
						},
					},
				},
			});

			// Direct DOM pointer interactions on horizontal bars
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

			canvas.addEventListener("pointerleave", clearCanvasState, { signal });
			canvas.addEventListener("pointercancel", clearCanvasState, { signal });
			canvas.addEventListener("mouseout", clearCanvasState, { signal });

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

					const hit = findBarElement(chart, x, y);
					if (hit) {
						const summary = engineSummaries[hit.index];
						if (summary) {
							this.#canvasHover.set({ kind: "engine", key: summary.engineKey });
							const activeElements = [{ datasetIndex: 0, index: hit.index }];
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

			window.addEventListener("scroll", clearCanvasState, { signal, passive: true });

			chart._engineKeys = engineKeys;
			this.#charts.set("memory", chart);
		} catch (err) {
			console.error("Failed to render Chart.js memory:", err);
		}
	}

	#renderTelemetryChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		// Discover active formats that actually have timeSeries data
		const availableFormats = ALL_FORMATS.filter((f) => {
			if (!this.#state.formats.has(f)) return false;
			return rows.some((r) => {
				const rFmt = r.format || r.file?.split(".").pop();
				return rFmt === f && Array.isArray(r.timeSeries) && r.timeSeries.length >= 2;
			});
		});

		// Auto-select first available format if not set or invalid
		if (!this.#state.telemetryFormat || !availableFormats.includes(this.#state.telemetryFormat)) {
			this.#state.telemetryFormat = availableFormats[0] || null;
		}

		const currentFormat = this.#state.telemetryFormat;
		const dsMeta = "Final recorded run · Sampled ≈100 ms";

		const header = document.createElement("div");
		header.className = "section-header";

		const titleGroup = document.createElement("div");
		titleGroup.style.display = "flex";
		titleGroup.style.alignItems = "center";
		titleGroup.style.flexWrap = "wrap";
		titleGroup.style.gap = "10px";

		const h3 = document.createElement("h3");
		h3.style.margin = "0";
		h3.style.fontSize = "15px";
		h3.style.fontWeight = "600";
		h3.style.display = "flex";
		h3.style.alignItems = "center";
		h3.style.gap = "8px";
		h3.innerHTML = `
			<span>Heap Telemetry Profile</span>
			<span class="tag-format">MiB</span>
		`;
		titleGroup.appendChild(h3);

		// Format switch: styled segmented radio-like selector matching Design System
		if (availableFormats.length > 0) {
			const selectorWrap = document.createElement("div");
			selectorWrap.className = "telemetry-format-selector";
			selectorWrap.setAttribute("role", "radiogroup");
			selectorWrap.setAttribute("aria-label", "Telemetry profile format");

			const selectorLabel = document.createElement("span");
			selectorLabel.className = "telemetry-format-label";
			selectorLabel.textContent = "Format:";
			selectorWrap.appendChild(selectorLabel);

			const pillGroup = document.createElement("div");
			pillGroup.style.display = "inline-flex";
			pillGroup.style.alignItems = "center";
			pillGroup.style.gap = "4px";

			availableFormats.forEach((fmt) => {
				const isChecked = fmt === currentFormat;
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = `telemetry-pill-btn ${isChecked ? "is-active" : ""}`;
				btn.setAttribute("role", "radio");
				btn.setAttribute("aria-checked", String(isChecked));
				btn.textContent = `.${fmt}`;
				btn.title = `Show heap telemetry curve for .${fmt}`;
				btn.addEventListener("click", () => {
					this.#updateState({ telemetryFormat: fmt }, { history: "replace" });
				});
				pillGroup.appendChild(btn);
			});
			selectorWrap.appendChild(pillGroup);
			titleGroup.appendChild(selectorWrap);
		}

		header.appendChild(titleGroup);

		const metaSpan = document.createElement("span");
		metaSpan.className = "section-meta";
		metaSpan.innerHTML = `
			<span class="meta-label">${escapeHtml(dsMeta)}</span>
			<span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
		`;
		header.appendChild(metaSpan);
		section.appendChild(header);

		const body = document.createElement("div");
		body.className = "section-body";
		body.style.position = "relative";
		body.style.height = "320px";

		if (!currentFormat) {
			body.innerHTML = `
				<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px;">
					No time series telemetry available for the current selection.
				</div>
			`;
		} else {
			const canvas = document.createElement("canvas");
			canvas.id = "loading-telemetry-chart";
			body.appendChild(canvas);
		}

		section.appendChild(body);
		return section;
	}

	#initTelemetryChart(rows, orderedEngines, catalog) {
		if (window.Chart === undefined) return;

		const canvas = document.getElementById("loading-telemetry-chart");
		if (!canvas) return;

		const signal = this.#renderAbortController?.signal || this.#abortController?.signal;
		const currentFormat = this.#state.telemetryFormat;
		if (!currentFormat) return;

		// Filter runs matching the selected telemetry format and active engines
		const formatRows = rows.filter((r) => {
			const rFmt = r.format || r.file?.split(".").pop();
			return rFmt === currentFormat && Array.isArray(r.timeSeries) && r.timeSeries.length >= 2;
		});

		// Build datasets per ordered engine
		const datasets = [];
		const engineKeys = [];

		orderedEngines.forEach((engConfig) => {
			const matchingRun = formatRows.find((r) => {
				const rowKey = formatEngineId(parseEngineId(r.engine));
				return rowKey === engConfig.key || r.engine === engConfig.key;
			});

			if (!matchingRun?.timeSeries) return;

			// Validate and clean telemetry points: strictly finite positive numbers, monotonic elapsedMs
			let lastElapsed = -1;
			const validPoints = [];
			for (let i = 0; i < matchingRun.timeSeries.length; i++) {
				const p = matchingRun.timeSeries[i];
				if (!p || typeof p.elapsedMs !== "number" || typeof p.heapUsedMb !== "number") continue;
				if (!Number.isFinite(p.elapsedMs) || !Number.isFinite(p.heapUsedMb)) continue;
				if (p.elapsedMs < 0 || p.heapUsedMb < 0) continue;
				if (p.elapsedMs < lastElapsed) continue; // enforce chronological order

				const isLastInRaw = i === matchingRun.timeSeries.length - 1;
				validPoints.push({
					x: p.elapsedMs / 1000,
					y: p.heapUsedMb,
					isPostGcFinal: isLastInRaw,
				});
				lastElapsed = p.elapsedMs;
			}

			if (validPoints.length < 2) return;

			const maxHeap = Math.max(...validPoints.map((p) => p.y));
			const totalTriples = matchingRun.triples || 0;
			const loadingDurSec = matchingRun.loadingTimeMs ? matchingRun.loadingTimeMs / 1000 : null;

			engineKeys.push(engConfig.key);

			datasets.push({
				label: engConfig.label,
				_engineKey: engConfig.key,
				_baseColor: engConfig.style.color,
				_maxHeap: maxHeap,
				_totalTriples: totalTriples,
				_loadingDurSec: loadingDurSec,
				data: validPoints,
				borderColor: engConfig.style.color,
				backgroundColor: "transparent",
				borderWidth: 2,
				pointRadius: (ctx) => (ctx.raw?.isPostGcFinal ? 4 : 0),
				pointBackgroundColor: (ctx) => (ctx.raw?.isPostGcFinal ? engConfig.style.color : "transparent"),
				pointBorderColor: "#ffffff",
				pointBorderWidth: 1.5,
				pointHoverRadius: 5,
				pointHoverBackgroundColor: engConfig.style.color,
				tension: 0, // Straight segments, no artificial Bezier smoothing
			});
		});

		if (datasets.length === 0) return;

		const isDark = document.documentElement.dataset.theme === "dark";
		const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
		const textColor = isDark ? "#8b949e" : "#656d76";

		try {
			const chart = new window.Chart(canvas, {
				type: "line",
				data: { datasets },
				options: {
					responsive: true,
					maintainAspectRatio: false,
					animation: false,
					interaction: {
						mode: "nearest",
						intersect: false,
						axis: "x",
					},
					plugins: {
						legend: {
							position: "top",
							onHover: (e, legendItem, legend) => {
								const c = legend.chart;
								const ds = c.data.datasets[legendItem.datasetIndex];
								if (ds?._engineKey) {
									this.#legendHover.set({ kind: "engine", key: ds._engineKey });
								}
							},
							onLeave: () => {
								this.#legendHover.clear();
							},
							onClick: (e, legendItem, legend) => {
								const c = legend.chart;
								const ds = c.data.datasets[legendItem.datasetIndex];
								if (ds?._engineKey) {
									focusStore.togglePin({ kind: "engine", key: ds._engineKey });
								}
							},
							labels: {
								font: { family: "Inter, sans-serif", size: 12, weight: 500 },
								usePointStyle: true,
								boxWidth: 8,
								padding: 16,
							},
						},
						tooltip: {
							callbacks: {
								title: (items) => {
									if (!items || items.length === 0) return "";
									return `Elapsed Time: ${items[0].parsed.x.toFixed(2)} s`;
								},
								label: (ctx) => {
									const ds = ctx.dataset;
									const isLastPoint = ctx.raw?.isPostGcFinal;
									const tag = isLastPoint ? " [final post-GC]" : "";
									return ` ${ds.label}: ${ctx.parsed.y.toFixed(1)} MiB${tag}`;
								},
								afterBody: (items) => {
									if (!items || items.length === 0) return [];
									const ds = items[0].dataset;
									const lines = [
										"",
										`Peak observed: ${ds._maxHeap.toFixed(1)} MiB`,
										`Dataset size: ${ds._totalTriples.toLocaleString()} triples (progression: final-only)`,
									];
									if (ds._loadingDurSec !== null) {
										lines.push(`Ingestion completed at: ~${ds._loadingDurSec.toFixed(2)} s`);
									}
									return lines;
								},
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
							type: "linear",
							grid: { color: gridColor },
							ticks: {
								color: textColor,
								font: { weight: 600 },
								callback: (val) => `${val} s`,
							},
							title: {
								display: true,
								text: "Elapsed Time (seconds)",
								color: textColor,
								font: { size: 11, weight: 600 },
							},
						},
						y: {
							beginAtZero: true,
							grace: "10%",
							grid: { color: gridColor },
							ticks: {
								color: textColor,
								callback: (val) => `${val} MiB`,
							},
							title: {
								display: true,
								text: "JVM Heap Used (MiB)",
								color: textColor,
								font: { size: 11, weight: 600 },
							},
						},
					},
				},
			});

			// Reset legend hover on canvas pointerleave / pointercancel
			const clearLegendOnExit = () => {
				this.#legendHover.clear();
			};
			canvas.addEventListener("pointerleave", clearLegendOnExit, { signal });
			canvas.addEventListener("pointercancel", clearLegendOnExit, { signal });

			chart._engineKeys = engineKeys;
			this.#charts.set("telemetry", chart);
		} catch (err) {
			console.error("Failed to render Chart.js telemetry:", err);
		}
	}

	#renderTable(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		// Group by format, then sort by throughput descending
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
		const reps = this.#data?.metadata?.protocol?.repetitions ?? 3;
		const dsMeta = `${count} configuration${count > 1 ? "s" : ""} · Median of ${reps} runs per engine/format · Grouped by format, sorted by throughput`;

		header.innerHTML = `
			<h3 style="margin:0;font-size:15px;font-weight:600;">Ingestion Benchmark Details</h3>
			<span class="section-meta">
				<span class="meta-label">${escapeHtml(dsMeta)}</span>
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
					<td class="text-right font-mono text-muted">${r.memoryDeltaMb ? `${r.memoryDeltaMb.toFixed(1)} MiB` : "—"}</td>
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
