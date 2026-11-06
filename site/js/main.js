/**
 * Corese Benchmark Dashboard - Main Orchestrator
 */

import { loadBenchmarkReport } from "./api.js";
import { engineManager } from "./engines.js";
import {
	getCurrentView,
	navigateToView,
	parseUrlEngines,
	updateUrlEngines,
} from "./router.js";

class DashboardApp {
	#abortController = null;
	#indicatorRaf = null;
	#resizeObserver = null;
	data = null;
	mainContainer =
		typeof document !== "undefined"
			? document.getElementById("dashboard-main")
			: null;
	panelContainer =
		typeof document !== "undefined"
			? document.getElementById("benchmark-panel")
			: null;
	tablistEl =
		typeof document !== "undefined"
			? document.getElementById("benchmark-tabs")
			: null;
	unsubscribeEngines = null;
	currentView = "overview";

	destroy() {
		if (this.#abortController) {
			this.#abortController.abort();
			this.#abortController = null;
		}
		if (this.#indicatorRaf) {
			cancelAnimationFrame(this.#indicatorRaf);
			this.#indicatorRaf = null;
		}
		if (this.#resizeObserver) {
			this.#resizeObserver.disconnect();
			this.#resizeObserver = null;
		}
		if (this.unsubscribeEngines) {
			this.unsubscribeEngines();
			this.unsubscribeEngines = null;
		}
		engineManager.destroy();
	}

	async init() {
		this.destroy();
		this.#abortController = new AbortController();
		const { signal } = this.#abortController;

		try {
			this.data = await loadBenchmarkReport("data/benchmark-report.json?v=42", {
				signal,
			});
			if (signal.aborted) return;

			// 1. Parse initial engines from URL search parameters (shareable links)
			const urlEngines = parseUrlEngines(
				window.location.search,
				this.data.enginesCatalog,
			);

			// 2. Initialize Engines Manager with custom URL engines or defaults
			engineManager.init(
				{
					addBtn: document.getElementById("btn-add-engine"),
					popover: document.getElementById("miller-popover"),
					backBtn: document.getElementById("btn-miller-back"),
					confirmBtn: document.getElementById("btn-confirm-engine"),
					chipsContainer: document.getElementById("active-engines-chips"),
					scroller: document.getElementById("engines-scroller"),
				},
				this.data.enginesCatalog,
				urlEngines,
			);

			// 3. Keep URL query params synchronized when active engines change and re-render active page
			this.unsubscribeEngines = engineManager.onChange(() => {
				updateUrlEngines(engineManager.getSelectedEngines(), false);
				this.renderActivePage();
			});

			// 4. Setup Benchmark Tabs Keyboard Navigation & Routing
			this.setupTabs(signal);

			// 5. Handle browser back / forward navigation
			window.addEventListener(
				"popstate",
				() => {
					if (!this.data) return;
					const freshEngines = parseUrlEngines(
						window.location.search,
						this.data.enginesCatalog,
					);
					engineManager.setActiveEngines(freshEngines);
					this.updateViewFromUrl();
				},
				{ signal },
			);

			window.addEventListener(
				"hashchange",
				() => {
					this.updateViewFromUrl();
				},
				{ signal },
			);

			// Initial URL sync and render
			updateUrlEngines(engineManager.getSelectedEngines(), false);
			this.updateViewFromUrl();
		} catch (err) {
			if (signal.aborted) return;
			console.error("Failed to initialize dashboard:", err);
			if (this.mainContainer) {
				this.mainContainer.replaceChildren();
				const errEl = document.createElement("div");
				errEl.className = "chart-empty";
				errEl.style.padding = "48px";
				errEl.style.color = "var(--text-danger, #cf222e)";
				errEl.textContent = `Failed to load benchmark data: ${err.message}`;
				this.mainContainer.appendChild(errEl);
			}
		}
	}

	setupTabs(signal) {
		if (!this.tablistEl) return;

		this.tablistEl.addEventListener(
			"click",
			(e) => {
				const tab = e.target.closest('[role="tab"]');
				if (!tab) return;
				const targetView = tab.dataset.view;
				if (targetView) {
					navigateToView(targetView);
					this.updateViewFromUrl();
				}
			},
			{ signal },
		);

		// WAI-ARIA Tabs keyboard navigation
		this.tablistEl.addEventListener(
			"keydown",
			(e) => {
				const tabs = Array.from(
					this.tablistEl.querySelectorAll('[role="tab"]'),
				);
				const currentIndex = tabs.indexOf(document.activeElement);
				if (currentIndex === -1) return;

				let nextIndex = -1;
				if (e.key === "ArrowRight") {
					nextIndex = (currentIndex + 1) % tabs.length;
				} else if (e.key === "ArrowLeft") {
					nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
				} else if (e.key === "Home") {
					nextIndex = 0;
				} else if (e.key === "End") {
					nextIndex = tabs.length - 1;
				}

				if (nextIndex !== -1) {
					e.preventDefault();
					const targetTab = tabs[nextIndex];
					targetTab.focus();
					const targetView = targetTab.dataset.view;
					if (targetView) {
						navigateToView(targetView);
						this.updateViewFromUrl();
					}
				}
			},
			{ signal },
		);

		// Setup ResizeObserver for responsive sliding indicator without animation glitch
		if (typeof ResizeObserver !== "undefined") {
			this.#resizeObserver = new ResizeObserver(() => {
				this.updateIndicator({ immediate: true });
			});
			this.#resizeObserver.observe(this.tablistEl);
			this.tablistEl.querySelectorAll('[role="tab"]').forEach((t) => {
				this.#resizeObserver.observe(t);
			});
		}

