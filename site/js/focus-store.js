/**
 * Unified Focus & Selection Store (Single Source of Truth)
 * Eliminates state desynchronization between EngineManager, LoadingView, Charts & Tables.
 *
 * Formal invariant:
 * Effective Focus = Pinned (if any) ELSE Hover (if any) ELSE Null.
 * While any target is pinned, hovering never breaks or mutates the effective focus.
 */

export function sameTarget(a, b) {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.kind === b.kind && a.key === b.key;
}

/**
 * Extracts canonical engine key from a focus target (engine, measure, cell, or bar).
 * Returns null if target is null or not resolvable to an engine.
 */
export function engineKeyOf(target) {
	if (!target?.key) return null;
	if (target.kind === "engine") return target.key;
	if (target.kind === "measure" || target.kind === "bar") return target.key.split("|")[0];
	if (target.kind === "cell") {
		// Key format: `${engine}|${JSON.stringify([dataset, queryId])}`
		const idx = target.key.indexOf("|");
		return idx !== -1 ? target.key.slice(0, idx) : null;
	}
	return null;
}

function presentationForQuery(tKey, item, resolveFeature) {
	if (item.queryKey) return item.queryKey === tKey ? "selected" : "unrelated";
	if (item.feature) {
		const queryFeature = resolveFeature(tKey);
		return queryFeature && item.feature === queryFeature ? "related" : "unrelated";
	}
	return "unrelated";
}

function cellPresentationDetailed(item, cellEngine, cellQueryKey, resolveFeature) {
	if (item.kind === "cell" || (item.engine && item.queryKey)) {
		return item.engine === cellEngine && item.queryKey === cellQueryKey ? "selected" : "unrelated";
	}
	if (item.engine && item.feature) {
		return item.engine === cellEngine && item.feature === resolveFeature(cellQueryKey) ? "related" : "unrelated";
	}
	return null;
}

function presentationForCell(focusTarget, tKey, item, resolveFeature) {
	const cellEngine = engineKeyOf(focusTarget);
	const cellQueryKey = tKey.slice(tKey.indexOf("|") + 1);

	const detailed = cellPresentationDetailed(item, cellEngine, cellQueryKey, resolveFeature);
	if (detailed) return detailed;

	if (item.queryKey) {
		return item.queryKey === cellQueryKey ? "related" : "unrelated";
	}
	if (item.engine) {
		return item.engine === cellEngine ? "related" : "unrelated";
	}
	return "unrelated";
}

function barPresentationDetailed(item, barEngine, barFeature, resolveFeature) {
	if (item.engine && item.feature) {
		return item.engine === barEngine && item.feature === barFeature ? "selected" : "unrelated";
	}
	if (item.engine && item.queryKey) {
		const qFeature = resolveFeature(item.queryKey);
		return item.engine === barEngine && qFeature === barFeature ? "related" : "unrelated";
	}
	return null;
}

function presentationForBar(focusTarget, tKey, item, resolveFeature) {
	const barEngine = engineKeyOf(focusTarget);
	const barFeature = tKey.slice(tKey.indexOf("|") + 1);

	const detailed = barPresentationDetailed(item, barEngine, barFeature, resolveFeature);
	if (detailed) return detailed;

	if (item.queryKey) {
		const qFeature = resolveFeature(item.queryKey);
		return qFeature === barFeature ? "related" : "unrelated";
	}
	if (item.engine) {
		return item.engine === barEngine ? "related" : "unrelated";
	}
	return "unrelated";
}

function presentationForFeature(tKey, item, resolveFeature) {
	if (item.feature) {
		return item.feature === tKey ? "selected" : "unrelated";
	}
	if (item.queryKey) {
		return resolveFeature(item.queryKey) === tKey ? "related" : "unrelated";
	}
	return "neutral";
}

function presentationForEngine(tKey, item) {
	if (!item.engine) return "neutral";
	return item.engine === tKey ? "selected" : "unrelated";
}

function presentationForMeasure(tKey, item) {
	if (item.measureKey) {
		return item.measureKey === tKey ? "selected" : "unrelated";
	}
	if (!item.engine) return "unrelated";
	const mEngine = tKey.split("|")[0];
	return item.engine === mEngine ? "related" : "unrelated";
}

function createFeatureResolver(context) {
	return (qKey) => {
		if (!qKey || !context) return null;
		if (context instanceof Map) return context.get(qKey) || null;
		if (typeof context.getFeature === "function") return context.getFeature(qKey) || null;
		return context[qKey] || null;
	};
}

