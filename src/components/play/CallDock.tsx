'use client';

import { Button, cx } from '../ui';
import { Term } from '../ui/client';
import { Icon } from '../ui/icons';

/**
 * The Call: everything a player decides, in one dock under the chart.
 *
 * Three changes from the console it replaces, each fixing something a player could feel:
 *
 *   **The side is a choice.** The old screen opened every chart with a long 1:1 already drawn, so
 *   an untouched round was a long the player never chose, and going short meant discovering that
 *   dragging a rail across the entry flips the trade. Now nothing is drawn until Long or Short is
 *   picked (or L / S pressed), and Sit out sits beside them as the third answer it is.
 *
 *   **The bracket is set in its own units.** Stop in ATR, target in R, with steppers and presets on
 *   the grid the score enumerates. Dragging the lines still works for fine control; the steppers
 *   are what make a phone and a keyboard first-class.
 *
 *   **"How sure?" travels with every commit.** Enter, the button and a clock running out all send
 *   the same order, stake included. It used to be dropped by everything but the button.
 *
 * Presentational: PlaySurface owns the state and the keys.
 */

const STOP_PRESETS = [0.5, 1, 1.5, 2] as const;
const TARGET_PRESETS = [1, 2, 3, 5] as const;
const CONFIDENCE = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

export function CallDock({
  direction,
  onDirection,
  stopAtr,
  targetR,
  onStopAtr,
  onTargetR,
  confidence,
  onConfidence,
  mayPass,
  passNote,
  passEndsRun,
  onPass,
  onCommit,
  busy,
  nudge,
}: {
  direction: 'long' | 'short' | null;
  onDirection: (direction: 'long' | 'short') => void;
  stopAtr: number;
  targetR: number;
  onStopAtr: (value: number) => void;
  onTargetR: (value: number) => void;
  confidence: number | null;
  onConfidence: (value: number | null) => void;
  mayPass: boolean;
  /** Why sitting out is unavailable, or what it costs, in a few words. */
  passNote?: string | null;
  /** Survival: a sit-out with no skip left ends the run, and the button says so before it is pressed. */
  passEndsRun?: boolean;
  onPass: () => void;
  onCommit: () => void;
  busy: boolean;
  /** Set briefly when the player tried to lock in without a side; the side buttons pulse. */
  nudge?: boolean;
}) {
  const sided = direction !== null;

  return (
    <div className="border-line-faint bg-surface-1 rounded-2xl border p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-5">
        {/* The side */}
        <div
          role="radiogroup"
          aria-label="Direction"
          className={cx('grid grid-cols-2 gap-2 lg:flex', nudge && 'animate-pop')}
        >
          <SideButton side="long" active={direction === 'long'} disabled={busy} onClick={() => onDirection('long')} />
          <SideButton side="short" active={direction === 'short'} disabled={busy} onClick={() => onDirection('short')} />
        </div>

        {/* The bracket */}
        {sided ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Stepper
              label="Stop"
              unit="ATR"
              value={stopAtr}
              step={0.25}
              min={0.25}
              max={6}
              presets={STOP_PRESETS}
              onChange={onStopAtr}
              disabled={busy}
              tone="short"
            />
            <Stepper
              label="Target"
              unit="R"
              value={targetR}
              step={0.5}
              min={0.5}
              max={10}
              presets={TARGET_PRESETS}
              onChange={onTargetR}
              disabled={busy}
              tone="long"
            />
            <Confidence value={confidence} onChange={onConfidence} disabled={busy} className="col-span-2 md:col-span-1" />
          </div>
        ) : (
          <p className="text-ink-lo text-sm leading-relaxed lg:px-2">
            {nudge ? (
              <span className="text-ink-max font-medium">Pick a side first — or sit out.</span>
            ) : (
              <>
                Which way from here? Pick a side and your stop and target appear on the chart. Or sit out:
                on most charts, the <Term id="par">typical trade</Term> loses.
              </>
            )}
          </p>
        )}

        {/* The decision */}
        <div className="grid grid-cols-[auto_1fr] gap-2 lg:flex">
          <Button
            variant="secondary"
            size="lg"
            kbd="X"
            onClick={onPass}
            disabled={!mayPass || busy}
            title={passNote ?? undefined}
            className={cx(passEndsRun && 'ring-short-line text-short-ink')}
          >
            {passEndsRun ? 'Sit out · ends run' : 'Sit out'}
          </Button>
          <Button variant="primary" size="lg" kbd="⏎" onClick={onCommit} loading={busy} disabled={!sided} className="min-w-36">
            {busy ? 'Locking in' : 'Lock in'}
          </Button>
        </div>
      </div>
      {passNote && (
        <p className="text-ink-dim mt-2 text-right text-xs">{passNote}</p>
      )}
    </div>
  );
}

