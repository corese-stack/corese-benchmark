/** SPARQL feature timings and original query sources. */
import { escapeHtml as esc, formatEngineId, parseEngineId } from "../engine-id.js";
import { attachChartPointerInteraction, colorWithAlpha, createEngineLegendConfig, getChartThemeTokens } from "../chart-utils.js";
import { getEngineStyle, renderEngineIndicatorSvg } from "../engines.js";
import { focusStore, hoverSource, engineKeyOf, presentationFor } from "../focus-store.js";
import { parseUrlSparql, updateUrlSparql } from "../router.js";
import { createProtocolTile, populateDatasetCards, attachDetailsAnimation, DATASET_CONFIGS, highlightSparql, renderSourceBox } from "../components/protocol-tile.js";

export { DATASET_CONFIGS, highlightSparql };

export const FEATURES = Object.freeze({
 BGP_JOIN: "BGP joins", PROPERTY_PATH: "Property paths",
 OPTIONAL_LEFT_JOIN: "Optional joins", NEGATION: "Negation",
 AGGREGATION_ANALYTICS: "Aggregation", SUBQUERY: "Subqueries",
 FILTER_FUNCTIONS: "Filter functions", NAMED_GRAPH: "Named graphs",
 SOLUTION_MODIFIERS: "Solution modifiers",
});
const FEATURE_IDS = Object.keys(FEATURES);
const CATALOGUE_URL = "data/sparql/v1/catalogue.json";

const keyOf = (dataset, id) => JSON.stringify([dataset, id]);
const canonicalEngine = (engine) => formatEngineId(parseEngineId(engine));
const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const measured = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const milliseconds = (v) => measured(v) ? `${v.toLocaleString("en", { maximumFractionDigits: 3 })} ms` : "—";
export const statusOf = (run) => run ? String(run.status || "UNKNOWN").toUpperCase() : "MISSING";

/** Duplicates are ambiguous, not extra independent observations. Never average medians. */
export function indexRuns(runs = []) {
 const index = new Map();
 for (const run of runs) {
  const key = keyOf(run.dataset, run.queryId);
  if (!index.has(key)) index.set(key, new Map());
  const engines = index.get(key);
  const engine = canonicalEngine(run.engine);
  engines.set(engine, engines.has(engine) ? { status: "DUPLICATE" } : run);
 }
 return index;
}

/** Equal weight per query; log differences avoid overflow in ref / engine. */
export function aggregateFeatures(queries, index, engines, reference) {
 return engines.map((engine) => ({ engine, axes: FEATURE_IDS.map((feature) => {
  const scope = queries.filter((q) => q.primaryFeature === feature);
  let passed = 0;
  const logs = [];
  for (const q of scope) {
   const runs = index.get(keyOf(q.dataset, q.id));
   const run = runs?.get(engine);
   const ref = runs?.get(reference);
   if (statusOf(run) === "PASS") passed++;
   if (statusOf(run) === "PASS" && statusOf(ref) === "PASS" && positive(run.medianMs) && positive(ref.medianMs)) {
    logs.push(Math.log(ref.medianMs) - Math.log(run.medianMs));
   }
  }
  const value = logs.length ? Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length) : null;
  return { feature, total: scope.length, passed, paired: logs.length,
   speedup: positive(value) ? value : null };
 }) }));
}

/** Scope summaries count query/engine observations, never average feature means. */
export function summarizeScope(queries, index, engines, reference) {
 let present = 0, passed = 0;
 const logs = [];
 for (const q of queries) {
  const runs = index.get(keyOf(q.dataset, q.id));
  const ref = runs?.get(reference);
  for (const engine of engines) {
   const run = runs?.get(engine);
   if (run) present++;
   if (statusOf(run) === "PASS") passed++;
   if (engine !== reference && statusOf(run) === "PASS" && statusOf(ref) === "PASS" && positive(run.medianMs) && positive(ref.medianMs)) {
    logs.push(Math.log(ref.medianMs) - Math.log(run.medianMs));
   }
  }
 }
 const value = logs.length ? Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length) : null;
 return { total: queries.length * engines.length, present, passed, paired: logs.length,
  speedup: positive(value) ? value : null };
}

const DATASETS = new Set(["lubm", "bsbm", "bowlogna", "dbpedia", "named-graphs"]);

