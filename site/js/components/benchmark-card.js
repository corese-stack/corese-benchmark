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
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${escapeHtml(s.param || "n/a")}</td>
        <td class="num-col font-mono">${escapeHtml(s.triples || "n/a")}</td>
        <td class="font-mono">${escapeHtml(s.file || "n/a")}</td>
        <td><span class="status-badge ${s.tested ? "badge-pass" : "badge-skip"}">${s.tested ? "BENCHMARKED" : "REFERENCE"}</span></td>
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

			modalDialog.open({
				title: `${descriptor.name} – Technical Specifications`,
				badge: "SPECIFICATION",
				badgeClass: "badge-pass",
				bodyHtml: `
        <div class="info-row">
          <span class="info-label">Full Academic Citation</span>
          <div class="info-value font-italic">${escapeHtml(descriptor.citation || "Official specification")}</div>
        </div>
        <div class="info-row">
          <span class="info-label">Dataset Generation / Extraction CLI</span>
          <pre class="info-code modal-preview-code"><code>${escapeHtml(descriptor.generatorCli || "Standard generator")}</code></pre>
        </div>
        <div class="info-row">
          <span class="info-label">Ontology & Namespaces</span>
          <div class="tile-kv-list" style="margin-top: 4px;">
            ${nsList || '<div class="text-faint">No specific prefixes defined.</div>'}
          </div>
        </div>
        <div class="info-row">
          <span class="info-label">Scales & Benchmark Topology</span>
          <table class="academic-table" style="margin-top: 6px;">
            <thead>
              <tr><th>Scale</th><th>Parameter</th><th class="num-col">Triples</th><th>Fixture</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${scalesTable}
            </tbody>
          </table>
        </div>
        <div class="info-row">
          <span class="info-label">Local Reproduction Command</span>
          <pre class="info-code modal-preview-code"><code>${escapeHtml(descriptor.reproduceCli || "./gradlew run")}</code></pre>
        </div>
      `,
			});
		});
}
