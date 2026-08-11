'use client';

import { TOOLS, type ToolCode } from '@/core/tiers';
import { cx } from '../ui';
import type { DrawTool } from './DrawLayer';

/**
 * The Full Desk toolbar.
 *
 * Three groups, because they behave differently and a player should not have to learn which is
 * which by clicking:
 *
 * - **Pointer tools** are modal — measure, trendline, level, channel, fib. One at a time, and
 *   selecting one takes over the frame's pointer events (see `DrawLayer`).
 * - **Overlays** are toggles — the indicators and Layer 2's annotations. Any number at once.
 * - **Chart options** are toggles that change the chart itself — magnet, log scale.
 *
 * The measure tool is always present, at every rung including Blackout, and it is deliberately the
 * first control. §3.1: identity, hindsight and crutches are restricted and risk arithmetic never
 * is, and a ruler reading out in ATR and R is risk arithmetic. Everything else here appears only
 * where the tier grants it, so at Naked this component renders the ruler and nothing else.
 */

/** Pointer tools, and the tool code that unlocks each. Measure has none — it is universal. */
const POINTER: { tool: DrawTool; label: string; needs: ToolCode | null; hint: string }[] = [
  { tool: 'measure', label: 'Measure', needs: null, hint: 'Drag to measure, in ATR and R' },
  { tool: 'trendline', label: 'Line', needs: 'trendline', hint: 'Drag between two points' },
  { tool: 'level', label: 'Level', needs: 'level', hint: 'Click to place a horizontal level' },
  { tool: 'channel', label: 'Channel', needs: 'channel', hint: 'Drag to place a parallel channel' },
  { tool: 'fib', label: 'Fib', needs: 'fib', hint: 'Drag across a leg to retrace it' },
];

const OVERLAY_ORDER: ToolCode[] = [
  'ma',
  'bollinger',
  'keltner',
  'donchian',
  'volumeProfile',
  'geometry',
  'rsi',
  'macd',
  'stopAlgos',
];

interface Props {
  granted: readonly ToolCode[];
  tool: DrawTool | null;
  onTool: (tool: DrawTool | null) => void;
  active: readonly ToolCode[];
  onToggle: (tool: ToolCode) => void;
  magnet: boolean;
  onMagnet: (on: boolean) => void;
  logScale: boolean;
  onLogScale: (on: boolean) => void;
  disabled?: boolean;
}

function Chip({
  on,
  onClick,
  title,
  children,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'rounded px-2 py-1 font-mono text-[11px] whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        on
          ? 'bg-surface-4 text-ink-max'
          : 'text-ink-dim hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  granted,
  tool,
  onTool,
  active,
  onToggle,
  magnet,
  onMagnet,
  logScale,
  onLogScale,
  disabled,
}: Props) {
  const has = (code: ToolCode) => granted.includes(code);
  const pointer = POINTER.filter((entry) => entry.needs === null || has(entry.needs));
  const overlays = OVERLAY_ORDER.filter(has);
  const nameOf = (code: ToolCode) => TOOLS.find((t) => t.code === code)?.name ?? code;
  const effectOf = (code: ToolCode) => TOOLS.find((t) => t.code === code)?.effect ?? '';

  return (
    <div className="border-line flex flex-wrap items-center gap-x-1 gap-y-1 border-b py-1.5">
      {pointer.map((entry) => (
        <Chip
          key={entry.tool}
          on={tool === entry.tool}
          disabled={disabled}
          title={entry.hint}
          onClick={() => onTool(tool === entry.tool ? null : entry.tool)}
        >
          {entry.label}
        </Chip>
      ))}

      {overlays.length > 0 && <span className="bg-line mx-1 h-4 w-px" />}

      {overlays.map((code) => (
        <Chip
          key={code}
          on={active.includes(code)}
          disabled={disabled}
          title={effectOf(code)}
          onClick={() => onToggle(code)}
        >
          {nameOf(code)}
        </Chip>
      ))}

      {(has('magnet') || has('logScale')) && <span className="bg-line mx-1 h-4 w-px" />}

      {has('magnet') && (
        <Chip
          on={magnet}
          disabled={disabled}
          title="Snap a drawing to the nearest wick"
          onClick={() => onMagnet(!magnet)}
        >
          Magnet
        </Chip>
      )}
      {has('logScale') && (
        <Chip
          on={logScale}
          disabled={disabled}
          title="Logarithmic price axis"
          onClick={() => onLogScale(!logScale)}
        >
          Log
        </Chip>
      )}
    </div>
  );
}
