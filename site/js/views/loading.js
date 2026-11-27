/**
 * Corese Benchmark Dashboard - RDF Loading View (Issue #30 & #37)
 * Evaluates ingestion throughput, retained heap, and JVM heap telemetry across engines.
 */

import { attachChartPointerInteraction, clearChartInteraction, colorWithAlpha, createEngineLegendConfig, findBarElement, getChartThemeTokens, createStatusBadgePlugin, normalizeRunStatus, formatStatusBadgeLabel } from "../chart-utils.js";
import { createProtocolTile, populateDatasetCards } from "../components/protocol-tile.js";
import { escapeHtml, formatEngineId, isBranchVersion, parseEngineId } from "../engine-id.js";
import {
	getEngineStyle,
	renderEngineIndicatorSvg,
} from "../engines.js";
import { focusStore, hoverSource, engineKeyOf, presentationFor } from "../focus-store.js";
import { parseUrlLoading, updateUrlLoading } from "../router.js";

const ALL_FORMATS = ["nt", "ttl", "nq", "trig", "rdf", "jsonld", "html"];

function effectiveLoadingStatus(run) {
	if (run?.status) {
		return normalizeRunStatus(run.status);
	}
	if (
		run &&
		!run.errorMessage &&
		typeof run.triples === "number" && Number.isFinite(run.triples) && run.triples > 0 &&
		typeof run.loadingTimeMs === "number" && Number.isFinite(run.loadingTimeMs) && run.loadingTimeMs >= 0
	) {
		return "SUCCESS";
	}
	return "MISSING";
}
const successful = (run) => effectiveLoadingStatus(run) === "SUCCESS";
function loadingStatus(run, engineKey, metric = "measurement") {
 const status = effectiveLoadingStatus(run);
 const reason = run?.errorMessage || ({ OOM: "JVM heap limit exceeded", TIMEOUT: "Load exceeded the configured time limit", ERROR: "Loading failed", MISSING: "No run reported" })[status] || "No valid measurement reported";
 return { status: ["SUCCESS", "PASS"].includes(status) ? "MISSING" : status,
  shortLabel: formatStatusBadgeLabel(["SUCCESS", "PASS"].includes(status) ? "MISSING" : status),
  detail: `${reason} — ${metric} unmeasurable`, engineKey };
}
function loadingBadge(info) {
 return `<span class="status-badge status-badge--${info.status.toLowerCase()}" title="${escapeHtml(info.detail)}">${escapeHtml(info.shortLabel)}</span>`;
}

