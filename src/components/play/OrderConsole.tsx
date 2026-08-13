'use client';

import { Button, cx, Kbd, Panel } from '../ui';

/**
 * The order controls.
 *
 * Three readouts and two actions. The readouts are deliberately the arithmetic and not the
 * prices: §2 of the rules fixes entry at the decision bar close and makes direction *implied* by
 * which side of it the stop sits on, so what the player is actually choosing is a risk distance
 * and a reward-to-risk — and those are the two numbers shown.
 *
 * The readouts moved from 12px to 20px. They update on every pointer-move during a drag and they
 * are the only feedback the player has about what they are building; at 12px in a corner they
 * whispered the one thing on the screen that was actively changing.
 *
 * Reset view is gone from here — it lives on the chart now, as a cornered control next to the
 * thing it resets, which is also where a charting tool would put it.
 */
export function OrderConsole({
  isLong,
  stopAtr,
  rr,
  busy,
  onPass,
  onCommit,
  mayPass = true,
  passesLeft,
  confidence,
  onConfidence,
}: {
  isLong: boolean;
  stopAtr: number;
  rr: number;
  busy: boolean;
  onPass: () => void;
  onCommit: () => void;
  /**
   * §4.7's stake, or null if the player has not made one.
   *
   * Null rather than a default of 50%, and that distinction is load-bearing: a forecast nobody made
   * must not enter their calibration curve. The control below starts empty and stays empty until it
   * is touched.
   */
  confidence?: number | null;
  onConfidence?: (value: number) => void;
  /** False under the Iron mod, or once a ranked session has spent its quota. */
  mayPass?: boolean;
  /** Ranked only. Shown so the quota is a visible resource rather than a trap sprung at the end. */
  passesLeft?: number | null;
}) {
  return (
    <Panel pad="none" className="animate-rise p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <OrderReadout isLong={isLong} stopAtr={stopAtr} rr={rr} />

        {/*
          §4.7: "players stake a probability on each trade and are scored with a proper scoring
          rule". Five steps rather than a slider — a slider invites a shrug at the midpoint, and the
          whole measurement is about whether a stated number means anything. Each step is a claim a
          player would defend out loud.

          Deliberately optional. The trade commits with or without it, because a mandatory forecast
          would be answered carelessly and careless forecasts are worse than none: they enter the
          curve and flatten it toward the base rate.
        */}
        {onConfidence && (
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-dim text-[0.6875rem] font-medium tracking-wide uppercase">
              Odds this finishes green
            </span>
            <div className="flex gap-1">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onConfidence(value)}
                  aria-pressed={confidence === value}
                  className={cx(
                    'numeral h-9 min-w-11 rounded-lg border px-2 text-sm font-semibold transition-colors',
                    'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
                    confidence === value
                      ? 'border-info bg-info text-ink-inv'
                      : 'border-line bg-surface-1 text-ink-lo hover:text-ink-hi',
                  )}
                >
                  {Math.round(value * 100)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
          {/* §4.4 makes passing a first-class scored action, not an escape hatch, so it gets a real
              button beside Commit rather than a link underneath it. */}
          <Button
            variant="secondary"
            size="lg"
            onClick={onPass}
            disabled={busy || !mayPass}
            kbd={mayPass ? 'P' : undefined}
            title={
              mayPass
                ? undefined
                : passesLeft === 0
                  ? 'A ranked session allows two passes, and both are spent'
                  : 'The Iron mod removes the pass'
            }
          >
            Pass
            {passesLeft !== null && passesLeft !== undefined && (
              <span className="numeral text-ink-faint text-micro">{passesLeft}</span>
            )}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onCommit}
            loading={busy}
            kbd={busy ? undefined : '⏎'}
            glow="brand"
          >
            {busy ? 'Sealing…' : 'Commit'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** The live arithmetic. Mono because these three change on every pointer-move during a drag. */
export function OrderReadout({
  isLong,
  stopAtr,
  rr,
  className,
}: {
  isLong: boolean;
  stopAtr: number;
  rr: number;
  className?: string;
}) {
  return (
    <dl className={cx('grid grid-cols-3 gap-x-6 gap-y-1 sm:flex sm:gap-8', className)}>
      <Readout label="Side">
        <span className={isLong ? 'text-long-ink' : 'text-short-ink'}>{isLong ? 'long' : 'short'}</span>
      </Readout>
      <Readout label="Stop">
        {stopAtr.toFixed(2)}
        <span className="text-ink-dim text-sm"> ATR</span>
      </Readout>
      <Readout label="Reward">
        <span className="text-ink-dim text-sm">1:</span>
        {rr.toFixed(2)}
      </Readout>
    </dl>
  );
}

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow text-ink-dim">{label}</dt>
      <dd className="numeral text-ink-hi mt-0.5 text-lg font-semibold">{children}</dd>
    </div>
  );
}

/** The hotkey line under the console. Cheap to show, and it is how the loop is meant to be played. */
export function HotkeyHint() {
  return (
    <p className="text-ink-faint mt-2.5 hidden items-center gap-3 text-xs sm:flex">
      <span>
        <Kbd>⏎</Kbd> commit
      </span>
      <span>
        <Kbd>P</Kbd> pass
      </span>
      <span>
        <Kbd>R</Kbd> reset view
      </span>
    </p>
  );
}
