// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * convert.ts — main-thread controller that owns the worker and drives a
 * sequential conversion queue, emitting item + overall progress to the UI.
 */

import { sniffImageKind, toOutputName, FORMATS, type OutputFormat } from './heic';
import type { ConversionItem, WorkerMessage } from './types';

export interface ConverterHooks {
  onItem: (item: ConversionItem) => void;
  onOverall: (done: number, total: number, bytesPerSec: number) => void;
  onLog: (level: 'info' | 'ok' | 'warn' | 'err', msg: string, meta?: Record<string, string | number>) => void;
  onIdle: () => void;
}

export interface ConvertSettings {
  format: OutputFormat;
  quality: number;
}

let nextId = 1;

export class Converter {
  private worker: Worker;
  private hooks: ConverterHooks;
  private queue: ConversionItem[] = [];
  private byId = new Map<number, ConversionItem>();
  private active: ConversionItem | null = null;
  private settings: ConvertSettings;
  private ready = false;
  private pending: (() => void)[] = [];

  // throughput accounting
  private total = 0;
  private done = 0;
  private bytesDone = 0;
  private startedAt = 0;

  constructor(hooks: ConverterHooks, settings: ConvertSettings) {
    this.hooks = hooks;
    this.settings = settings;
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (ev: MessageEvent<WorkerMessage>) => this.onMessage(ev.data));
    this.worker.addEventListener('error', (ev) => {
      this.hooks.onLog('err', `Worker crashed: ${ev.message}`);
      if (this.active) this.fail(this.active, 'The converter worker crashed. Try reloading.');
    });
  }

  setSettings(s: ConvertSettings): void {
    this.settings = s;
  }

  /** Ingest a list of files; non-HEIC files are rejected with a log entry. */
  async add(files: File[]): Promise<void> {
    let accepted = 0;
    for (const file of files) {
      let buf: ArrayBuffer;
      try {
        buf = await file.arrayBuffer();
      } catch {
        this.hooks.onLog('err', `Could not read ${file.name}.`);
        continue;
      }
      const kind = sniffImageKind(buf);
      if (!kind) {
        this.hooks.onLog('warn', `Skipped ${file.name} — not a HEIC/HEIF image.`, { name: file.name });
        continue;
      }
      const item: ConversionItem = {
        id: nextId++,
        name: file.name || 'image.heic',
        inputSize: file.size || buf.byteLength,
        status: 'queued',
      };
      this.byId.set(item.id, item);
      this.queue.push(item);
      this.total += 1;
      accepted += 1;
      this.hooks.onItem(item);
      this.hooks.onLog('info', `Queued ${item.name}`, { kind, size: item.inputSize });
      // stash the buffer on a side map keyed by id
      this.buffers.set(item.id, buf);
    }
    if (accepted > 0) {
      if (this.startedAt === 0) this.startedAt = performance.now();
      this.emitOverall();
      this.pump();
    }
  }

  private buffers = new Map<number, ArrayBuffer>();

  private pump(): void {
    if (this.active) return;
    const next = this.queue.shift();
    if (!next) {
      this.hooks.onIdle();
      return;
    }
    this.active = next;
    const buf = this.buffers.get(next.id)!;
    const send = () => {
      next.status = 'decoding';
      this.hooks.onItem(next);
      this.worker.postMessage(
        {
          type: 'convert',
          id: next.id,
          name: toOutputName(next.name, FORMATS[this.settings.format].ext),
          format: this.settings.format,
          quality: this.settings.quality,
          buffer: buf,
        },
        [buf],
      );
      this.buffers.delete(next.id);
    };
    if (this.ready) send();
    else this.pending.push(send);
  }

  private onMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case 'ready': {
        this.ready = true;
        for (const fn of this.pending.splice(0)) fn();
        break;
      }
      case 'progress': {
        const item = this.byId.get(msg.id);
        if (!item) return;
        item.status = msg.phase === 'decode' ? 'decoding' : 'encoding';
        this.hooks.onItem(item);
        break;
      }
      case 'done': {
        const item = this.byId.get(msg.id);
        if (!item) return;
        item.status = 'done';
        item.blob = msg.blob;
        item.outName = msg.outName;
        item.outputSize = msg.blob.size;
        item.width = msg.width;
        item.height = msg.height;
        item.previewUrl = URL.createObjectURL(msg.blob);
        this.done += 1;
        this.bytesDone += item.inputSize;
        this.hooks.onItem(item);
        this.hooks.onLog('ok', `Converted ${item.name} → ${item.outName}`, {
          out: item.outName ?? '',
          size: item.outputSize ?? 0,
        });
        this.finishActive();
        break;
      }
      case 'error': {
        const item = this.byId.get(msg.id);
        if (!item) return;
        this.fail(item, msg.message);
        break;
      }
    }
  }

  private fail(item: ConversionItem, message: string): void {
    item.status = 'error';
    item.error = message;
    this.done += 1;
    this.hooks.onItem(item);
    this.hooks.onLog('err', `Failed ${item.name}: ${message}`, { name: item.name });
    this.finishActive();
  }

  private finishActive(): void {
    this.active = null;
    this.emitOverall();
    this.pump();
  }

  private emitOverall(): void {
    const elapsed = (performance.now() - this.startedAt) / 1000;
    const bps = elapsed > 0 ? this.bytesDone / elapsed : 0;
    this.hooks.onOverall(this.done, this.total, bps);
  }

  /** All finished items (done or error), in insertion order. */
  items(): ConversionItem[] {
    return [...this.byId.values()];
  }

  successful(): ConversionItem[] {
    return this.items().filter((i) => i.status === 'done' && i.blob);
  }

  isBusy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  reset(): void {
    for (const item of this.byId.values()) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    this.queue = [];
    this.byId.clear();
    this.buffers.clear();
    this.active = null;
    this.total = 0;
    this.done = 0;
    this.bytesDone = 0;
    this.startedAt = 0;
  }

  destroy(): void {
    this.reset();
    this.worker.terminate();
  }
}
