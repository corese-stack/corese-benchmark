/**
 * Corese Benchmark Dashboard - Chart.js Utilities & Interaction Helpers
 * Provides reusable canvas pointer handling, color alpha blending,
 * and Chart.js DOM lifecycle coordination.
 */

const HEX6_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX3_REGEX = /^#[0-9a-fA-F]{3}$/;
const RGB_REGEX = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const RGBA_REGEX = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,[^)]+\)$/i;

/**
 * Returns a CSS rgba string for a given hex (#rgb, #rrggbb) or rgb/rgba color with applied alpha.
 * Fallbacks to rgba(136, 136, 136, alpha) on invalid color format.
 */
export function colorWithAlpha(color, alpha) {
	if (!color || typeof color !== "string") {
		return `rgba(136, 136, 136, ${alpha})`;
	}
	const trimmed = color.trim();
	if (HEX6_REGEX.test(trimmed)) {
		const r = Number.parseInt(trimmed.substring(1, 3), 16);
		const g = Number.parseInt(trimmed.substring(3, 5), 16);
		const b = Number.parseInt(trimmed.substring(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	if (HEX3_REGEX.test(trimmed)) {
		const r = Number.parseInt(trimmed[1] + trimmed[1], 16);
		const g = Number.parseInt(trimmed[2] + trimmed[2], 16);
		const b = Number.parseInt(trimmed[3] + trimmed[3], 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	const rgbMatch = RGB_REGEX.exec(trimmed);
	if (rgbMatch) {
		return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
	}
	const rgbaMatch = RGBA_REGEX.exec(trimmed);
	if (rgbaMatch) {
		return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${alpha})`;
	}
	return `rgba(136, 136, 136, ${alpha})`;
}

/**
 * Finds the bar element intersecting (x, y) coordinates on a Chart.js bar chart.
 */
export function findBarElement(chart, x, y) {
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
}

/**
 * Attaches pointer interactions (pointermove, pointerleave, scroll) on a Chart.js canvas
 * and binds hover focus target updates cleanly with AbortSignal lifecycle.
 */
export function attachChartPointerInteraction(chart, canvas, activeFormats, hoverTarget, signal) {
	const clearState = () => {
		hoverTarget.clear();
		if (chart) {
			chart.setActiveElements([]);
			if (chart.tooltip) {
				chart.tooltip.setActiveElements([], { x: 0, y: 0 });
			}
			chart.update("none");
		}
	};

	canvas.addEventListener("pointerleave", clearState, { signal });
	canvas.addEventListener("pointercancel", clearState, { signal });
	canvas.addEventListener("mouseout", clearState, { signal });

	canvas.addEventListener(
		"pointermove",
		(e) => {
			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			if (!chart.isPointInArea({ x, y })) {
				clearState();
				return;
			}

			const hit = findBarElement(chart, x, y);
			if (hit) {
				const dataset = chart.data.datasets[hit.datasetIndex];
				const format = activeFormats[hit.index];
				if (dataset && format) {
					const measureKey = `${dataset._engineKey}|${format}`;
					hoverTarget.set({ kind: "measure", key: measureKey });
					const activeElements = [{ datasetIndex: hit.datasetIndex, index: hit.index }];
					chart.setActiveElements(activeElements);
					if (chart.tooltip) {
						chart.tooltip.setActiveElements(activeElements, { x, y });
					}
					chart.update("none");
				} else {
					clearState();
				}
			} else {
				clearState();
			}
		},
		{ signal, passive: true },
	);

	window.addEventListener("scroll", clearState, { signal, passive: true });
}
