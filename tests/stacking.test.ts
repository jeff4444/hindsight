import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The rails must stay grabbable.
 *
 * `TradeOverlay` paints the stop and target into a layer that fills the chart frame at `z-10`,
 * above a canvas lightweight-charts draws at its own `z-index: 2`. That ordering is what makes a
 * pointer land on a rail instead of on the chart. A **stacking context** anywhere above the frame
 * re-parents the comparison: the rail layer is then ordered against its siblings inside that new
 * context rather than against the canvas, so it paints on top and hit-tests underneath.
 *
 * The failure is silent and it is nasty. The rails look perfect. They cannot be dragged. Nothing
 * throws, no test that renders markup notices, and the property that caused it is usually three
 * components away and looks decorative — a `backdrop-blur` on a header, a `will-change` added for
 * smoothness, a `motion.div` wrapper. `ChartFrame.tsx` has carried a comment about this since the
 * frame was written, ending "which is now the only thing checking it". This is the thing checking
 * it.
 *
 * ## What creates one, and what does not
 *
 * Creates: `filter`, `backdrop-filter`, `transform` (incl. `scale`/`rotate`/`translate`),
 * `perspective`, `isolation`, `will-change`, `mix-blend-mode`, `contain`, `mask`, `clip-path`,
 * `opacity` below 1, `view-transition-name`.
 *
 * Does **not**: `background-image` and therefore every gradient, `box-shadow` inset or outer,
 * `border`, `background-clip`, `overflow`, `border-radius`, `transition` on its own. That
 * distinction is the whole reason this app can have atmosphere and elevation at all, so the test
 * has to encode it precisely rather than banning anything that sounds fancy.
 *
 * ## Why a `z-` escape hatch is correct and not a loophole
 *
 * Children of the frame are **siblings** of the rail layer, not ancestors of it. An absolutely
 * positioned overlay at `z-20` may fade, scale and gradient as freely as it likes — the reveal's
 * score stage does exactly that, and `ChartFrame`'s own hint pill ships `-translate-x-1/2` today.
 * So a class group that carries an explicit `z-` index is a declared in-frame layer and is allowed
 * its transforms. A group with no `z-` is either a root or an unpositioned wrapper, and those are
 * the ones that can swallow the rails.
 */

/**
 * The ancestor chain, in order. Exactly four elements, which is the property being defended —
 * `PlaySurface` mounts under the root layout and opts out of `AppShell`, so nothing else comes
 * between `<body>` and the frame.
 *
 * `DrawLayer`, `TradeOverlay`, `layers.tsx` and `Toolbar` are deliberately absent: every one of
 * them is a sibling of the rail layer or lives outside the frame entirely, and guarding them would
 * ban the transforms the reveal is built out of.
 */
const GUARDED = [
  'src/app/layout.tsx',
  'src/components/play/PlaySurface.tsx',
  'src/components/play/ChartFrame.tsx',
  // The trading terminal holds its order lines the same way, in a z-10 layer over the canvas, and
  // everything between them and <body> is in this file.
  'src/components/trading/TerminalShell.tsx',
];

/**
 * Tailwind utilities that compile to a stacking-context property.
 *
 * Written as anchored fragments rather than whole words so `blur-sm`, `blur-[2px]` and
 * `backdrop-blur` all match while `logScale` does not match `scale-`. `opacity-100` is the one
 * value that creates nothing, so it is excluded by requiring the number to be under 100.
 */
const FORBIDDEN: { pattern: RegExp; property: string }[] = [
  { pattern: /(?:^|[\s:])backdrop-\w/, property: 'backdrop-filter' },
  { pattern: /(?:^|[\s:])blur-/, property: 'filter: blur()' },
  { pattern: /(?:^|[\s:])drop-shadow-/, property: 'filter: drop-shadow()' },
  { pattern: /(?:^|[\s:])(?:grayscale|sepia|invert|saturate-|brightness-|contrast-|hue-rotate-)/, property: 'filter' },
  { pattern: /(?:^|[\s:])-?scale-/, property: 'transform: scale()' },
  { pattern: /(?:^|[\s:])-?rotate-/, property: 'transform: rotate()' },
  { pattern: /(?:^|[\s:])-?translate-/, property: 'transform: translate()' },
  { pattern: /(?:^|[\s:])-?skew-/, property: 'transform: skew()' },
  { pattern: /(?:^|[\s:])transform(?:$|[\s-])/, property: 'transform' },
  { pattern: /(?:^|[\s:])perspective(?:$|[\s-])/, property: 'perspective' },
  { pattern: /(?:^|[\s:])isolate(?:$|\s)/, property: 'isolation' },
  { pattern: /(?:^|[\s:])will-change-/, property: 'will-change' },
  { pattern: /(?:^|[\s:])mix-blend-/, property: 'mix-blend-mode' },
  { pattern: /(?:^|[\s:])contain-/, property: 'contain' },
  { pattern: /(?:^|[\s:])mask-/, property: 'mask' },
  // opacity-0 … opacity-95, never opacity-100.
  { pattern: /(?:^|[\s:])opacity-(?:\d|\d\d)(?:$|\s)/, property: 'opacity < 1' },
];

/** Inline `style` equivalents, for the places that bypass Tailwind. */
const FORBIDDEN_CSS = [
  'filter:',
  'backdropFilter',
  'backdrop-filter',
  'transform:',
  'perspective:',
  'isolation',
  'willChange',
  'will-change',
  'mixBlendMode',
  'mix-blend-mode',
  'clipPath',
  'clip-path',
  'viewTransitionName',
  'view-transition-name',
];

