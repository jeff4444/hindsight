'use client';

import { Button, Segmented } from '../ui';
import { SPEEDS } from './useRevealLoop';

/**
 * Transport controls for the reveal.
 *
 * The counter is deliberately not animated. It changes every 78ms at 1x, and tweening a number
 * that already moves faster than the eye tracks produces noise rather than smoothness — the
 * progress bar's linear width transition is the right treatment and the only one.
 */
export function RevealTransport({
  revealed,
  total,
  paused,
  speed,
  onTogglePause,
  onSpeed,
  onSkip,
}: {
  revealed: number;
  total: number;
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onSpeed: (index: number) => void;
  onSkip: () => void;
}) {
  return (
    <div className="bg-surface-2 border-line shadow-panel animate-rise flex items-center gap-3 rounded-lg border p-3">
      <Button variant="secondary" onClick={onTogglePause} className="w-16">
        {paused ? 'Play' : 'Pause'}
      </Button>

      <div className="bg-fill-2 h-1 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-info h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${total ? (revealed / total) * 100 : 0}%` }}
        />
      </div>

      <span className="text-ink-dim font-mono text-xs tabular-nums">
        {revealed}/{total}
      </span>

      <Segmented
        options={SPEEDS.map((option, index) => ({ value: index, label: option.label }))}
        value={speed}
        onChange={onSpeed}
        className="hidden xs:inline-flex"
      />

      <Button variant="secondary" onClick={onSkip} kbd="S">
        Skip
      </Button>
    </div>
  );
}
