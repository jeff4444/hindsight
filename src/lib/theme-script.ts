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
 * Resolves the stored preference to `light` or `dark` and writes it to `<html data-theme>` before
 * the first paint, along with the colour-blind palette flag. Paper is the product's face, so it is
 * what a visitor sees until they choose otherwise; `system` is a choice, stored like the others,
 * and only then does the OS setting decide.
 */
export const THEME_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t!=='dark')t='light';d.dataset.theme=t;if(localStorage.getItem('${PALETTE_KEY}')==='cb')d.dataset.palette='cb'}catch(e){document.documentElement.dataset.theme='light'}`;
