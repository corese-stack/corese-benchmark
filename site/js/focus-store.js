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
		if (!target || !target.key) return;
		const isSame = sameTarget(this.#state.pinned, target);
		const pinned = isSame ? null : target;
		this.#state = { ...this.#state, pinned };
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
