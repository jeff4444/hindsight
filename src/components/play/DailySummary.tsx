'use client';

import { useState } from 'react';
import type { DailyPayload } from '@/lib/api-types';
import { Button, Eyebrow } from '../ui';

/**
 * The end of a daily.
 *
 * §10.4: the card is "a bid for a reply rather than a broadcast", so the screen leads with the
 * card itself and a way to copy it, not with a wall of statistics. The traded count is on the
 * card because §4.4 makes it the daily's only brake on passing everything — "so the format
 * self-polices socially rather than mechanically".
 */
export function DailySummary({
  daily,
  onKeepPlaying,
  keepPlayingLabel = 'Free play',
}: {
  daily: DailyPayload;
  onKeepPlaying: () => void;
  keepPlayingLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!daily.card) return;
    try {
      await navigator.clipboard.writeText(daily.card);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied; the card is on screen and selectable anyway.
    }
  };

  return (
    <div className="bg-surface-2 border-line shadow-panel animate-rise rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow>Daily #{daily.day} complete</Eyebrow>
          <div className="text-ink-max mt-0.5 font-mono text-3xl font-semibold tabular-nums">
            {daily.percentile === null ? '—' : Math.round(daily.percentile * 100)}
            <span className="text-ink-dim ml-1 text-base font-normal">of 100</span>
          </div>
          <p className="text-ink-dim mt-1 text-xs">
            Mean percentile across {daily.total} charts, against everything each one allowed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onKeepPlaying}>
            {keepPlayingLabel}
          </Button>
          <Button variant="primary" size="lg" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy card'}
          </Button>
        </div>
      </div>

      {daily.card && (
        <pre className="border-line bg-surface-1 text-ink mt-4 rounded-md border p-3 font-mono text-sm leading-relaxed whitespace-pre select-all">
          {daily.card}
        </pre>
      )}

      <p className="text-ink-dim text-mini mt-3 leading-relaxed">
        The card carries no R-multiple, no direction and no ticker, so posting it cannot spoil the
        setup for anyone who has not played today (§10.4). Everyone gets the same five charts.
      </p>
    </div>
  );
}