/**
 * Resolves presentation state for an entity given the current focus target and catalogue relationships.
 * Returns: 'selected' | 'related' | 'unrelated' | 'neutral'
 *
 * @param {object|null} focusTarget - { kind: 'engine' | 'measure' | 'query' | 'feature' | 'cell', key: string }
 * @param {object} item - Query or Measure descriptor:
 *   { kind: 'query'|'cell'|'bar'|'row'|'engine', engine?, queryKey?, feature?, dataset?, queryId? }
 * @param {Map|object} [context] - Optional relationships (e.g. queryKey -> feature)
 */
export function presentationFor(focusTarget, item, context = null) {
	if (!focusTarget?.key) return "neutral";

	const resolveFeature = createFeatureResolver(context);
	const { kind: tKind, key: tKey } = focusTarget;

	switch (tKind) {
	case "engine":
		return presentationForEngine(tKey, item);
	case "query":
		return presentationForQuery(tKey, item, resolveFeature);
	case "feature":
		return presentationForFeature(tKey, item, resolveFeature);
	case "cell":
		return presentationForCell(focusTarget, tKey, item, resolveFeature);
	case "bar":
		return presentationForBar(focusTarget, tKey, item, resolveFeature);
	case "measure":
		return presentationForMeasure(tKey, item);
	default:
		return "neutral";
	}
}

/**
 * Checks whether a target matches a given engine key.
 */
export function matchesEngine(target, engineKey) {
	if (!engineKey) return false;
	return engineKeyOf(target) === engineKey;
}

export function hoverSource() {
	let target = null;
	let token = null;

	return {
		set(next) {
			if (sameTarget(target, next)) return;
			if (token) {
				focusStore.endHover(token);
				token = null;
			}
			target = next;
			token = next ? focusStore.beginHover(next) : null;
		},

		clear() {
			this.set(null);
		},

		get target() {
			return target;
		},
	};
}

export class FocusStore extends EventTarget {
	#state = {
		pinned: null, // null | { kind: 'engine' | 'measure', key: string }
		hover: null,  // null | { token: symbol, target: { kind, key } }
	};

	get state() {
		return this.#state;
	}

	get effectiveFocus() {
		if (this.#state.pinned) {
			return { target: this.#state.pinned, mode: "pinned" };
		}
		if (this.#state.hover) {
			return { target: this.#state.hover.target, mode: "hover" };
		}
		return null;
	}

	/**
	 * Instant hover acquisition. Returns unique token.
	 */
	beginHover(target) {
		if (!target?.key) return null;
		const token = Symbol("hover");
		this.#state = { ...this.#state, hover: { token, target } };
		this.#notify();
		return token;
	}

	/**
	 * Immediately cancel hover if token matches.
	 */
	endHover(token) {
		if (!token || this.#state.hover?.token !== token) return;
		this.#state = { ...this.#state, hover: null };
		this.#notify();
	}

	/**
	 * Immediately clear any active unpinned hover (e.g. when pointer leaves the window).
	 */
	clearHover() {
		if (!this.#state.hover) return;
		this.#state = { ...this.#state, hover: null };
		this.#notify();
	}

	/**
	 * Toggle pin state immediately.
	 */
	togglePin(target) {
		if (!target?.key) return;
		const isSame = sameTarget(this.#state.pinned, target);
		const pinned = isSame ? null : target;
		this.#state = { ...this.#state, pinned };
		this.#notify();
	}

	/**
	 * Pin target directly.
	 */
	pin(target) {
		if (!target?.key || sameTarget(this.#state.pinned, target)) return;
		this.#state = { ...this.#state, pinned: target };
		this.#notify();
	}

	/**
	 * Unpin target.
	 */
	unpin() {
		if (!this.#state.pinned) return;
		this.#state = { ...this.#state, pinned: null };
		this.#notify();
	}

	/**
	 * Clear all pinned and hover states immediately.
	 */
	clear() {
		if (!this.#state.pinned && !this.#state.hover) return;
		this.#state = { pinned: null, hover: null };
		this.#notify();
	}

	#notify() {
		const focus = this.effectiveFocus;
		this.dispatchEvent(new CustomEvent("focus-changed", { detail: { focus, rawState: this.#state } }));
	}
}

export const focusStore = new FocusStore();
if (typeof window !== "undefined") {
	window.focusStore = focusStore;
}

// Global Window & Document Exit / Scroll Safety
if (typeof window !== "undefined") {
	window.addEventListener("blur", () => {
		focusStore.clearHover();
	});

	// On scroll, the mouse position is unchanged but elements move away underneath it:
	// always clear any unpinned hover immediately.
	window.addEventListener(
		"scroll",
		() => {
			focusStore.clearHover();
		},
		{ passive: true },
	);

	document.addEventListener("mouseleave", (e) => {
		// When pointer moves outside html/viewport
		if (!e.relatedTarget && !e.toElement) {
			focusStore.clearHover();
		}
	});

	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			focusStore.clearHover();
		}
	});
}
