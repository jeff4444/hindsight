'use client';

import { useMemo, useState } from 'react';
import { REPLAY_SPEEDS } from '@/core/trading/clock';
import type { ClockView, InstrumentView, SessionTime, WireBar } from '@/lib/trading/types';
import { formatElapsed, formatPct, formatPrice, formatReplayTime } from '@/lib/trading/format';
import { TIMEFRAMES } from '@/lib/timeframe';
import { Button, Chip, IconButton, Segmented, cx } from '../ui';
import { Dialog, Select, Tooltip } from '../ui/client';
import { NumberRoll } from '../ui/kinetic';
import { Icon } from '../ui/icons';

/**
 * The strip across the top of the terminal: what is trading, at what price, and where the replay
 * has got to — with the transport that drives it.
 */

const SPEED_LABEL: Record<number, string> = { 1: '1m/s', 5: '5m/s', 15: '15m/s', 60: '1h/s', 240: '4h/s' };

export function MarketHeader({
  instrument,
  time,
  clock,
  tape,
  refClose,
  tickExp,
  purpose,
  ranked,
  closed,
  timeframe,
  onTimeframe,
  onAct,
  busy,
  exit,
}: {
  instrument: InstrumentView;
  time: SessionTime;
  clock: ClockView;
  tape: WireBar[];
  refClose: number;
  tickExp: number;
  purpose: 'main' | 'practice';
  ranked: boolean;
  closed: boolean;
  timeframe: number;
  onTimeframe: (minutes: number) => void;
  onAct: (op: { op: 'play' } | { op: 'pause' } | { op: 'speed'; speed: number } | { op: 'step'; minutes: number } | { op: 'end' }) => void;
  busy: boolean;
  exit?: React.ReactNode;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const unit = Math.pow(10, tickExp);

  const stats = useMemo(() => {
    const last = tape.length > 0 ? tape[tape.length - 1][3] : refClose;
    const previous = tape.length > 1 ? tape[tape.length - 2][3] : refClose;
    let high = refClose;
    let low = refClose;
    let volume = 0;
    for (const bar of tape) {
      if (bar[1] > high) high = bar[1];
      if (bar[2] < low) low = bar[2];
      volume += bar[4];
    }
    return { last: last * unit, up: last >= previous, change: last / refClose - 1, high: high * unit, low: low * unit, volume };
  }, [tape, refClose, unit]);

  const playing = !clock.paused && !closed;
  const progress = clock.total > 0 ? clock.revealed / clock.total : 0;

  return (
    <header className="border-line-faint flex flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:items-center lg:gap-6 lg:px-4">
      <div className="flex min-w-0 items-center gap-3">
        {exit}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-ink-max truncate text-base font-semibold tracking-tight">{instrument.display}</span>
            <Chip size="sm">{instrument.venue}</Chip>
            {purpose === 'practice' ? (
              <Chip size="sm" tone="info">
                Practice
              </Chip>
            ) : ranked ? (
              <Chip size="sm" tone="gold">
                Ranked
              </Chip>
            ) : null}
          </div>
          <div className="text-ink-dim text-mini">
            Replay · {formatReplayTime(time, clock.revealed - 1)} · {formatElapsed(clock.revealed)}
          </div>
        </div>
        <div className="ml-auto flex items-baseline gap-2 lg:ml-2">
          <span className={cx('numeral text-xl font-semibold', stats.up ? 'text-long-ink' : 'text-short-ink')}>
            <NumberRoll value={formatPrice(stats.last, instrument)} />
          </span>
          <span className={cx('numeral text-xs', stats.change >= 0 ? 'text-long-ink' : 'text-short-ink')}>
            {formatPct(stats.change, { sign: true })}
          </span>
        </div>
      </div>

      <dl className="text-mini hidden items-center gap-5 xl:flex">
        <div>
          <dt className="text-ink-dim">Session high</dt>
          <dd className="numeral text-ink-hi">{formatPrice(stats.high, instrument)}</dd>
        </div>
        <div>
          <dt className="text-ink-dim">Session low</dt>
          <dd className="numeral text-ink-hi">{formatPrice(stats.low, instrument)}</dd>
        </div>
        <div>
          <dt className="text-ink-dim">Volume</dt>
          <dd className="numeral text-ink-hi">
            {stats.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })} {instrument.base}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <span className="hidden lg:inline-flex">
          <Segmented
            label="Chart timeframe"
            value={timeframe}
            onChange={onTimeframe}
            options={TIMEFRAMES.map((tf) => ({ value: tf.minutes, label: tf.label }))}
          />
        </span>
        <span className="contents lg:hidden">
          <Select
            label="Chart timeframe"
            value={timeframe}
            onChange={onTimeframe}
            options={TIMEFRAMES.map((tf) => ({ value: tf.minutes, label: tf.label }))}
          />
        </span>

        <div className="bg-fill-1 ring-line-faint flex items-center gap-1 rounded-full p-1 ring-1">
          <Tooltip label={playing ? 'Pause (Space)' : 'Play (Space)'}>
            <IconButton
              icon={playing ? 'pause' : 'play'}
              label={playing ? 'Pause the replay' : 'Play the replay'}
              size="sm"
              variant={playing ? 'secondary' : 'primary'}
              disabled={closed}
              onClick={() => onAct({ op: playing ? 'pause' : 'play' })}
            />
          </Tooltip>
          <Tooltip label="Step one candle (→)">
            <IconButton
              icon="skip-forward"
              label="Step forward one candle"
              size="sm"
              disabled={closed || busy}
              onClick={() => onAct({ op: 'step', minutes: Math.min(timeframe, 1440) })}
            />
          </Tooltip>
          <Select
            label="Replay speed"
            value={clock.speed}
            onChange={(speed) => onAct({ op: 'speed', speed })}
            options={REPLAY_SPEEDS.map((speed) => ({ value: speed, label: SPEED_LABEL[speed] ?? `${speed}m/s` }))}
          />
        </div>

        <div className="hidden w-28 items-center gap-2 md:flex" title={`${clock.revealed} of ${clock.total} minutes`}>
          <div className="bg-fill-2 h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="bg-gold h-full rounded-full" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="numeral text-ink-dim text-mini">{Math.round(progress * 100)}%</span>
        </div>

        <Button size="sm" variant="ghost" disabled={closed} onClick={() => setConfirmEnd(true)}>
          <Icon name="flag" size={14} />
          End
        </Button>
      </div>

      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End this session?"
        description="Every working order is cancelled and any open position is closed at the market. The session's result goes on your account."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
              Keep trading
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmEnd(false);
                onAct({ op: 'end' });
              }}
            >
              Close out and end
            </Button>
          </>
        }
      >
        <p className="text-ink-lo text-sm">
          The replay will not continue. You can always open a new market from the Markets page.
        </p>
      </Dialog>
    </header>
  );
}
