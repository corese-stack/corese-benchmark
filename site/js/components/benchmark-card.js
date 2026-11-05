/**
 * Benchmark Presentation Card Component
 * Conforms to academic Inria / W3C standards:
 * 1. Title: Full name + acronym. No redundant badges.
 * 2. Description: 1 concise paragraph explaining what it actually evaluates.
 * 3. Characteristics: 4 structured key-value items (Queries, Dataset, Focus, Particularity / Ontology).
 * 4. Footer: Short academic citation + "[ Benchmark Details ⓘ ]" modal button.
 */

import { escapeHtml } from "../engine-id.js";
import { modalDialog } from "./modal.js";

export function renderBenchmarkCard(descriptor) {
	const id = escapeHtml(descriptor.id);
	const cite = escapeHtml(
		descriptor.shortCitation || descriptor.citation || "Official Specification",
	);

	// descriptor.characteristics is an array of { label, value } or fallback object
	const characteristics = Array.isArray(descriptor.characteristics)
		? descriptor.characteristics
		: [
				{ label: "Queries", value: descriptor.characteristics?.queries },
				{ label: "Dataset", value: descriptor.characteristics?.dataset },
				{ label: "Focus", value: descriptor.characteristics?.focus },
				{
					label: "Particularity",
					value: descriptor.characteristics?.particularity,
				},
			];

	const charItems = characteristics
		.map(
			(item) => `
    <div class="benchmark-card__char">
      <dt class="benchmark-card__char-label">${escapeHtml(item.label)}</dt>
      <dd class="benchmark-card__char-value">${escapeHtml(item.value || "—")}</dd>
    </div>
  `,
		)
		.join("");

	return `
    <article class="benchmark-card" aria-labelledby="bench-title-${id}">
      <header class="benchmark-card__header">
        <h2 class="benchmark-card__title" id="bench-title-${id}">${escapeHtml(descriptor.name)}</h2>
      </header>

      <p class="benchmark-card__description">${escapeHtml(descriptor.description || descriptor.subtitle)}</p>

      <dl class="benchmark-card__chars">
        ${charItems}
      </dl>

      <footer class="benchmark-card__footer">
        <div class="benchmark-card__citation">
          <span class="citation-label">Reference:</span>
          ${
						descriptor.officialUrl
							? `<a href="${escapeHtml(descriptor.officialUrl)}" target="_blank" rel="noopener noreferrer" class="benchmark-card__link" title="Open official reference in a new tab">${cite} ↗</a>`
							: `<span>${cite}</span>`
					}
        </div>
        <button type="button" class="btn btn-sm btn-outline btn-open-bench-modal" data-bench-id="${id}" aria-haspopup="dialog" aria-label="Technical specifications for ${escapeHtml(descriptor.shortName || descriptor.name)}">
          Benchmark Details ⓘ
        </button>
      </footer>
    </article>
  `;
}