		// Recalculate indicator position when web fonts finish loading
		if (typeof document !== "undefined" && "fonts" in document) {
			void document.fonts.ready
				.then(() => {
					if (!signal.aborted) {
						this.updateIndicator({ immediate: true });
					}
				})
				.catch(() => {});
		}
	}

	updateIndicator({ immediate = false } = {}) {
		if (!this.tablistEl) return;
		if (this.#indicatorRaf) {
			cancelAnimationFrame(this.#indicatorRaf);
		}
		this.#indicatorRaf = requestAnimationFrame(() => {
			this.#indicatorRaf = null;
			if (!this.tablistEl) return;
			const activeTab = this.tablistEl.querySelector(
				'.benchmark-tab[aria-selected="true"]',
			);
			if (!activeTab) return;

			if (immediate) {
				this.tablistEl.classList.add("is-resizing");
			}
			const x = activeTab.offsetLeft;
			const w = activeTab.offsetWidth;
			this.tablistEl.style.setProperty("--tab-x", `${x}px`);
			this.tablistEl.style.setProperty("--tab-w", `${w}px`);
			this.tablistEl.classList.add("is-ready");

			if (immediate) {
				requestAnimationFrame(() => {
					this.tablistEl?.classList.remove("is-resizing");
				});
			}
		});
	}

	updateViewFromUrl() {
		const view = getCurrentView();
		this.currentView = view;

		// Update Tab UI states
		if (this.tablistEl) {
			const tabs = this.tablistEl.querySelectorAll('[role="tab"]');
			tabs.forEach((tab) => {
				const isActive = tab.dataset.view === view;
				tab.setAttribute("aria-selected", String(isActive));
				tab.setAttribute("tabindex", isActive ? "0" : "-1");
				tab.classList.toggle("is-active", isActive);
			});
			this.updateIndicator({
				immediate: !this.tablistEl.classList.contains("is-ready"),
			});
		}

		if (this.panelContainer) {
			this.panelContainer.setAttribute("aria-labelledby", `tab-${view}`);
		}

		this.renderActivePage();
	}

	renderActivePage() {
		if (!this.panelContainer) return;
		this.panelContainer.replaceChildren();
	}
}

// Bootstrap dashboard
const app = new DashboardApp();
await app.init();
