'use client';

import { PALETTE_KEY, THEME_KEY } from './theme-script';

/**
 * Theme and palette preferences, as one store.
 *
 * Same shape as `motion.ts`, for the same reasons. `<html data-theme>` always carries the
 * *resolved* theme — `light` or `dark`, never `system` — so CSS needs no media query and the chart
 * can read one attribute. The stored preference is what may be `system`, and the blocking script
 * in layout.tsx resolves it before first paint. While the preference is `system` this module keeps
 * the attribute in step with the OS.
 *
 * `data-palette="cb"` is the colour-blind palette: blue for long, orange for short.
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export type Palette = 'standard' | 'cb';

export interface ThemeSnapshot {
  pref: ThemePref;
  theme: Theme;
  palette: Palette;
}


type Listener = () => void;
const listeners = new Set<Listener>();

let snapshot: ThemeSnapshot = { pref: 'system', theme: 'dark', palette: 'standard' };
let started = false;
let initialised = false;

function storedPref(): ThemePref {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function osTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function read(): ThemeSnapshot {
  const root = document.documentElement;
  const pref = storedPref();
  const theme: Theme = root.dataset.theme === 'light' ? 'light' : 'dark';
  const palette: Palette = root.dataset.palette === 'cb' ? 'cb' : 'standard';
  return { pref, theme, palette };
}

function ensureInitialised() {
  if (initialised || typeof document === 'undefined') return;
  snapshot = read();
  initialised = true;
}

function publish() {
  const next = read();
  if (next.pref === snapshot.pref && next.theme === snapshot.theme && next.palette === snapshot.palette) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  ensureInitialised();

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (storedPref() === 'system') document.documentElement.dataset.theme = osTheme();
  });
  new MutationObserver(publish).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-palette'],
  });
}

export function subscribeTheme(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThemeSnapshot(): ThemeSnapshot {
  ensureInitialised();
  return snapshot;
}

export const SERVER_THEME: ThemeSnapshot = { pref: 'system', theme: 'dark', palette: 'standard' };

export function setThemePref(next: ThemePref): void {
  const root = document.documentElement;
  try {
    if (next === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // Private windows can refuse storage; the attribute still changes for this page.
  }
  root.dataset.theme = next === 'system' ? osTheme() : next;
  publish();
}

export function setPalette(next: Palette): void {
  const root = document.documentElement;
  try {
    if (next === 'cb') localStorage.setItem(PALETTE_KEY, 'cb');
    else localStorage.removeItem(PALETTE_KEY);
  } catch {
    // As above.
  }
  if (next === 'cb') root.dataset.palette = 'cb';
  else delete root.dataset.palette;
  publish();
}
