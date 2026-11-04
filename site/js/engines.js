/**
 * Benchmark Engines Selector (Miller Columns 3-step selector)
 * Driven 100% dynamically by REAL benchmark data from api.js.
 * ZERO MOCK: Every engine, version, and storage backend exists in the report JSON.
 */

import { formatEngineId, isBranchVersion, escapeHtml, sanitizeColor } from './engine-id.js?v=30';

export const SETTLE_TRANSITION_MS = 180;
export const SETTLE_SAFETY_MS = 40;
export const AUTO_SCROLL_EDGE_PX = 40;
export const AUTO_SCROLL_MAX_SPEED = 12;

// Official engines supported in corese-benchmark with their WCAG AA compliant palettes
const OFFICIAL_ENGINE_FAMILIES_LIGHT = {
  corese: {
    base: '#0072b2',      // Primary Blue (hue ~210°, contrast 5.19:1 on white)
    dev: '#00b4d8',       // Vivid Cyan
    ramp: ['#0072b2', '#004e82', '#3a86c8', '#1a365d']
  },
  jena: {
    base: '#d55e00',      // Vermillion (hue ~25°, contrast 3.87:1)
    dev: '#ff7b00',       // Bright Orange
    ramp: ['#d55e00', '#9e3d00', '#f77f00', '#6b2600']
  },
  rdf4j: {
    base: '#009e73',      // Teal / Bluish Green (hue ~165°, contrast 3.42:1)
    dev: '#06d6a0',       // Emerald
    ramp: ['#009e73', '#00664b', '#2ec4b6', '#004733']
  }
};

const OFFICIAL_ENGINE_FAMILIES_DARK = {
  corese: {
    base: '#388bfd',      // Accessible light blue (contrast 4.84:1 on dark)
    dev: '#79c0ff',       // Electric Cyan
    ramp: ['#388bfd', '#79c0ff', '#1f6feb', '#a5d6ff']
  },
  jena: {
    base: '#f0883e',      // Accessible amber/vermillion (contrast 6.39:1 on dark)
    dev: '#ff9e58',       // Bright coral
    ramp: ['#f0883e', '#ffb074', '#bd5a17', '#ffd8a8']
  },
  rdf4j: {
    base: '#3fb950',      // Accessible bright green (contrast 6.37:1 on dark)
    dev: '#56d364',       // Vivid emerald
    ramp: ['#3fb950', '#7ee787', '#238636', '#aff5b4']
  }
};

function isDarkThemeActive() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.theme === 'dark';
}

function getOfficialFamilies() {
  return isDarkThemeActive() ? OFFICIAL_ENGINE_FAMILIES_DARK : OFFICIAL_ENGINE_FAMILIES_LIGHT;
}

/**
 * Intelligent deterministic hue generator for ANY new engine added in the future.
 * Spaces new engines far apart using candidate slots while dodging existing engines.
 */
function generateDistinctFamily(engineId, customColor = null) {
  const safeCustom = sanitizeColor(customColor, null);
  if (safeCustom) {
    return {
      base: safeCustom,
      dev: safeCustom,
      ramp: [safeCustom, safeCustom, safeCustom, safeCustom]
    };
  }

  let hash = 0;
  for (let i = 0; i < engineId.length; i++) {
    hash = Math.trunc((hash << 5) - hash + engineId.codePointAt(i));
  }
  const seed = Math.abs(hash);

  const candidateSlots = [275, 55, 320, 90, 245, 345, 115];
  const chosenHue = candidateSlots[seed % candidateSlots.length];

  const base = `hsl(${chosenHue}, 75%, 45%)`;
  const dev = `hsl(${(chosenHue + 15) % 360}, 90%, 55%)`;
  const ramp = [
    `hsl(${chosenHue}, 75%, 45%)`,
    `hsl(${chosenHue}, 85%, 32%)`,
    `hsl(${chosenHue}, 65%, 60%)`,
    `hsl(${chosenHue}, 90%, 25%)`
  ];

  return { base, dev, ramp };
}

/**
 * Computes deterministic version rank among stable releases in the catalog.
 * Rank 0 = latest release, 1 = previous release, 2+ = legacy releases.
 */
function getVersionRank(versionId, engineEntry) {
  if (!engineEntry || !engineEntry.versions) return 0;
  const versionsList = Array.isArray(engineEntry.versions)
    ? engineEntry.versions
    : Array.from(engineEntry.versions.values());

  const stableReleases = versionsList
    .filter((v) => !isBranchVersion(v.id || v))
    .map((v) => (typeof v === 'string' ? v : v.id))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  const rank = stableReleases.indexOf(versionId);
  return rank >= 0 ? rank : 0;
}

/**
 * Computes the unique visual style (color, glyph, storage pattern) for an engine configuration.
 * Orthogonal visual encoding:
 * - Engine family: distinct hue
 * - Version: distinct glyph (diamond dev, circle latest, square previous, triangle legacy) + ramp color tier
 * - Storage: marker fill (solid in-memory, ring disk)
 */
export function getEngineStyle(target, catalog = []) {
  const engineId = (target.engineId || '').toLowerCase();
  const versionId = target.versionId || 'latest';
  const storageId = (target.storageId || 'in-memory').toLowerCase();

  const engEntry = catalog.find((e) => e.id === engineId);
  const customColor = engEntry?.color || null;

  const official = getOfficialFamilies();
  const family = Object.hasOwn(official, engineId)
    ? official[engineId]
    : generateDistinctFamily(engineId, customColor);

  const isDev = isBranchVersion(versionId);
  const isDisk = storageId !== 'in-memory';

  let color;
  let glyph;

  if (isDev) {
    color = sanitizeColor(family.dev, '#00b4d8');
    glyph = 'diamond';
  } else {
    const rank = getVersionRank(versionId, engEntry);
    const ramp = family.ramp || [family.base];
    const rampColor = ramp[Math.min(rank, ramp.length - 1)] || family.base;
    color = sanitizeColor(rampColor, family.base || '#0072b2');

    if (rank === 0) {
      glyph = 'circle';
    } else if (rank === 1) {
      glyph = 'square';
    } else {
      glyph = 'triangle';
    }
  }

  const storagePattern = isDisk ? 'ring' : 'solid';

  return {
    color,
    glyph,
    storagePattern,
    isDisk,
    isDev
  };
}

/**
 * Renders a crisp SVG indicator:
 * - Dev: diamond ◆
 * - Latest release: circle ●
 * - Previous release: square ■
 * - Older legacy: triangle ▲
 * Disk storages render with an accessible ring (outline) rather than solid fill.
 */
export function renderEngineIndicatorSvg(style) {
  const safeColor = sanitizeColor(style.color, '#0072b2');
  const isDisk = style.isDisk || style.storagePattern === 'ring';
  const fillAttr = isDisk ? 'none' : safeColor;
  const strokeAttr = isDisk ? `stroke="${safeColor}" stroke-width="1.75"` : '';

  if (style.glyph === 'diamond' || style.isDev) {
    return `<svg class="engine-glyph" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,1 9,5 5,9 1,5" fill="${fillAttr}" ${strokeAttr} /></svg>`;
  }
  if (style.glyph === 'square') {
    return `<svg class="engine-glyph" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="${fillAttr}" ${strokeAttr} /></svg>`;
  }
  if (style.glyph === 'triangle') {
    return `<svg class="engine-glyph" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,1.5 9,8.5 1,8.5" fill="${fillAttr}" ${strokeAttr} /></svg>`;
  }
  return `<svg class="engine-glyph" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="${isDisk ? '3.5' : '4.25'}" fill="${fillAttr}" ${strokeAttr} /></svg>`;
}

