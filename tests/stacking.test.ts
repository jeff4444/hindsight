import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isStage } from '@/components/shell/AppShell';

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
 * The ancestor chain, in order: everything between `<body>` and the terminal's order-line layer.
 * A session page renders inside the app layout and its template; `AppShell` sits between them too
 * but returns its children bare on a stage, which the test below pins rather than scanning the
 * shell's own chrome. The template already declines its entrance fade on a stage for this reason.
 *
 * `DrawLayer`, `OrderLinesOverlay` and the ticket are deliberately absent: each is a sibling of the
 * line layer or lives outside the frame entirely, and guarding them would ban the transforms their
 * own animations are built out of.
 */
const GUARDED = [
  'src/app/layout.tsx',
  'src/app/(app)/layout.tsx',
  'src/app/(app)/template.tsx',
  'src/components/trading/LiveTerminal.tsx',
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

describe('the order lines stay grabbable', () => {
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
    // If the chain ever grows an element, this list has to grow with it. Stated as a test so that
    // adding a wrapper around TerminalShell is a decision rather than an accident.
    expect(GUARDED).toHaveLength(5);
  });

  it('the shell steps aside on a round, and only on a round', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/AppShell.tsx'), 'utf8');
    expect(shell).toMatch(/if \(isStage\(pathname\)\) return <>\{children\}<\/>;/);
    expect(isStage('/play/abc')).toBe(true);
    expect(isStage('/play/new')).toBe(true);
    expect(isStage('/play')).toBe(false);
    expect(isStage('/duel/abc')).toBe(false);
    expect(isStage('/schools')).toBe(false);
  });
});

describe('the in-frame layers stay out of the way of the drag', () => {
  /**
   * The other half of the rule. A layer inside the frame may transform freely, but if it lies
   * across the chart *while the order lines are live* and takes pointer events, it cuts a dead
   * stripe through every drag target. So the full-bleed layers that do take the pointer — the
   * closing card with its buttons and the loading veil — may only exist once there is nothing to
   * drag: after the bell, or before the tape has loaded.
   */
  const shell = readFileSync(join(process.cwd(), 'src/components/trading/TerminalShell.tsx'), 'utf8');
  const overlay = readFileSync(join(process.cwd(), 'src/components/trading/OrderLinesOverlay.tsx'), 'utf8');

  it('the line layer is the canvas, rectangle for rectangle', () => {
    // OrderLinesOverlay's drag maths reads its layer's rect and hands the offset straight to the
    // chart's price scale, so the two boxes must stay the same one.
    expect(shell).toMatch(/<TerminalChart[^>]*className="absolute inset-0"/);
    expect(overlay).toMatch(/className="pointer-events-none absolute inset-0 z-10/);
  });

  it('every full-bleed layer that takes the pointer appears only when nothing can be dragged', () => {
    const lines = shell.split('\n');
    const offenders: string[] = [];
    for (const { text, line } of literals(shell)) {
      if (!/(?:^|\s)absolute inset-0 z-\d+/.test(text) || text.includes('pointer-events-none')) continue;
      const guard = lines.slice(Math.max(0, line - 3), line).join('\n');
      if (!/\{closed && |\{!open && /.test(guard)) offenders.push(`TerminalShell.tsx:${line} — "${text.slice(0, 70)}"`);
    }
    expect(offenders).toEqual([]);
  });
});
