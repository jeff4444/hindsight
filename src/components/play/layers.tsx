'use client';

import { useEffect, useRef } from 'react';
import type { Bar } from '@/core/bars';
import type { RoundResult } from '@/lib/api-types';
import type { ChartHandle } from '../Chart';
import { cx, Kbd } from '../ui';
import { Icon } from '../ui/icons';

/* --------------------------------------------------------------------- fog */

/**
 * The future, drawn as fog.
 *
 * Everything right of "now" is hatched until it is revealed, and the hatch recedes one candle at a
 * time as the reveal plays. It is the product's signature, and it makes the most important fact on
 * the screen visible before a word is read: there are sixty more candles, and you cannot see them.
 *
 * Positioned from the chart every frame, the same way the rails are, so it tracks pan, zoom and
 * the reveal camera without owning any of them. `known` is a ref, not a prop, because the reveal
 * loop advances it every 78ms and a re-render per candle would be pure waste.
 */
export function FogLayer({
  chart,
  known,
  label,
  visible,
}: {
  chart: React.RefObject<ChartHandle | null>;
  /** Hours already on screen: the lead-in, plus whatever the reveal has shown. */
  known: React.RefObject<number>;
  label: string;
  visible: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const x = chart.current?.hourToX(known.current ?? 0);
      const node = el.current;
      if (node) {
        const pane = chart.current?.paneWidth() ?? null;
        if (x === null || x === undefined || pane === null || !visible || x >= pane) {
          node.style.visibility = 'hidden';
        } else {
          node.style.visibility = 'visible';
          node.style.left = `${Math.max(0, x)}px`;
          // Stop at the price scale: the axis labels stay legible over the future.
          const width = pane - Math.max(0, x);
          node.style.width = `${width}px`;
          // The label leaves before the fog does, rather than spilling out of a sliver.
          if (tag.current) tag.current.style.visibility = width < 96 ? 'hidden' : 'visible';
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart, known, visible]);

  return (
    <div
      ref={el}
      aria-hidden
      className="fog fog-drift pointer-events-none absolute inset-y-0 z-5"
      style={{ visibility: 'hidden', ['--fog-strength' as string]: '7%' }}
    >
      <div ref={edge} className="border-ink-dim/60 absolute inset-y-0 left-0 border-l border-dashed" />
      <span ref={tag} className="numeral text-ink-dim bg-surface-1/80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-mini whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

/**
 * The layers painted over the chart.
 *
 * These are the reason the redesign has anywhere to put a moment. The stacking-context rule that
 * shapes this whole app — no `filter`, `transform` or `opacity < 1` anywhere above `ChartFrame`,
 * or the drag rails fall behind the canvas — constrains *ancestors*. Everything here is a
 * **sibling** of the rail layer, mounted inside the frame at a higher z-index, so it may fade,
 * scale, glow and gradient as freely as anything else in the product. `ChartFrame` has shipped a
 * `-translate-x-1/2` hint pill at `z-20` since long before this file existed; that was always the
 * proof that in-frame overlays are safe.
 *
 * One hard rule applies to everything here: **`pointer-events-none` unless it is a small cornered
 * control.** The rails are full-width `inset-x-0` pointer targets, so anything interactive lying
 * across the frame punches a dead horizontal stripe through the drag.
 */

/* ------------------------------------------------------- instrument watermark */

/**
 * What a real chart puts in its top-left corner: what you are looking at.
 *
 * This used to be a row of chips in the page header, which put the instrument's own metadata
 * further from the instrument than the browser tab was. None of it is interactive, so it costs
 * nothing to sit on the canvas — and it hands the header back for navigation.
 */
export function InstrumentWatermark({
  atr,
  tickSize,
  clockLabel,
  weekend,
}: {
  atr: number;
  tickSize: number;
  clockLabel: string;
  weekend: boolean;
}) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-0.5 sm:left-4 sm:top-3.5">
      <div className="numeral text-ink-lo text-xs">1 ATR = {atr.toFixed(2)}</div>
      <div className="flex items-center gap-2">
        <span className={cx('numeral text-xs', weekend ? 'text-attention-ink' : 'text-ink-dim')}>
          {clockLabel} UTC
        </span>
        {weekend && <span className="eyebrow text-attention-ink">thin books</span>}
      </div>
      <div className="numeral text-ink-faint hidden text-xs sm:block">tick {tickSize}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- live R */

/**
 * The running result, while it is still running.
 *
 * Inset from the right by the width of the price scale rather than sitting at `right-3`: the
 * scale is part of the canvas, so anything flush to the frame's right edge lands on top of the
 * price labels.
 *
 * The single largest gap in the old reveal: sixty candles played out one at a time with no number
 * attached to any of them, so the player watched an animation rather than a trade. Everything here
 * is computed from bars already on the client — nothing new is requested, and nothing about the
 * future is revealed a frame earlier than the candle that carries it.
 */
export function LiveR({
  r,
  mfe,
  mae,
  frozen,
  passed,
}: {
  r: number | null;
  mfe: number;
  mae: number;
  /** The trade has closed; the number stops moving and gets a ring. */
  frozen: 'target' | 'stop' | null;
  passed: boolean;
}) {
  if (passed) {
    return (
      <div className="pointer-events-none absolute right-16 top-4 z-20 text-right sm:right-20">
        <div className="eyebrow text-restraint-ink">Sat out</div>
        <div className="numeral text-restraint-ink text-3xl font-semibold sm:text-4xl">0.00R</div>
      </div>
    );
  }
  if (r === null) return null;

  const tone = r > 0.005 ? 'text-gain-ink' : r < -0.005 ? 'text-loss-ink' : 'text-ink-hi';

  return (
    <div className="pointer-events-none absolute right-16 top-4 z-20 text-right sm:right-20">
      <div className="eyebrow text-ink-dim">{frozen ? (frozen === 'target' ? 'Target hit' : 'Stopped out') : 'Live'}</div>
      <div className={cx('numeral text-3xl font-semibold transition-colors sm:text-4xl', tone)}>
        {r >= 0 ? '+' : ''}
        {r.toFixed(2)}R
      </div>
      <div className="numeral text-ink-dim mt-1 text-mini">
        peak {mfe >= 0 ? '+' : ''}
        {mfe.toFixed(2)} · dip {mae.toFixed(2)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- score stage */

/**
 * The moment.
 *
 * The R-multiple lands at 92px **on the chart, over the trade that just resolved** — which is the
 * whole reason the in-frame layer system exists. Putting it in a panel underneath, as the old
 * result card did, separates the number from the thing it is a number about.
 *
 * The wash is a `background-image` gradient and the scrim is an alpha colour, not an `opacity` —
 * neither creates a stacking context, and in any case this is a sibling of the rails rather than
 * an ancestor.
 */
export function ScoreStage({
  label,
  value,
  tone,
  detail,
  show,
}: {
  label: string;
  value: string;
  tone: 'gain' | 'loss' | 'restraint' | 'neutral';
  detail: string | null;
  show: boolean;
}) {
  const ink = {
    gain: 'text-gain-ink',
    loss: 'text-loss-ink',
    restraint: 'text-restraint-ink',
    neutral: 'text-ink-max',
  }[tone];

  return (
    <div
      aria-hidden
      className={cx(
        'pointer-events-none absolute inset-0 z-30 grid place-items-center',
        'bg-[radial-gradient(60%_55%_at_50%_50%,var(--color-scrim),transparent)]',
        'transition-opacity duration-(--dur-6) ease-(--ease-standard)',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className={cx('flex flex-col items-center', show && 'animate-stamp')}>
        <div className={cx('eyebrow', ink)}>{label}</div>
        <div className={cx('numeral font-semibold text-display-sm sm:text-display lg:text-display-lg', ink)}>
          {value}
        </div>
        {detail && <div className="numeral text-ink-lo mt-2 text-xs sm:text-sm">{detail}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- frame controls */

/**
 * The only interactive layer, and the only one allowed to be.
 *
 * Cornered and small: the rails span the full width, so an interactive element anywhere across the
 * middle of the frame would eat pointer events the drag needs.
 */
const CORNER_BUTTON =
  'press bg-scrim ring-line-faint grid h-8 w-8 place-items-center rounded-md ring-1 transition-colors';

/**
 * Magnet and log scale live here rather than in a tool palette.
 *
 * They are the same category as "reset the view": they change how the chart *draws*, not what you
 * are doing with a pointer. The old toolbar filed them beside the instruments and the indicators,
 * which made three unrelated kinds of control look like one list of fourteen. Chart furniture
 * belongs with chart furniture, in the corner, beside the thing it is a sibling of.
 */
export function FrameControls({
  onResetView,
  onHelp,
  magnet,
  onMagnet,
  logScale,
  onLogScale,
  onClear,
  drawings = 0,
}: {
  onResetView: () => void;
  onHelp: () => void;
  /** Undefined where the tier does not grant the option, which hides the control entirely. */
  magnet?: boolean;
  onMagnet?: (on: boolean) => void;
  logScale?: boolean;
  onLogScale?: (on: boolean) => void;
  onClear?: () => void;
  drawings?: number;
}) {
  return (
    <div className="absolute right-3 bottom-10 z-30 flex items-center gap-1.5 sm:right-4">
      {onClear && drawings > 0 && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${drawings} drawing${drawings === 1 ? '' : 's'}`}
          title={`Clear ${drawings} drawing${drawings === 1 ? '' : 's'}`}
          className={cx(CORNER_BUTTON, 'text-ink-dim hover:text-short-ink')}
        >
          <Icon name="trash" size={15} />
        </button>
      )}
      {onMagnet && (
        <button
          type="button"
          onClick={() => onMagnet(!magnet)}
          aria-pressed={magnet}
          aria-label="Snap drawings to the nearest wick"
          title="Snap drawings to the nearest wick"
          className={cx(CORNER_BUTTON, magnet ? 'bg-fill-3 text-ink-max ring-line-strong' : 'text-ink-dim hover:text-ink-hi')}
        >
          <Icon name="magnet" size={15} />
        </button>
      )}
      {onLogScale && (
        <button
          type="button"
          onClick={() => onLogScale(!logScale)}
          aria-pressed={logScale}
          aria-label="Logarithmic price axis"
          title="Logarithmic price axis"
          className={cx(CORNER_BUTTON, logScale ? 'bg-fill-3 text-ink-max ring-line-strong' : 'text-ink-dim hover:text-ink-hi')}
        >
          <Icon name="log-scale" size={15} />
        </button>
      )}
      <button
        type="button"
        onClick={onResetView}
        aria-label="Reset the view"
        title="Reset the view"
        className={cx(CORNER_BUTTON, 'text-ink-dim hover:text-ink-hi')}
      >
        <Icon name="rotate-ccw" size={15} />
      </button>
      <button
        type="button"
        onClick={onHelp}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        className={cx(CORNER_BUTTON, 'text-ink-dim hover:text-ink-hi')}
      >
        <Icon name="keyboard" size={15} />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- legend */

export function HotkeyLegend() {
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: 'Calling the trade',
      rows: [
        ['L', 'Go long'],
        ['S', 'Go short'],
        ['X', 'Sit out — scored, not skipped'],
        ['↑ ↓', 'Move the stop'],
        ['⇧ ↑ ↓', 'Move the target'],
        ['⏎', 'Lock it in'],
      ],
    },
    {
      title: 'The reveal',
      rows: [
        ['Space', 'Pause and resume'],
        ['S', 'Skip to the end'],
        ['R', 'Replay it'],
        ['⏎', 'Next chart'],
      ],
    },
    {
      // Undiscoverable otherwise: the rail carries icons, and the numbers are only in a tooltip.
      title: 'The toolbox',
      rows: [
        ['1–5', 'Pick a tool — ruler, line, level, channel, fib'],
        ['Esc', 'Put the tool down'],
        ['⌘Z', 'Undo the last drawing'],
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.title}>
          <p className="eyebrow text-ink-dim mb-2">{group.title}</p>
          <dl className="flex flex-col gap-2.5">
            {group.rows.map(([key, what]) => (
              <div key={key} className="flex items-baseline gap-3">
                <dt className="bg-fill-2 ring-line shrink-0 rounded px-1.5 py-0.5 ring-1">
                  <Kbd>{key}</Kbd>
                </dt>
                <dd className="text-ink-lo text-sm">{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- running R */

export interface Running {
  r: number | null;
  mfe: number;
  mae: number;
  frozen: 'target' | 'stop' | null;
}

/**
 * The open trade's R after `revealed` candles.
 *
 * Marked to the close of the last revealed bar while the trade is open, then frozen at the
 * server's own number once the exit bar has been shown. It deliberately does not try to re-derive
 * the final R from bars: resolution walks the one-minute path with tie-break rules this does not
 * have, and a live readout that disagreed with the result by a hundredth would be worse than no
 * readout at all.
 */
export function runningR(
  bars: Bar[],
  revealed: number,
  entry: number,
  result: RoundResult | null,
): Running {
  const risk = result?.riskPerUnit ?? null;
  if (!result || result.outcome === 'pass' || !risk || risk <= 0 || revealed === 0) {
    return { r: null, mfe: 0, mae: 0, frozen: null };
  }

  const dir = result.direction === 'short' ? -1 : 1;
  const exit = result.exitBarIndex;
  const closed = exit !== null && revealed > exit;

  let mfe = 0;
  let mae = 0;
  const upto = closed ? exit + 1 : revealed;
  for (let i = 0; i < upto && i < bars.length; i++) {
    const bar = bars[i];
    const best = ((dir === 1 ? bar.h : -bar.l) - dir * entry) / risk;
    const worst = ((dir === 1 ? bar.l : -bar.h) - dir * entry) / risk;
    if (best > mfe) mfe = best;
    if (worst < mae) mae = worst;
  }

  if (closed) {
    return {
      r: result.rMultiple,
      mfe: result.mfeR ?? mfe,
      mae: result.maeR ?? mae,
      frozen: result.outcome === 'target' ? 'target' : result.outcome === 'stop' ? 'stop' : null,
    };
  }

  const last = bars[revealed - 1];
  return { r: last ? ((last.c - entry) * dir) / risk : null, mfe, mae, frozen: null };
}
