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
}: {
  isLong: boolean;
  stopAtr: number;
  rr: number;
  busy: boolean;
  onPass: () => void;
  onCommit: () => void;
}) {
  return (
    <Panel pad="none" className="animate-rise p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <OrderReadout isLong={isLong} stopAtr={stopAtr} rr={rr} />

        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
          {/* §4.4 makes passing a first-class scored action, not an escape hatch, so it gets a real
              button beside Commit rather than a link underneath it. */}
          <Button variant="secondary" size="lg" onClick={onPass} disabled={busy} kbd="P">
            Pass
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