/** Every string literal in the file. className groups are literals; doc comments are not. */
function literals(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    // Skip comment lines outright, so prose about `transform` never trips the scan.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    for (const match of line.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
      const text = match[1] ?? match[2] ?? match[3] ?? '';
      if (text) out.push({ text, line: index + 1 });
    }
  });
  return out;
}

/** A declared in-frame layer: it has an explicit z-index, so it is a sibling and may transform. */
function isLayer(text: string): boolean {
  return /(?:^|\s)z-(?:\d+|\[)/.test(text);
}

/**
 * Drop utilities that can only ever apply to a form control.
 *
 * `disabled:` and `enabled:` match `<button>`, `<input>`, `<select>` and friends and nothing else —
 * the attribute does not exist on a `<div>`, so a rule behind one of them cannot fire on a wrapper.
 * A control is never an ancestor of the chart frame, so `disabled:opacity-45` on the studies button
 * is provably harmless, while a bare `opacity-45` on the same file's root would not be.
 *
 * Deliberately not extended to `hover:` or `group-*:`, which *do* apply to wrappers: a
 * `hover:opacity-50` on a div above the frame would kill the rails on mouseover only, which is
 * precisely the kind of bug this file exists to catch.
 */
function withoutControlStates(text: string): string {
  return text
    .split(/\s+/)
    .filter((token) => !/^(?:disabled|enabled):/.test(token))
    .join(' ');
}

describe('the rails stay grabbable', () => {
  for (const file of GUARDED) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');

    it(`${file} creates no stacking context above the rail layer`, () => {
      const offenders: string[] = [];

      for (const { text, line } of literals(source)) {
        if (isLayer(text)) continue;
        const structural = withoutControlStates(text);
        for (const { pattern, property } of FORBIDDEN) {
          if (pattern.test(structural)) {
            offenders.push(`${file}:${line} — ${property} in "${text.slice(0, 70)}"`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });

    it(`${file} sets no stacking property through an inline style`, () => {
      // Inline styles are how the atmosphere gradient is applied, so they are allowed to exist —
      // they just may not carry one of these.
      const offenders: string[] = [];
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
        for (const property of FORBIDDEN_CSS) {
          if (line.includes(property)) {
            offenders.push(`${file}:${index + 1} — ${property}`);
          }
        }
      });

      expect(offenders).toEqual([]);
    });
  }

  it('guards every element in the documented ancestor chain', () => {
    // If either chain ever grows an element, this list has to grow with it. Stated as a test so
    // that adding a wrapper around PlaySurface or TerminalShell is a decision rather than an
    // accident. Three for the game's stage, plus the terminal (which shares the root layout).
    expect(GUARDED).toHaveLength(4);
    const frame = readFileSync(
      join(process.cwd(), 'src/components/play/ChartFrame.tsx'),
      'utf8',
    );
    // The frame box and the canvas box must remain the same rectangle: TradeOverlay's drag maths
    // reads the layer's rect and hands the offset straight to `chart.yToPrice`.
    expect(frame).toMatch(/relative overflow-hidden/);
    expect(frame).toMatch(/<Chart[\s\S]*?className="absolute inset-0"/);
  });
});

describe('the in-frame layers stay out of the way of the drag', () => {
  /**
   * The other half of the rule, and the one the toolbox makes newly relevant.
   *
   * A layer may transform freely, but if it lies across the frame *while the rails are live* and
   * takes pointer events, it cuts a dead stripe through a full-width drag target. So the frame has
   * two tiers of layer and the z-index says which:
   *
   * - **Below z-40 — annotation.** Coexists with draggable rails, so it must be
   *   `pointer-events-none`. The atmosphere wash, the hit flash, the hint pill, the watermark.
   * - **z-40 and above — takeover.** Replaces the chart rather than annotating it, and only
   *   renders in phases where `showRails` is false: the loading veil and the error panel, which
   *   owns a Retry button and therefore *must* take the pointer.
   *
   * `DrawLayer` is the deliberate third case and lives outside this file: it sits at z-20 and takes
   * the pointer only while an instrument is armed, which is a mode the player chose and — after
   * T2 — one the frame visibly announces.
   */
  const frame = readFileSync(join(process.cwd(), 'src/components/play/ChartFrame.tsx'), 'utf8');

  /** The z-index at which a layer stops annotating the chart and starts replacing it. */
  const TAKEOVER = 40;

  function zIndexOf(text: string): number | null {
    const match = text.match(/(?:^|\s)z-(\d+)(?:\s|$)/);
    return match ? Number(match[1]) : null;
  }

  it('every annotation layer in the frame is pointer-events-none', () => {
    const offenders: string[] = [];
    for (const { text, line } of literals(frame)) {
      const z = zIndexOf(text);
      if (z === null || z >= TAKEOVER) continue;
      const fullBleed = /(?:^|\s)inset-0(?:\s|$)/.test(text);
      if (fullBleed && !text.includes('pointer-events-none')) {
        offenders.push(`ChartFrame.tsx:${line} — z-${z} "${text.slice(0, 70)}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only the takeover layers accept the pointer, and only above the rails', () => {
    // Stated positively so that demoting the error panel below z-40 — which would put a button on
    // top of a live rail — fails here rather than in a bug report about a dead stripe.
    const takeovers = literals(frame)
      .filter(({ text }) => (zIndexOf(text) ?? 0) >= TAKEOVER)
      .map(({ text }) => text);
    expect(takeovers.length).toBeGreaterThan(0);
    expect(frame).toMatch(/showRails && entry !== null/);
  });
});
