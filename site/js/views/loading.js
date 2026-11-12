/**
 * Corese Benchmark Dashboard - RDF Loading View (Issue #30 & #37)
 * Evaluates ingestion throughput and memory density across engines (.nt, .ttl, .nq, .trig)
 * Fully aligned with Engine Selector standards: palette, glyphs, order, and cross-highlighting.
 */

import { escapeHtml, formatEngineId, isBranchVersion, parseEngineId } from "../engine-id.js";
import {
	engineManager,
	getEngineStyle,
	renderEngineIndicatorSvg,
} from "../engines.js";
import { focusStore, hoverSource } from "../focus-store.js";

const ALL_FORMATS = ["nt", "ttl", "nq", "trig", "rdf", "jsonld", "html"];
const DEFAULT_BASELINE = "corese.4.6.5";
const NEXT_ENGINE = "corese.next";

export class LoadingView {
	#root = null;
	#data = null;
	#activeEngines = [];
	#abortController = null;
	#charts = new Map();
	#canvasHover = hoverSource();
	#legendHover = hoverSource();
	#tableHover = hoverSource();
	#chartAlphaMap = new Map();
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
		const chart = this.#charts.get("summary") || (typeof window.Chart !== "undefined" ? window.Chart.getChart("loading-summary-chart") : null);
		if (!chart) return;

		const focus = focusStore.effectiveFocus;
		const formats = Array.from(this.#state.formats);

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
					r = parseInt(hex.substring(0, 2), 16);
					g = parseInt(hex.substring(2, 4), 16);
					b = parseInt(hex.substring(4, 6), 16);
				}
			}

			const toRgba = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

			if (focus.target.kind === "engine") {
				const isEngineMatch = eKey === focus.target.key;
				ds.backgroundColor = isEngineMatch ? baseColor : toRgba(0.22);
			} else if (focus.target.kind === "measure") {
				const [targetEng, targetFmt] = focus.target.key.split("|");
				const colors = formats.map((fmt) => {
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

		["bsbm", "lubm", "dbpedia", "bowlogna"].forEach((ds) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = `segmented-control__btn ${this.#state.dataset === ds ? "is-active" : ""}`;
			btn.textContent = ds.toUpperCase();
			btn.addEventListener("click", () => {
				this.#state.dataset = ds;
				// Default scale when switching dataset
				if (ds === "bsbm") this.#state.scale = "small";
				this.render();
			});
			dsGroup.appendChild(btn);
		});
		dsWrap.appendChild(dsGroup);
		leftGroup.appendChild(dsWrap);

		// Scale Segmented Control (only relevant for multi-scale datasets like LUBM/BSBM)
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

		const availableScales = this.#state.dataset === "lubm" ? ["small", "medium", "large"] : ["small", "medium"];
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

		ALL_FORMATS.forEach((fmt) => {
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
						void pill.offsetWidth;
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

		const summary = document.createElement("summary");
		summary.innerHTML = `
			<span class="protocol-title">Benchmark Protocol</span>
			<span class="protocol-summary-meta">${escapeHtml(jvmVer)} · ${escapeHtml(cpuName)} · ${reps} isolated runs</span>
			<div class="protocol-links" onclick="event.stopPropagation();">
				<a class="protocol-link" href="./data/benchmark-report.json" target="_blank" download="benchmark-report.json" title="Download raw JSON report data">Raw JSON ↗</a>
				<a class="protocol-link" href="https://github.com/corese-stack/corese-benchmark" target="_blank" rel="noopener" title="Source code on GitHub">Source ↗</a>
			</div>
			<span class="protocol-chevron" aria-hidden="true">▾</span>
		`;
		details.appendChild(summary);

		const body = document.createElement("div");
		body.className = "protocol-body";

		// Column 1: Reproduction Commands
		const colCmds = document.createElement("div");
		colCmds.innerHTML = `<h4 class="protocol-section-title">Reproduction Commands</h4>`;
		const cmds = [
			{ label: "Convert datasets", cmd: "./gradlew convertDatasets" },
			{ label: "Verify canonical W3C parity", cmd: './gradlew test --tests "*DatasetParityTest*"' },
			{ label: "Run ingestion benchmark", cmd: "./gradlew runBenchmark" },
		];
		cmds.forEach(({ label, cmd }) => {
			const box = document.createElement("div");
			box.className = "protocol-cmd-box";
			box.innerHTML = `
				<code title="${escapeHtml(label)}">${escapeHtml(cmd)}</code>
				<button type="button" class="btn-copy-cmd" data-cmd="${escapeHtml(cmd)}">Copy</button>
			`;
			const copyBtn = box.querySelector(".btn-copy-cmd");
			copyBtn.addEventListener("click", () => {
				navigator.clipboard.writeText(cmd).then(() => {
					copyBtn.textContent = "Copied ✓";
					setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
				});
			});
			colCmds.appendChild(box);
		});

		// Column 2: Execution Environment (Live data from report metadata)
		const colEnv = document.createElement("div");
		colEnv.innerHTML = `
			<h4 class="protocol-section-title">Execution Environment & Flags</h4>
			<ul class="protocol-info-list">
				<li><strong>OS :</strong> ${escapeHtml(osDist)} (${escapeHtml(env.osKernel || "x86_64")})</li>
				<li><strong>CPU :</strong> ${escapeHtml(cpuName)} (${env.cpuCores || 8} cores, ${env.cpuThreads || 8} threads)</li>
				<li><strong>JVM Flags :</strong> <code>${escapeHtml(jvmFlags)}</code></li>
				<li><strong>Isolation :</strong> Sequential runs in dedicated child JVM processes</li>
				<li><strong>Metric :</strong> Median across ${reps} isolated runs (warmup: ${proto.warmup || 1})</li>
			</ul>
		`;

		body.appendChild(colCmds);
		body.appendChild(colEnv);
		details.appendChild(body);
		return details;
	}



	#renderSummaryChart(rows, orderedEngines, catalog) {
		const section = document.createElement("div");
		section.className = "dashboard-section";

		const firstRow = rows[0];
		const triplesCount = firstRow?.triples ? `${firstRow.triples.toLocaleString()} triples` : null;
		const dsMeta = [triplesCount, "Median of 3 runs per engine/format"].filter(Boolean).join(" · ");

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
		if (typeof window.Chart === "undefined") return;

		const canvas = document.getElementById("loading-summary-chart");
		if (!canvas) return;

		const signal = this.#abortController?.signal;

		// Formats for X-axis (only active ones)
		const formats = ALL_FORMATS.filter((f) => this.#state.formats.has(f));
		const formatLabels = formats.map((f) => `.${f.toUpperCase()}`);

		// Datasets strictly ordered and styled following engine selector norms
		const datasets = orderedEngines.map((engConfig) => {
			const color = engConfig.style.color;
			const dataPoints = formats.map((fmt) => {
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
							const format = formats[dataIndex];
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
												r = parseInt(hex.substring(0, 2), 16);
												g = parseInt(hex.substring(2, 4), 16);
												b = parseInt(hex.substring(4, 6), 16);
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
						if (el && el.inRange(x, y)) {
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
						const format = formats[hit.index];
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