function loadingMetric(value, valid, format, fallback = "—") {
 if (!valid || !Number.isFinite(value) || value < 0) return fallback;
 return format(value);
}

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
		dataset: "bowlogna",
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
		focusStore.retainEngines(this.#activeEngines.map(formatEngineId));
		this.render();
	}

	restoreState(newState, engines) {
		if (engines) {
			this.#activeEngines = engines;
		}
		if (newState) {
			this.#state.dataset = newState.dataset || "bowlogna";
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
		focusStore.retainEngines(this.#activeEngines.map(formatEngineId));
		this.#state.pin = focusStore.state.pinned;
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

		// Global Escape key to unpin sticky selection (without breaking modal dialogs)
		window.addEventListener(
			"keydown",
			(e) => {
				if (e.key === "Escape") {
					const hasOpenModal = document.querySelector("dialog[open]");
					if (hasOpenModal) return;
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

			if (chartKey === "memory" || chartKey === "disk") {
				// Horizontal bar chart: 1 dataset, each bar = 1 engine
				const ds = chart.data.datasets[0];
				if (!ds || !chart._engineKeys) return;
				const baseColors = ds._baseColors || ds.backgroundColor;

				const colors = chart._engineKeys.map((eKey, idx) => {
					const baseColor = Array.isArray(baseColors) ? baseColors[idx] : baseColors;
					if (!focus) return baseColor;

					const targetEng = engineKeyOf(focus.target);
					return eKey === targetEng ? baseColor : colorWithAlpha(baseColor, 0.22);
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

		// Preserve user disclosure state of protocol tile across dataset/format filter changes
		const wasOpen = this.#root.querySelector(".protocol-tile")?.open ?? false;

		this.#destroyCharts();
		this.#root.replaceChildren();

		const section = document.createElement("div");
		section.className = "loading-view-container";

		// Controls Header (Dataset, Scale, Format selectors)
		section.appendChild(this.#renderControls());

		// Unified Datasets, Measurement Protocol & Reproducibility Tile
		const protocolTile = createProtocolTile({
			mode: "loading",
			reportData: this.#data,
			state: this.#state,
			isOpen: wasOpen,
		});
		const repoRef = this.#data?.metadata?.gitCommit || "main";
		const datasetsContainer = protocolTile.querySelector("[data-protocol-datasets]");
		if (datasetsContainer) {
			populateDatasetCards(datasetsContainer, {
				datasets: ["bsbm", "lubm", "dbpedia", "bowlogna", "named-graphs"],
				repoRef,
				activeDataset: this.#state.dataset,
				mode: "loading",
				reportData: this.#data,
			});
		}
		section.appendChild(protocolTile);

		// Filter runs by dataset and format uniformly using canonical representative files
		const allLoadingRuns = this.#data?.loadingRuns || [];
		const isDbpedia = this.#state.dataset.toLowerCase() === "dbpedia";
		const isLubm = this.#state.dataset.toLowerCase() === "lubm";
		const isBowlogna = this.#state.dataset.toLowerCase() === "bowlogna";
		const isBsbm = this.#state.dataset.toLowerCase() === "bsbm";

		const datasetFilteredRows = allLoadingRuns.filter((r) => {
			const matchDs = r.dataset?.toLowerCase() === this.#state.dataset.toLowerCase();
			const fmt = r.format || r.file?.split(".").pop();
			const matchFormat = this.#state.formats.has(fmt);

			// DBpedia: canonical cross-format slice (persondata_en)
			if (isDbpedia && !r.file?.startsWith("persondata_en.")) {
				return false;
			}
			// LUBM: canonical representative slice (medium, ~1.3M triples)
			if (isLubm && !r.file?.includes("medium")) {
				return false;
			}
			// Bowlogna: canonical representative department (Department0)
			if (isBowlogna && !r.file?.startsWith("Department0.")) {
				return false;
			}
			// BSBM: canonical representative slice (medium)
			if (isBsbm && !r.file?.startsWith("bsbm_medium.")) {
				return false;
			}

			return matchDs && matchFormat;
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

		// Check whether in-memory and on-disk engines are present in selection
		const hasInMemoryEngines = orderedEngineConfigs.some((e) => e.storageId !== "tdb2" && e.storageId !== "native" && e.storageId !== "lmdb");
		const hasOnDiskEngines = orderedEngineConfigs.some((e) => e.storageId === "tdb2" || e.storageId === "native" || e.storageId === "lmdb");

		// Multi-Format Throughput Summary Chart
		const throughputEl = this.#renderSummaryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		throughputEl.id = "section-loading-throughput";
		section.appendChild(throughputEl);

		// Retained Heap After Ingestion Chart (displayed only if in-memory engines are active)
		if (hasInMemoryEngines) {
			const memoryEl = this.#renderMemoryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
			memoryEl.id = "section-loading-retained-heap";
			section.appendChild(memoryEl);
		}

		// On-Disk Storage Footprint Chart (displayed only if persistent engines are active)
		if (hasOnDiskEngines) {
			const diskEl = this.#renderDiskChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
			diskEl.id = "section-loading-disk-footprint";
			section.appendChild(diskEl);
		}

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
		if (hasInMemoryEngines) {
			this.#initMemoryChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		}
		if (hasOnDiskEngines) {
			this.#initDiskChart(strictlyFilteredRows, orderedEngineConfigs, catalog);
		}
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
					// Open enclosing details disclosure if target is nested inside one
					const ancestorDetails = target.closest("details");
					if (ancestorDetails && !ancestorDetails.open) {
						ancestorDetails.open = true;
					}
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
		const availableDatasets = discoveredDatasets.length > 0 ? discoveredDatasets : ["bowlogna", "bsbm", "lubm", "dbpedia"];

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

		// Dynamic discovery of formats available for the current dataset (using canonical slices)
		const datasetRuns = allRuns.filter((r) => r.dataset?.toLowerCase() === this.#state.dataset.toLowerCase());
		const isDbpedia = this.#state.dataset.toLowerCase() === "dbpedia";
		const isLubm = this.#state.dataset.toLowerCase() === "lubm";
		const isBowlogna = this.#state.dataset.toLowerCase() === "bowlogna";
		const isBsbm = this.#state.dataset.toLowerCase() === "bsbm";

		const currentViewRuns = datasetRuns.filter((r) => {
			if (isDbpedia && !r.file?.startsWith("persondata_en.")) return false;
			if (isLubm && !r.file?.includes("medium")) return false;
			if (isBowlogna && !r.file?.startsWith("Department0.")) return false;
			if (isBsbm && !r.file?.startsWith("bsbm_medium.")) return false;
			return true;
		});
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

	#renderSummaryChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		const reps = this.#data?.metadata?.protocol?.repetitions ?? 3;
		const dsMeta = `Selected engines and formats · Median of ${reps} runs per engine/format · Grouped by format`;

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
		const caption = document.createElement("p");
		caption.className = "status-chart-caption";
		caption.textContent = "Bars show measured throughput. Badges show unmeasurable runs: ⚠ OOM · ◷ TIMEOUT · × ERROR · — MISSING.";
		section.appendChild(caption);
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
			const statuses = [];
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

				const valid = successful(r) && Number.isFinite(r.throughputTriplesPerSec) && r.throughputTriplesPerSec >= 0;
				statuses.push(valid ? null : { ...loadingStatus(r, engConfig.key, "throughput"), presentation: (target) => presentationFor(target, { engine: engConfig.key, measureKey: `${engConfig.key}|${fmt}` }) });
				return valid ? r.throughputTriplesPerSec / 1000 : null;
			});

			return {
				label: engConfig.label,
				data: dataPoints,
				_statuses: statuses,
				backgroundColor: color,
				borderRadius: 4,
				maxBarThickness: 36,
				_engineKey: engConfig.key,
				_baseColor: color,
			};
		});

		const { grid: gridColor, text: textColor } = getChartThemeTokens();

		try {
			const chart = new window.Chart(canvas, {
				type: "bar",
				plugins: [createStatusBadgePlugin()],
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
						legend: createEngineLegendConfig({
							onEngineHover: (key) => this.#legendHover.set({ kind: "engine", key }),
							onEngineLeave: () => this.#legendHover.clear(),
							onEngineTogglePin: (key) => focusStore.togglePin({ kind: "engine", key }),
							focusStore,
							textColor,
						}),
						tooltip: {
							callbacks: {
								label: (ctx) => ctx.raw === null ? `${ctx.dataset.label}: ${ctx.dataset._statuses[ctx.dataIndex].detail}` : ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString("en", { maximumFractionDigits: 1 })} kTriples/s`,
							},
						},
					},
					layout: {
						padding: {
							top: 16,
							left: 12,
							bottom: 16,
						},
					},
					scales: {
						x: {
							grid: { color: gridColor },
							ticks: { color: textColor, font: { weight: 600 } },
						},
						y: {
							beginAtZero: true,
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

			attachChartPointerInteraction(chart, canvas, this.#canvasHover, signal, (dataset, index) => {
				const format = activeFormats[index];
				return dataset && format ? { kind: "measure", key: `${dataset._engineKey}|${format}` } : null;
			});

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
			const selectedRows = rows.filter((r) => (formatEngineId(parseEngineId(r.engine)) === engConfig.key || r.engine === engConfig.key) && this.#state.formats.has(r.format || r.file?.split(".").pop()));
			const engineRows = selectedRows.filter((r) => {
				const rowKey = formatEngineId(parseEngineId(r.engine));
				const fmt = r.format || r.file?.split(".").pop();
				return (rowKey === engConfig.key || r.engine === engConfig.key) &&
					this.#state.formats.has(fmt) && successful(r) &&
					typeof r.memoryDeltaMb === "number" &&
					Number.isFinite(r.memoryDeltaMb) &&
					r.memoryDeltaMb >= 0 &&
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
				ran: selectedRows.length > 0,
				statusInfo: { ...loadingStatus(selectedRows.find((r) => !successful(r)) || selectedRows[0], engConfig.key),
				 detail: selectedRows.map((r) => `.${r.format || r.file?.split(".").pop()}: ${loadingStatus(r, engConfig.key).detail}`).join("; ") },
			};
		}).filter((item) => item.ran);

		// Sort engines by median B / triple ascending (lower is better)
		engineSummaries.sort((a, b) => (a.medianB ?? Infinity) - (b.medianB ?? Infinity));

		canvas.parentElement.style.height = `${Math.max(220, engineSummaries.length * 38 + 90)}px`;

		const labels = engineSummaries.map((s) => s.label);
		const dataValues = engineSummaries.map((s) => s.medianB);
		const colors = engineSummaries.map((s) => s.color);
		const engineKeys = engineSummaries.map((s) => s.engineKey);

		const { grid: gridColor, text: textColor } = getChartThemeTokens();

		try {
			const chart = new window.Chart(canvas, {
				type: "bar",
				plugins: [createStatusBadgePlugin()],
				data: {
					labels: labels,
					datasets: [
						{
							label: "Median Retained Heap",
							data: dataValues,
							_statuses: engineSummaries.map((summary) => summary.medianB === null ? summary.statusInfo : null),
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
									if (summary.medianB === null) return summary.statusInfo.detail;
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
			const clearCanvasState = () => clearChartInteraction(chart, this.#canvasHover);

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

	#renderDiskChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		const dsMeta = "Selected on-disk engines · Median across selected formats · Sorted by storage footprint ascending";

		const header = document.createElement("div");
		header.className = "section-header";
		header.innerHTML = `
			<div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;">
				<h3 style="margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;">
					<span>On-Disk Storage Footprint</span>
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
		body.style.height = "260px";

		const canvas = document.createElement("canvas");
		canvas.id = "loading-disk-chart";
		body.appendChild(canvas);

		section.appendChild(body);
		return section;
	}

	#initDiskChart(rows, orderedEngines, catalog) {
		if (window.Chart === undefined) return;

		const canvas = document.getElementById("loading-disk-chart");
		if (!canvas) return;

		const signal = this.#renderAbortController?.signal || this.#abortController?.signal;

		// Strictly persistent on-disk engines
		const diskEngines = orderedEngines.filter((eng) => {
			return eng.storageId === "tdb2" || eng.storageId === "native" || eng.storageId === "lmdb";
		});

		// Compute per-engine disk footprint summary across active formats
		const engineSummaries = diskEngines.map((engConfig) => {
			const selectedRows = rows.filter((r) => (formatEngineId(parseEngineId(r.engine)) === engConfig.key || r.engine === engConfig.key) && this.#state.formats.has(r.format || r.file?.split(".").pop()));
			const engineRows = selectedRows.filter((r) => {
				const rowKey = formatEngineId(parseEngineId(r.engine));
				const fmt = r.format || r.file?.split(".").pop();
				return (rowKey === engConfig.key || r.engine === engConfig.key) &&
					this.#state.formats.has(fmt) && successful(r) &&
					typeof r.diskFootprintBytes === "number" &&
					Number.isFinite(r.diskFootprintBytes) &&
					r.diskFootprintBytes >= 0 &&
					r.triples > 0;
			});

			const bValues = engineRows.map((r) => {
				const bPerTriple = Math.round(r.diskFootprintBytes / r.triples);
				const fmt = r.format || r.file?.split(".").pop();
				const mib = r.diskFootprintBytes / (1024 * 1024);
				return { format: fmt, bPerTriple, mib };
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
				ran: selectedRows.length > 0,
				statusInfo: { ...loadingStatus(selectedRows.find((r) => !successful(r)) || selectedRows[0], engConfig.key),
				 detail: selectedRows.map((r) => `.${r.format || r.file?.split(".").pop()}: ${loadingStatus(r, engConfig.key).detail}`).join("; ") },
			};
		}).filter((item) => item.ran);

		if (engineSummaries.length === 0) {
			const parent = canvas.parentElement;
			if (parent) {
				parent.innerHTML = `
					<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px;">
						On-disk storage footprint measurements will be populated after the next benchmark run.
					</div>
				`;
			}
			return;
		}

		engineSummaries.sort((a, b) => (a.medianB ?? Infinity) - (b.medianB ?? Infinity));

		canvas.parentElement.style.height = `${Math.max(220, engineSummaries.length * 38 + 90)}px`;

		const labels = engineSummaries.map((s) => s.label);
		const dataValues = engineSummaries.map((s) => s.medianB);
		const colors = engineSummaries.map((s) => s.color);
		const engineKeys = engineSummaries.map((s) => s.engineKey);

		const { grid: gridColor, text: textColor } = getChartThemeTokens();

		try {
			const chart = new window.Chart(canvas, {
				type: "bar",
				plugins: [createStatusBadgePlugin()],
				data: {
					labels: labels,
					datasets: [
						{
							label: "Median Disk Footprint",
							data: dataValues,
							_statuses: engineSummaries.map((summary) => summary.medianB === null ? summary.statusInfo : null),
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
						legend: { display: false },
						tooltip: {
							callbacks: {
								title: (items) => (items && items.length > 0 ? items[0].label : ""),
								label: (ctx) => {
									const summary = engineSummaries[ctx.dataIndex];
									if (!summary) return "";
									if (summary.medianB === null) return summary.statusInfo.detail;
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
					layout: { padding: { top: 8, bottom: 8 } },
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
								text: "Storage Footprint (Bytes / Triple) — Lower is better",
								color: textColor,
								font: { size: 11, weight: 600 },
							},
						},
						y: {
							grid: { display: false },
							ticks: { color: textColor, font: { weight: 600, size: 12 } },
						},
					},
				},
			});

			const clearCanvasState = () => clearChartInteraction(chart, this.#canvasHover);

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
			this.#charts.set("disk", chart);
		} catch (err) {
			console.error("Failed to render Chart.js disk:", err);
		}
	}

	#renderTelemetryChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		// Include attempted formats so failures without telemetry remain visible
		const availableFormats = ALL_FORMATS.filter((f) => {
			if (!this.#state.formats.has(f)) return false;
			return rows.some((r) => {
				const rFmt = r.format || r.file?.split(".").pop();
				return rFmt === f;
			});
		});

		// Auto-select first available format if not set or invalid
		if (!this.#state.telemetryFormat || !availableFormats.includes(this.#state.telemetryFormat)) {
			this.#state.telemetryFormat = availableFormats[0] || null;
		}

		const currentFormat = this.#state.telemetryFormat;
		const dsMeta = "Final repetition run · Sampled ≈100 ms during ingestion · Excludes native memory & OS page cache";

		const header = document.createElement("div");
		header.className = "section-header";

		const topRow = document.createElement("div");
		topRow.style.display = "flex";
		topRow.style.justifyContent = "space-between";
		topRow.style.alignItems = "center";
		topRow.style.flexWrap = "wrap";
		topRow.style.gap = "12px";
		topRow.style.width = "100%";

		const h3 = document.createElement("h3");
		h3.style.margin = "0";
		h3.style.fontSize = "15px";
		h3.style.fontWeight = "600";
		h3.style.display = "flex";
		h3.style.alignItems = "center";
		h3.style.gap = "8px";
		h3.innerHTML = `
			<span>JVM Heap Used Over Time</span>
			<span class="tag-format">MiB</span>
		`;
		topRow.appendChild(h3);

		const metaSpan = document.createElement("span");
		metaSpan.className = "section-meta";
		metaSpan.innerHTML = `
			<span class="meta-label">${escapeHtml(dsMeta)}</span>
			<span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
		`;
		topRow.appendChild(metaSpan);
		header.appendChild(topRow);

		// Format switch: styled segmented control matching Design System placed cleanly on the 2nd line of header
		if (availableFormats.length > 0) {
			const subRow = document.createElement("div");
			subRow.style.display = "flex";
			subRow.style.alignItems = "center";
			subRow.style.gap = "8px";
			subRow.style.width = "100%";
			subRow.style.paddingTop = "4px";

			const selectorLabel = document.createElement("span");
			selectorLabel.className = "text-xs text-muted font-medium";
			selectorLabel.textContent = "FORMAT:";
			subRow.appendChild(selectorLabel);

			const segGroup = document.createElement("div");
			segGroup.className = "segmented-control";
			segGroup.setAttribute("role", "radiogroup");
			segGroup.setAttribute("aria-label", "Telemetry format selection");

			availableFormats.forEach((fmt) => {
				const isChecked = fmt === currentFormat;
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = `segmented-control__btn ${isChecked ? "is-active" : ""}`;
				btn.setAttribute("role", "radio");
				btn.setAttribute("aria-checked", String(isChecked));
				btn.textContent = `.${fmt.toUpperCase()}`;
				btn.title = `Show heap telemetry profile for .${fmt}`;
				btn.addEventListener("click", () => {
					this.#updateState({ telemetryFormat: fmt }, { history: "replace" });
				});
				segGroup.appendChild(btn);
			});
			subRow.appendChild(segGroup);
			header.appendChild(subRow);
		}

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
		const failedRows = rows.filter((run) => (run.format || run.file?.split(".").pop()) === currentFormat && !successful(run));
		if (failedRows.length) {
		 const strip = document.createElement("div");
		 strip.className = "telemetry-status-strip";
		 strip.setAttribute("aria-label", "Failed ingestion runs");
		 for (const run of failedRows) {
		  const key = formatEngineId(parseEngineId(run.engine));
		  const config = orderedEngines.find((engine) => engine.key === key);
		  if (!config) continue;
		  const info = loadingStatus(run, key, "heap telemetry");
		  const button = document.createElement("button");
		  button.type = "button"; button.dataset.engineKey = key; button.title = info.detail;
		  button.innerHTML = `<span class="telemetry-status-dot" style="background:${config.style.color}"></span><span>${escapeHtml(config.label)}</span>${loadingBadge(info)}`;
		  const target = { kind: "engine", key };
		  const signal = this.#renderAbortController?.signal;
		  button.addEventListener("pointerenter", () => this.#tableHover.set(target), { signal });
		  button.addEventListener("pointerleave", () => this.#tableHover.clear(), { signal });
		  button.addEventListener("focus", () => this.#tableHover.set(target), { signal });
		  button.addEventListener("blur", () => this.#tableHover.clear(), { signal });
		  button.addEventListener("click", () => focusStore.togglePin(target), { signal });
		  const sync = () => {
		   const focused = engineKeyOf(focusStore.effectiveFocus?.target);
		   button.classList.toggle("is-dimmed", Boolean(focused && focused !== key));
		   button.setAttribute("aria-pressed", String(engineKeyOf(focusStore.state.pinned) === key));
		  };
		  focusStore.addEventListener("focus-changed", sync, { signal }); sync();
		  strip.appendChild(button);
		 }
		 section.appendChild(strip);
		}
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

			const isDisk = engConfig.storageId === "tdb2" || engConfig.storageId === "native" || engConfig.storageId === "lmdb";

			datasets.push({
				label: engConfig.label,
				_engineKey: engConfig.key,
				_baseColor: engConfig.style.color,
				_maxHeap: maxHeap,
				_totalTriples: totalTriples,
				_loadingDurSec: loadingDurSec,
				_isDisk: isDisk,
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

		if (datasets.length === 0) {
		 canvas.parentElement.style.height = "80px";
		 canvas.replaceWith(Object.assign(document.createElement("p"), { className: "status-chart-caption", textContent: "No measured heap telemetry for this format. Failed runs are listed below." }));
		 return;
		}

		const { grid: gridColor, text: textColor } = getChartThemeTokens();

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
						legend: createEngineLegendConfig({
							onEngineHover: (key) => this.#legendHover.set({ kind: "engine", key }),
							onEngineLeave: () => this.#legendHover.clear(),
							onEngineTogglePin: (key) => focusStore.togglePin({ kind: "engine", key }),
							focusStore,
							textColor,
						}),
						tooltip: {
							callbacks: {
								title: (items) => {
									if (!items || items.length === 0) return "";
									return `Elapsed Time: ${items[0].parsed.x.toFixed(2)} s`;
								},
								label: (ctx) => {
									const ds = ctx.dataset;
									const isLastPoint = ctx.raw?.isPostGcFinal;
									const postGcTag = isLastPoint ? " [final post-GC]" : "";
									const diskTag = ds._isDisk ? " [persistent buffer]" : "";
									return ` ${ds.label}: ${ctx.parsed.y.toFixed(1)} MiB${postGcTag}${diskTag}`;
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

		const hasOnDiskEngines = orderedEngines.some((e) => e.storageId === "tdb2" || e.storageId === "native" || e.storageId === "lmdb");

		// Group by format, then sort by throughput descending
		const formatOrder = ALL_FORMATS.filter((f) => this.#state.formats.has(f));
		const sortedRows = [...rows].sort((a, b) => {
			const fmtA = a.format || a.file.split(".").pop();
			const fmtB = b.format || b.file.split(".").pop();
			const idxA = formatOrder.indexOf(fmtA);
			const idxB = formatOrder.indexOf(fmtB);
			if (idxA !== idxB) return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
			const statusOrder = Number(successful(b)) - Number(successful(a));
			if (statusOrder) return statusOrder;
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
				${hasOnDiskEngines ? '<th class="text-right">Disk Size</th>' : ""}
				<th class="text-right">Repetitions (ms)</th>
			</tr>
		`;
		table.appendChild(thead);

		const tbody = document.createElement("tbody");
		let lastFormat = null;
		const totalCols = hasOnDiskEngines ? 7 : 6;
		if (sortedRows.length === 0) {
			const tr = document.createElement("tr");
			tr.innerHTML = `<td colspan="${totalCols}" class="text-center text-muted" style="padding:24px;">No data matching active engines and format filters</td>`;
			tbody.appendChild(tr);
		} else {
			sortedRows.forEach((r) => {
				const tr = this.#renderTableRow(r, catalog, hasOnDiskEngines, lastFormat);
				lastFormat = r.format || r.file.split(".").pop();
				tbody.appendChild(tr);
			});
		}

		table.appendChild(tbody);
		wrapper.appendChild(table);
		section.appendChild(wrapper);
		return section;
	}
	#renderTableRow(r, catalog, hasOnDiskEngines, lastFormat) {
		const tr = document.createElement("tr");
		const parsed = parseEngineId(r.engine);
		const engineKey = formatEngineId(parsed);
		const fmt = r.format || r.file.split(".").pop();
		const measureKey = `${engineKey}|${fmt}`;

		// Visually separate format blocks with a clean border
		if (lastFormat !== null && lastFormat !== fmt) {
			tr.classList.add("group-separator");
		}

		tr.dataset.engineKey = engineKey;
		tr.dataset.measureKey = measureKey;

		const style = getEngineStyle(parsed, catalog);
		const indicatorSvg = renderEngineIndicatorSvg(style);

		const valid = successful(r);
		const info = loadingStatus(r, engineKey, "throughput");
		const repsStr = valid ? (r.repetitionsMs || []).filter((v) => Number.isFinite(v) && v >= 0).join(", ") : "";
		const throughputK = (r.throughputTriplesPerSec / 1000).toFixed(0);
		const isDisk = parsed.storageId === "tdb2" || parsed.storageId === "native" || parsed.storageId === "lmdb";
		let diskText = valid ? "N/A" : "—";
		if (isDisk && valid) {
			diskText = Number.isFinite(r.diskFootprintBytes) && r.diskFootprintBytes >= 0 ? `${(r.diskFootprintBytes / (1024 * 1024)).toFixed(1)} MiB` : "—";
		}
		const diskCell = hasOnDiskEngines
			? `<td class="text-right font-mono text-muted">${diskText}</td>`
			: "";

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
			<td class="text-right font-mono font-medium">${loadingMetric(r.loadingTimeMs, valid, (value) => value + " ms")}</td>
			<td class="text-right font-mono font-medium" style="color:var(--focus);">${loadingMetric(r.throughputTriplesPerSec, valid, () => throughputK + " k/s", loadingBadge(info))}</td>
			<td class="text-right font-mono text-muted">${loadingMetric(r.memoryDeltaMb, valid, (value) => value.toFixed(1) + " MiB")}</td>
			${diskCell}
			<td class="text-right font-mono text-xs text-muted">${repsStr ? "[" + escapeHtml(repsStr) + "]" : "—"}</td>
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

		return tr;
	}

}
