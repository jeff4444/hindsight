'use client';

import { Button, Panel, ProgressBar, Segmented } from '../ui';
import { Icon } from '../ui/icons';
import { SPEEDS } from './useRevealLoop';

/**
 * Transport controls for the reveal.
 *
 * The counter is deliberately not animated. It changes every 78ms at 1x, and tweening a number
 * that already moves faster than the eye tracks produces noise rather than smoothness — the
 * progress bar's linear width transition is the right treatment and the only one.
 *
 * Two changes from the previous version. The bar recolours to the outcome the moment a level is
 * touched, so the thing the player is watching and the thing measuring it agree. And the speed
 * control is shown at every width: it used to be hidden below 375px, where it is four 32px pills
 * that fit comfortably once the row is allowed to wrap.
 */
export function TransportConsole({
  revealed,
  total,
  paused,
  speed,
  outcome,
  onTogglePause,
  onSpeed,
  onSkip,
}: {
  revealed: number;
  total: number;
  paused: boolean;
  speed: number;
  /** Set once a level has been touched, so the progress bar can carry the verdict. */
  outcome: 'target' | 'stop' | null;
  onTogglePause: () => void;
  onSpeed: (index: number) => void;
  onSkip: () => void;
}) {
  return (
    <Panel pad="none" className="animate-rise p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-3 sm:flex-1">
          <Button
            variant="secondary"
            size="lg"
            onClick={onTogglePause}
            className="w-24 shrink-0"
            aria-label={paused ? 'Resume the reveal' : 'Pause the reveal'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={15} />
            {paused ? 'Play' : 'Pause'}
          </Button>

          <ProgressBar
            value={revealed}
            max={total}
            size="sm"
            pace="live"
            className="flex-1"
            label="Candles revealed"
            tone={outcome === 'target' ? 'long' : outcome === 'stop' ? 'short' : 'info'}
          />

          <span className="numeral text-ink-dim shrink-0 text-sm">
            {revealed}/{total}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Segmented
            options={SPEEDS.map((option, index) => ({ value: index, label: option.label }))}
            value={speed}
            onChange={onSpeed}
          />
          <Button variant="secondary" size="lg" onClick={onSkip} kbd="S">
            Skip
          </Button>
        </div>
      </div>
    </Panel>
  );
}