function SideButton({
  side,
  active,
  disabled,
  onClick,
}: {
  side: 'long' | 'short';
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const long = side === 'long';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'press flex h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold ring-1 transition-colors lg:min-w-32',
        'disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? long
            ? 'bg-long text-on-gold ring-long'
            : 'bg-short text-on-gold ring-short'
          : long
            ? 'bg-long-bg text-long-ink ring-long-line hover:bg-long/25'
            : 'bg-short-bg text-short-ink ring-short-line hover:bg-short/25',
      )}
    >
      <Icon name={long ? 'arrow-up' : 'arrow-down'} size={18} stroke={2} />
      {long ? 'Long' : 'Short'}
      <span className={cx('kbd-hint font-mono text-micro', active ? 'opacity-60' : 'opacity-70')}>{long ? 'L' : 'S'}</span>
    </button>
  );
}

function Stepper({
  label,
  unit,
  value,
  step,
  min,
  max,
  presets,
  onChange,
  disabled,
  tone,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  min: number;
  max: number;
  presets: readonly number[];
  onChange: (value: number) => void;
  disabled?: boolean;
  tone: 'long' | 'short';
}) {
  const round = (x: number) => Math.round(x / step) * step;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const display = unit === 'R' ? value.toFixed(1) : value.toFixed(2);
  const accent = tone === 'long' ? 'text-long-ink' : 'text-short-ink';

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow text-ink-dim">{label}</span>
      </div>
      <div className="bg-surface-2 ring-line mt-1.5 flex h-11 items-center rounded-full ring-1">
        <button
          type="button"
          aria-label={`${label} smaller`}
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(round(value - step)))}
          className="press text-ink-lo hover:text-ink-hi grid h-11 w-10 shrink-0 place-items-center rounded-full disabled:opacity-35"
        >
          <Icon name="minus" size={16} />
        </button>
        <output className={cx('numeral min-w-0 flex-1 text-center text-base font-semibold', accent)} aria-live="polite">
          {display}
          <span className="text-ink-dim ml-1 text-xs font-medium">{unit}</span>
        </output>
        <button
          type="button"
          aria-label={`${label} bigger`}
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(round(value + step)))}
          className="press text-ink-lo hover:text-ink-hi grid h-11 w-10 shrink-0 place-items-center rounded-full disabled:opacity-35"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="no-scrollbar mt-1.5 flex gap-1 overflow-x-auto">
        {presets.map((preset) => {
          const on = Math.abs(preset - value) < 1e-6;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset)}
              aria-pressed={on}
              className={cx(
                'numeral h-7 shrink-0 rounded-full px-2.5 text-xs font-medium transition-colors',
                on ? 'bg-thumb text-ink-max shadow-e1' : 'text-ink-dim hover:text-ink-hi hover:bg-fill-2',
              )}
            >
              {preset}
              {unit === 'R' ? 'R' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Confidence({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <span className="eyebrow text-ink-dim">
        <Term id="calibration">How sure?</Term>
      </span>
      <div role="radiogroup" aria-label="How sure are you this finishes green?" className="bg-surface-2 ring-line mt-1.5 flex h-11 items-center gap-0.5 rounded-full p-1 ring-1">
        {CONFIDENCE.map((option) => {
          const on = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              // A second tap clears it. An untouched control is not a forecast, and a player who
              // tapped one by accident should not have to commit to it.
              onClick={() => onChange(on ? null : option)}
              className={cx(
                'numeral h-9 min-w-10 flex-1 rounded-full text-xs font-semibold transition-colors',
                on ? 'bg-info text-ink-inv' : 'text-ink-lo hover:text-ink-hi hover:bg-fill-2',
              )}
            >
              {Math.round(option * 100)}%
            </button>
          );
        })}
      </div>
      <p className="text-ink-dim mt-1.5 text-xs">Optional · odds it finishes green</p>
    </div>
  );
}
