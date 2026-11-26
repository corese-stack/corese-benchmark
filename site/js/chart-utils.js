/**
 * Corese Benchmark Dashboard - Chart.js Utilities & Interaction Helpers
 * Provides reusable canvas pointer handling, color alpha blending,
 * and Chart.js DOM lifecycle coordination.
 */

import { focusStore, engineKeyOf, matchesEngine } from "./focus-store.js";

const HEX6_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX3_REGEX = /^#[0-9a-fA-F]{3}$/;
const RGB_REGEX = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const RGBA_REGEX = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,[^)]+\)$/i;

/**
 * Reads standard CSS theme colors (text-muted, border, bg) for Chart.js rendering.
 */
export function getChartThemeTokens() {
	if (typeof document === "undefined") {
		return { text: "#64748b", grid: "rgba(0, 0, 0, 0.06)", bg: "#ffffff" };
	}
	const css = getComputedStyle(document.documentElement);
	const text = (css.getPropertyValue("--text-muted") || "#64748b").trim();
	const border = (css.getPropertyValue("--border") || "#d8dce2").trim();
	const bg = (css.getPropertyValue("--bg") || "#ffffff").trim();
	const grid = colorWithAlpha(border, 0.5);
	return { text, border, bg, grid };
}

/**
 * Resets Chart.js active hover elements, tooltips, and associated hoverSource.
 */
export function clearChartInteraction(chart, hoverSource = null) {
	if (hoverSource) {
		hoverSource.clear();
	}
	if (chart) {
		chart.setActiveElements([]);
		if (chart.tooltip) {
			chart.tooltip.setActiveElements([], { x: 0, y: 0 });
		}
		chart.update("none");
	}
}

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
			if (chart.data.datasets[d].data[i] == null) continue;
			if (el?.inRange(x, y)) {
				return { datasetIndex: d, index: i, element: el };
			}
		}
	}
	return findStatusBadge(chart, x, y);
}

/**
 * Attaches pointer interactions (pointermove, pointerleave, scroll) on a Chart.js canvas
 * and binds hover focus target updates cleanly with AbortSignal lifecycle.
 *
 * @param {object} chart - Chart.js instance
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {object} hoverTarget - hoverSource instance (with .set() and .clear())
 * @param {AbortSignal} signal - AbortSignal for event cleanup
 * @param {Function} [resolveTarget] - Optional callback (dataset, index) => { kind, key } or null
 */
