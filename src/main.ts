// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * main.ts — bootstraps unHEIC: wires the drop zone, format/quality controls,
 * results gallery, output delivery and modals to the worker-backed Converter.
 * Owns no heavy logic — decoding/encoding lives in the worker.
 */

import { Converter, type ConvertSettings } from './convert';
import {
  DEFAULT_FORMAT,
  DEFAULT_QUALITY,
  FORMATS,
  formatBytes,
  isOutputFormat,
  sizeDeltaPct,
  type OutputFormat,
} from './heic';
import { emit, mountEventDrawer } from './eventlog';
import { initGlossary, term } from './glossary';
import { closeModal, el, isModalOpen, openModal, toast } from './ui';
import type { ConversionItem } from './types';

const LS_FORMAT = 'unheic:format';
const LS_QUALITY = 'unheic:quality';

// ─────────────────────────── settings (persisted) ───────────────────────────

function loadSettings(): ConvertSettings {
  let format: OutputFormat = DEFAULT_FORMAT;
  const stored = localStorage.getItem(LS_FORMAT);
  if (stored && isOutputFormat(stored)) format = stored;

  let quality = DEFAULT_QUALITY;
  const q = Number(localStorage.getItem(LS_QUALITY));
  if (Number.isFinite(q) && q >= 0.3 && q <= 1) quality = q;

  return { format, quality };
}

const settings = loadSettings();

// ─────────────────────────────── DOM scaffold ───────────────────────────────

const app = document.getElementById('app')!;
const drawer = document.getElementById('event-drawer')!;
const sbDot = document.getElementById('sb-dot')!;
const sbStatus = document.getElementById('sb-status')!;
const sbThroughput = document.getElementById('sb-throughput')!;

app.innerHTML = `
  <section class="converter">
    <div class="controls">
      <div class="control-group">
        <span class="control-label">Convert to</span>
        <div class="seg" role="radiogroup" aria-label="Output format">
          ${(Object.keys(FORMATS) as OutputFormat[])
            .map(
              (f) =>
                `<button type="button" class="seg-btn" role="radio" data-format="${f}"
                   aria-checked="${f === settings.format}">${FORMATS[f].label}</button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="control-group quality" id="quality-group">
        <label class="control-label" for="quality">Quality</label>
        <input type="range" id="quality" min="0.3" max="1" step="0.01" value="${settings.quality}" />
        <span class="quality-val" id="quality-val">${Math.round(settings.quality * 100)}</span>
      </div>
    </div>

    <div class="dropzone" id="dropzone" tabindex="0" role="button"
         aria-label="Drop HEIC photos here, or click to choose files">
      <svg class="dz-icon" viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
        <path d="M12 15V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor"
              stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" fill="none" stroke="currentColor"
              stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="dz-title">Drop your <span class="glossary-link" data-term="heic" role="button" tabindex="0">HEIC</span> photos</div>
      <div class="dz-sub">or click to browse · paste with ⌘/Ctrl&nbsp;+&nbsp;V</div>
      <div class="dz-formats">Whole camera-roll batches welcome · everything stays on your device</div>
      <input type="file" id="file-input" class="visually-hidden"
             accept=".heic,.heif,.hif,image/heic,image/heif" multiple />
    </div>

    <div class="overall hidden" id="overall" aria-live="polite">
      <div class="overall-bar"><div class="overall-fill" id="overall-fill"></div></div>
      <div class="overall-text" id="overall-text"></div>
    </div>

    <div class="results" id="results" aria-live="polite"></div>

    <div class="batch-actions hidden" id="batch-actions">
      <button type="button" class="btn btn-primary" id="download-all">Download all (ZIP)</button>
      <button type="button" class="btn btn-ghost" id="clear-all">Clear</button>
    </div>

    <p class="privacy-note">
      Runs entirely in your browser with ${term('libheif', 'libheif')} compiled to
      ${term('WebAssembly', 'wasm')}. Your photos never leave your device —
      <button type="button" class="link-btn" data-modal="tmpl-security">read the threat model</button>.
    </p>
  </section>
