'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { DEMO_STORAGE_KEY } from './data.ts';
import type { UserFields } from './data.ts';
import { todayISO } from './dates.ts';
import { buildViews, createInitialState, describeOutcome, saveUserFields as applyUserFields, simulateRefresh } from './tracking.ts';
import type { TrackerState } from './tracking.ts';

export type Notice = { id: number; tone: 'success' | 'error'; text: string };
type Snapshot = { tracker: TrackerState; refreshing: boolean; notice?: Notice };

const REFRESH_DELAY_MS = 900;
const listeners = new Set<() => void>();
let snapshot: Snapshot | undefined;
let serverSnapshot: Snapshot | undefined;

function load(): TrackerState | undefined {
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : undefined;
    if (parsed?.version === 1 && parsed.records && parsed.userFields && Array.isArray(parsed.trackedIds)) return parsed as TrackerState;
  } catch { /* fall back to the demo data */ }
  return undefined;
}

function getSnapshot(): Snapshot { return snapshot ??= { tracker: load() ?? createInitialState(), refreshing: false }; }
function getServerSnapshot(): Snapshot { return serverSnapshot ??= { tracker: createInitialState(), refreshing: false }; }

function update(next: Snapshot, persist = true) {
  snapshot = next;
  if (persist) { try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next.tracker)); } catch { /* storage unavailable: keep session state only */ } }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key !== DEMO_STORAGE_KEY) return; const tracker = load(); if (tracker) update({ ...getSnapshot(), tracker }, false); };
  listeners.add(listener); window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

async function refresh() {
  if (getSnapshot().refreshing) return;
  update({ ...getSnapshot(), refreshing: true, notice: undefined }, false);
  await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS));
  // Re-read after the delay so edits saved while the "request" was in flight are kept.
  const current = getSnapshot();
  const { state, outcome } = simulateRefresh(current.tracker);
  update({ tracker: state, refreshing: false, notice: { id: Date.now(), tone: outcome.ok ? 'success' : 'error', text: describeOutcome(outcome, state) } });
}

function saveUserFields(id: string, patch: UserFields) { const current = getSnapshot(); update({ ...current, tracker: applyUserFields(current.tracker, id, patch) }); }
function dismissNotice() { update({ ...getSnapshot(), notice: undefined }, false); }

const subscribeNever = () => () => {};
export function useContainerTracker() {
  const { tracker, refreshing, notice } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // False during server render and hydration, when the snapshot is the demo seed rather than the saved session.
  const ready = useSyncExternalStore(subscribeNever, () => true, () => false);
  const today = todayISO();
  const containers = useMemo(() => buildViews(tracker, today), [tracker, today]);
  return { ready, containers, tracker, refreshing, notice, refresh, saveUserFields, dismissNotice };
}