function badge(status) {
	if (status === "PASS") {
		return `<span class="sf-badge sf-badge--pass">${esc(status)}</span>`;
	}
	if (["MISMATCH", "TIMEOUT", "ERROR", "DUPLICATE"].includes(status)) {
		return `<span class="sf-badge sf-badge--fail">${esc(status)}</span>`;
	}
	return `<span class="sf-badge sf-badge--other">${esc(status)}</span>`;
}

function calculateMedian(values) {
	if (!values.length) return null;
	const middle = Math.floor(values.length / 2);
	if (values.length % 2 !== 0) {
		return values[middle];
	}
	return values[middle - 1] / 2 + values[middle] / 2;
}

/** Median of reported query medians, with no inferred or failed timings. */
export function featureTimings(queries, index, engines) {
	return engines.map((engine) => ({ engine, axes: FEATURE_IDS.map((feature) => {
		const scope = queries.filter((query) => query.primaryFeature === feature);
		const values = scope.map((query) => index.get(keyOf(query.dataset, query.id))?.get(engine))
			.filter((run) => statusOf(run) === "PASS" && measured(run.medianMs))
			.map((run) => run.medianMs).sort((a, b) => a - b);
		const medianMs = calculateMedian(values);
		return { feature, total: scope.length, count: values.length, medianMs };
	}) }));
}

const jumpHighlightTimers = new WeakMap();

function highlightJumpTarget(target) {
 if (!target) return;
 clearTimeout(jumpHighlightTimers.get(target));
 target.classList.add("is-jump-highlighted");
 jumpHighlightTimers.set(target, setTimeout(() => {
  target.classList.remove("is-jump-highlighted");
  jumpHighlightTimers.delete(target);
 }, 1800));
}

export class SparqlFeaturesView {
 #root; #data; #engines; #index; #state;
 #catalogue = null; #controller = null; #chart = null;
 #sourceCache = new Map();
 #chartController = null;
 #legendHover = hoverSource();
 #canvasHover = hoverSource();
 #cachedQueryFeatureMap = null;

 constructor(container, data, engines = []) {
  this.#root = container;
  this.#data = data;
  this.#engines = engines;
  this.#index = indexRuns(data.queryRuns);
  this.#setState(parseUrlSparql(window.location.search));
 }

