'use client';

import Link from 'next/link';
import type { Verdict } from '@/core/engines';
import type { Direction } from '@/core/resolve';
import { COIN, SCHOOLS, personaFor, type Persona } from '@/lib/panel';
import { routes } from '@/lib/routes';
import { PersonaAvatar, cx } from '../ui';
import { Term } from '../ui/client';
import { Icon } from '../ui/icons';

/**
 * The Panel, on this chart.
 *
 * Seven schools and a coin, as faces. Each face carries its call in a corner badge, and tapping one
 * draws its stop and target on the chart in its own colour and opens what it saw. The disagreement
 * the council exists to show is now visible at a glance — three arrows up, two down, two dashes —
 * instead of hiding behind hover tooltips a phone cannot reach.
 *
 * The honesty is unchanged, only moved: provenance (whose stop, whose target), the rules that fired
 * and how many candles the engine read are all in the selected card, and the dossier one tap further.
 */
export function PanelRow({
  verdicts,
  playerDirection,
  returns,
  selected,
  onSelect,
  entry,
  atr,
}: {
  verdicts: Verdict[];
  playerDirection: Direction | null;
  /** Each engine's own R on this chart, where it traded. From the reveal's style block. */
  returns: Record<string, number> | null;
  selected: string | null;
  onSelect: (engine: string | null) => void;
  entry: number;
  atr: number | null;
}) {
  if (verdicts.length === 0) return null;

  const byEngine = new Map(verdicts.map((verdict) => [verdict.engine as string, verdict]));
  const schools = SCHOOLS.filter((persona) => byEngine.has(persona.engine));
  const coin = byEngine.get(COIN.engine);
  const spoke = schools.filter((persona) => byEngine.get(persona.engine)?.direction);
  const agreed = playerDirection ? spoke.filter((p) => byEngine.get(p.engine)?.direction === playerDirection).length : 0;
  const longs = spoke.filter((p) => byEngine.get(p.engine)?.direction === 'long').length;
  const shorts = spoke.length - longs;

  const summary =
    spoke.length === 0
      ? playerDirection
        ? `You went ${playerDirection}. No school had a trade here.`
        : 'No school had a trade here either.'
      : playerDirection
        ? `You went ${playerDirection}. ${agreed} of ${schools.length} agreed${longs && shorts ? ' — and the panel split' : ''}.`
        : `You sat out. ${spoke.length} of ${schools.length} traded${longs && shorts ? ', on opposite sides' : ''}.`;

  const active = selected ? byEngine.get(selected) : null;
  const persona = selected ? personaFor(selected) : null;

  return (
    <section aria-labelledby="panel-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="panel-heading" className="eyebrow text-ink-dim">
          <Term id="panel">The Panel</Term>
        </h3>
        <Link href={routes.learn.methods} className="text-ink-dim hover:text-ink-hi text-xs">
          Who are they?
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Show a school's trade">
        {schools.map((p) => (
          <Face
            key={p.engine}
            persona={p}
            direction={byEngine.get(p.engine)?.direction ?? null}
            selected={selected === p.engine}
            onClick={() => onSelect(selected === p.engine ? null : p.engine)}
          />
        ))}
        {coin && (
          <>
            <span aria-hidden className="bg-line mx-1 h-7 w-px" />
            <Face
              persona={COIN}
              direction={coin.direction}
              selected={selected === COIN.engine}
              onClick={() => onSelect(selected === COIN.engine ? null : COIN.engine)}
            />
          </>
        )}
      </div>

      <p className="text-ink-lo text-sm">{summary}</p>

      {active && persona && (
        <PersonaCard persona={persona} verdict={active} r={returns?.[persona.engine] ?? null} entry={entry} atr={atr} onClose={() => onSelect(null)} />
      )}
    </section>
  );
}

function Face({
  persona,
  direction,
  selected,
  onClick,
}: {
  persona: Persona;
  direction: Direction | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${persona.name}: ${direction ? `went ${direction}` : 'sat out'}`}
      onClick={onClick}
      className={cx(
        'press rounded-full p-0.5 ring-2 transition-colors',
        selected ? 'ring-ink-max' : 'ring-transparent hover:ring-line-strong',
      )}
    >
      <PersonaAvatar persona={persona} direction={direction} muted={direction === null} size={38} />
    </button>
  );
}

function PersonaCard({
  persona,
  verdict,
  r,
  entry,
  atr,
  onClose,
}: {
  persona: Persona;
  verdict: Verdict;
  r: number | null;
  entry: number;
  atr: number | null;
  onClose: () => void;
}) {
  const bracket = verdict.bracket;
  const risk = bracket ? Math.abs(entry - bracket.stop) : 0;
  const stopAtr = bracket && atr ? risk / atr : null;
  const targetR = bracket && risk > 0 ? Math.abs(bracket.target - entry) / risk : null;

  return (
    <div
      className="animate-rise bg-surface-2 rounded-xl border p-4"
      style={{ borderColor: `color-mix(in oklch, ${persona.colour} 45%, transparent)` }}
    >
      <div className="flex items-start gap-3">
        <PersonaAvatar persona={persona} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-max font-semibold">{persona.name}</span>
            <button type="button" onClick={onClose} aria-label="Close" className="text-ink-dim hover:text-ink-hi -mt-1 -mr-1 p-1">
              <Icon name="x" size={14} />
            </button>
          </div>
          <p className="text-ink-lo text-xs leading-relaxed">{persona.style}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {verdict.direction ? (
          <>
            <span className={cx('font-semibold', verdict.direction === 'long' ? 'text-long-ink' : 'text-short-ink')}>
              Went {verdict.direction}
            </span>
            {stopAtr !== null && targetR !== null && (
              <span className="numeral text-ink-lo text-xs">
                stop {stopAtr.toFixed(2)} ATR · target {targetR.toFixed(1)}R
              </span>
            )}
            {r !== null && (
              <span className={cx('numeral ml-auto font-semibold', r > 0 ? 'text-gain-ink' : r < 0 ? 'text-loss-ink' : 'text-ink-hi')}>
                {r >= 0 ? '+' : ''}
                {r.toFixed(2)}R
              </span>
            )}
          </>
        ) : (
          <span className="text-restraint-ink font-semibold">No setup — sat out</span>
        )}
      </div>

      {verdict.rules.length > 0 && (
        <ul className="text-ink-lo mt-2.5 space-y-1 text-xs leading-relaxed">
          {verdict.rules.slice(0, 4).map((rule) => (
            <li key={rule} className="flex gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: persona.colour }} />
              {rule}
            </li>
          ))}
        </ul>
      )}

      <p className="text-ink-dim mt-3 text-mini leading-relaxed">
        {bracket &&
          `Stop: ${verdict.provenance.stop === 'school' ? "the school's" : 'ours'} · target: ${
            verdict.provenance.target === 'school' ? "the school's" : 'ours'
          } · `}
        read {verdict.candlesUsed} candles
        {verdict.exit ? ` · natively it would ${verdict.exit.description}` : ''}
      </p>
    </div>
  );
}
