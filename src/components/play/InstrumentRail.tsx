'use client';

import { useRef } from 'react';
import { TOOLS, grantingTier, type ToolCode } from '@/core/tiers';
import { cx } from '../ui';
import { Tooltip } from '../ui/client';
import { Icon, type IconName } from '../ui/icons';
import type { DrawTool } from './DrawLayer';

/**
 * The instruments.
 *
 * Five modal tools: pick one, draw with it, put it down. That is a different kind of control from
 * an indicator you switch on and leave on, and the toolbar this replaces rendered both through the
 * same chip — its own header comment said the three groups "behave differently and a player should
 * not have to learn which is which by clicking", and then made them identical. So the modality is
 * now carried by the control itself: this is a radio group, the studies are switches, and the chart
 * options live with the other chart furniture in the frame's corner.
 *
 * **Vertical, at `lg` and above.** The stage is `clamp(17rem, 50dvh, 26rem)` on a phone, so
 * vertical space is the scarce resource on this screen and the old wrapping row of fourteen labels
 * spent two or three lines of it. Horizontal space is not scarce — the container runs to 120rem.
 * Below `lg` it becomes a single horizontal strip of icons, which costs one row instead of three
 * because icons do not wrap the way "Donchian Channels" does.
 *
 * The width is fixed per breakpoint and never animates: a ResizeObserver drives the chart's redraw,
 * and a rail that eased open would resize the canvas every frame while it did.
 *
 * ## Locked instruments are shown, not hidden
 *
 * The old toolbar filtered to what the tier granted, so Naked rendered one button and a player had
 * no way to learn that four more existed. `TimeframeControl` already argues the other way — "shown
 * rather than hidden: a player should be able to see what the ruleset took away, which is the whole
 * legibility argument behind the ladder" — and a ladder is exactly what this is. A locked
 * instrument is dimmed, carries a lock, and its tooltip names the rung that grants it.
 *
 * Measure is never locked. §3.1 restricts identity, hindsight and crutches and never restricts risk
 * arithmetic; a ruler reading out in ATR and R is risk arithmetic, and `UNIVERSAL_AFFORDANCES`
 * keeps it out of `tools` for that reason.
 */

/**
 * The glyph for each instrument, and how it is worked.
 *
 * This is the *only* thing the rail declares. Which instruments exist, what they are called and
 * what they do all come from `TOOLS` below, because `kind: 'drawing'` already says which tools are
 * modal pointer instruments and the toolbar this replaces ignored that — it kept a second hardcoded
 * list, so adding a tool meant editing two files that had to agree.
 */
const ICON: Record<string, IconName> = {
  trendline: 'trendline',
  level: 'level',
  channel: 'channel',
  fib: 'fib',
};

/** How each is worked. `TOOLS[].effect` says what a tool *is*; this says what to do with a pointer. */
const HOW: Record<string, string> = {
  trendline: 'Drag between two points',
  level: 'Click to place a horizontal level',
  channel: 'Drag a rail, then drag to set its width',
  fib: 'Drag across a leg to retrace it',
};

/**
 * Measure first, then everything the data calls a drawing.
 *
 * The ruler is not in `TOOLS` and that is deliberate — `UNIVERSAL_AFFORDANCES` holds it instead,
 * because §3.1 restricts identity, hindsight and crutches and never restricts risk arithmetic. It
 * is prepended here rather than given a `ToolCode`, so there is no code that could be left out of a
 * tier's grant list by accident.
 */
const INSTRUMENTS: {
  tool: DrawTool;
  label: string;
  icon: IconName;
  needs: ToolCode | null;
  hint: string;
}[] = [
  { tool: 'measure', label: 'Measure', icon: 'ruler', needs: null, hint: 'Drag to measure, in ATR and R' },
  ...TOOLS.filter((t) => t.kind === 'drawing').map((t) => ({
    tool: t.code as DrawTool,
    label: t.name,
    icon: ICON[t.code] ?? ('trendline' as IconName),
    needs: t.code,
    hint: HOW[t.code] ?? t.effect,
  })),
];

