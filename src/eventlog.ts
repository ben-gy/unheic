// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * eventlog.ts — a small live event trail rendered into a collapsible drawer.
 * The rest of the app calls `emit()`; the drawer subscribes and renders rows
 * with timestamps, levels and optional structured metadata.
 */

export type EventLevel = 'info' | 'ok' | 'warn' | 'err';

export interface LogEvent {
  ts: number;
  level: EventLevel;
  msg: string;
  meta?: Record<string, string | number>;
}

const MAX_EVENTS = 500;

let events: LogEvent[] = [];
let listeners: Array<(e: LogEvent) => void> = [];
let listEl: HTMLElement | null = null;
let countEl: HTMLElement | null = null;
let autoScroll = true;

export function emit(level: EventLevel, msg: string, meta?: Record<string, string | number>): void {
  const e: LogEvent = { ts: Date.now(), level, msg, meta };
  events.push(e);
  if (events.length > MAX_EVENTS) {
    events.shift();
    if (listEl) listEl.querySelector('.event')?.remove();
  }
  for (const l of listeners) l(e);
}

export function clearLog(): void {
  events = [];
  if (listEl) listEl.innerHTML = '';
  if (countEl) countEl.textContent = '0';
}

export function mountEventDrawer(container: HTMLElement): void {
  container.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'drawer-head';
  head.innerHTML = `
    <span class="drawer-title">Activity</span>
    <span class="drawer-controls">
      <span class="count"><strong id="ev-count">0</strong> events</span>
      <button type="button" class="drawer-clear" id="ev-clear">clear</button>
    </span>`;
  container.appendChild(head);

  const list = document.createElement('div');
  list.className = 'drawer-list';
  list.setAttribute('role', 'log');
  list.setAttribute('aria-live', 'polite');
  container.appendChild(list);

  listEl = list;
  countEl = container.querySelector('#ev-count');
  container.querySelector('#ev-clear')?.addEventListener('click', () => clearLog());

  list.addEventListener('scroll', () => {
    autoScroll = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
  });

  for (const e of events) appendEvent(e, false);

  const onEvent = (e: LogEvent) => appendEvent(e);
  listeners.push(onEvent);
}

function appendEvent(e: LogEvent, scroll = true): void {
  if (!listEl) return;
  const row = document.createElement('div');
  row.className = 'event';
  row.dataset.level = e.level;

  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = formatTs(e.ts);

  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = e.msg;

  row.append(ts, msg);
  listEl.appendChild(row);
  if (countEl) countEl.textContent = String(events.length);
  if (scroll && autoScroll) listEl.scrollTop = listEl.scrollHeight;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
