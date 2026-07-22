// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * ui.ts — modal management, toast notifications and small DOM helpers.
 * Modals are defined as <template> elements and lazily cloned into an overlay.
 */

let overlay: HTMLElement | null = null;

export function openModal(templateId: string): void {
  const tmpl = document.getElementById(templateId) as HTMLTemplateElement | null;
  if (!tmpl) return;
  closeModal();

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  const dialog = document.createElement('div');
  dialog.className = 'modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.appendChild(tmpl.content.cloneNode(true));

  const close = document.createElement('button');
  close.className = 'modal-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = '&times;';
  close.addEventListener('click', () => closeModal());
  dialog.appendChild(close);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  close.focus();
}

export function closeModal(): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
    document.body.classList.remove('modal-open');
  }
}

export function isModalOpen(): boolean {
  return overlay !== null;
}

let toastTimer: number | undefined;

export function toast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove('show'), 2600);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}
