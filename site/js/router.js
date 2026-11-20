/**
 * Corese Benchmark Dashboard - URL Engine Serializer
 * Deep linking for selected engines comparison in URL query parameter (?engines=...)
 */

import { formatEngineId, parseEngineId } from "./engine-id.js";

export function parseUrlEngines(searchStr, catalog = []) {
	const params = new URLSearchParams(searchStr || "");
	const rawEngines = (params.get("engines") || params.get("e") || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	if (rawEngines.length === 0 || catalog.length === 0) {
		return null;
	}

	const validEngines = [];
	const seenKeys = new Set();

	rawEngines.forEach((str) => {
		const parsed = parseEngineId(str);
		const eng = catalog.find(
			(e) => e.id.toLowerCase() === parsed.engineId.toLowerCase(),
		);
		if (!eng) return;

		let resolvedVersion = eng.versions.find(
			(v) => v.id.toLowerCase() === parsed.versionId.toLowerCase(),
		);
		if (!resolvedVersion) {
			resolvedVersion = eng.versions.find((v) => v.isLatest) || eng.versions[0];
		}
		if (!resolvedVersion) return;

		let resolvedStorage = (eng.storages || []).find(
			(s) => s.id.toLowerCase() === parsed.storageId.toLowerCase(),
		);
		if (!resolvedStorage) {
			resolvedStorage = (eng.storages || []).find((s) => s.isDefault) ||
				eng.storages?.[0] || { id: "in-memory" };
		}

		const key = formatEngineId({
			engineId: eng.id,
			versionId: resolvedVersion.id,
			storageId: resolvedStorage.id,
		});

		if (!seenKeys.has(key)) {
			seenKeys.add(key);
			validEngines.push({
				engineId: eng.id,
				versionId: resolvedVersion.id,
				storageId: resolvedStorage.id,
			});
		}
	});

	return validEngines.length > 0 ? validEngines : null;
}

function commitUrlParams(params, push = false) {
	if (typeof window === "undefined") return;

	// Preserve readable commas instead of %2C, and preserve existing location.hash
	const query = params.toString().replaceAll("%2C", ",");
	const hash = window.location.hash || "";
	const currentUrl =
		(window.location.search
			? `${window.location.pathname}${window.location.search}`
			: window.location.pathname) + hash;
	const newUrl =
		(query
			? `${window.location.pathname}?${query}`
			: window.location.pathname) + hash;

	if (newUrl === currentUrl) return;

	if (push) {
		window.history.pushState(null, "", newUrl);
	} else {
		window.history.replaceState(null, "", newUrl);
	}
}

export function updateUrlEngines(selectedEngines = [], push = false) {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams(window.location.search);
	params.delete("e");

	if (selectedEngines.length > 0) {
		const serialized = selectedEngines.map((e) => formatEngineId(e)).join(",");
		params.set("engines", serialized);
	} else {
		params.delete("engines");
	}

	commitUrlParams(params, push);
}

const VALID_DATASETS = new Set(["bsbm", "bowlogna", "dbpedia", "lubm"]);
const DEFAULT_ALL_FORMATS = ["nt", "ttl", "nq", "trig", "rdf", "jsonld", "html"];
const VALID_FORMATS_SET = new Set(DEFAULT_ALL_FORMATS);
export const VALID_LOADING_SECTIONS = new Set([
	"dataset",
	"protocol",
	"throughput",
	"retained-heap",
	"telemetry",
	"table",
]);

export function parseUrlLoading(searchStr) {
	const params = new URLSearchParams(searchStr || "");

	const rawDataset = (params.get("dataset") || "").trim().toLowerCase();
	const dataset = VALID_DATASETS.has(rawDataset) ? rawDataset : "bsbm";

	let formats = new Set(DEFAULT_ALL_FORMATS);
	if (params.has("formats")) {
		const parsed = params
			.get("formats")
			.split(",")
			.map((f) => f.trim().toLowerCase())
			.filter((f) => VALID_FORMATS_SET.has(f));
		if (parsed.length > 0) {
			formats = new Set(parsed);
		}
	}

	const rawTFormat = (params.get("tformat") || "").trim().toLowerCase();
	const telemetryFormat = VALID_FORMATS_SET.has(rawTFormat) ? rawTFormat : null;

	const rawSection = (params.get("section") || "").trim().toLowerCase();
	const section = VALID_LOADING_SECTIONS.has(rawSection) ? rawSection : null;

	const rawPin = (params.get("pin") || "").trim();
	let pin = null;
	if (rawPin.startsWith("engine:")) {
		pin = { kind: "engine", key: rawPin.slice(7) };
	} else if (rawPin.startsWith("measure:")) {
		pin = { kind: "measure", key: rawPin.slice(8) };
	}

	return { dataset, formats, telemetryFormat, section, pin };
}

function applyParam(params, key, value, defaultValue = null) {
	if (value && value !== defaultValue) {
		params.set(key, value);
	} else {
		params.delete(key);
	}
}

export function updateUrlLoading(state, { history = "replace" } = {}) {
	if (typeof window === "undefined" || !state) return;

	const params = new URLSearchParams(window.location.search);

	applyParam(params, "dataset", state.dataset, "bsbm");

	const hasCustomFormats = state.formats && state.formats.size < DEFAULT_ALL_FORMATS.length;
	const serializedFormats = hasCustomFormats
		? DEFAULT_ALL_FORMATS.filter((f) => state.formats.has(f)).join(",")
		: null;
	applyParam(params, "formats", serializedFormats);

	applyParam(params, "tformat", state.telemetryFormat);

	const validSection = state.section && VALID_LOADING_SECTIONS.has(state.section) ? state.section : null;
	applyParam(params, "section", validSection);

	const pinStr = state.pin?.kind && state.pin?.key ? `${state.pin.kind}:${state.pin.key}` : null;
	applyParam(params, "pin", pinStr);

	commitUrlParams(params, history === "push");
}

export const VALID_VIEWS = ["loading", "sparql"];

/**
 * Extracts and validates the current active view from location.hash.
 * Fallback to 'loading' if hash is missing or unknown.
 */
export function getCurrentView() {
	if (typeof window === "undefined") return "loading";
	const rawHash = (window.location.hash || "")
		.replace(/^#\/?/, "")
		.trim()
		.toLowerCase();
	if (rawHash === "sparql-features") return "sparql";
	if (rawHash === "overview") return "loading";
	return VALID_VIEWS.includes(rawHash) ? rawHash : "loading";
}

/**
 * Navigates to a specific benchmark view by updating location.hash while preserving location.search (?engines=...).
 */
export function navigateToView(viewId) {
	if (typeof window === "undefined") return;
	const targetView = VALID_VIEWS.includes(viewId) ? viewId : "loading";
	window.location.hash = targetView;
}

// SPARQL state is namespaced so loading parameters and engine links are preserved.
export function parseUrlSparql(searchStr) {
 const params = new URLSearchParams(searchStr || "");
 const sort = params.get("sf-sort") || "id";
 const rawPin = (params.get("pin") || "").trim();
 let pin = null;
 if (rawPin.startsWith("engine:")) {
  pin = { kind: "engine", key: rawPin.slice(7) };
 } else if (rawPin.startsWith("measure:")) {
  pin = { kind: "measure", key: rawPin.slice(8) };
 } else if (rawPin.startsWith("query:")) {
  pin = { kind: "query", key: rawPin.slice(6) };
 } else if (rawPin.startsWith("cell:")) {
  pin = { kind: "cell", key: rawPin.slice(5) };
 } else if (rawPin.startsWith("bar:")) {
  pin = { kind: "bar", key: rawPin.slice(4) };
 } else if (rawPin.startsWith("feature:")) {
  pin = { kind: "feature", key: rawPin.slice(8) };
 }
 return {
  reference: params.get("sf-ref") || "",
  dataset: params.get("sf-dataset") || "",
  feature: params.get("sf-feature") || "",
  q: params.get("sf-q") || "",
  chart: params.get("sf-chart") === "radar" ? "radar" : "bar",
  sort: /^(id|name|dataset|primaryFeature|(?:medianMs|medianTtfrMs|status):[^:]+)$/.test(sort) ? sort : "id",
  direction: params.get("sf-dir") === "desc" ? "desc" : "asc",
  pin,
 };
}

export function updateUrlSparql(state) {
 if (typeof window === "undefined") return;
 const params = new URLSearchParams(window.location.search);
 for (const [key, name, fallback] of [
  ["reference", "ref", ""], ["dataset", "dataset", ""], ["feature", "feature", ""],
  ["chart", "chart", "bar"], ["q", "q", ""], ["sort", "sort", "id"], ["direction", "dir", "asc"],
 ]) applyParam(params, `sf-${name}`, state[key], fallback);
 const pinStr = state.pin?.kind && state.pin?.key ? `${state.pin.kind}:${state.pin.key}` : null;
 applyParam(params, "pin", pinStr);
 commitUrlParams(params);
}
