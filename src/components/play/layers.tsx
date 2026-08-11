'use client';

import type { Bar } from '@/core/bars';
import type { RoundResult } from '@/lib/api-types';
import { cx, Kbd } from '../ui';
import { Icon } from '../ui/icons';

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
      <div className="pointer-events-none absolute right-16 top-3 z-20 text-right sm:right-20 sm:top-3.5">
        <div className="eyebrow text-restraint-ink">Stood aside</div>
        <div className="numeral text-restraint-ink text-2xl font-semibold">0.00R</div>
      </div>
    );
  }
  if (r === null) return null;

  const tone = r > 0.005 ? 'text-gain-ink' : r < -0.005 ? 'text-loss-ink' : 'text-ink-hi';

  return (
    <div className="pointer-events-none absolute right-16 top-3 z-20 text-right sm:right-20 sm:top-3.5">
      <div className="eyebrow text-ink-dim">{frozen ? (frozen === 'target' ? 'Target hit' : 'Stopped out') : 'Open'}</div>
      <div
        className={cx(
          'numeral text-2xl font-semibold transition-colors sm:text-3xl',
          tone,
          frozen && 'ring-line-strong rounded-md px-1.5 ring-1',
        )}
      >
        {r >= 0 ? '+' : ''}
        {r.toFixed(2)}R
      </div>
      <div className="numeral text-ink-faint mt-0.5 text-micro">
        MFE {mfe >= 0 ? '+' : ''}
        {mfe.toFixed(2)} · MAE {mae.toFixed(2)}
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
        'pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center pb-10 pt-24',
        'bg-linear-to-t from-surface-0/95 via-surface-0/70 to-transparent',
        'transition-opacity duration-(--dur-6) ease-(--ease-standard)',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className={cx('eyebrow', show ? 'animate-fade' : '')}>{label}</div>
      <div
        className={cx(
          'numeral font-semibold text-display-sm sm:text-display lg:text-display-lg',
          ink,
          show && 'animate-slam',
        )}
      >
        {value}
      </div>
      {detail && <div className="numeral text-ink-dim mt-2 text-xs sm:text-sm">{detail}</div>}
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
          className={cx(CORNER_BUTTON, magnet ? 'bg-surface-inv text-ink-inv' : 'text-ink-dim hover:text-ink-hi')}
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
          className={cx(CORNER_BUTTON, logScale ? 'bg-surface-inv text-ink-inv' : 'text-ink-dim hover:text-ink-hi')}
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
      title: 'The round',
      rows: [
        ['⏎', 'Commit the bracket, then move to the next chart'],
        ['P', 'Pass — a scored decision, not a skip'],
        ['R', 'Reset the view while placing, replay the reveal after'],
        ['Space', 'Pause and resume the reveal'],
        ['S', 'Skip to the end of the reveal'],
      ],
    },
    {
      // Undiscoverable otherwise: the rail carries icons, and the numbers are only in a tooltip.
      title: 'The toolbox',
      rows: [
        ['1–5', 'Pick an instrument — ruler, line, level, channel, fib'],
        ['Esc', 'Put the instrument down and hand the rails back'],
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
