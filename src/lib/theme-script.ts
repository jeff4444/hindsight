/**
 * The theme's storage keys and its pre-paint script.
 *
 * Not in `theme.ts`, which is a client module: a server component that imports a constant from a
 * `'use client'` file receives a client reference, not the string, so layout.tsx could never
 * inline it. This file has no directive and is safe on both sides.
 */

export const THEME_KEY = 'hs-theme';
export const PALETTE_KEY = 'hs-palette';

/**
 * Resolves the stored preference (or the OS setting) to `light` or `dark` and writes it to
 * `<html data-theme>` before the first paint, along with the colour-blind palette flag.
 */
export const THEME_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.dataset.theme=t;if(localStorage.getItem('${PALETTE_KEY}')==='cb')d.dataset.palette='cb'}catch(e){document.documentElement.dataset.theme='dark'}`;
