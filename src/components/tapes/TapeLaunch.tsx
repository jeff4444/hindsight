'use client';

import { useState } from 'react';
import { MODS, TIERS, xpMultiplier, type ModCode, type TierCode } from '@/core/tiers';
import { Button, Eyebrow, cx } from '../ui';

/**
 * Choose a ruleset and mods, then play.
 *
 * §3.6 asks for the edge cases to be written down "before the first ranked season, because the
 * first tournament dispute will be about an edge case and there will be no time to decide then".
 * The player-facing half of that is showing what each rung actually removes rather than only its
 * name — so every tier is listed with its affordances, including the two that are not built, which
 * are shown greyed rather than hidden. Honesty about what exists is worth more than a tidy list.
 *
 * §3.3 makes mods "layerable and not nested", and the multiplier is XP only — §3.4 forbids ranked
 * multipliers on principle, so the number here is never a rating adjustment.
 */
export function TapeLaunch({ slug, locked }: { slug: string; locked: boolean }) {
  const [tier, setTier] = useState<TierCode>('NTZ');
  const [mods, setMods] = useState<ModCode[]>([]);

  const selected = TIERS.find((t) => t.code === tier)!;
  const multiplier = xpMultiplier(selected, mods);
  const href = `/play?mode=tape&tape=${encodeURIComponent(slug)}&tier=${tier}${
    mods.length ? `&mods=${mods.join(',')}` : ''
  }`;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Ruleset</Eyebrow>
        {/* A mutually exclusive choice is a radio group, not a row of toggles: `aria-pressed`
            announces each tier as an independent on/off, which is not what picking a ruleset is.
            Roving tabindex keeps the whole ladder to one tab stop with arrows inside it. */}
        <div role="radiogroup" aria-label="Ruleset" className="mt-2 grid gap-2 sm:grid-cols-2">
          {TIERS.map((option) => {
            const active = option.code === tier;
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTier(option.code)}
                className={cx(
                  'press rounded-md border p-3 text-left transition-colors',
                  active
                    ? 'border-info-line bg-info-bg'
                    : 'border-line bg-surface-1 hover:border-line-strong',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cx(
                      'font-mono text-xs font-semibold',
                      active ? 'text-info-ink' : 'text-ink-hi',
                    )}
                  >
                    {option.code === 'SBX' ? 'SANDBOX' : option.code}
                  </span>
                  <span className="text-ink-faint text-micro font-mono">
                    {option.rated ? `${option.xp.toFixed(2)}×` : 'unrated'}
                  </span>
                </div>
                <div className="text-ink-hi mt-0.5 text-sm">{option.name}</div>
                <p className="text-ink-dim mt-1 text-xs leading-relaxed">{option.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="border-line-faint mt-2 grid gap-2 rounded-md border border-dashed p-3 opacity-55 sm:grid-cols-2">
          {[
            ['FD', 'Full Desk', 'Pre-trade news headlines, indicators, drawing tools.'],
            ['NN', 'News Blind', 'Full Desk without the headlines.'],
          ].map(([code, name, blurb]) => (
            <div key={code}>
              <div className="text-ink-faint font-mono text-xs font-semibold">{code}</div>
              <div className="text-ink-faint mt-0.5 text-sm">{name}</div>
              <p className="text-ink-faint mt-1 text-xs leading-relaxed">{blurb}</p>
            </div>
          ))}
          <p className="text-ink-faint text-micro sm:col-span-2">
            Both wait on the news panel. Until it exists Full Desk is News Blind wearing a different
            name, and a ladder with two rungs that are one rung is not a ladder.
          </p>
        </div>
      </div>

      <div>
        <Eyebrow>Mods</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODS.map((mod) => {
            const active = mods.includes(mod.code);
            return (
              <button
                key={mod.code}
                type="button"
                aria-pressed={active}
                title={mod.effect}
                onClick={() =>
                  setMods((current) =>
                    current.includes(mod.code)
                      ? current.filter((code) => code !== mod.code)
                      : [...current, mod.code],
                  )
                }
                className={cx(
                  'press rounded-md border px-3 py-2 text-left transition-colors',
                  active
                    ? mod.reduction
                      ? 'border-restraint-line bg-restraint-bg'
                      : 'border-attention-line bg-attention-bg'
                    : 'border-line bg-surface-1 hover:border-line-strong',
                )}
              >
                <div
                  className={cx(
                    'text-xs font-medium',
                    active
                      ? mod.reduction
                        ? 'text-restraint-ink'
                        : 'text-attention-ink'
                      : 'text-ink-hi',
                  )}
                >
                  {mod.name}
                </div>
                <div className="text-ink-faint text-micro mt-0.5 font-mono">
                  {mod.xp.toFixed(2)}×
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-ink-dim mt-2 text-xs leading-relaxed">
          Multipliers are XP only. §3.4 refuses them in ranked on principle — &ldquo;every attempt
          to assert a conversion generates an argument that consumes the community&rdquo; — and the
          tier multiplier is meant to be derived from the achieved percentile per tier once there is
          volume, not chosen.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button as="a" href={href} variant="primary" size="lg" disabled={locked}>
          Play {selected.code === 'SBX' ? 'the sandbox' : selected.name}
        </Button>
        <span className="text-ink-dim font-mono text-xs">
          {multiplier.toFixed(2)}× XP{selected.rated ? '' : ' · unrated'}
        </span>
      </div>
    </div>
  );
}
