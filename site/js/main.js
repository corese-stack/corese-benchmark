/**
 * Corese Benchmark Dashboard - Main Orchestrator
 */

import { loadBenchmarkReport } from './api.js?v=36';
import { engineManager } from './engines.js?v=36';
import { parseUrlEngines, updateUrlEngines } from './router.js?v=36';

class DashboardApp {
  #abortController = null;
  data = null;
  mainContainer = null;
  unsubscribeEngines = null;

  constructor() {
    this.mainContainer = document.getElementById('dashboard-main');
  }

  destroy() {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
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
      this.data = await loadBenchmarkReport('data/benchmark-report.json?v=30', { signal });
      if (signal.aborted) return;

      // 1. Parse initial engines from URL search parameters (shareable links)
      const urlEngines = parseUrlEngines(
        window.location.search,
        this.data.enginesCatalog
      );

      // 2. Initialize Engines Manager with custom URL engines or defaults
      engineManager.init(
        {
          addBtn: document.getElementById('btn-add-engine'),
          popover: document.getElementById('miller-popover'),
          backBtn: document.getElementById('btn-miller-back'),
          confirmBtn: document.getElementById('btn-confirm-engine'),
          chipsContainer: document.getElementById('active-engines-chips'),
          scroller: document.getElementById('engines-scroller')
        },
        this.data.enginesCatalog,
        urlEngines
      );

      // 3. Keep URL query params synchronized when active engines change (replaceState)
      this.unsubscribeEngines = engineManager.onChange(() => {
        updateUrlEngines(engineManager.getSelectedEngines(), false);
      });

      // 4. Handle browser back / forward navigation
      window.addEventListener('popstate', () => {
        if (!this.data) return;
        const freshEngines = parseUrlEngines(
          window.location.search,
          this.data.enginesCatalog
        );
        engineManager.setActiveEngines(freshEngines);
      }, { signal });

      // Initial URL sync
      updateUrlEngines(engineManager.getSelectedEngines(), false);
    } catch (err) {
      if (signal.aborted) return;
      console.error('Failed to initialize dashboard:', err);
      if (this.mainContainer) {
        this.mainContainer.replaceChildren();
        const errEl = document.createElement('div');
        errEl.className = 'chart-empty';
        errEl.style.padding = '48px';
        errEl.style.color = 'var(--text-danger, #cf222e)';
        errEl.textContent = `Failed to load benchmark data: ${err.message}`;
        this.mainContainer.appendChild(errEl);
      }
    }
  }
}

// Bootstrap dashboard
const app = new DashboardApp();
void app.init();
