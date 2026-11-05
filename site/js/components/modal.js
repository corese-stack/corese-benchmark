/**
 * Accessible Modal Dialog Component
 * Inspired by corese-w3c dialog system.
 * Uses native <dialog> with showModal(), ESC dismissal, backdrop blur, and focus trap.
 */

export class ModalDialog {
	constructor() {
		this.dialog = document.getElementById("details-dialog");
		if (!this.dialog) {
			this.createDialogElement();
		}
		this.closeBtn = this.dialog.querySelector(".modal-close-icon");
		this.bottomCloseBtn = this.dialog.querySelector(".modal-bottom-close-btn");

		this.handleClose = () => this.close();
		this.closeBtn?.addEventListener("click", this.handleClose);
		this.bottomCloseBtn?.addEventListener("click", this.handleClose);

		// Close when clicking directly on the backdrop
		this.dialog.addEventListener("click", (e) => {
			const rect = this.dialog.getBoundingClientRect();
			const isInDialog =
				rect.top <= e.clientY &&
				e.clientY <= rect.top + rect.height &&
				rect.left <= e.clientX &&
				e.clientX <= rect.left + rect.width;
			if (!isInDialog) {
				this.close();
			}
		});
	}

	createDialogElement() {
		this.dialog = document.createElement("dialog");
		this.dialog.id = "details-dialog";
		this.dialog.className = "modal-window";
		this.dialog.setAttribute("aria-labelledby", "modal-dialog-title");
		this.dialog.innerHTML = `
      <div class="modal-inner">
        <div class="modal-top">
          <div class="modal-title-box">
            <span class="status-badge" id="modal-dialog-badge">INFO</span>
            <h3 id="modal-dialog-title">Details</h3>
          </div>
          <button class="modal-close-icon" type="button" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-content-body" id="modal-dialog-body">
          <!-- Dynamic body injected here -->
        </div>
        <div class="modal-bottom split">
          <div id="modal-bottom-actions"></div>
          <button class="btn btn-sm modal-bottom-close-btn" type="button">Close</button>
        </div>
      </div>
    `;
		document.body.appendChild(this.dialog);
	}

	open({ title, badge = "INFO", badgeClass = "", bodyHtml, actionsHtml = "" }) {
		const titleEl = this.dialog.querySelector("#modal-dialog-title");
		const badgeEl = this.dialog.querySelector("#modal-dialog-badge");
		const bodyEl = this.dialog.querySelector("#modal-dialog-body");
		const actionsEl = this.dialog.querySelector("#modal-bottom-actions");

		if (titleEl) titleEl.textContent = title;
		if (badgeEl) {
			badgeEl.textContent = badge;
			badgeEl.className = `status-badge ${badgeClass}`.trim();
		}
		if (bodyEl) bodyEl.innerHTML = bodyHtml;
		if (actionsEl) actionsEl.innerHTML = actionsHtml;

		if (typeof this.dialog.showModal === "function") {
			this.dialog.showModal();
		} else {
			this.dialog.setAttribute("open", "");
		}
	}

	close() {
		if (typeof this.dialog.close === "function") {
			this.dialog.close();
		} else {
			this.dialog.removeAttribute("open");
		}
	}
}

// Global singleton instance
export const modalDialog = new ModalDialog();
