'use client';

import { Button, cx } from '../ui';

/**
 * The order controls.
 *
 * Three readouts and three actions. The readouts are deliberately the arithmetic and not the
 * prices: §2 of the rules fixes entry at the decision bar close and makes direction *implied* by
 * which side of it the stop sits on, so what the player is actually choosing is a risk distance and
 * a reward-to-risk — and those are the two numbers shown.
 *
 * Below `sm` the readouts move out of the bar entirely (see PlaySurface) so the two 44px targets
 * get the width. Readouts are glanceable; targets are targets.
 */
export function PlacementBar({
  isLong,
  stopAtr,
  rr,
  busy,
  onResetView,
  onPass,
  onCommit,
  mayPass = true,
  passesLeft,
}: {
  isLong: boolean;
  stopAtr: number;
  rr: number;
  busy: boolean;
  onResetView: () => void;
  onPass: () => void;
  onCommit: () => void;
  /** False under the Iron mod, or once a ranked session has spent its quota. */
  mayPass?: boolean;
  /** Ranked only. Shown so the quota is a visible resource rather than a trap sprung at the end. */
  passesLeft?: number | null;
}) {
  return (
    <div className="bg-surface-2 border-line shadow-panel animate-rise flex items-center gap-3 rounded-lg border p-3">
      <OrderReadout isLong={isLong} stopAtr={stopAtr} rr={rr} className="hidden sm:flex" />

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" onClick={onResetView} disabled={busy} kbd="R" title="Reset zoom">
          <span className="hidden sm:inline">Reset view</span>
          <span className="sm:hidden">Reset</span>
        </Button>
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
                ? '§4.4 allows two passes in a five-chart ranked session, and both are spent'
                : 'The Iron mod removes the pass'
          }
        >
          Pass
          {passesLeft !== null && passesLeft !== undefined && (
            <span className="text-ink-faint text-micro font-mono">{passesLeft}</span>
          )}
        </Button>
        <Button variant="primary" size="lg" onClick={onCommit} loading={busy} kbd={busy ? undefined : '⏎'}>
          {busy ? 'Committing…' : 'Commit'}
        </Button>
      </div>
    </div>
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
    <div className={cx('text-ink-lo flex gap-4 font-mono text-xs tabular-nums', className)}>
      <span>
        <span className="text-ink-faint">side </span>
        <span className={isLong ? 'text-long-ink' : 'text-short-ink'}>
          {isLong ? 'long' : 'short'}
        </span>
      </span>
      <span>
        <span className="text-ink-faint">stop </span>
        {stopAtr.toFixed(2)} ATR
      </span>
      <span>
        <span className="text-ink-faint">R:R </span>1:{rr.toFixed(2)}
      </span>
    </div>
  );
}