export class EngineManager extends EventTarget {
  #abortController = null;
  #pendingDrag = null;
  #activeDrag = null;
  #settlingDrag = null;
  #isSettling = false;
  #pendingCommit = null;
  #isRenderingColumns = false;
  #pendingRafs = new Set();
  #autoScrollRaf = null;
  #resizeObserver = null;
  #highlightTimeout = null;
  #middleClickArmedKey = null;
  #activeGhosts = new Set();
  #ghostTimeouts = new Set();

  constructor() {
    super();
    this.catalog = [];
    this.activeEngines = [];
    this.draftEngine = null;
    this.draftVersion = null;
    this.draftStorage = null;
    this.isPickerOpen = false;
    this.settleDurationMs = 180;
  }

  #parseDurationMs(raw) {
    if (/^\d+(?:\.\d+)?\s*s$/i.test(raw)) {
      return Number.parseFloat(raw) * 1000;
    }
    if (/^\d+(?:\.\d+)?\s*ms$/i.test(raw) || /^\d+(?:\.\d+)?$/.test(raw)) {
      return Number.parseFloat(raw);
    }
    return null;
  }

  init(domElements, catalog, initialEngines = null) {
    this.destroy(); // Idempotent setup
    this.#abortController = new AbortController();
    this.settleDurationMs = 180; // Reset to default

    // Dynamically synchronize settle transition timing with CSS custom property
    if (typeof window !== 'undefined' && typeof getComputedStyle === 'function') {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--chip-settle-duration').trim();
      const parsed = this.#parseDurationMs(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        this.settleDurationMs = parsed;
      }
    }

    this.el = {
      ...domElements,
      scroller: domElements?.scroller ||
        domElements?.chipsContainer?.closest('.engines-bar__scroller') ||
        (typeof document !== 'undefined' ? document.getElementById('engines-scroller') : null)
    };
    this.setCatalog(catalog, initialEngines);
    this.bindEvents(this.#abortController.signal);
    this.render();
  }

  destroy() {
    this.closePicker(false);
    this.clearHighlight();
    this.#stopAutoScroll();
    this.#middleClickArmedKey = null;

    this.#ghostTimeouts.forEach((id) => clearTimeout(id));
    this.#ghostTimeouts.clear();
    this.#activeGhosts.forEach((ghost) => ghost.remove());
    this.#activeGhosts.clear();

    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    this.#pendingRafs.forEach((id) => cancelAnimationFrame(id));
    this.#pendingRafs.clear();
    this.cancelPendingDrag();
  }

  getChipElements() {
    return Array.from(this.el?.chipsContainer?.querySelectorAll('.engine-chip:not(.engine-chip--ghost)') || []);
  }

  updateFadeMask() {
    const scroller = this.el?.scroller;
    if (!scroller) return;
    const { scrollLeft, scrollWidth, clientWidth } = scroller;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    const canScrollLeft = scrollLeft > 2;
    const canScrollRight = maxScroll - scrollLeft > 2;

    scroller.style.setProperty('--fade-left', canScrollLeft ? '24px' : '0px');
    scroller.style.setProperty('--fade-right', canScrollRight ? '24px' : '0px');
  }

  setHighlight(key, immediate = false) {
    if (this.#highlightTimeout) {
      clearTimeout(this.#highlightTimeout);
      this.#highlightTimeout = null;
    }

    const apply = () => {
      if (typeof document === 'undefined') return;
      if (key) {
        document.documentElement.dataset.highlightedEngine = key;
        const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key;
        document.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
        document.querySelectorAll(`[data-key="${escaped}"], [data-engine-key="${escaped}"]`).forEach((el) => {
          el.classList.add('is-highlighted');
        });
      } else {
        delete document.documentElement.dataset.highlightedEngine;
        document.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
      }
    };

    if (immediate) {
      apply();
    } else {
      const delay = key ? 50 : 60;
      this.#highlightTimeout = setTimeout(apply, delay);
    }
  }

  clearHighlight(immediate = true) {
    this.setHighlight(null, immediate);
  }

  #updateDragPosition(clientX) {
    const drag = this.#activeDrag;
    if (!drag) return;
    drag.currentClientX = clientX;

    const scroller = this.el?.scroller;
    const currentScrollLeft = scroller ? scroller.scrollLeft : drag.startScrollLeft;
    const scrollDelta = currentScrollLeft - drag.startScrollLeft;
    const rawDelta = (clientX - drag.startX) + scrollDelta;

    drag.dx = Math.min(drag.maxDx, Math.max(drag.minDx, rawDelta));
    drag.chip.style.transform = `translateX(${drag.dx}px)`;

    // Identify target slot using variable-width edge crossing (guarantees wide chips can reach extreme slots)
    let to = drag.from;
    const myLeft = drag.slots[drag.from].left + drag.dx;
    const myRight = myLeft + drag.slots[drag.from].width;

    // Check rightward progression: right edge crossing destination slot center
    for (let i = drag.from + 1; i < drag.slots.length; i++) {
      if (myRight >= drag.slots[i].center) {
        to = i;
      } else {
        break;
      }
    }
    // Check leftward progression: left edge crossing destination slot center
    for (let i = drag.from - 1; i >= 0; i--) {
      if (myLeft <= drag.slots[i].center) {
        to = i;
      } else {
        break;
      }
    }
    drag.to = to;

    // Fluidly shift neighbour chips with cached mutation check
    drag.chipElements.forEach((c, i) => {
      if (i === drag.from) return;

      let shiftX = 0;
      const mySlotWidth = drag.slots[drag.from].width + drag.gap;

      if (drag.from < drag.to && i > drag.from && i <= drag.to) {
        shiftX = -mySlotWidth;
      } else if (drag.from > drag.to && i < drag.from && i >= drag.to) {
        shiftX = mySlotWidth;
      }

      const shiftKey = String(shiftX);
      if (c.dataset.shiftX !== shiftKey) {
        c.dataset.shiftX = shiftKey;
        c.style.transition = `transform ${SETTLE_TRANSITION_MS}ms cubic-bezier(.2, .8, .2, 1)`;
        c.style.transform = shiftX !== 0 ? `translateX(${shiftX}px)` : '';
      }
    });
  }

  #startAutoScroll(clientX) {
    const scroller = this.el?.scroller;
    if (!scroller || this.#autoScrollRaf) return;

    let lastTime = null;

    const step = (timestamp) => {
      if (!this.#activeDrag || !this.el?.scroller) {
        this.#stopAutoScroll();
        return;
      }

      const sRect = scroller.getBoundingClientRect();
      const leftZone = sRect.left + AUTO_SCROLL_EDGE_PX;
      const rightZone = sRect.right - AUTO_SCROLL_EDGE_PX;
      const px = this.#activeDrag.currentClientX ?? clientX;

      let speed = 0;
      if (px < leftZone) {
        const factor = Math.max(0, Math.min(1, (leftZone - px) / AUTO_SCROLL_EDGE_PX));
        speed = -Math.max(2, factor * AUTO_SCROLL_MAX_SPEED);
      } else if (px > rightZone) {
        const factor = Math.max(0, Math.min(1, (px - rightZone) / AUTO_SCROLL_EDGE_PX));
        speed = Math.max(2, factor * AUTO_SCROLL_MAX_SPEED);
      }

      if (speed === 0) {
        this.#stopAutoScroll();
        return;
      }

      const dt = lastTime ? Math.min(50, timestamp - lastTime) / 16.67 : 1;
      lastTime = timestamp;

      const prev = scroller.scrollLeft;
      scroller.scrollLeft += speed * dt;
      if (scroller.scrollLeft !== prev) {
        this.updateFadeMask();
        this.#updateDragPosition(this.#activeDrag.currentClientX);
      }

      this.#autoScrollRaf = requestAnimationFrame(step);
    };

    this.#autoScrollRaf = requestAnimationFrame(step);
  }

  #stopAutoScroll() {
    if (this.#autoScrollRaf) {
      cancelAnimationFrame(this.#autoScrollRaf);
      this.#autoScrollRaf = null;
    }
  }

  safeRaf(callback) {
    const id = requestAnimationFrame(() => {
      this.#pendingRafs.delete(id);
      callback();
    });
    this.#pendingRafs.add(id);
    return id;
  }

  onChange(callback) {
    if (typeof callback !== 'function') return () => {};
    const handler = (e) => callback(e.detail.engines);
    this.addEventListener('benchmark:engines-changed', handler);
    return () => {
      this.removeEventListener('benchmark:engines-changed', handler);
    };
  }

  setCatalog(catalog, initialEngines = null) {
    this.catalog = catalog || [];

    if (Array.isArray(initialEngines) && initialEngines.length > 0) {
      this.activeEngines = [...initialEngines];
    } else {
      // Default selection: Corese dev branch + latest stable of each engine
      this.activeEngines = [];
      const seen = new Set();

      this.catalog.forEach((eng) => {
        const defaultStorage = (eng.storages || []).find((s) => s.isDefault) ||
          eng.storages?.[0] ||
          { id: 'in-memory' };

        if (eng.id === 'corese') {
          const devBranch = eng.versions.find((v) => v.type === 'branch');
          if (devBranch) {
            const entry = {
              engineId: eng.id,
              versionId: devBranch.id,
              storageId: defaultStorage.id
            };
            seen.add(formatEngineId(entry));
            this.activeEngines.push(entry);
          }
        }
        const latest = eng.versions.find((v) => v.isLatest) || eng.versions[0];
        if (latest) {
          const entry = {
            engineId: eng.id,
            versionId: latest.id,
            storageId: defaultStorage.id
          };
          const key = formatEngineId(entry);
          if (!seen.has(key)) {
            seen.add(key);
            this.activeEngines.push(entry);
          }
        }
      });
    }

    if (this.catalog.length > 0) {
      this.draftEngine = this.catalog[0];
      this.draftVersion = this.draftEngine.versions[0] || null;
      this.draftStorage = (this.draftEngine.storages || []).find((s) => s.isDefault) ||
        this.draftEngine.storages?.[0] ||
        null;
    } else {
      this.draftEngine = null;
      this.draftVersion = null;
      this.draftStorage = null;
    }
  }

  setActiveEngines(enginesList) {
    if (Array.isArray(enginesList) && enginesList.length > 0) {
      this.activeEngines = [...enginesList];
    } else {
      this.setCatalog(this.catalog, null);
    }
    this.render();
  }

  getSelectedEngines() {
    return this.activeEngines.map((t) => {
      const eng = this.catalog.find((e) => e.id === t.engineId);
      const style = getEngineStyle(t, this.catalog);
      const isNext = isBranchVersion(t.versionId);
      const versionLabel = isNext ? `${t.versionId} (dev)` : t.versionId;
      const raw = formatEngineId(t);
      const engineName = eng?.shortName || eng?.name || t.engineId;
      const storageLabel = t.storageId === 'in-memory' ? 'MEM' : t.storageId.toUpperCase();

      const displayLabel = `${engineName} · ${versionLabel} · ${storageLabel}`;
      const shortLabel = `${engineName} ${versionLabel} ${storageLabel}`;

      return {
        ...t,
        raw,
        label: displayLabel,
        shortLabel,
        color: style.color,
        style
      };
    });
  }

  announce(message) {
    const announcer = document.getElementById('chips-announcer');
    if (announcer) {
      if (announcer.textContent === message) {
        announcer.textContent = '';
      }
      this.safeRaf(() => {
        announcer.textContent = message;
      });
    }
  }

  bindEvents(signal) {
    if (!this.el) return;

    // Open / Close Add Picker
    if (this.el.addBtn) {
      this.el.addBtn.addEventListener('click', () => {
        this.togglePicker();
      }, { signal });
    }

    // Step back in drill-down (mobile)
    if (this.el.backBtn) {
      this.el.backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentStep = Number.parseInt(this.el.popover?.dataset.step || '1', 10);
        this.setStep(Math.max(1, currentStep - 1));
      }, { signal });
    }

    // Close picker when clicking outside without stealing focus
    document.addEventListener('pointerdown', (e) => {
      if (!this.isPickerOpen) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (this.el.popover && path.includes(this.el.popover)) return;
      if (this.el.addBtn && path.includes(this.el.addBtn)) return;
      this.closePicker(false);
    }, { signal });

    // Focusout handling on popover to close when focus leaves completely
    if (this.el.popover) {
      this.el.popover.addEventListener('focusout', () => {
        if (!this.isPickerOpen || this.#isRenderingColumns) return;
        this.safeRaf(() => {
          if (!this.isPickerOpen || this.#isRenderingColumns) return;
          const activeEl = document.activeElement;
          if (
            this.el.popover &&
            !this.el.popover.contains(activeEl) &&
            this.el.addBtn !== activeEl
          ) {
            this.closePicker(false);
          }
        });
      }, { signal });

      // Keyboard navigation inside Miller columns & focus trap
      this.el.popover.addEventListener('keydown', (e) => {
        this.handlePopoverKeydown(e);
      }, { signal });
    }

    // Global Escape: on mobile, step back first before closing
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isPickerOpen) {
        const isMobile = Boolean(window?.matchMedia?.('(max-width: 560px)')?.matches);
        const currentStep = Number.parseInt(this.el.popover?.dataset.step || '1', 10);
        if (isMobile && currentStep > 1) {
          this.setStep(currentStep - 1);
        } else {
          this.closePicker(true);
        }
      }
    }, { signal });

    // Viewport resize synchronization between mobile drill-down and desktop Miller layout
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mobileMq = window.matchMedia('(max-width: 560px)');
      const handleMqChange = () => {
        if (this.isPickerOpen) {
          const step = Number.parseInt(this.el.popover?.dataset.step || '1', 10);
          this.setStep(step);
        }
      };
      mobileMq.addEventListener('change', handleMqChange, { signal });
    }

    // Theme changes: only refresh chip visuals without firing full re-query/URL events
    window.addEventListener('theme-changed', () => {
      this.renderChips();
      if (this.isPickerOpen) {
        const focusedItem = document.activeElement?.closest('.miller__item');
        const col = focusedItem?.closest('.miller__col');
        const colClass = col ? '.' + Array.from(col.classList).find((c) => c.startsWith('miller__col--')) : null;
        const focusTarget = (focusedItem && colClass)
          ? { colClass, id: focusedItem.dataset.id }
          : null;
        this.renderMillerColumns(focusTarget);
      }
    }, { signal });

    // Confirm button in picker
    if (this.el.confirmBtn) {
      this.el.confirmBtn.addEventListener('click', () => {
        this.confirmDraftEngine();
      }, { signal });
    }

    // Global window release to prevent any stuck #pendingDrag or uncaptured #activeDrag
    window.addEventListener('pointerup', (e) => {
      if (this.#pendingDrag && e.pointerId === this.#pendingDrag.pointerId) {
        this.#pendingDrag = null;
      }
      if (this.#activeDrag && e.pointerId === this.#activeDrag.pointerId) {
        this.terminateActiveDrag(e, false);
      }
    }, { signal });

    window.addEventListener('pointercancel', (e) => {
      if (this.#pendingDrag && e.pointerId === this.#pendingDrag.pointerId) {
        this.#pendingDrag = null;
      }
      if (this.#activeDrag && e.pointerId === this.#activeDrag.pointerId) {
        this.terminateActiveDrag(e, true);
      }
    }, { signal });

    // Scroller overflow & wheel navigation
    const scroller = this.el?.scroller;
    if (scroller) {
      scroller.addEventListener('scroll', () => {
        this.updateFadeMask();
        if (this.#activeDrag) {
          this.#updateDragPosition(this.#activeDrag.currentClientX);
        }
      }, { passive: true, signal });

      scroller.addEventListener('wheel', (e) => {
        if (e.deltaX === 0 && e.deltaY !== 0) {
          if (scroller.scrollWidth > scroller.clientWidth) {
            scroller.scrollLeft += e.deltaY * 0.8;
            e.preventDefault();
          }
        }
      }, { passive: false, signal });

      if (typeof ResizeObserver !== 'undefined') {
        this.#resizeObserver = new ResizeObserver(() => {
          this.updateFadeMask();
        });
        this.#resizeObserver.observe(scroller);
        if (this.el.chipsContainer) {
          this.#resizeObserver.observe(this.el.chipsContainer);
        }
      }
    }

    // Event Delegation on chipsContainer (replaces per-chip listener churn)
    if (this.el.chipsContainer) {
      this.bindChipsDelegation(signal);
    }
  }

  terminateActiveDrag(e, isCancel) {
    this.#stopAutoScroll();
    if (!this.#activeDrag || e.pointerId !== this.#activeDrag.pointerId) return;
    const d = this.#activeDrag;
    this.#activeDrag = null;

    try {
      d.chip.releasePointerCapture(d.pointerId);
    } catch (_) {}

    if (isCancel) {
      this.clearHighlight();
      this.#isSettling = false;
      this.#settlingDrag = null;
      d.chipElements?.forEach((el) => {
        delete el.dataset.shiftX;
        el.style.transform = '';
        el.style.transition = '';
        el.style.zIndex = '';
        el.classList.remove('is-dragging', 'is-settling');
      });
      return;
    }

    // Settling commit
    this.#isSettling = true;
    this.#settlingDrag = d;
    let targetDx = 0;
    if (d.to !== d.from) {
      if (d.to > d.from) {
        targetDx = d.slots[d.to].right - d.slots[d.from].right;
      } else {
        targetDx = d.slots[d.to].left - d.slots[d.from].left;
      }
    }

    const prefersReducedMotion = Boolean(window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    d.chip.classList.remove('is-dragging');
    d.chip.classList.add('is-settling');
    if (d.chip.offsetWidth) {
      d.chip.style.transition = `transform ${this.settleDurationMs}ms cubic-bezier(.2, .8, .2, 1)`;
      d.chip.style.transform = `translateX(${targetDx}px)`;
    }

    let committed = false;
    let safetyTimer = null;

    const onEnd = (ev) => {
      if (ev.target === d.chip && ev.propertyName === 'transform') {
        commit();
      }
    };

    const commit = () => {
      if (committed) return;
      committed = true;
      this.#isSettling = false;
      this.#settlingDrag = null;
      this.#pendingCommit = null;
      if (safetyTimer) clearTimeout(safetyTimer);
      d.chip.removeEventListener('transitionend', onEnd);

      if (this.el.chipsContainer) {
        this.el.chipsContainer.classList.add('no-anim');
      }

      const freshFrom = this.activeEngines.findIndex((eng) => formatEngineId(eng) === d.chipKey);
      if (freshFrom !== -1 && d.to !== freshFrom && d.to >= 0 && d.to < this.activeEngines.length) {
        const [moved] = this.activeEngines.splice(freshFrom, 1);
        this.activeEngines.splice(d.to, 0, moved);
        this.render();
        const movedEng = this.activeEngines[d.to];
        const engMeta = this.catalog.find((item) => item.id === movedEng.engineId);
        const engName = engMeta?.shortName || engMeta?.name || movedEng.engineId;
        this.announce(`${engName} moved to position ${d.to + 1} of ${this.activeEngines.length}`);

        this.safeRaf(() => {
          const freshChips = this.getChipElements();
          freshChips?.[d.to]?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        });
      } else {
        d.chipElements?.forEach((el) => {
          delete el.dataset.shiftX;
          el.style.transform = '';
          el.style.transition = '';
          el.style.zIndex = '';
          el.classList.remove('is-settling');
        });
        this.clearHighlight();
      }

      this.safeRaf(() => {
        if (this.el.chipsContainer) {
          this.el.chipsContainer.classList.remove('no-anim');
        }
      });
    };

    if (prefersReducedMotion || this.settleDurationMs <= 0) {
      commit();
      return;
    }

    this.#pendingCommit = () => {
      if (!committed) {
        committed = true;
        this.#isSettling = false;
        this.#settlingDrag = null;
        if (safetyTimer) clearTimeout(safetyTimer);
        d.chip.removeEventListener('transitionend', onEnd);
      }
    };

    d.chip.addEventListener('transitionend', onEnd);
    safetyTimer = setTimeout(commit, this.settleDurationMs + SETTLE_SAFETY_MS);
  }

  bindChipsDelegation(signal) {
    const container = this.el.chipsContainer;

    // 1. Pointerdown (Starts drag threshold tracking)
    container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Left mouse button only
      if (e.target.closest('.engine-chip__remove')) return;
      if (this.#activeDrag || this.#pendingDrag || this.#isSettling) return;

      const chip = e.target.closest('.engine-chip:not(.engine-chip--ghost)');
      if (!chip) return;

      const chipElements = this.getChipElements();
      const fromIdx = chipElements.indexOf(chip);
      if (fromIdx === -1) return;

      const scroller = this.el?.scroller;
      const startScrollLeft = scroller ? scroller.scrollLeft : 0;

      const slots = chipElements.map((el) => {
        const left = el.offsetLeft;
        const width = el.offsetWidth;
        return {
          left,
          right: left + width,
          width,
          center: left + width / 2
        };
      });

      const firstSlot = slots.at(0);
      const lastSlot = slots.at(-1);
      const mySlot = slots[fromIdx];

      let realGap = 8;
      if (slots.length > 1) {
        realGap = fromIdx < slots.length - 1
          ? slots[fromIdx + 1].left - slots[fromIdx].right
          : slots[fromIdx].left - slots[fromIdx - 1].right;
      }

      this.#pendingDrag = {
        pointerId: e.pointerId,
        chip,
        chipKey: chip.dataset.key,
        from: fromIdx,
        startX: e.clientX,
        startY: e.clientY,
        startScrollLeft,
        minDx: firstSlot.left - mySlot.left,
        maxDx: lastSlot.right - mySlot.right,
        gap: realGap,
        slots,
        chipElements
      };
    }, { signal });

    // 2. Pointermove (Enforces 4px drag threshold before taking over pointer capture)
    container.addEventListener('pointermove', (e) => {
      if (this.#pendingDrag && !this.#activeDrag && e.pointerId === this.#pendingDrag.pointerId) {
        const moveDist = Math.hypot(e.clientX - this.#pendingDrag.startX, e.clientY - this.#pendingDrag.startY);
        if (moveDist > 4) {
          // Upgrade to active drag
          this.#activeDrag = {
            ...this.#pendingDrag,
            to: this.#pendingDrag.from,
            dx: 0,
            currentClientX: e.clientX
          };
          this.#pendingDrag = null;

          const { chip, pointerId } = this.#activeDrag;
          this.setHighlight(this.#activeDrag.chipKey);
          chip.classList.add('is-dragging');
          chip.style.zIndex = '1000';
          chip.style.transition = 'none';

          try {
            chip.setPointerCapture(pointerId);
          } catch (_) {}
        }
      }

      const drag = this.#activeDrag;
      if (!drag || e.pointerId !== drag.pointerId) return;

      this.#updateDragPosition(e.clientX);

      // Check edge proximity for auto-scrolling
      const scroller = this.el?.scroller;
      if (scroller) {
        const sRect = scroller.getBoundingClientRect();
        const inLeftEdge = e.clientX < sRect.left + AUTO_SCROLL_EDGE_PX;
        const inRightEdge = e.clientX > sRect.right - AUTO_SCROLL_EDGE_PX;
        if (inLeftEdge || inRightEdge) {
          if (!this.#autoScrollRaf) {
            this.#startAutoScroll(e.clientX);
          }
        } else {
          this.#stopAutoScroll();
        }
      }
    }, { signal });

    // 3. Pointerup / Lostcapture / Pointercancel
    container.addEventListener('pointerup', (e) => {
      this.terminateActiveDrag(e, false);
    }, { signal });

    container.addEventListener('pointercancel', (e) => {
      this.terminateActiveDrag(e, true);
    }, { signal });

    container.addEventListener('lostpointercapture', (e) => {
      this.terminateActiveDrag(e, false);
    }, { signal });

    // 4. Keyboard interactions:
    // - Alt + ArrowLeft / Alt + ArrowRight: reorder
    // - Delete / Backspace: remove focused chip
    container.addEventListener('keydown', (e) => {
      const chip = e.target.closest('.engine-chip');
      if (!chip) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement === chip && !chip.classList.contains('is-removing')) {
          e.preventDefault();
          this.animateAndRemoveChip(chip);
        }
        return;
      }

      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;

      const chipElements = this.getChipElements();
      const currentIdx = chipElements.indexOf(chip);
      if (currentIdx === -1) return;

      const targetIdx = e.key === 'ArrowLeft' ? currentIdx - 1 : currentIdx + 1;
      if (targetIdx < 0 || targetIdx >= this.activeEngines.length) return;

      e.preventDefault();
      this.reorderEngines(currentIdx, targetIdx);

      // Restore focus to moved chip at new index
      this.safeRaf(() => {
        const newChips = this.getChipElements();
        if (newChips[targetIdx]) {
          newChips[targetIdx].focus();
          newChips[targetIdx].scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        }
        const movedEng = this.activeEngines[targetIdx];
        const engMeta = this.catalog.find((item) => item.id === movedEng.engineId);
        const engName = engMeta?.shortName || engMeta?.name || movedEng.engineId;
        this.announce(`${engName} moved to position ${targetIdx + 1} of ${this.activeEngines.length}`);
      });
    }, { signal });

    // 5. Middle-click (auxclick / button 1) like browser tabs:
    // Prevent default on mousedown to cancel Linux autoscroll / primary selection paste, and arm chip by key
    container.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        const chip = e.target.closest('.engine-chip');
        if (chip?.dataset.key) {
          e.preventDefault();
          this.#middleClickArmedKey = chip.dataset.key;
        }
      }
    }, { signal });

    container.addEventListener('mouseleave', () => {
      this.#middleClickArmedKey = null;
    }, { signal });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 1 && this.#middleClickArmedKey) {
        const chip = e.target.closest('.engine-chip');
        if (!chip || chip.dataset.key !== this.#middleClickArmedKey) {
          this.#middleClickArmedKey = null;
        }
      }
    }, { signal, capture: true });

    container.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();

      const chip = e.target.closest('.engine-chip');
      const armedKey = this.#middleClickArmedKey;
      this.#middleClickArmedKey = null;

      if (chip && chip.dataset.key === armedKey && !chip.classList.contains('is-removing')) {
        this.animateAndRemoveChip(chip);
      }
    }, { signal });

    // 6. Click on remove button (via delegation)
    container.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.engine-chip__remove');
      if (!removeBtn) return;
      e.stopPropagation();

      const chip = removeBtn.closest('.engine-chip');
      if (chip && !chip.classList.contains('is-removing')) {
        this.animateAndRemoveChip(chip);
      }
    }, { signal });

    // 6. Linked cross-highlighting on hover & focus
    container.addEventListener('pointerover', (e) => {
      if (this.#activeDrag) return;
      const chip = e.target.closest('.engine-chip');
      if (chip?.dataset.key) {
        this.setHighlight(chip.dataset.key, false);
      }
    }, { signal });

    container.addEventListener('pointerout', (e) => {
      if (this.#activeDrag) return;
      const chip = e.target.closest('.engine-chip');
      const related = e.relatedTarget?.closest?.('.engine-chip');
      if (chip && chip !== related) {
        this.setHighlight(null, false);
      }
    }, { signal });

    container.addEventListener('focusin', (e) => {
      const chip = e.target.closest('.engine-chip');
      if (chip?.dataset.key) {
        this.setHighlight(chip.dataset.key, true);
      }
    }, { signal });

    container.addEventListener('focusout', (e) => {
      const related = e.relatedTarget?.closest?.('.engine-chip');
      if (!related) {
        this.setHighlight(null, true);
      }
    }, { signal });
  }

  #handlePopoverTabKey(e, popover) {
    const focusables = Array.from(popover.querySelectorAll('button:not([disabled])')).filter((btn) => {
      return btn.offsetParent !== null && !btn.closest('[inert]');
    });
    if (focusables.length === 0) return;
    const first = focusables.at(0);
    const last = focusables.at(-1);

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  handlePopoverKeydown(e) {
    const popover = this.el.popover;
    if (!popover || popover.hidden) return;

    if (e.key === 'Tab') {
      this.#handlePopoverTabKey(e, popover);
      return;
    }

    const currentItem = document.activeElement.closest('.miller__item');
    if (!currentItem) return;

    const currentColumn = currentItem.closest('.miller__col');
    if (!currentColumn) return;

    const items = Array.from(currentColumn.querySelectorAll('.miller__item'));
    const idx = items.indexOf(currentItem);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (idx + 1) % items.length;
      this.triggerItemSelection(currentColumn, items[nextIdx].dataset.id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (idx - 1 + items.length) % items.length;
      this.triggerItemSelection(currentColumn, items[prevIdx].dataset.id);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.#handlePopoverArrowRight(currentColumn, popover);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.#handlePopoverArrowLeft(currentColumn, popover);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.#handlePopoverAction(currentColumn, currentItem);
    }
  }

  #handlePopoverArrowRight(currentColumn, popover) {
    if (currentColumn.classList.contains('miller__col--engines')) {
      const nextCol = popover.querySelector('.miller__col--versions');
      const target = nextCol?.querySelector('.is-selected') || nextCol?.querySelector('.miller__item');
      if (typeof window !== 'undefined' && window.innerWidth <= 560) this.setStep(2);
      target?.focus();
    } else if (currentColumn.classList.contains('miller__col--versions')) {
      const nextCol = popover.querySelector('.miller__col--storages');
      const target = nextCol?.querySelector('.is-selected') || nextCol?.querySelector('.miller__item');
      if (typeof window !== 'undefined' && window.innerWidth <= 560) this.setStep(3);
      target?.focus();
    }
  }

  #handlePopoverArrowLeft(currentColumn, popover) {
    if (currentColumn.classList.contains('miller__col--storages')) {
      const prevCol = popover.querySelector('.miller__col--versions');
      const target = prevCol?.querySelector('.is-selected') || prevCol?.querySelector('.miller__item');
      if (typeof window !== 'undefined' && window.innerWidth <= 560) this.setStep(2);
      target?.focus();
    } else if (currentColumn.classList.contains('miller__col--versions')) {
      const prevCol = popover.querySelector('.miller__col--engines');
      const target = prevCol?.querySelector('.is-selected') || prevCol?.querySelector('.miller__item');
      if (typeof window !== 'undefined' && window.innerWidth <= 560) this.setStep(1);
      target?.focus();
    }
  }

  #handlePopoverAction(currentColumn, currentItem) {
    if (currentColumn.classList.contains('miller__col--storages')) {
      this.confirmDraftEngine();
      return;
    }
    this.triggerItemSelection(currentColumn, currentItem.dataset.id);
    if (typeof window !== 'undefined' && window.innerWidth <= 560) {
      if (currentColumn.classList.contains('miller__col--engines')) {
        this.setStep(2);
      } else if (currentColumn.classList.contains('miller__col--versions')) {
        this.setStep(3);
      }
    }
  }

  triggerItemSelection(columnEl, itemId) {
    if (columnEl.classList.contains('miller__col--engines')) {
      const eng = this.catalog.find((e) => e.id === itemId);
      if (eng) {
        this.draftEngine = eng;
        this.draftVersion = eng.versions[0] || null;
        this.draftStorage = (eng.storages || []).find((s) => s.isDefault) ||
          eng.storages?.[0] ||
          null;
        this.renderMillerColumns({ colClass: '.miller__col--engines', id: eng.id });
      }
    } else if (columnEl.classList.contains('miller__col--versions')) {
      const ver = this.draftEngine?.versions.find((v) => v.id === itemId);
      if (ver) {
        this.draftVersion = ver;
        this.renderMillerColumns({ colClass: '.miller__col--versions', id: ver.id });
      }
    } else if (columnEl.classList.contains('miller__col--storages')) {
      const st = (this.draftEngine?.storages || []).find((s) => s.id === itemId);
      if (st) {
        this.draftStorage = st;
        this.renderMillerColumns({ colClass: '.miller__col--storages', id: st.id });
      }
    }
  }

  setStep(step) {
    if (!this.el.popover) return;
    const clamped = Math.max(1, Math.min(3, step));
    this.el.popover.dataset.step = String(clamped);

    const isMobile = Boolean(window?.matchMedia?.('(max-width: 560px)')?.matches);
    const cols = [
      this.el.popover.querySelector('.miller__col--engines'),
      this.el.popover.querySelector('.miller__col--versions'),
      this.el.popover.querySelector('.miller__col--storages')
    ];

    cols.forEach((col, idx) => {
      if (!col) return;
      if (isMobile) {
        col.inert = (idx !== clamped - 1);
        col.setAttribute('aria-hidden', String(idx !== clamped - 1));
      } else {
        col.inert = false;
        col.removeAttribute('aria-hidden');
      }
    });

    if (isMobile) {
      const activeCol = cols[clamped - 1];
      const activeBtn = activeCol?.querySelector('.is-selected') || activeCol?.querySelector('.miller__item');
      activeBtn?.focus({ preventScroll: true });
    }
  }

  togglePicker() {
    if (this.isPickerOpen) {
      this.closePicker(true);
    } else {
      this.openPicker();
    }
  }

  openPicker() {
    if (this.catalog.length === 0) return;
    this.isPickerOpen = true;
    if (this.el.popover) {
      this.el.popover.hidden = false;
      this.setStep(1);
    }
    if (this.el.addBtn) this.el.addBtn.setAttribute('aria-expanded', 'true');
    this.renderMillerColumns();

    // Focus active item in first column
    const activeBtn = this.el.popover?.querySelector('.miller__col--engines .is-selected') ||
      this.el.popover?.querySelector('.miller__col--engines .miller__item');
    if (activeBtn) activeBtn.focus();
  }

  closePicker(restoreFocus = true) {
    if (!this.isPickerOpen) return;
    this.isPickerOpen = false;
    if (this.el.popover) this.el.popover.hidden = true;
    if (this.el.addBtn) {
      this.el.addBtn.setAttribute('aria-expanded', 'false');
      if (restoreFocus) {
        this.el.addBtn.focus();
      }
    }
  }

  selectEngine(engine) {
    this.draftEngine = engine;
    this.draftVersion = engine.versions[0] || null;
    this.draftStorage = (engine.storages || []).find((s) => s.isDefault) ||
      engine.storages?.[0] ||
      null;
    this.renderMillerColumns({ colClass: '.miller__col--engines', id: engine.id });
    if (typeof window !== 'undefined' && window.innerWidth <= 560) {
      this.setStep(2);
    }
  }

  selectVersion(version) {
    this.draftVersion = version;
    this.renderMillerColumns({ colClass: '.miller__col--versions', id: version.id });
    if (typeof window !== 'undefined' && window.innerWidth <= 560) {
      this.setStep(3);
    }
  }

  selectStorage(storage) {
    this.draftStorage = storage;
    this.renderMillerColumns({ colClass: '.miller__col--storages', id: storage.id });
  }

  #animateChipsFlip(chips, targetKey, firstLefts) {
    chips.forEach((c) => {
      const k = c.dataset.key;
      if (k !== targetKey && firstLefts.has(k)) {
        const firstLeft = firstLefts.get(k);
        const lastLeft = c.getBoundingClientRect().left;
        const dx = firstLeft - lastLeft;
        if (Math.abs(dx) > 0.5) {
          c.animate([
            { transform: `translateX(${dx}px)` },
            { transform: 'translateX(0)' }
          ], {
            duration: 200,
            easing: 'cubic-bezier(0.2, 0, 0, 1)'
          });
        }
      }
    });
  }

  confirmDraftEngine() {
    if (!this.draftEngine || !this.draftVersion || !this.draftStorage) return;

    const target = {
      engineId: this.draftEngine.id,
      versionId: this.draftVersion.id,
      storageId: this.draftStorage.id
    };
    const targetKey = formatEngineId(target);

    const exists = this.activeEngines.some(
      (e) =>
        e.engineId === target.engineId &&
        e.versionId === target.versionId &&
        e.storageId === target.storageId
    );

    if (exists) {
      this.#confirmRemoveEngine(target, targetKey);
    } else {
      this.#confirmAddEngine(target, targetKey);
    }
  }

  #confirmRemoveEngine(target, targetKey) {
    if (this.activeEngines.length <= 1) {
      this.announce('At least one engine must remain selected');
      return;
    }

    const escapedKey = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(targetKey) : targetKey;
    const chipEl = this.el.chipsContainer?.querySelector(`[data-key="${escapedKey}"]`);
    if (chipEl) {
      this.animateAndRemoveChip(chipEl);
    } else {
      this.removeEngine(target);
    }
    this.closePicker(true);
  }

  #confirmAddEngine(target, targetKey) {
    const firstLefts = new Map();
    if (this.el.chipsContainer) {
      this.getChipElements().forEach((c) => {
        if (c.dataset.key) {
          firstLefts.set(c.dataset.key, c.getBoundingClientRect().left);
        }
      });
    }

    this.activeEngines.push(target);
    this.renderChips();
    this.dispatchChangeEvent();
    this.closePicker(true);

    const engMeta = this.catalog.find((item) => item.id === target.engineId);
    const engName = engMeta?.shortName || engMeta?.name || target.engineId;
    this.announce(`${engName} added to comparison`);

    const prefersReducedMotion = Boolean(window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    this.safeRaf(() => {
      const chips = this.getChipElements();
      const newChip = chips.find((c) => c.dataset.key === targetKey);

      if (!prefersReducedMotion) {
        this.#animateChipsFlip(chips, targetKey, firstLefts);

        if (newChip) {
          newChip.animate([
            { opacity: 0, transform: 'scale(0.85) translateX(12px)' },
            { opacity: 1, transform: 'scale(1) translateX(0)' }
          ], {
            duration: 180,
            easing: 'cubic-bezier(0, 0, 0.2, 1)'
          });
        }
      }

      if (newChip) {
        newChip.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  animateAndRemoveChip(chip) {
    if (!chip || chip.classList.contains('is-removing')) return;
    if (this.activeEngines.length <= 1) {
      this.announce('At least one engine must remain selected');
      return;
    }

    const key = chip.dataset.key;
    const targetEng = this.activeEngines.find((eng) => formatEngineId(eng) === key);
    if (!targetEng) return;

    const engMeta = this.catalog.find((item) => item.id === targetEng.engineId);
    const name = engMeta?.shortName || engMeta?.name || targetEng.engineId;

    const container = this.el.chipsContainer;
    if (!container) return;

    const chipElements = this.getChipElements();
    const removedIdx = chipElements.indexOf(chip);

    // Clear any active cross-highlight
    this.clearHighlight();

    // Check prefers-reduced-motion
    const prefersReducedMotion = Boolean(window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    if (prefersReducedMotion) {
      this.removeEngine(targetEng);
      this.announce(`${name} removed from comparison`);
      this.safeRaf(() => {
        const remainingChips = this.getChipElements();
        if (remainingChips.length > 0) {
          const nextFocusIdx = Math.min(removedIdx, remainingChips.length - 1);
          remainingChips[nextFocusIdx]?.focus();
        } else if (this.el.addBtn) {
          this.el.addBtn.focus();
        }
      });
      return;
    }

    // 1. FIRST: Measure visual coordinates of all chips before mutation
    const firstLefts = new Map();
    chipElements.forEach((c) => {
      if (c.dataset.key) {
        firstLefts.set(c.dataset.key, c.getBoundingClientRect().left);
      }
    });

    // 2. Clone chip as an absolute ghost to animate its fade and slight scale down
    const ghost = chip.cloneNode(true);
    ghost.className = 'engine-chip engine-chip--ghost';
    delete ghost.dataset.key;
    ghost.removeAttribute('tabindex');
    ghost.style.position = 'absolute';
    ghost.style.left = `${chip.offsetLeft}px`;
    ghost.style.top = `${chip.offsetTop}px`;
    ghost.style.width = `${chip.offsetWidth}px`;
    ghost.style.height = `${chip.offsetHeight}px`;
    ghost.style.pointerEvents = 'none';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');

    // 3. Mark chip as removing
    chip.classList.add('is-removing');

    // 4. Update data model and re-render remaining chips
    this.removeEngine(targetEng, { skipRender: true });
    this.renderChips();
    this.dispatchChangeEvent();
    this.announce(`${name} removed from comparison`);

    // Append ghost into container so it stays visually in place during the slide
    container.appendChild(ghost);
    this.#activeGhosts.add(ghost);

    // 5. LAST & INVERT: Measure new positions of remaining chips and animate dx -> 0
    const remainingChips = this.getChipElements();
    remainingChips.forEach((c) => {
      const k = c.dataset.key;
      if (k && firstLefts.has(k)) {
        const firstLeft = firstLefts.get(k);
        const lastLeft = c.getBoundingClientRect().left;
        const dx = firstLeft - lastLeft;
        if (Math.abs(dx) > 0.5) {
          c.animate([
            { transform: `translateX(${dx}px)` },
            { transform: 'translateX(0)' }
          ], {
            duration: 200,
            easing: 'cubic-bezier(0.2, 0, 0, 1)'
          });
        }
      }
    });

    // 6. Animate ghost exit (fade + scale down) and clean up
    let ghostTimer = null;
    const cleanupGhost = () => {
      if (ghostTimer) {
        clearTimeout(ghostTimer);
        this.#ghostTimeouts.delete(ghostTimer);
        ghostTimer = null;
      }
      this.#activeGhosts.delete(ghost);
      if (ghost.parentElement) {
        ghost.remove();
      }
    };

    try {
      const ghostAnim = ghost.animate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.82)' }
      ], {
        duration: 160,
        easing: 'cubic-bezier(0.4, 0, 1, 1)'
      });
      ghostAnim.addEventListener('finish', cleanupGhost, { once: true });
    } catch {
      // Element.animate is unsupported or aborted in testing environments
      cleanupGhost();
    }

    ghostTimer = setTimeout(cleanupGhost, 240);
    this.#ghostTimeouts.add(ghostTimer);

    // 7. Focus next chip smoothly
    this.safeRaf(() => {
      const freshChips = this.getChipElements();
      if (freshChips.length > 0) {
        const nextFocusIdx = Math.min(removedIdx, freshChips.length - 1);
        freshChips[nextFocusIdx]?.focus();
      } else if (this.el.addBtn) {
        this.el.addBtn.focus();
      }
    });
  }

  removeEngine(target, options = {}) {
    if (this.activeEngines.length <= 1) return; // Invariant: Keep at least one engine
    const initialLen = this.activeEngines.length;
    this.activeEngines = this.activeEngines.filter(
      (e) =>
        !(
          e.engineId === target.engineId &&
          e.versionId === target.versionId &&
          e.storageId === target.storageId
        )
    );
    if (this.activeEngines.length !== initialLen && !options.skipRender) {
      this.render();
    }
  }

  reorderEngines(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= this.activeEngines.length || toIndex >= this.activeEngines.length) return;
    const [moved] = this.activeEngines.splice(fromIndex, 1);
    this.activeEngines.splice(toIndex, 0, moved);
    this.render();
  }

  cancelPendingDrag() {
    this.clearHighlight();
    this.#stopAutoScroll();
    const staleContext = this.#activeDrag || this.#settlingDrag;
    this.#activeDrag = null;
    this.#pendingDrag = null;
    this.#settlingDrag = null;
    this.#isSettling = false;

    if (this.#pendingCommit) {
      this.#pendingCommit();
      this.#pendingCommit = null;
    }

    if (staleContext) {
      try {
        staleContext.chip.releasePointerCapture(staleContext.pointerId);
      } catch (_) {}
      staleContext.chipElements?.forEach((el) => {
        delete el.dataset.shiftX;
        el.style.transform = '';
        el.style.transition = '';
        el.style.zIndex = '';
        el.classList.remove('is-dragging', 'is-settling');
      });
    }

    if (this.el?.chipsContainer) {
      this.el.chipsContainer.classList.remove('no-anim');
    }
  }

  render() {
    this.cancelPendingDrag();
    this.renderChips();
    this.dispatchChangeEvent();
  }

  renderChips() {
    if (!this.el?.chipsContainer) return;
    this.cancelPendingDrag();
    this.el.chipsContainer.innerHTML = '';

    const selectedList = this.getSelectedEngines();
    const isSingleEngine = selectedList.length <= 1;

    selectedList.forEach((t, idx) => {
      const eng = this.catalog.find((e) => e.id === t.engineId);
      const isNext = isBranchVersion(t.versionId);
      const versionLabel = isNext ? `${t.versionId} (dev)` : t.versionId;
      const engineName = eng?.shortName || eng?.name || t.engineId;
      const chipKey = formatEngineId(t);
      const storageLabel = t.storageId === 'in-memory' ? 'MEM' : t.storageId.toUpperCase();
      const storageDescription = t.style.isDisk
        ? `Persistent Disk Storage (${storageLabel})`
        : 'In-Memory Store';

      const chip = document.createElement('li');
      chip.className = 'engine-chip';
      chip.dataset.index = String(idx);
      chip.dataset.key = chipKey;
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-roledescription', 'sortable engine');
      chip.setAttribute('aria-label', `${engineName} ${versionLabel} ${storageLabel}, ${storageDescription}. Position ${idx + 1} of ${selectedList.length}. Use Alt+Arrow keys to reorder. Delete to remove.`);
      chip.setAttribute('title', isSingleEngine ? 'At least one engine must remain selected' : 'Drag to reorder · Middle-click to remove');

      const indicatorHtml = renderEngineIndicatorSvg(t.style);
      const storageClass = t.style.isDisk ? 'engine-chip__storage--disk' : 'engine-chip__storage--mem';
      const storageBadge = `<span class="engine-chip__storage ${storageClass}" title="${escapeHtml(storageDescription)}">${escapeHtml(storageLabel)}</span>`;

      const removeDisabledAttr = isSingleEngine ? 'disabled="true" aria-disabled="true"' : '';
      const removeTitle = isSingleEngine
        ? 'At least one engine must remain selected'
        : `Remove ${engineName} ${t.versionId} (${storageLabel}) [Middle-click or ✕]`;

      chip.innerHTML = `
        <span class="engine-chip__glyph" title="${escapeHtml(storageDescription)}">
          ${indicatorHtml}
        </span>
        <span class="engine-chip__name">${escapeHtml(engineName)}</span>
        <span class="engine-chip__version">${escapeHtml(versionLabel)}</span>
        ${storageBadge}
        <button type="button" class="engine-chip__remove" aria-label="${escapeHtml(removeTitle)}" title="${escapeHtml(removeTitle)}" ${removeDisabledAttr}>✕</button>
      `;

      this.el.chipsContainer.appendChild(chip);
    });

    this.updateFadeMask();
  }

  renderMillerColumns(focusTarget = null) {
    if (!this.draftEngine || !this.el.popover) return;
    this.#isRenderingColumns = true;

    try {
      const colEngines = this.el.popover.querySelector('.miller__col--engines');
      const colVersions = this.el.popover.querySelector('.miller__col--versions');
      const colStorages = this.el.popover.querySelector('.miller__col--storages');
      const previewEl = this.el.popover.querySelector('.miller__preview');

      if (!colEngines || !colVersions || !colStorages) return;

      this.#renderEnginesColumn(colEngines);
      this.#renderVersionsColumn(colVersions);
      this.#renderStoragesColumn(colStorages);
      this.#updateMillerFooter(previewEl);

      // Restore focus to requested element synchronously (prevents focusout from firing on body)
      if (focusTarget?.colClass && focusTarget.id) {
        const col = this.el.popover.querySelector(focusTarget.colClass);
        if (col) {
          const buttons = Array.from(col.querySelectorAll('button'));
          const targetBtn = buttons.find((b) => b.dataset.id === focusTarget.id);
          if (targetBtn) {
            targetBtn.focus({ preventScroll: true });
          }
        }
      }
    } finally {
      this.#isRenderingColumns = false;
    }
  }

  #renderEnginesColumn(colEngines) {
    colEngines.innerHTML = '';
    this.catalog.forEach((eng) => {
      const isSelected = eng.id === this.draftEngine.id;
      const official = getOfficialFamilies();
      const family = Object.hasOwn(official, eng.id)
        ? official[eng.id]
        : generateDistinctFamily(eng.id, eng.color);
      const safeBaseColor = sanitizeColor(family.base, '#0072b2');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `miller__item ${isSelected ? 'is-selected' : ''}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(isSelected));
      btn.dataset.id = eng.id;
      btn.innerHTML = `
        <span class="miller__dot" style="background-color: ${safeBaseColor}"></span>
        <span class="miller__label">${escapeHtml(eng.name)}</span>
        <span class="miller__arrow" aria-hidden="true">›</span>
      `;
      btn.addEventListener('click', () => {
        this.selectEngine(eng);
      });
      colEngines.appendChild(btn);
    });
  }

  #renderVersionsColumn(colVersions) {
    colVersions.innerHTML = '';
    this.draftEngine.versions.forEach((v) => {
      const isSelected = this.draftVersion && v.id === this.draftVersion.id;
      const previewStyle = getEngineStyle({
        engineId: this.draftEngine.id,
        versionId: v.id,
        storageId: 'in-memory'
      }, this.catalog);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `miller__item ${isSelected ? 'is-selected' : ''}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(isSelected));
      btn.dataset.id = v.id;

      let tagHtml = '';
      if (v.isLatest) {
        tagHtml = '<span class="miller__tag">latest</span>';
      } else if (v.type === 'branch') {
        tagHtml = '<span class="miller__tag">dev</span>';
      }

      const glyphSvg = renderEngineIndicatorSvg(previewStyle);

      btn.innerHTML = `
        <span class="miller__glyph">${glyphSvg}</span>
        <span class="miller__label">${escapeHtml(v.label)}</span>
        ${tagHtml}
        <span class="miller__arrow" aria-hidden="true">›</span>
      `;
      btn.addEventListener('click', () => {
        this.selectVersion(v);
      });
      colVersions.appendChild(btn);
    });
  }

  #renderStoragesColumn(colStorages) {
    colStorages.innerHTML = '';
    (this.draftEngine?.storages || []).forEach((s) => {
      const isSelected = this.draftStorage && s.id === this.draftStorage.id;
      const previewStyle = getEngineStyle({
        engineId: this.draftEngine.id,
        versionId: this.draftVersion?.id || 'latest',
        storageId: s.id
      }, this.catalog);

      const isAlreadyActive = this.activeEngines.some(
        (e) =>
          e.engineId === this.draftEngine.id &&
          e.versionId === this.draftVersion?.id &&
          e.storageId === s.id
      );

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `miller__item ${isSelected ? 'is-selected' : ''} ${isAlreadyActive ? 'is-active-in-bar' : ''}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(isSelected));
      btn.dataset.id = s.id;

      const glyphSvg = renderEngineIndicatorSvg(previewStyle);
      const activeTag = isAlreadyActive ? '<span class="miller__tag miller__tag--active">✓ Active</span>' : '';

      btn.innerHTML = `
        <span class="miller__glyph">${glyphSvg}</span>
        <span class="miller__label">${escapeHtml(s.label)}</span>
        ${activeTag}
      `;
      btn.addEventListener('click', () => {
        this.selectStorage(s);
      });
      colStorages.appendChild(btn);
    });
  }

  #updateMillerFooter(previewEl) {
    const isCurrentActive = this.activeEngines.some(
      (e) =>
        e.engineId === this.draftEngine.id &&
        e.versionId === this.draftVersion?.id &&
        e.storageId === this.draftStorage?.id
    );

    if (this.el.confirmBtn) {
      if (isCurrentActive) {
        this.#updateMillerRemoveButton();
      } else {
        this.#updateMillerAddButton();
      }
    }

    if (previewEl && this.draftEngine && this.draftVersion && this.draftStorage) {
      previewEl.textContent = `${this.draftEngine.name} · ${this.draftVersion.label} · ${this.draftStorage.label}`;
    }
  }

  #updateMillerRemoveButton() {
    this.el.confirmBtn.textContent = 'Remove';
    this.el.confirmBtn.classList.add('miller__confirm-btn--remove');
    if (this.activeEngines.length <= 1) {
      this.el.confirmBtn.disabled = true;
      this.el.confirmBtn.setAttribute('aria-disabled', 'true');
      this.el.confirmBtn.title = 'At least one engine must remain selected';
      this.el.confirmBtn.setAttribute('aria-label', 'At least one engine must remain selected');
    } else {
      this.el.confirmBtn.disabled = false;
      this.el.confirmBtn.removeAttribute('aria-disabled');
      this.el.confirmBtn.title = 'Remove this engine from comparison';
      this.el.confirmBtn.setAttribute('aria-label', `Remove ${this.draftEngine.name} ${this.draftVersion?.label} from comparison`);
    }
  }

  #updateMillerAddButton() {
    this.el.confirmBtn.disabled = false;
    this.el.confirmBtn.removeAttribute('aria-disabled');
    this.el.confirmBtn.textContent = 'Add';
    this.el.confirmBtn.classList.remove('miller__confirm-btn--remove');
    this.el.confirmBtn.title = 'Add this engine to comparison';
    this.el.confirmBtn.setAttribute('aria-label', `Add ${this.draftEngine.name} ${this.draftVersion?.label} to comparison`);
  }

  dispatchChangeEvent() {
    const detail = { engines: this.getSelectedEngines() };
    const event = new CustomEvent('benchmark:engines-changed', { detail });
    this.dispatchEvent(event);
  }
}

export const engineManager = new EngineManager();
