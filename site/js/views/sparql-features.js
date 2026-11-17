/** SPARQL feature timings and original query sources. */
import { escapeHtml as esc, formatEngineId, parseEngineId } from "../engine-id.js";
import { clearChartInteraction, colorWithAlpha, createEngineLegendConfig, getChartThemeTokens } from "../chart-utils.js";
import { getEngineStyle, renderEngineIndicatorSvg } from "../engines.js";
import { focusStore, hoverSource, engineKeyOf } from "../focus-store.js";
import { parseUrlSparql, updateUrlSparql } from "../router.js";

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

/** Single-pass lexer: escape each original token exactly once, including markup in literals. */
export function highlightSparql(source) {
 const tokens = /#[^\n\r]*|<[^<>\s]*>|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[?$][\w]+|(?:[A-Za-z_][\w-]*)?:[\w.-]*|\b[A-Za-z_][\w-]*\b/g;
 const keywords = /^(PREFIX|BASE|SELECT|ASK|CONSTRUCT|DESCRIBE|WHERE|FROM|NAMED|GRAPH|OPTIONAL|UNION|MINUS|FILTER|NOT|EXISTS|BIND|AS|VALUES|SERVICE|SILENT|DISTINCT|REDUCED|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|ASC|DESC|COUNT|SUM|AVG|MIN|MAX|SAMPLE|GROUP_CONCAT|CONTAINS|LCASE|YEAR|MONTH|STR|CONCAT|REGEX|BOUND|IF|COALESCE|IN|true|false)$/i;
 let output = "", end = 0;
 for (const match of String(source).matchAll(tokens)) {
  output += esc(source.slice(end, match.index));
  const token = match[0];
  const kind = token.startsWith("#") ? "comment" : /^["']/.test(token) ? "string" : /^[?$]/.test(token) ? "variable" : token.startsWith("<") || token.includes(":") ? "iri" : keywords.test(token) ? "keyword" : null;
  output += kind ? `<span class="sf-token-${kind}">${esc(token)}</span>` : esc(token);
  end = match.index + token.length;
 }
 return output + esc(source.slice(end));
}

function badge(status) {
 const kind = status === "PASS" ? "pass" : ["MISMATCH", "TIMEOUT", "ERROR", "DUPLICATE"].includes(status) ? "fail" : "other";
 return `<span class="sf-badge sf-badge--${kind}">${esc(status)}</span>`;
}

/** Median of reported query medians, with no inferred or failed timings. */
export function featureTimings(queries, index, engines) {
 return engines.map((engine) => ({ engine, axes: FEATURE_IDS.map((feature) => {
  const scope = queries.filter((query) => query.primaryFeature === feature);
  const values = scope.map((query) => index.get(keyOf(query.dataset, query.id))?.get(engine))
   .filter((run) => statusOf(run) === "PASS" && measured(run.medianMs))
   .map((run) => run.medianMs).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const medianMs = !values.length ? null : values.length % 2 ? values[middle]
   : values[middle - 1] / 2 + values[middle] / 2;
  return { feature, total: scope.length, count: values.length, medianMs };
 }) }));
}

const DATASETS = ["lubm", "bsbm", "bowlogna", "dbpedia", "named-graphs"];

export class SparqlFeaturesView {
 #root; #data; #engines; #index; #state;
 #catalogue = null; #controller = null; #sourceController = null; #chart = null;
 #sourceCache = new Map();
 #chartController = null;
 #legendHover = hoverSource();
 #canvasHover = hoverSource();

 constructor(container, data, engines = []) {
  this.#root = container;
  this.#data = data;
  this.#engines = engines;
  this.#index = indexRuns(data.queryRuns);
  this.#setState(parseUrlSparql(window.location.search));
 }

 // Old links retain their dataset and sorting; removed controls cannot hide queries.
 #setState(state) {
  this.#state = { ...parseUrlSparql(""), ...state, reference: "", feature: "", q: "", chart: "bar" };
  if (!DATASETS.includes(this.#state.dataset)) this.#state.dataset = "";
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
    const dialog = this.#root?.querySelector("dialog[open]");
    if (dialog) return; // Allow native dialog closing without clearing pin
    focusStore.clear();
   }
  }, { signal });
  this.#root.addEventListener("click", (event) => {
   const dataset = event.target.closest("[data-sf-state='dataset']");
   if (dataset) {
    this.#state.dataset = dataset.dataset.sfValue;
    updateUrlSparql(this.#state);
    this.#refresh();
    return;
   }
   const sort = event.target.closest("[data-sf-sort]");
   if (sort) {
    const key = sort.dataset.sfSort;
    this.#state.direction = this.#state.sort === key && this.#state.direction === "asc" ? "desc" : "asc";
    this.#state.sort = key;
    updateUrlSparql(this.#state);
    this.#renderTable(this.#queries(), this.#engineKeys());
    [...this.#root.querySelectorAll("[data-sf-sort]")].find((button) => button.dataset.sfSort === key)?.focus();
    return;
   }
   if (event.target.closest("[data-sf-retry]")) { void this.#loadCatalogue(); return; }
   const row = event.target.closest("[data-sf-query]");
   if (row) void this.#openQuery(row.dataset.sfQuery);
  }, { signal });
  this.#root.addEventListener("close", (event) => {
   if (event.target.matches("dialog")) this.#sourceController?.abort();
  }, { signal, capture: true });
  window.addEventListener("theme-changed", () => {
   if (this.#catalogue) this.#renderChart(this.#queries(), this.#engineKeys());
  }, { signal });
  void this.#loadCatalogue();
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
  this.#sourceController?.abort();
  this.#chart?.destroy();
  this.#chart = null;
  this.#root.querySelector("dialog[open]")?.close();
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
    if (!query.id || !query.name || !DATASETS.includes(query.dataset) ||
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
  return this.#catalogue.queries.filter((query) => !this.#state.dataset || query.dataset === this.#state.dataset);
 }

 #render() {
  this.#root.innerHTML = `<div class="sf-view loading-view-container">
   <div class="view-controls sf-controls">
    <div class="sf-filter" role="group" aria-label="Dataset"><span class="sf-filter-label">DATASET:</span>
     <div class="segmented-control sf-segments">${[["", "All datasets"], ...DATASETS.map((dataset) => [dataset, dataset])].map(([value, title]) =>
      `<button type="button" class="segmented-control__btn" data-sf-state="dataset" data-sf-value="${value}" aria-pressed="false">${title}</button>`).join("")}</div>
    </div>
   </div>
   <details class="protocol-tile sf-protocol">
    <summary><span class="protocol-title">Dataset &amp; protocol</span><span class="protocol-summary-meta" data-sf-protocol-meta></span><span class="protocol-chevron" aria-hidden="true">▾</span></summary>
    <div class="protocol-body"><div class="protocol-col"><h4 class="protocol-section-title">Dataset</h4><dl class="protocol-facts" data-sf-inputs></dl></div>
     <div class="protocol-col"><h4 class="protocol-section-title">Measurement protocol</h4>
      <dl class="protocol-facts"><dt>Aggregation</dt><dd>Median of reported query medians per feature, using PASS results only.</dd>
       <dt>Repetitions</dt><dd>${esc(this.#data.metadata?.protocol?.repetitions ?? "Not reported")}</dd>
       <dt>Timeout</dt><dd>${esc(this.#catalogue.defaults?.timeoutSecs ?? "Not reported")} s, unless overridden per query</dd>
       <dt>Entailment</dt><dd>${esc(this.#catalogue.entailment ?? "Not reported")}</dd>
       <dt>Validation</dt><dd>Reported SPARQL result comparison; not W3C certification. Missing timings remain blank.</dd></dl>
     </div></div>
   </details>
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
   <dialog class="sf-dialog" aria-labelledby="sf-query-title" style="overscroll-behavior:contain">
    <form method="dialog"><button type="submit" autofocus>Close</button></form>
    <h3 id="sf-query-title"></h3><p class="section-meta" data-sf-query-meta></p>
    <div data-sf-query-perf style="margin: 16px 0;"></div>
    <p data-sf-source-status role="status"></p><pre tabindex="0"><code></code></pre>
   </dialog>
  </div>`;
  this.#refresh();
 }

 #refresh() {
  if (!this.#catalogue) return;
  const queries = this.#queries(), engines = this.#engineKeys();
  const sortEngine = this.#state.sort.split(":")[1];
  if (sortEngine && !engines.includes(sortEngine)) this.#state.sort = "id";
  updateUrlSparql(this.#state);
  this.#root.querySelectorAll("[data-sf-state='dataset']").forEach((button) => {
   const active = button.dataset.sfValue === this.#state.dataset;
   button.setAttribute("aria-pressed", String(active));
   button.classList.toggle("is-active", active);
  });
  this.#root.querySelector("[data-sf-chart-meta]").textContent = `${queries.length} queries · Median execution time (ms) · Grouped by feature`;
  this.#root.querySelector("[data-sf-table-meta]").textContent = `${queries.length} queries · Median execution time (ms) · Lower is better · Result validation`;
  this.#root.querySelector("[data-sf-protocol-meta]").textContent = `${this.#state.dataset || "All datasets"} · SPARQL 1.1`;
  const datasets = [...new Set(queries.map((query) => query.dataset))];
  this.#root.querySelector("[data-sf-inputs]").innerHTML = datasets.map((dataset) => {
   const input = this.#catalogue.datasets?.[dataset];
   const paths = input?.defaultGraphFiles || (input?.quadFile ? [input.quadFile] : []);
   return `<dt>${esc(dataset)}</dt><dd style="overflow-wrap:anywhere">${esc(paths.join(", ") || "Not reported")}${input?.source ? `<br>Source: ${esc(input.source)}` : ""}${input?.graphIris ? `<br>Graphs: ${esc(input.graphIris.join(", "))}` : ""}</dd>`;
  }).join("");
  this.#renderTable(queries, engines);
  this.#renderChart(queries, engines);
 }

 #syncFocusVisuals() {
  const isPinned = Boolean(focusStore.state.pinned);
  this.#root.querySelectorAll(".badge-pinned").forEach((badge) => {
   badge.style.display = isPinned ? "inline-flex" : "none";
  });
  const engine = engineKeyOf(focusStore.effectiveFocus?.target);
  this.#root.querySelectorAll("[data-sf-table] [data-engine-key]").forEach((cell) => {
   const match = cell.dataset.engineKey === engine;
   cell.classList.toggle("is-column-highlighted", match);
   cell.classList.toggle("is-column-pinned", match && Boolean(focusStore.state.pinned));
   // Column focus needs cell styling: the shared loading styles target whole rows.
   cell.style.opacity = engine && !match ? "0.22" : "";
   cell.style.backgroundColor = match ? "var(--bg-hover)" : "";
   cell.style.boxShadow = match && focusStore.state.pinned ? "inset 0 -2px var(--focus)" : "";
  });
  if (!this.#chart) return;
  for (const dataset of this.#chart.data.datasets) {
   const color = !engine || dataset._engineKey === engine
    ? dataset._baseColor : colorWithAlpha(dataset._baseColor, 0.22);
   dataset.backgroundColor = color;
   dataset.borderColor = color;
   dataset.hoverBackgroundColor = color;
   dataset.hoverBorderColor = color;
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
  empty.textContent = !engines.length ? "Select an engine." : !hasTimings ? "No timings available." : !available ? "Chart unavailable. See Query details." : "";
  canvas.parentElement.hidden = !empty.hidden;
  if (!empty.hidden) return;
  // Allow each engine bar its own space, including when many versions are selected.
  canvas.parentElement.style.height = `${Math.max(360, features.length * Math.max(76, engines.length * 24 + 22) + 90)}px`;
  this.#chartController = new AbortController();
  const clearHover = () => {
   this.#legendHover.clear();
   clearChartInteraction(this.#chart, this.#canvasHover);
  };
  for (const event of ["pointerleave", "pointercancel", "mouseout"]) {
   canvas.addEventListener(event, clearHover, { signal: this.#chartController.signal });
  }
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
    onHover: (_event, elements, chart) => {
     const key = chart.data.datasets[elements[0]?.datasetIndex]?._engineKey;
     this.#canvasHover.set(key ? { kind: "engine", key } : null);
    },
    onClick: (_event, elements, chart) => {
     const key = chart.data.datasets[elements[0]?.datasetIndex]?._engineKey;
     if (key) focusStore.togglePin({ kind: "engine", key });
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
       return `${axis.count}/${axis.total} queries · Median of query medians`;
      },
     } },
    },
   },
  });
  this.#syncFocusVisuals();
 }

 #renderTable(queries, engines) {
  const showDataset = !this.#state.dataset;
  const baseColumns = [["id", "Query"], ["primaryFeature", "Feature"]];
  if (showDataset) baseColumns.push(["dataset", "Dataset"]);

  const value = (query) => {
   const [field, engine] = this.#state.sort.split(":");
   if (!engine) return query[field];
   const run = this.#index.get(keyOf(query.dataset, query.id))?.get(engine);
   return field === "status" ? statusOf(run) : measured(run?.[field]) ? run[field] : null;
  };

  const sorted = [...queries].sort((a, b) => {
   const av = value(a), bv = value(b);
   if (av == null || bv == null) return av == null && bv == null ? a.id.localeCompare(b.id) : av == null ? 1 : -1;
   const diff = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "en", { numeric: true });
   return (this.#state.direction === "desc" ? -diff : diff) || a.id.localeCompare(b.id);
  });

  const header = (key, label) => `<th scope="col"${this.#state.sort === key ? ` aria-sort="${this.#state.direction === "asc" ? "ascending" : "descending"}"` : ""}><button type="button" data-sf-sort="${esc(key)}" aria-label="Sort by ${esc(label)}">${esc(label)}</button></th>`;
  const engineHeader = (engine) => {
   const sortKey = `medianMs:${engine}`;
   const isSorted = this.#state.sort === sortKey;
   const ariaSort = isSorted ? ` aria-sort="${this.#state.direction === "asc" ? "ascending" : "descending"}"` : "";
   const indicator = renderEngineIndicatorSvg(getEngineStyle(parseEngineId(engine), this.#data.enginesCatalog));
   return `<th scope="col" data-engine-key="${esc(engine)}" style="text-align: right;"${ariaSort}><button type="button" data-sf-sort="${esc(sortKey)}" aria-label="Sort by ${esc(engine)} median execution time" style="display: inline-flex; align-items: center; justify-content: flex-end; width: 100%; gap: 6px;">${indicator}<span>${esc(engine)}</span></button></th>`;
  };

  this.#root.querySelector("[data-sf-table]").innerHTML = `<table class="data-table"><thead>
   <tr>${baseColumns.map(([key, label]) => header(key, label)).join("")}${engines.map(engineHeader).join("")}</tr></thead>
   <tbody>${sorted.map((query) => `<tr data-sf-query="${esc(keyOf(query.dataset, query.id))}"><th scope="row"><button type="button" title="${esc(query.name)}" aria-label="Open ${esc(query.id)}: ${esc(query.name)}">${esc(query.id)}</button></th><td>${esc(FEATURES[query.primaryFeature])}</td>${showDataset ? `<td>${esc(query.dataset)}</td>` : ""}${engines.map((engine) => {
    const run = this.#index.get(keyOf(query.dataset, query.id))?.get(engine);
    const status = statusOf(run);
    const num = (v) => measured(v) ? v.toLocaleString("en", { maximumFractionDigits: 3 }) : "—";
    const cellTooltip = `${esc(engine)}: ${num(run?.medianMs)} ms (TTFR: ${num(run?.medianTtfrMs)} ms) · Status: ${status}`;
    if (status === "PASS") {
     return `<td data-engine-key="${esc(engine)}" style="text-align: right; font-variant-numeric: tabular-nums;" title="${cellTooltip}">${num(run?.medianMs)} ms</td>`;
    }
    return `<td data-engine-key="${esc(engine)}" style="text-align: right;" title="${cellTooltip}">${badge(status)}</td>`;
   }).join("")}</tr>`).join("")}</tbody></table>`;
  this.#syncFocusVisuals();
 }

 async #openQuery(key) {
  const query = this.#catalogue.queries.find((entry) => keyOf(entry.dataset, entry.id) === key);
  if (!query) return;
  this.#sourceController?.abort();
  const controller = new AbortController();
  this.#sourceController = controller;
  const dialog = this.#root.querySelector("dialog");
  dialog.querySelector("h3").textContent = `${query.id} · ${query.name}`;
  dialog.querySelector("[data-sf-query-meta]").textContent = `${query.dataset} · ${FEATURES[query.primaryFeature]} · ${query.validationMode || this.#catalogue.defaults?.validationMode || "Not reported"}`;
  
  // Render performance summary table inside dialog
  const perfDiv = dialog.querySelector("[data-sf-query-perf]");
  const engines = this.#engineKeys();
  const num = (v) => measured(v) ? `${v.toLocaleString("en", { maximumFractionDigits: 3 })} ms` : "—";
  perfDiv.innerHTML = `<table class="data-table" style="font-size: 12px; margin-bottom: 12px;">
   <thead><tr><th scope="col">Engine</th><th scope="col" style="text-align: right;">Median</th><th scope="col" style="text-align: right;">TTFR</th><th scope="col" style="text-align: center;">Status</th></tr></thead>
   <tbody>${engines.map((engine) => {
    const run = this.#index.get(keyOf(query.dataset, query.id))?.get(engine);
    const style = getEngineStyle(parseEngineId(engine), this.#data.enginesCatalog);
    const indicator = renderEngineIndicatorSvg(style);
    return `<tr><td><span style="display: inline-flex; align-items: center; gap: 6px;">${indicator}<strong>${esc(engine)}</strong></span></td><td style="text-align: right; font-variant-numeric: tabular-nums;">${num(run?.medianMs)}</td><td style="text-align: right; font-variant-numeric: tabular-nums;">${num(run?.medianTtfrMs)}</td><td style="text-align: center;">${badge(statusOf(run))}</td></tr>`;
   }).join("")}</tbody></table>`;

  const status = dialog.querySelector("[data-sf-source-status]");
  const code = dialog.querySelector("code");
  code.textContent = "";
  status.textContent = "Loading query…";
  if (!dialog.open) dialog.showModal();
  try {
   if (typeof query.file !== "string" || !/^[\w-]+\/[\w.-]+\.rq$/.test(query.file)) throw new Error("Invalid source");
   let source = this.#sourceCache.get(query.file);
   if (source === undefined) {
    const response = await fetch(`data/sparql/v1/${query.file}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Source unavailable");
    source = await response.text();
    if (controller.signal.aborted) return;
    this.#sourceCache.set(query.file, source);
   }
   if (controller.signal.aborted) return;
   code.innerHTML = highlightSparql(source);
   status.textContent = query.file;
  } catch {
   if (!controller.signal.aborted) status.textContent = "Query source unavailable.";
  }
 }
}