export function attachChartPointerInteraction(chart, canvas, hoverTarget, signal, resolveTarget = null) {
	const clearState = () => clearChartInteraction(chart, hoverTarget);

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
				let target = null;
				if (resolveTarget) {
					target = resolveTarget(dataset, hit.index);
				} else if (dataset?._engineKey) {
					target = { kind: "engine", key: dataset._engineKey };
				}

				if (target) {
					hoverTarget.set(target);
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

	canvas.addEventListener(
		"click",
		(e) => {
			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const hit = findStatusBadge(chart, x, y);
			if (hit) {
				e._statusBadgeHandled = true;
				chart.options.onClick?.(e, [hit], chart);
			}
		},
		{ signal },
	);

	window.addEventListener("scroll", clearState, { signal, passive: true });
}

/**
 * Builds standard Chart.js legend configuration with interactive circular color badges,
 * focus dimming, and bidirectional pointer hover/pin interactions.
 */
export function createEngineLegendConfig({ onEngineHover, onEngineLeave, onEngineTogglePin, focusStore, textColor }) {
	return {
		position: "top",
		onHover: (e, legendItem, legend) => {
			const chart = legend.chart;
			const dataset = chart.data.datasets[legendItem.datasetIndex];
			if (dataset?._engineKey && onEngineHover) {
				onEngineHover(dataset._engineKey);
			}
		},
		onLeave: () => {
			if (onEngineLeave) onEngineLeave();
		},
		onClick: (e, legendItem, legend) => {
			const chart = legend.chart;
			const dataset = chart.data.datasets[legendItem.datasetIndex];
			if (dataset?._engineKey && onEngineTogglePin) {
				onEngineTogglePin(dataset._engineKey);
			}
		},
		labels: {
			font: { family: "Inter, sans-serif", size: 12, weight: 500 },
			usePointStyle: true,
			pointStyle: "circle",
			boxWidth: 8,
			boxHeight: 8,
			padding: 16,
			generateLabels: (c) => {
				const defaultGen = window.Chart.defaults.plugins.legend.labels.generateLabels;
				const items = defaultGen(c);
				const focus = focusStore.effectiveFocus;

				return items.map((item) => {
					const ds = c.data.datasets[item.datasetIndex];
					if (!ds) return item;
					const baseColor = ds._baseColor || "#888";

					let isMatch = true;
					if (focus && engineKeyOf(focus.target)) {
						isMatch = matchesEngine(focus.target, ds._engineKey);
					}

					const fill = isMatch ? baseColor : colorWithAlpha(baseColor, 0.22);
					item.fillStyle = fill;
					item.strokeStyle = fill;
					item.pointStyle = "circle";
					return item;
				});
			},
			color: (ctx) => {
				const focus = focusStore.effectiveFocus;
				const dsIndex = ctx.datasetIndex;
				const ds = ctx.chart.data.datasets[dsIndex];
				if (!ds || !focus || !engineKeyOf(focus.target)) return textColor;

				return matchesEngine(focus.target, ds._engineKey) ? textColor : "rgba(128, 128, 128, 0.4)";
			},
		},
	};
}


export function normalizeRunStatus(status) {
	const value = String(status ?? "MISSING").trim().toUpperCase().replace(/[\s-]+/g, "_");
	return ({ OUT_OF_MEMORY: "OOM", OUTOFMEMORY: "OOM", TIMED_OUT: "TIMEOUT", NOT_TESTED: "MISSING", NOT_RUN: "MISSING" })[value] || value || "MISSING";
}

export function formatStatusBadgeLabel(status) {
	const value = normalizeRunStatus(status);
	const symbol = ({ OOM: "⚠", TIMEOUT: "◷", ERROR: "×", MISMATCH: "≠", DUPLICATE: "⊘", MISSING: "—", PASS: "✓", SUCCESS: "✓" })[value] || "—";
	return `${symbol} ${value}`;
}

export function getStatusBadgePalette(status) {
	const value = normalizeRunStatus(status);
	let group = "muted";
	if (["OOM", "ERROR", "MISMATCH", "DUPLICATE"].includes(value)) group = "fail";
	else if (value === "TIMEOUT") group = "timeout";
	else if (["PASS", "SUCCESS"].includes(value)) group = "pass";
	const fallback = { fail: ["#fff1f3", "#9f1239", "#be4563"], timeout: ["#fff7df", "#854d0e", "#a87820"], muted: ["#f1f5f9", "#334155", "#718096"], pass: ["#e4f0e7", "#1a7f37", "#5c9169"] }[group];
	const css = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
	return Object.fromEntries(["bg", "text", "border"].map((part, i) => [part, css?.getPropertyValue(group === "pass" ? `--tag-active-${part}` : `--status-${group}-${part}`).trim() || fallback[i]]));
}

function badgePath(ctx, w, h) {
	ctx.beginPath();
	if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
	else {
		const r = h / 2;
		ctx.moveTo(-w / 2 + r, -r);
		ctx.arc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
		ctx.arc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
		ctx.closePath();
	}
}

/** Null observations remain null. Only their element's tooltip anchor is positioned. */
export function createStatusBadgePlugin() {
	return {
		id: "statusBadges",
		afterDatasetsDraw(chart) {
			chart._statusBadgeHitBoxes = [];
			const { ctx, chartArea: area } = chart;
			if (!area) return;
			const horizontal = chart.options.indexAxis === "y";
			chart.data.datasets.forEach((dataset, datasetIndex) => {
				if (!chart.isDatasetVisible(datasetIndex)) return;
				const meta = chart.getDatasetMeta(datasetIndex);
				dataset.data.forEach((value, index) => {
					const info = dataset._statuses?.[index];
					if (value != null || !info) return;
					const element = meta.data[index];
					if (!element) return;
					ctx.save();
					ctx.font = "700 11px Inter, sans-serif";
					const label = info.shortLabel || formatStatusBadgeLabel(info.status);
					const slot = horizontal ? element.height : element.width;
					const h = Math.min(22, Math.max(1, (slot || 26) - 2));
					const naturalWidth = ctx.measureText(label).width + 16;
					const rotated = !horizontal && (slot || 0) < naturalWidth + 4;
					const w = Math.max(1, Math.min(naturalWidth, rotated ? area.bottom - area.top - 12 : area.right - area.left - 16));
					ctx.font = `700 ${Math.min(11, Math.max(1, h - 4))}px Inter, sans-serif`;
					const bw = rotated ? h : w, bh = rotated ? w : h;
					let x = horizontal ? chart.scales.x.left + 8 + bw / 2 : element.x;
					let y = horizontal ? element.y : chart.scales.y.bottom - 6 - bh / 2;
					if (!Number.isFinite(x)) x = chart.scales.x.getPixelForValue(index);
					if (!Number.isFinite(y)) y = chart.scales.y.getPixelForValue(index);
					x = Math.max(area.left + bw / 2, Math.min(area.right - bw / 2, x));
					y = Math.max(area.top + bh / 2, Math.min(area.bottom - bh / 2, y));
					const focus = focusStore.effectiveFocus?.target;
					const engine = info.engineKey || dataset._engineKey;
					const presentation = info.presentation?.(focus);
					ctx.globalAlpha = presentation === "unrelated" || (!presentation && engineKeyOf(focus) && !matchesEngine(focus, engine)) ? 0.22 : 1;
					const palette = getStatusBadgePalette(info.status);
					ctx.translate(x, y);
					if (rotated) ctx.rotate(-Math.PI / 2);
					badgePath(ctx, w, h);
					ctx.fillStyle = palette.bg; ctx.fill();
					ctx.strokeStyle = palette.border; ctx.lineWidth = 1; ctx.stroke();
					ctx.fillStyle = palette.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
					ctx.fillText(label, 0, 0, w - 10);
					ctx.restore();
					// Chart.js v4 tooltip positioners require hasValue() and tooltipPosition().
					// Null bars may have NaN coordinates; supply a real badge anchor, never a value.
					element.x = x; element.y = y;
					element.tooltipPosition = () => ({ x, y });
					chart._statusBadgeHitBoxes.push({ x: x - bw / 2, y: y - bh / 2, w: bw, h: bh, datasetIndex, index, statusInfo: info });
				});
			});
		},
		afterEvent(chart, args) {
			const event = args.event;
			if (!["mousemove", "touchmove", "touchstart"].includes(event.type)) return;
			const hit = findStatusBadge(chart, event.x, event.y);
			if (!hit) return;
			const active = [{ datasetIndex: hit.datasetIndex, index: hit.index }];
			chart.setActiveElements(active);
			chart.tooltip?.setActiveElements(active, { x: event.x, y: event.y });
			args.changed = true;
		},
		beforeEvent(chart, args) {
			const event = args.event;
			const hit = findStatusBadge(chart, event.x, event.y);
			if (hit && event.type === "click") {
				if (event.native?._statusBadgeHandled) {
					return false;
				}
				chart.options.onClick?.(event, [hit], chart);
				return false;
			}
		},
	};
}

function findStatusBadge(chart, x, y) {
	return chart._statusBadgeHitBoxes?.find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) || null;
}