 // Old links retain their sorting; removed controls cannot hide queries.
 #setState(state) {
  this.#state = { ...parseUrlSparql(""), ...state, reference: "", feature: "", q: "", chart: "bar" };
 }

 mount() {
  this.#controller = new AbortController();
  const { signal } = this.#controller;
  // Re-apply URL pin if present
  if (this.#state.pin) {
   focusStore.pin(this.#state.pin);
  }
  // FocusStore is an EventTarget; AbortSignal owns the subscription lifecycle.
  focusStore.addEventListener("focus-changed", () => {
   const currentPinned = focusStore.state.pinned;
   this.#state.pin = currentPinned ? { kind: currentPinned.kind, key: currentPinned.key } : null;
   updateUrlSparql(this.#state);
   this.#syncFocusVisuals();
  }, { signal });
  window.addEventListener("keydown", (event) => {
   if (event.key === "Escape") {
    focusStore.clear();
   }
  }, { signal });
  this.#root.addEventListener("click", (event) => this.#handleClick(event), { signal });
  this.#root.addEventListener("toggle", (event) => this.#handleToggle(event, signal), { signal, capture: true });
  window.addEventListener("theme-changed", () => {
   if (this.#catalogue) this.#renderChart(this.#queries(), this.#engineKeys());
  }, { signal });
  void this.#loadCatalogue();
 }

 #handleClick(event) {
  if (this.#handleCopyClick(event.target)) return;
  if (this.#handleSortClick(event.target)) return;
  if (event.target.closest("[data-sf-retry]")) {
   void this.#loadCatalogue();
   return;
  }
  if (this.#handleJumpClick(event.target)) return;
  this.#handleSelectionClick(event.target);
 }

 #handleCopyClick(target) {
  const copyCmdBtn = target.closest("[data-sf-copy-cmd]");
  if (copyCmdBtn) {
   const cmd = copyCmdBtn.dataset.sfCopyCmd;
   if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(cmd).then(() => {
     copyCmdBtn.textContent = "Copied ✓";
     setTimeout(() => (copyCmdBtn.textContent = "Copy"), 1500);
    }).catch(() => {
     copyCmdBtn.textContent = "Error ✗";
     setTimeout(() => (copyCmdBtn.textContent = "Copy"), 1500);
    });
   }
   return true;
  }
  const copyQueryBtn = target.closest("[data-sf-copy-query]");
  if (copyQueryBtn) {
   const code = copyQueryBtn.closest(".sf-source-box, .sf-query-source-box")?.querySelector("pre code")?.textContent
    || this.#root.querySelector("dialog pre code")?.textContent;
   if (code && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => {
     copyQueryBtn.textContent = "Copied ✓";
     setTimeout(() => (copyQueryBtn.textContent = "Copy SPARQL"), 1500);
    }).catch(() => {
     copyQueryBtn.textContent = "Error ✗";
     setTimeout(() => (copyQueryBtn.textContent = "Copy SPARQL"), 1500);
    });
   }
   return true;
  }
  return false;
 }

 #handleSortClick(target) {
  const sort = target.closest("[data-sf-sort]");
  if (!sort) return false;
  const key = sort.dataset.sfSort;
  this.#state.direction = this.#state.sort === key && this.#state.direction === "asc" ? "desc" : "asc";
  this.#state.sort = key;
  updateUrlSparql(this.#state);
  this.#renderTable(this.#queries(), this.#engineKeys());
  [...this.#root.querySelectorAll("[data-sf-sort]")].find((button) => button.dataset.sfSort === key)?.focus();
  return true;
 }

 #handleJumpClick(target) {
  const jumpBtn = target.closest("[data-sf-jump-query]");
  if (jumpBtn) {
   return this.#jumpToQuery(jumpBtn.dataset.sfJumpQuery);
  }
  const jumpDsBtn = target.closest("[data-sf-jump-dataset]");
  if (jumpDsBtn) {
   return this.#jumpToDataset(jumpDsBtn.dataset.sfJumpDataset);
  }
  return false;
 }

 #jumpToQuery(key) {
  const protocolTile = this.#root.querySelector(".protocol-tile");
  if (protocolTile && !protocolTile.open) protocolTile.open = true;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollBehavior = prefersReducedMotion ? "auto" : "smooth";

  const targetItem = this.#root.querySelector(`.sf-query-item[data-sf-query-key='${key}']`);
  if (targetItem) {
   targetItem.open = true;
   targetItem.scrollIntoView({ behavior: scrollBehavior, block: "center" });
   highlightJumpTarget(targetItem);
   targetItem.querySelector("summary")?.focus({ preventScroll: true });
   return true;
  }
  const targetRow = this.#root.querySelector(`tr[data-sf-query='${key}']`);
  if (targetRow) {
   targetRow.scrollIntoView({ behavior: scrollBehavior, block: "center" });
   highlightJumpTarget(targetRow);
   targetRow.querySelector("button")?.focus({ preventScroll: true });
  }
  return true;
 }

 #jumpToDataset(ds) {
  const targetCard = this.#root.querySelector(`.sf-dataset-card[data-sf-dataset-id='${ds}'], #dataset-${ds}`);
  if (targetCard) {
   const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   targetCard.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
   highlightJumpTarget(targetCard);
   targetCard.focus({ preventScroll: true });
   return true;
  }
  return false;
 }

 #handleSelectionClick(target) {
  const cell = target.closest("td[data-cell-key]");
  if (cell) {
   const key = cell.dataset.cellKey;
   focusStore.togglePin({ kind: "cell", key });
   return;
  }
  const row = target.closest("[data-sf-query]");
  if (row) {
   const key = row.dataset.sfQuery;
   focusStore.togglePin({ kind: "query", key });
  }
 }

 #handleToggle(event, signal) {
  const details = event.target.closest(".sf-query-item");
  if (!details?.open) return;
  const file = details.dataset.sfQueryFile;
  const codeEl = details.querySelector("pre code");
  const statusEl = details.querySelector("[data-sf-source-status]");
  if (file && codeEl && !codeEl.textContent) {
   statusEl.textContent = "Loading query…";
   this.#fetchQuerySource(file, signal)
    .then((src) => {
     codeEl.innerHTML = highlightSparql(src);
     statusEl.textContent = "";
     // If currently animating, smoothly adjust target height to avoid any jump
     details._adjustHeight?.();
    })
    .catch(() => {
     statusEl.textContent = "Query source unavailable.";
     details._adjustHeight?.();
    });
  }
 }

 restoreState(state, engines) {
  this.#setState(state || parseUrlSparql(window.location.search));
  if (engines) this.#engines = engines;
  if (this.#state.pin) {
   focusStore.pin(this.#state.pin);
  } else if (focusStore.state.pinned) {
   focusStore.unpin();
  }
  this.#refresh();
 }

 updateActiveEngines(engines) {
  this.#engines = engines || [];
  this.#refresh();
 }

 destroy() {
  this.#controller?.abort();
  this.#chartController?.abort();
  this.#legendHover.clear();
  this.#canvasHover.clear();
  this.#chart?.destroy();
  this.#chart = null;
  this.#root.replaceChildren();
 }

 async #loadCatalogue() {
  this.#root.innerHTML = '<div class="chart-empty" role="status">Loading queries…</div>';
  const { signal } = this.#controller;
  try {
   const response = await fetch(CATALOGUE_URL, { signal });
   if (!response.ok) throw new Error("Catalogue unavailable");
   const catalogue = await response.json();
   if (!Array.isArray(catalogue.queries) || !catalogue.queries.length) throw new Error("Invalid catalogue");
   const seen = new Set();
   for (const query of catalogue.queries) {
    const key = keyOf(query.dataset, query.id);
    if (!query.id || !query.name || !query.file || !DATASETS.has(query.dataset) ||
     !Object.hasOwn(FEATURES, query.primaryFeature) || seen.has(key)) throw new Error("Invalid query");
    seen.add(key);
   }
   if (signal.aborted) return;
   this.#catalogue = catalogue;
   this.#render();
  } catch {
   if (!signal.aborted) this.#root.innerHTML = '<div class="chart-empty" role="status">Queries unavailable. <button type="button" data-sf-retry>Retry</button></div>';
  }
 }

 #engineKeys() {
  return [...new Set(this.#engines.map((engine) => typeof engine === "string" ? canonicalEngine(engine) : formatEngineId(engine)))];
 }

 #queries() {
  return this.#catalogue?.queries || [];
 }

 #render() {
  const protocolTile = createProtocolTile({
   mode: "sparql",
   reportData: this.#data,
   state: this.#state,
   catalogue: this.#catalogue,
   isOpen: false,
  });

  const wrapper = document.createElement("div");
  wrapper.className = "sf-view loading-view-container";
  wrapper.appendChild(protocolTile);

  const sectionsHtml = `
   <section class="dashboard-section" aria-labelledby="sf-chart-title">
    <div class="section-header">
     <h3 id="sf-chart-title">Feature comparison</h3>
     <span class="section-meta">
      <span class="meta-label" data-sf-chart-meta></span>
      <span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
     </span>
    </div>
    <div class="section-body"><div class="sf-chart"><canvas role="img" aria-label="Median execution time by feature and engine, in milliseconds. Query measurements follow in Query details."></canvas></div><p class="chart-empty" data-sf-chart-empty role="status" hidden></p></div>
   </section>
   <section class="dashboard-section" aria-labelledby="sf-table-title">
    <div class="section-header">
     <h3 id="sf-table-title">Query details</h3>
     <span class="section-meta">
      <span class="meta-label" data-sf-table-meta></span>
      <span class="badge-pinned" style="display:none;" aria-live="polite">Pinned · <kbd>Esc</kbd> to reset</span>
     </span>
    </div>
    <div class="sf-scroll" tabindex="0" role="region" aria-label="Query details" data-sf-table></div>
   </section>
  `;
  wrapper.insertAdjacentHTML("beforeend", sectionsHtml);
  this.#root.replaceChildren(wrapper);
  this.#refresh();
 }

 #refresh() {
  if (!this.#catalogue) return;
  const queries = this.#queries(), engines = this.#engineKeys();
  const sortEngine = this.#state.sort.split(":")[1];
  if (sortEngine && !engines.includes(sortEngine)) this.#state.sort = "id";
  updateUrlSparql(this.#state);
  const repoRef = this.#data?.metadata?.gitCommit || "main";
  this.#root.querySelector("[data-sf-chart-meta]").textContent = `${queries.length} queries · Median of query medians · Lower is better`;
  this.#root.querySelector("[data-sf-table-meta]").textContent = `${queries.length} queries · Median execution time (ms) · Lower is better · Result validation`;
  this.#root.querySelector("[data-sf-protocol-meta]").textContent = `${queries.length} queries · 5 dataset configurations · SPARQL 1.1`;
  const datasets = [...new Set(queries.map((query) => query.dataset))];

  // Render Section 1: Datasets Responsive Grid (only if not already populated to preserve DOM state)
  const inputsContainer = this.#root.querySelector("[data-sf-inputs]");
  if (inputsContainer && !inputsContainer.hasChildNodes()) {
   populateDatasetCards(inputsContainer, {
    datasets,
    queries,
    repoRef,
   });
  }

  // Render Section 2: Full Catalogue Queries (only if not already populated to preserve open states and loaded sources)
  const catalogListEl = this.#root.querySelector("[data-sf-catalog-list]");
  if (catalogListEl && !catalogListEl.hasChildNodes()) {
   const defaultTimeout = this.#catalogue?.defaults?.timeoutSecs ?? 30;
   const defaultMode = this.#catalogue?.defaults?.validationMode ?? "unordered_exact";
   catalogListEl.innerHTML = `
    <div class="sf-queries-catalog">
     ${queries.map((q) => {
      const dsInfo = DATASET_CONFIGS[q.dataset] || { name: q.dataset, fullName: q.dataset, shortFile: q.dataset };
      const featureLabel = FEATURES[q.primaryFeature] || q.primaryFeature;
      const timeoutSec = q.timeoutSecs ?? defaultTimeout;
      const validationMode = q.validationMode ?? defaultMode;
      const timeoutFact = timeoutSec !== defaultTimeout ? `<span class="sf-badge sf-badge--other">Timeout: ${esc(timeoutSec)} s</span>` : "";
      const modeFact = validationMode === "ordered_exact" ? `<span class="sf-badge sf-badge--other" title="Requires strict row sequence equality in addition to RDF term equality">Row order validated</span>` : "";

      const metaHtml = `
       <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">Dataset:</span>
       <button type="button" class="sf-jump-dataset-btn" data-sf-jump-dataset="${esc(q.dataset)}" title="Jump to ${esc(dsInfo.fullName || dsInfo.name)} dataset in Section 1">
        ${esc(dsInfo.name)} ↖
       </button>
       ${modeFact}
       ${timeoutFact}
      `;

      return `<details class="sf-query-item" data-sf-query-key="${esc(keyOf(q.dataset, q.id))}" data-sf-query-file="${esc(q.file)}">
       <summary class="sf-query-summary">
        <div class="sf-query-summary-header">
         <span class="sf-badge sf-badge--query">${esc(q.id)}</span>
         <strong>${esc(q.name)}</strong>
        </div>
        <span class="sf-query-desc">${esc(q.description)}</span>
        <span class="sf-badge sf-badge--other" style="font-size: 11px; margin-left: auto;">${esc(featureLabel)}</span>
        <span class="protocol-chevron" aria-hidden="true">▾</span>
       </summary>
       <div class="sf-query-body" style="padding: 0; border-top: none;">
        ${renderSourceBox(q.file, null, null, metaHtml)}
       </div>
      </details>`;
     }).join("")}
    </div>
   `;
   catalogListEl.querySelectorAll(".sf-query-item").forEach((item) => {
    attachDetailsAnimation(item, { duration: 220 });
   });
  }
  this.#renderTable(queries, engines);
  this.#renderChart(queries, engines);
 }

 #queryFeatureMap() {
  if (!this.#cachedQueryFeatureMap) {
   const map = new Map();
   for (const q of this.#queries()) {
    map.set(keyOf(q.dataset, q.id), q.primaryFeature);
   }
   this.#cachedQueryFeatureMap = map;
  }
  return this.#cachedQueryFeatureMap;
 }

 #syncFocusVisuals() {
  const focus = focusStore.effectiveFocus;
  const raw = focusStore.state;
  const isPinned = Boolean(raw.pinned);
  this.#root.querySelectorAll(".badge-pinned").forEach((badge) => {
   badge.style.display = isPinned ? "inline-flex" : "none";
  });

  const target = focus?.target || null;
  const targetEngine = engineKeyOf(target);
  const qFeatureMap = this.#queryFeatureMap();
  const context = {
   getFeature: (qKey) => qFeatureMap.get(qKey),
  };

  // Update table container, rows, and cells
  const tbody = this.#root.querySelector("[data-sf-table] tbody");
  if (tbody) {
   tbody.classList.toggle("has-focus", Boolean(focus));
   tbody.querySelectorAll("tr[data-sf-query]").forEach((row) => {
    const queryKey = row.dataset.sfQuery;
    const rowPresentation = presentationFor(target, { kind: "query", queryKey }, context);
    row.classList.toggle("is-row-highlighted", rowPresentation === "selected");
    row.classList.toggle("is-row-related", rowPresentation === "related");
    row.classList.toggle("is-row-pinned", Boolean(raw.pinned?.kind === "query" && raw.pinned.key === queryKey));
    const btn = row.querySelector("button[data-sf-query-toggle]");
    if (btn) btn.setAttribute("aria-pressed", rowPresentation === "selected" && isPinned ? "true" : "false");

    // Individual cells in the row
    row.querySelectorAll("td[data-engine-key]").forEach((cell) => {
     const cellEngine = cell.dataset.engineKey;
     const cellPresentation = presentationFor(target, { kind: "cell", engine: cellEngine, queryKey }, context);
     cell.classList.toggle("is-cell-selected", cellPresentation === "selected");
     cell.classList.toggle("is-cell-related", cellPresentation === "related");
     cell.classList.toggle("is-column-highlighted", target?.kind === "engine" && cellEngine === targetEngine);
     cell.classList.toggle("is-column-pinned", target?.kind === "engine" && cellEngine === targetEngine && isPinned);
    });
   });
  }

  // Update Chart.js grouped horizontal bars per-bar
  if (!this.#chart) return;
  const features = FEATURE_IDS.filter((feature) => this.#queries().some((query) => query.primaryFeature === feature));

  for (const dataset of this.#chart.data.datasets) {
   const engine = dataset._engineKey;
   const baseColor = dataset._baseColor;

   // Per-bar color array
   const bgColors = [];
   const borderColors = [];

   for (const feature of features) {
    const barPresentation = presentationFor(target, { kind: "bar", engine, feature }, context);

    if (barPresentation === "selected" || barPresentation === "related" || barPresentation === "neutral") {
     bgColors.push(baseColor);
     borderColors.push(baseColor);
    } else {
     // unrelated: dimmed
     bgColors.push(colorWithAlpha(baseColor, 0.22));
     borderColors.push(colorWithAlpha(baseColor, 0.22));
    }
   }

   dataset.backgroundColor = bgColors;
   dataset.borderColor = borderColors;
   dataset.hoverBackgroundColor = bgColors;
   dataset.hoverBorderColor = borderColors;
  }
  this.#chart.update();
 }

 #renderChart(queries, engines) {
  this.#chartController?.abort();
  this.#legendHover.clear();
  this.#canvasHover.clear();
  this.#chart?.destroy();
  this.#chart = null;
  const series = featureTimings(queries, this.#index, engines);
  const features = FEATURE_IDS.filter((feature) => queries.some((query) => query.primaryFeature === feature));
  const canvas = this.#root.querySelector("canvas");
  const empty = this.#root.querySelector("[data-sf-chart-empty]");
  const hasTimings = series.some((entry) => entry.axes.some((axis) => axis.medianMs !== null));
  const available = typeof globalThis.Chart === "function";
  empty.hidden = engines.length > 0 && hasTimings && available;
  if (!engines.length) {
   empty.textContent = "Select an engine.";
  } else if (!hasTimings) {
   empty.textContent = "No timings available.";
  } else if (!available) {
   empty.textContent = "Chart unavailable. See Query details.";
  } else {
   empty.textContent = "";
  }
  canvas.parentElement.hidden = !empty.hidden;
  if (!empty.hidden) return;
  // Allow each engine bar its own space, including when many versions are selected.
  canvas.parentElement.style.height = `${Math.max(360, features.length * Math.max(76, engines.length * 24 + 22) + 90)}px`;
  this.#chartController = new AbortController();
  const timings = series.flatMap((entry) => entry.axes.map((axis) => axis.medianMs)).filter(measured);
  const minimum = Math.min(...timings), maximum = Math.max(...timings);
  // Logarithmic bars retain small latencies across orders of magnitude.
  // Keep real zero measurements on a linear axis; never replace them with epsilon.
  const logarithmic = minimum > 0 && Math.log10(maximum) - Math.log10(minimum) >= 2;
  const tickLabel = (value) => `${Number(value).toLocaleString("en", { maximumSignificantDigits: 3 })} ms`;
  const { text, grid } = getChartThemeTokens();
  this.#chart = new globalThis.Chart(canvas, {
   type: "bar",
   data: { labels: features.map((feature) => FEATURES[feature]), datasets: series.map((entry) => {
    const style = getEngineStyle(parseEngineId(entry.engine), this.#data.enginesCatalog);
    return { label: entry.engine, _engineKey: entry.engine, _baseColor: style.color, data: features.map((feature) => entry.axes.find((axis) => axis.feature === feature).medianMs),
     backgroundColor: style.color, borderColor: style.color, borderWidth: 1,
     borderRadius: 3, maxBarThickness: 20, categoryPercentage: 0.8, barPercentage: 0.9 };
   }) },
   options: {
    indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "nearest", intersect: true },
    onClick: (_event, elements, chart) => {
     const el = elements[0];
     if (!el) return;
     const dataset = chart.data.datasets[el.datasetIndex];
     const feature = features[el.index];
     if (dataset?._engineKey && feature) {
      focusStore.togglePin({ kind: "bar", engine: dataset._engineKey, feature, key: `${dataset._engineKey}|${feature}` });
     }
    },
    layout: { padding: { top: 8, right: 16, bottom: 8 } },
    scales: {
     x: { type: logarithmic ? "logarithmic" : "linear", beginAtZero: !logarithmic,
      ...(logarithmic ? { min: Math.max(Number.MIN_VALUE, 10 ** (Math.floor(Math.log10(minimum)) - 1)) } : {}), grid: { color: colorWithAlpha(grid, 0.6) },
      ticks: { color: text, maxTicksLimit: 6, callback: tickLabel },
      title: { display: true, text: logarithmic ? "Execution time (ms, logarithmic scale)" : "Execution time (ms)", color: text } },
     y: { grid: { display: false }, ticks: { color: text, autoSkip: false, padding: 12, font: { size: 12 } } },
    },
    plugins: {
     legend: createEngineLegendConfig({
      onEngineHover: (key) => this.#legendHover.set({ kind: "engine", key }),
      onEngineLeave: () => this.#legendHover.clear(),
      onEngineTogglePin: (key) => focusStore.togglePin({ kind: "engine", key }),
      focusStore, textColor: text,
     }),
     tooltip: { callbacks: {
      label: (context) => `${context.dataset.label}: ${milliseconds(context.raw)}`,
      afterLabel: (context) => {
       const axis = series[context.datasetIndex].axes.find((entry) => entry.feature === features[context.dataIndex]);
       return `${axis.count}/${axis.total} queries passed · Median of query medians`;
      },
     } },
    },
   },
  });
  attachChartPointerInteraction(this.#chart, canvas, this.#canvasHover, this.#chartController.signal, (dataset, index) => {
   const feature = features[index];
   return dataset?._engineKey && feature ? { kind: "bar", engine: dataset._engineKey, feature, key: `${dataset._engineKey}|${feature}` } : null;
  });
  this.#syncFocusVisuals();
 }

 #renderTable(queries, engines) {
  const baseColumns = [["id", "Query"], ["primaryFeature", "Feature"], ["dataset", "Dataset"]];

  const value = (query) => {
   const [field, engine] = this.#state.sort.split(":");
   if (!engine) return query[field];
   const run = this.#index.get(keyOf(query.dataset, query.id))?.get(engine);
   if (field === "status") return statusOf(run);
   return measured(run?.[field]) ? run[field] : null;
  };

  const sorted = [...queries].sort((a, b) => {
   const av = value(a);
   const bv = value(b);
   if (av == null || bv == null) {
    if (av == null && bv == null) return a.id.localeCompare(b.id);
    return av == null ? 1 : -1;
   }
   const diff = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "en", { numeric: true });
   return (this.#state.direction === "desc" ? -diff : diff) || a.id.localeCompare(b.id);
  });

  const header = (key, label) => {
   const isSorted = this.#state.sort === key;
   const sortDir = this.#state.direction === "asc" ? "ascending" : "descending";
   const ariaSort = isSorted ? ` aria-sort="${sortDir}"` : "";
   return `<th scope="col"${ariaSort}><button type="button" data-sf-sort="${esc(key)}" aria-label="Sort by ${esc(label)}">${esc(label)}</button></th>`;
  };

  const engineHeader = (engine) => {
   const sortKey = `medianMs:${engine}`;
   const isSorted = this.#state.sort === sortKey;
   const sortDir = this.#state.direction === "asc" ? "ascending" : "descending";
   const ariaSort = isSorted ? ` aria-sort="${sortDir}"` : "";
   const indicator = renderEngineIndicatorSvg(getEngineStyle(parseEngineId(engine), this.#data.enginesCatalog));
   return `<th scope="col" data-engine-key="${esc(engine)}" style="text-align: right;"${ariaSort}><button type="button" data-sf-sort="${esc(sortKey)}" aria-label="Sort by ${esc(engine)} median execution time" style="display: inline-flex; align-items: center; justify-content: flex-end; width: 100%; gap: 6px;">${indicator}<span>${esc(engine)}</span></button></th>`;
  };

  this.#root.querySelector("[data-sf-table]").innerHTML = `<table class="data-table"><thead>
   <tr>${baseColumns.map(([key, label]) => header(key, label)).join("")}${engines.map(engineHeader).join("")}</tr></thead>
   <tbody>${sorted.map((query) => {
    const dsInfo = DATASET_CONFIGS[query.dataset] || { name: query.dataset, shortFile: "" };
    const qKey = keyOf(query.dataset, query.id);
    return `<tr data-sf-query="${esc(qKey)}"><th scope="row"><div style="display: inline-flex; align-items: center; gap: 4px;"><button type="button" data-sf-query-toggle title="Pin query ${esc(query.id)}" aria-label="Pin query ${esc(query.id)}: ${esc(query.name)}" aria-pressed="false">${esc(query.id)}</button><button type="button" class="sf-query-link-btn" data-sf-jump-query="${esc(qKey)}" title="View SPARQL source in Protocol catalogue ↑">Source ↗</button></div></th><td>${esc(FEATURES[query.primaryFeature])}</td><td><div style="line-height: 1.3;"><strong>${esc(dsInfo.name)}</strong><br><span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${esc(dsInfo.shortFile)}</span></div></td>${engines.map((engine) => {
     const run = this.#index.get(keyOf(query.dataset, query.id))?.get(engine);
     const status = statusOf(run);
     const num = (v) => measured(v) ? v.toLocaleString("en", { maximumFractionDigits: 3 }) : "—";
     const cellTooltip = `${esc(engine)}: ${num(run?.medianMs)} ms (TTFR: ${num(run?.medianTtfrMs)} ms) · Status: ${esc(status)}`;
     const cellKey = `${engine}|${qKey}`;
     if (status === "PASS") {
      return `<td data-engine-key="${esc(engine)}" data-cell-key="${esc(cellKey)}" style="text-align: right; font-variant-numeric: tabular-nums;" title="${cellTooltip}">${num(run?.medianMs)} ms</td>`;
     }
     return `<td data-engine-key="${esc(engine)}" data-cell-key="${esc(cellKey)}" style="text-align: right;" title="${cellTooltip}">${badge(status)}</td>`;
    }).join("")}</tr>`;
   }).join("")}</tbody></table>`;
  this.#syncFocusVisuals();
 }

 async #fetchQuerySource(file, signal) {
  if (typeof file !== "string" || !/^[\w-]+\/[\w.-]+\.rq$/.test(file)) {
   throw new Error("Invalid query file path");
  }
  let source = this.#sourceCache.get(file);
  if (source === undefined) {
   const response = await fetch(`data/sparql/v1/${file}`, { signal });
   if (!response.ok) throw new Error("Source unavailable");
   source = await response.text();
   this.#sourceCache.set(file, source);
  }
  return source;
 }
}