export function bindBenchmarkCardEvents(container, descriptor) {
	container
		.querySelector(".btn-open-bench-modal")
		?.addEventListener("click", () => {
			const scalesTable = (descriptor.scales || [])
				.map(
					(s) => `
      <tr>
        <td><strong>${escapeHtml(s.name)}</strong> <span class="text-muted">(${escapeHtml(s.param || "")})</span></td>
        <td class="num-col font-mono">${escapeHtml(s.triples || "n/a")}</td>
        <td><span class="status-badge ${s.tested ? "badge-pass" : "badge-skip"}">${s.tested ? "Testé ✓" : "Non testé"}</span></td>
      </tr>
    `,
				)
				.join("");

			const nsList = Object.entries(descriptor.namespaces || {})
				.map(
					([prefix, iri]) => `
      <div class="kv-row font-mono">
        <span class="kv-k"><strong>${escapeHtml(prefix)}:</strong></span>
        <span class="kv-v text-muted">&lt;${escapeHtml(iri)}&gt;</span>
      </div>
    `,
				)
				.join("");

			const reproduceCmd =
				descriptor.reproduceCli ||
				`./gradlew run --args="--dataset ${descriptor.id}"`;
			const profile = descriptor.workloadProfile || {};

			modalDialog.open({
				title: descriptor.name,
				badge: profile.workloadType || "BENCHMARK SPECIFICATION",
				badgeClass: "badge-pass",
				bodyHtml: `
        <!-- A. Corese Implementation -->
        <div class="info-row">
          <span class="info-label">Corese Implementation & Workload</span>
          <div class="info-value" style="margin-bottom: 6px;">
            ${escapeHtml(descriptor.implementationNotes || descriptor.description)}
          </div>
          <div class="tile-kv-list">
            <div class="kv-row"><span class="kv-k">Domain:</span><span class="kv-v">${escapeHtml(profile.domain || "n/a")}</span></div>
            <div class="kv-row"><span class="kv-k">Expressivity:</span><span class="kv-v font-mono">${escapeHtml(profile.expressivity || "n/a")}</span></div>
            <div class="kv-row"><span class="kv-k">Stress Focus:</span><span class="kv-v">${escapeHtml(profile.stressFocus || "n/a")}</span></div>
          </div>
        </div>

        <!-- B. Dataset Files & Scales -->
        <div class="info-row">
          <span class="info-label">${descriptor.id === "dbpedia" ? "N-Triples Files & Ingestion Status" : "Dataset Scales & Coverage"}</span>
          <table class="academic-table" style="margin-top: 6px;">
            <thead>
              <tr><th>${descriptor.id === "dbpedia" ? "File & Slice Content" : "Scale & Parameter"}</th><th class="num-col">Triples</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${scalesTable}
            </tbody>
          </table>
        </div>

        <!-- C. Reproduction Commands -->
        <div class="info-row">
          <div class="split" style="align-items: center; margin-bottom: 4px;">
            <span class="info-label">Local Reproduction Command</span>
            <button class="btn btn-xs btn-outline btn-copy-cli" type="button" data-cmd="${escapeHtml(reproduceCmd)}">Copy Command</button>
          </div>
          <pre class="info-code modal-preview-code"><code>${escapeHtml(reproduceCmd)}</code></pre>
        </div>

        <!-- D. Technical References (Foldable) -->
        <details class="info-row advanced-namespaces-details" style="margin-top: 4px;">
          <summary class="info-label" style="cursor: pointer; user-select: none;">Technical References & Namespaces ▾</summary>
          <div style="margin-top: 8px;">
            ${
							descriptor.generatorCli
								? `
            <div style="margin-bottom: 8px;">
              <span class="text-muted" style="font-size: 11px; font-weight: 600;">Original Generator / Source:</span>
              <pre class="info-code" style="margin-top: 4px; padding: 4px 8px; font-size: 11px;"><code>${escapeHtml(descriptor.generatorCli)}</code></pre>
            </div>
            `
								: ""
						}
            <div class="tile-kv-list">
              ${nsList || '<div class="text-faint">No specific prefixes defined.</div>'}
            </div>
          </div>
        </details>

        <!-- E. Scientific Reference -->
        <div class="info-row" style="border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 4px;">
          <span class="info-label">Scientific Reference</span>
          <div class="info-value">
            ${escapeHtml(descriptor.citation || "Official academic specification")}
            ${descriptor.paperUrl ? `· <a href="${escapeHtml(descriptor.paperUrl)}" target="_blank" rel="noopener noreferrer" class="link-paper">Publication [DOI] ↗</a>` : ""}
          </div>
        </div>
      `,
			});

			const copyBtn = document.querySelector(".btn-copy-cli");
			if (copyBtn) {
				copyBtn.addEventListener("click", () => {
					const cmd = copyBtn.dataset.cmd || "";
					copyText(cmd)
						.then(() => {
							copyBtn.textContent = "Copied ✓";
							setTimeout(() => {
								copyBtn.textContent = "Copy Command";
							}, 1500);
						})
						.catch(() => {
							copyBtn.textContent = "Failed";
						});
				});
			}
		});
}

function copyText(text) {
	if (navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
	}
	return fallbackCopy(text);
}

function fallbackCopy(text) {
	const ta = document.createElement("textarea");
	ta.value = text;
	ta.style.position = "fixed";
	ta.style.opacity = "0";
	document.body.appendChild(ta);
	ta.focus();
	ta.select();
	try {
		document.execCommand("copy");
		ta.remove();
		return Promise.resolve();
	} catch (err) {
		ta.remove();
		return Promise.reject(err);
	}
}