/**
 * The same names and instructions, keyed for the frame's hint line.
 *
 * Derived rather than restated: the hint that appears while an instrument is held has to say the
 * same thing its tooltip did, and two copies of "drag across a leg to retrace it" is exactly the
 * kind of drift that leaves a tooltip and a hint disagreeing about how a tool works.
 */
export const INSTRUMENT_LABEL = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.tool, i.label]),
) as Record<DrawTool, string>;

export const INSTRUMENT_HOWTO = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.tool, i.hint.toLowerCase()]),
) as Record<DrawTool, string>;

export function InstrumentRail({
  granted,
  tool,
  onTool,
  disabled,
  className,
}: {
  granted: readonly ToolCode[];
  tool: DrawTool | null;
  onTool: (tool: DrawTool | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Every instrument, always — the locked ones are the point. See the note above.
  const available = INSTRUMENTS;

  /**
   * Arrow keys move within the group; the group itself is one tab stop.
   *
   * A radio group that puts every option in the tab order makes a keyboard user press Tab five
   * times to leave a toolbar, which is why the pattern exists.
   */
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1,
    };
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    // Step over the locked ones. `.focus()` on a disabled button is a no-op, so without this the
    // arrows would simply appear to stop working at whatever the tier took away — which is a poor
    // reward for showing the locked instruments in the first place.
    const count = available.length;
    for (let hop = 1; hop <= count; hop++) {
      const next = (((index + step * hop) % count) + count) % count;
      const button = buttons.current[next];
      if (button && !button.disabled) {
        button.focus();
        return;
      }
    }
  };

  // Focus follows selection where there is one, so Tab returns to the armed instrument rather than
  // to the top of the rail.
  const focusedIndex = Math.max(
    0,
    available.findIndex((i) => i.tool === tool),
  );

  return (
    <div
      role="radiogroup"
      aria-label="Drawing instruments"
      // Deliberately no `aria-orientation`: the rail is a row below `lg` and a column above it, and
      // an ARIA attribute cannot follow a media query. Both axes are bound below, so the arrow key
      // a reader is told to expect works either way — which is the promise the attribute exists to
      // make, kept without claiming an orientation that is only true at one width.
      className={cx(
        'bg-surface-1 border-line flex shrink-0 items-center gap-1 rounded-xl border p-1 lg:flex-col',
        className,
      )}
    >
      {available.map((instrument, index) => {
        const locked = instrument.needs !== null && !granted.includes(instrument.needs);
        const active = tool === instrument.tool;
        const rung = locked && instrument.needs ? grantingTier(instrument.needs) : null;
        const shortcut = String(index + 1);

        return (
          <Tooltip
            key={instrument.tool}
            placement="bottom"
            label={
              locked
                ? `${instrument.label} — ${rung ? `${rung.name} grants this` : 'not on the ladder yet'}`
                : `${instrument.label} (${shortcut}) · ${instrument.hint}`
            }
          >
            <button
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={instrument.label}
              tabIndex={index === focusedIndex ? 0 : -1}
              disabled={disabled || locked}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => onTool(active ? null : instrument.tool)}
              className={cx(
                'press relative grid h-9 w-9 place-items-center rounded-lg transition-colors',
                'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
                'disabled:cursor-not-allowed',
                locked
                  ? 'text-ink-faint opacity-60'
                  : active
                    ? 'bg-surface-inv text-ink-inv'
                    : 'text-ink-lo enabled:hover:bg-fill-2 enabled:hover:text-ink-hi',
                disabled && !locked && 'opacity-45',
              )}
            >
              <Icon name={instrument.icon} size={18} />
              {locked && (
                <Icon
                  name="lock"
                  size={9}
                  className="bg-surface-1 absolute right-0.5 bottom-0.5 rounded-full"
                />
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
