/**
 * Benchmark Data API & Normalization
 * Fetches real benchmark JSON reports and extracts engines, datasets, and metrics.
 * ZERO MOCK: Every engine, version, and number comes strictly from real test runs.
 */

import { isBranchVersion, parseEngineId, sanitizeColor } from "./engine-id.js";

export { isBranchVersion, parseEngineId };

// Official engines supported in corese-benchmark
const KNOWN_ENGINE_META = {
	corese: { name: "Corese", shortName: "Corese", color: "#0072b2" },
	jena: { name: "Apache Jena", shortName: "Jena", color: "#d55e00" },
	rdf4j: { name: "Eclipse RDF4J", shortName: "RDF4J", color: "#009e73" },
};

/**
 * Loads and normalizes benchmark report JSON.
 */
export async function loadBenchmarkReport(
	url = "data/benchmark-report.json",
	{ signal } = {},
) {
	const resp = await fetch(url, { signal });
	if (!resp.ok) {
		throw new Error(`Failed to load benchmark data: HTTP ${resp.status}`);
	}
	const rawData = await resp.json();
	if (!rawData || typeof rawData !== "object") {
		throw new Error("Invalid benchmark data: root JSON must be an object");
	}

	const metadata = rawData.metadata || {};
	const runs = (
		Array.isArray(rawData.runs)
			? rawData.runs.filter((r) => r && typeof r === "object")
			: []
	).map(normalizeRun);

	// Dynamically extract the catalog of engines and versions ACTUALLY present in data
	const catalogMap = new Map();
	const enginesConfig =
		metadata.engines && typeof metadata.engines === "object"
			? metadata.engines
			: {};

	runs.forEach((run) => {
		const { engineId, versionId, storageId } = run.parsedEngine;
		if (!catalogMap.has(engineId)) {
			// Safe property lookup guarding against Object prototype properties and null values
			const customMeta =
				Object.hasOwn(enginesConfig, engineId) &&
				enginesConfig[engineId] &&
				typeof enginesConfig[engineId] === "object"
					? enginesConfig[engineId]
					: {};
			const knownMeta = Object.hasOwn(KNOWN_ENGINE_META, engineId)
				? KNOWN_ENGINE_META[engineId]
				: {};

			const name =
				customMeta.name ||
				knownMeta.name ||
				engineId.charAt(0).toUpperCase() + engineId.slice(1);
			const shortName =
				customMeta.shortName ||
				knownMeta.shortName ||
				name.replace(/^(Apache|Eclipse)\s+/i, "");
			const color = sanitizeColor(customMeta.color, knownMeta.color || null);

			catalogMap.set(engineId, {
				id: engineId,
				name,
				shortName,
				color,
				versions: new Map(),
				storages: new Set(),
			});
		}

		const entry = catalogMap.get(engineId);
		if (!entry.versions.has(versionId)) {
			const isBranch = isBranchVersion(versionId);
			entry.versions.set(versionId, {
				id: versionId,
				label: isBranch ? `${versionId} (dev)` : versionId,
				type: isBranch ? "branch" : "release",
				isLatest: false,
			});
		}
		entry.storages.add(storageId);
	});

	// Convert catalog map to sorted arrays
	const enginesCatalog = Array.from(catalogMap.values()).map((eng) => {
		const versions = Array.from(eng.versions.values());
		// Sort: active dev branches first, then releases ordered descending by version
		versions.sort((a, b) => {
			if (a.type === "branch" && b.type !== "branch") return -1;
			if (b.type === "branch" && a.type !== "branch") return 1;
			return b.id.localeCompare(a.id, undefined, { numeric: true });
		});

		if (versions.length > 0) {
			// Mark the first release version as latest
			const firstRelease =
				versions.find((v) => v.type === "release") || versions[0];
			firstRelease.isLatest = true;
		}
		const storages = Array.from(eng.storages).map((sId) => ({
			id: sId,
			label: sId === "in-memory" ? "In-Memory" : sId.toUpperCase(),
			isDefault: sId === "in-memory" || eng.storages.size === 1,
		}));

		return {
			id: eng.id,
			name: eng.name,
			shortName: eng.shortName,
			color: eng.color,
			versions,
			storages:
				storages.length > 0
					? storages
					: [{ id: "in-memory", label: "In-Memory", isDefault: true }],
		};
	});

	const rawQueryRuns = Array.isArray(rawData.queryRuns)
		? rawData.queryRuns.filter((q) => q && typeof q === "object")
		: [];
	const queryRuns = rawQueryRuns.map(normalizeQueryRun);

	const rawLoadingRuns = Array.isArray(rawData.loadingRuns)
		? rawData.loadingRuns.filter((r) => r && typeof r === "object")
		: [];

	return {
		metadata,
		runs,
		loadingRuns: rawLoadingRuns,
		queryRuns,
		enginesCatalog,
	};
}

/**
 * Normalizes a single query run object (parses engine ID, handles sentinels).
 */
function normalizeQueryRun(qrun) {
	const sanitize = (val) => (val === -1 ? null : val);

	return {
		...qrun,
		medianMs: sanitize(qrun.medianMs),
		medianTtfrMs: sanitize(qrun.medianTtfrMs),
		repetitionsMs: Array.isArray(qrun.repetitionsMs)
			? qrun.repetitionsMs.map(sanitize)
			: [],
		repetitionsTtfrMs: Array.isArray(qrun.repetitionsTtfrMs)
			? qrun.repetitionsTtfrMs.map(sanitize)
			: [],
		parsedEngine: parseEngineId(qrun.engine),
		status: qrun.status || (qrun.medianMs != null ? "PASS" : "UNKNOWN"),
	};
}

/**
 * Normalizes a single run object (removes Java sentinels -1, computes metrics if needed).
 */
function normalizeRun(run) {
	const sanitize = (val) => (val === -1 ? null : val);

	return {
		...run,
		loadingTimeMs: sanitize(run.loadingTimeMs),
		throughputTriplesPerSec: sanitize(run.throughputTriplesPerSec),
		memoryDeltaMb: sanitize(run.memoryDeltaMb),
		cpuPercent: sanitize(run.cpuPercent),
		parsedEngine: parseEngineId(run.engine),
	};
}
