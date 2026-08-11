'use client';

/**
 * The motion preference, as one module.
 *
 * `data-motion` on <html> is the single source of truth. globals.css keys off it, `useReducedMotion`
 * reads it, the blocking script in layout.tsx seeds it before first paint, and the settings control
 * writes it. Before this, the first three existed and the fourth did not, so the whole feature was
 * plumbed end to end and completely inert.
 *
 * Everything here is a plain function rather than a hook: they touch `document` and `localStorage`
 * directly, which is exactly the kind of write that does not belong inside a component body.
 */

export type MotionPref = 'system' | 'full' | 'reduced';

const KEY = 'hs-motion';

type Listener = () => void;
const listeners = new Set<Listener>();

let snapshot: { pref: MotionPref; reduced: boolean } = { pref: 'system', reduced: false };
let started = false;
let initialised = false;

/**
 * Fill the snapshot from the DOM on first read.
 *
 * Separate from `start()` on purpose. React calls `getSnapshot()` during render and `subscribe()`
 * only afterwards, so a store that first learns the truth inside `subscribe` renders once with the
 * server default and never corrects itself — `start()` assigns the real value but has no listeners
 * to notify yet, so nothing schedules a re-render. That is exactly what happened: the settings
 * control reported "System" on a page whose <html> already carried `data-motion="reduced"`.
 *
 * Caching matters as much as the read: `useSyncExternalStore` compares snapshots by identity, so
 * returning a fresh object per call would loop forever.
 */
function ensureInitialised() {
  if (initialised || typeof document === 'undefined') return;
  snapshot = read();
  initialised = true;
}

function read(): { pref: MotionPref; reduced: boolean } {
  const explicit = document.documentElement.dataset.motion;
  const pref: MotionPref = explicit === 'reduced' || explicit === 'full' ? explicit : 'system';
  const reduced =
    pref === 'reduced' ||
    (pref === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return { pref, reduced };
}

function publish() {
  const next = read();
  if (next.pref === snapshot.pref && next.reduced === snapshot.reduced) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  ensureInitialised();

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', publish);
  // Two sources, one store. Watching the attribute is what the old implementation was missing:
  // it subscribed to the media query only, so changing the setting updated the stylesheet
  // instantly and left every React consumer on the previous value.
  new MutationObserver(publish).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  });
}

export function subscribeMotion(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMotionSnapshot(): { pref: MotionPref; reduced: boolean } {
  ensureInitialised();
  return snapshot;
}

/**
 * The server cannot know the preference, and guessing "reduced" would ship a first paint that then
 * animates. Guessing "full" only ever costs one entrance.
 */
export const SERVER_MOTION: { pref: MotionPref; reduced: boolean } = { pref: 'system', reduced: false };

export function setMotionPref(next: MotionPref): void {
  const root = document.documentElement;
  if (next === 'system') {
    root.removeAttribute('data-motion');
    localStorage.removeItem(KEY);
  } else {
    root.setAttribute('data-motion', next);
    localStorage.setItem(KEY, next);
  }
  publish();
}