`;

// ───────────────────────────── element handles ──────────────────────────────

const dropzone = document.getElementById('dropzone') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const results = document.getElementById('results') as HTMLElement;
const overall = document.getElementById('overall') as HTMLElement;
const overallFill = document.getElementById('overall-fill') as HTMLElement;
const overallText = document.getElementById('overall-text') as HTMLElement;
const batchActions = document.getElementById('batch-actions') as HTMLElement;
const qualityGroup = document.getElementById('quality-group') as HTMLElement;
const qualityInput = document.getElementById('quality') as HTMLInputElement;
const qualityVal = document.getElementById('quality-val') as HTMLElement;

// ─────────────────────────────── event log ──────────────────────────────────

mountEventDrawer(drawer);
initGlossary();
emit('info', 'unHEIC ready — drop a HEIC photo to begin. Nothing is uploaded.');

// ──────────────────────────────── converter ─────────────────────────────────

const cards = new Map<number, HTMLElement>();

const converter = new Converter(
  {
    onItem: (item) => renderCard(item),
    onOverall: (done, total, bps) => renderOverall(done, total, bps),
    onLog: (level, msg, meta) => emit(level, msg, meta),
    onIdle: () => {
      setStatus('Ready', 'idle');
      overall.classList.add('hidden');
      sbThroughput.textContent = '';
      updateBatchActions();
    },
  },
  settings,
);

// ─────────────────────────────── rendering ──────────────────────────────────

function setStatus(text: string, state: 'idle' | 'busy' | 'error'): void {
  sbStatus.textContent = text;
  sbDot.dataset.state = state;
}

function renderOverall(done: number, total: number, bps: number): void {
  if (total === 0) {
    overall.classList.add('hidden');
    return;
  }
  overall.classList.remove('hidden');
  const pct = Math.round((done / total) * 100);
  overallFill.style.width = `${pct}%`;
  overallText.textContent = `${done} / ${total} converted`;
  if (done < total) {
    setStatus(`Converting ${done + 1} of ${total}…`, 'busy');
    sbThroughput.textContent = bps > 0 ? `${formatBytes(bps)}/s` : '';
  }
}

function renderCard(item: ConversionItem): void {
  let card = cards.get(item.id);
  if (!card) {
    card = el('article', 'card');
    card.dataset.id = String(item.id);
    cards.set(item.id, card);
    results.appendChild(card);
  }
  card.classList.toggle('error', item.status === 'error');

  const thumb =
    item.status === 'done' && item.previewUrl
      ? `<img src="${item.previewUrl}" alt="Converted ${escapeHtml(item.outName ?? item.name)}" loading="lazy" />`
      : item.status === 'error'
        ? `<div class="card-badge err">!</div>`
        : `<div class="card-spinner" aria-hidden="true"></div>`;

  let meta = '';
  if (item.status === 'done') {
    const delta = sizeDeltaPct(item.inputSize, item.outputSize ?? 0);
    const cls = delta <= 0 ? 'down' : 'up';
    const sign = delta > 0 ? '+' : '';
    meta = `
      <div class="card-meta">
        <span class="dim">${item.width}×${item.height}</span>
        <span>${formatBytes(item.inputSize)} → <strong>${formatBytes(item.outputSize ?? 0)}</strong></span>
        <span class="delta ${cls}">${sign}${delta}%</span>
      </div>`;
  } else if (item.status === 'error') {
    meta = `<div class="card-error">${escapeHtml(item.error ?? 'Conversion failed.')}</div>`;
  } else {
    const label = item.status === 'encoding' ? 'Encoding…' : 'Decoding…';
    meta = `<div class="card-meta"><span class="working">${label}</span></div>`;
  }

  const actions =
    item.status === 'done'
      ? `<div class="card-actions">
           <button type="button" class="card-btn" data-act="download">Download</button>
           <button type="button" class="card-btn" data-act="copy">Copy</button>
           ${canShareFiles() ? `<button type="button" class="card-btn" data-act="share">Share</button>` : ''}
         </div>`
      : '';

  card.innerHTML = `
    <div class="card-thumb">${thumb}</div>
    <div class="card-body">
      <div class="card-name" title="${escapeHtml(item.outName ?? item.name)}">${escapeHtml(item.outName ?? item.name)}</div>
      ${meta}
      ${actions}
    </div>`;

  card.querySelectorAll<HTMLButtonElement>('.card-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleCardAction(btn.dataset.act ?? '', item));
  });
}

function updateBatchActions(): void {
  batchActions.classList.toggle('hidden', converter.successful().length < 2);
}

// ─────────────────────────── output delivery ────────────────────────────────

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canShareFiles(): boolean {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function';
}

async function handleCardAction(act: string, item: ConversionItem): Promise<void> {
  if (!item.blob || !item.outName) return;
  try {
    if (act === 'download') {
      downloadBlob(item.blob, item.outName);
      emit('ok', `Downloaded ${item.outName}`);
    } else if (act === 'copy') {
      if (!('clipboard' in navigator) || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard image copy is not supported in this browser.');
      }
      await navigator.clipboard.write([new ClipboardItem({ [item.blob.type]: item.blob })]);
      toast('Copied to clipboard');
      emit('ok', `Copied ${item.outName} to clipboard`);
    } else if (act === 'share') {
      const file = new File([item.blob], item.outName, { type: item.blob.type });
      if (!navigator.canShare?.({ files: [file] })) {
        throw new Error('Sharing this file is not supported here.');
      }
      await navigator.share({ files: [file], title: item.outName });
      emit('ok', `Shared ${item.outName}`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return; // user cancelled share
    const msg = err instanceof Error ? err.message : 'Action failed.';
    toast(msg, 'err');
    emit('err', `${act} failed: ${msg}`);
  }
}

async function downloadAll(): Promise<void> {
  const done = converter.successful();
  if (done.length === 0) return;
  try {
    setStatus('Packaging ZIP…', 'busy');
    const { zipSync } = await import('fflate');
    const entries: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    for (const item of done) {
      if (!item.blob || !item.outName) continue;
      let name = item.outName;
      let n = 2;
      while (used.has(name)) name = item.outName.replace(/(\.[^.]+)$/, `-${n++}$1`);
      used.add(name);
      entries[name] = new Uint8Array(await item.blob.arrayBuffer());
    }
    // Stored (level 0): images are already compressed; re-zipping wastes CPU.
    const zipped = zipSync(entries, { level: 0 });
    downloadBlob(new Blob([zipped], { type: 'application/zip' }), 'unheic-converted.zip');
    emit('ok', `Packaged ${done.length} images into unheic-converted.zip`);
    toast('ZIP downloaded');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not build the ZIP.';
    toast(msg, 'err');
    emit('err', `ZIP failed: ${msg}`);
  } finally {
    setStatus('Ready', 'idle');
  }
}

// ─────────────────────────────── ingestion ──────────────────────────────────

function ingest(files: FileList | File[] | null | undefined): void {
  if (!files) return;
  const list = Array.from(files);
  if (list.length === 0) return;
  batchActions.classList.remove('hidden');
  void converter.add(list);
}

// drop zone
dropzone.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.glossary-link')) return;
  fileInput.click();
});
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => {
  ingest(fileInput.files);
  fileInput.value = '';
});

for (const evt of ['dragenter', 'dragover'] as const) {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
}
for (const evt of ['dragleave', 'dragend'] as const) {
  dropzone.addEventListener(evt, (e) => {
    if (evt === 'dragleave' && dropzone.contains((e as DragEvent).relatedTarget as Node)) return;
    dropzone.classList.remove('dragging');
  });
}
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragging');
  ingest(e.dataTransfer?.files);
});

// paste anywhere
window.addEventListener('paste', (e) => {
  if (isModalOpen()) return;
  const files: File[] = [];
  for (const it of Array.from(e.clipboardData?.items ?? [])) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    ingest(files);
  }
});

// ─────────────────────────────── controls ───────────────────────────────────

function syncQualityVisibility(): void {
  qualityGroup.classList.toggle('disabled', !FORMATS[settings.format].lossy);
}

document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const fmt = btn.dataset.format;
    if (!fmt || !isOutputFormat(fmt)) return;
    settings.format = fmt;
    localStorage.setItem(LS_FORMAT, fmt);
    document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
      b.setAttribute('aria-checked', String(b === btn));
    });
    converter.setSettings(settings);
    syncQualityVisibility();
    emit('info', `Output format set to ${FORMATS[fmt].label}`);
  });
});

qualityInput.addEventListener('input', () => {
  const q = Number(qualityInput.value);
  settings.quality = q;
  qualityVal.textContent = String(Math.round(q * 100));
  localStorage.setItem(LS_QUALITY, String(q));
  converter.setSettings(settings);
});

syncQualityVisibility();

document.getElementById('download-all')?.addEventListener('click', () => void downloadAll());
document.getElementById('clear-all')?.addEventListener('click', () => {
  for (const card of cards.values()) card.remove();
  cards.clear();
  converter.reset();
  overall.classList.add('hidden');
  batchActions.classList.add('hidden');
  sbThroughput.textContent = '';
  setStatus('Ready', 'idle');
  emit('info', 'Cleared all conversions.');
});

// ──────────────────────────── modals & keys ─────────────────────────────────

document.querySelectorAll<HTMLElement>('[data-modal]').forEach((btn) => {
  btn.addEventListener('click', () => openModal(btn.dataset.modal!));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isModalOpen()) closeModal();
});

// cleanup worker on unload
window.addEventListener('beforeunload', () => converter.destroy());

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
