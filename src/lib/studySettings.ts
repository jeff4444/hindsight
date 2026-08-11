'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_STUDY_SETTINGS,
  clampPeriod,
  type StudySettings,
} from './toolOverlays';

/**
 * The player's indicator periods, remembered between rounds.
 *
 * A period is a preference, not round state. Someone who reads a 21-day RSI reads a 21-day RSI on
 * every chart, and making them set it again on each new one would be the kind of forgetting that
 * reads as a bug. So this persists, alongside the motion preference, under its own key.
 *
 * Deliberately *not* persisted: which studies are switched on. Those are cleared per round with the
 * drawings, because a chart is a fresh problem — and because carrying a Sandbox study into a Naked
 * round would silently hand a rated rung an affordance its ruleset removed.
 *
 * A module store with `useSyncExternalStore` rather than component state, for the same reason
 * `lib/motion.ts` is one: two panels reading the same preference must never disagree about it, and
 * the value has to survive the panel unmounting when the dialog closes.
 */

const KEY = 'hs-studies';

let snapshot: StudySettings = DEFAULT_STUDY_SETTINGS;
let initialised = false;
const listeners = new Set<() => void>();

/** Only ever widen a stored object into a valid one — a bad key must not brick the toolbox. */
function parse(raw: string | null): StudySettings {
  if (!raw) return DEFAULT_STUDY_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<StudySettings>;
    const ma = Array.isArray(value.ma) && value.ma.length === 3 ? value.ma : DEFAULT_STUDY_SETTINGS.ma;
    return {
      ma: [clampPeriod(ma[0]), clampPeriod(ma[1]), clampPeriod(ma[2])],
      bollinger: clampPeriod(value.bollinger ?? DEFAULT_STUDY_SETTINGS.bollinger),
      keltner: clampPeriod(value.keltner ?? DEFAULT_STUDY_SETTINGS.keltner),
      donchian: clampPeriod(value.donchian ?? DEFAULT_STUDY_SETTINGS.donchian),
      rsi: clampPeriod(value.rsi ?? DEFAULT_STUDY_SETTINGS.rsi),
    };
  } catch {
    return DEFAULT_STUDY_SETTINGS;
  }
}

/**
 * Read once, on first use from the browser.
 *
 * The same shape `lib/motion.ts` needed: a store read at module scope would run on the server,
 * and one read only inside `subscribe` leaves the first `getSnapshot` returning defaults forever
 * if nothing has subscribed yet.
 */
function ensureInitialised(): void {
  if (initialised || typeof window === 'undefined') return;
  snapshot = parse(window.localStorage.getItem(KEY));
  initialised = true;
}

function publish(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  ensureInitialised();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StudySettings {
  ensureInitialised();
  return snapshot;
}

/** The server has no localStorage, and the published defaults are the honest first paint. */
function getServerSnapshot(): StudySettings {
  return DEFAULT_STUDY_SETTINGS;
}

export function useStudySettings(): [StudySettings, (next: Partial<StudySettings>) => void, () => void] {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((next: Partial<StudySettings>) => {
    snapshot = { ...snapshot, ...next };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(snapshot));
    } catch {
      // A private-mode browser that refuses storage still gets a working session; it just forgets.
    }
    publish();
  }, []);

  const reset = useCallback(() => {
    snapshot = DEFAULT_STUDY_SETTINGS;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* see above */
    }
    publish();
  }, []);

  return [settings, update, reset];
}
