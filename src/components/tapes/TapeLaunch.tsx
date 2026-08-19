'use client';

import { useState } from 'react';
import { MODS, TIERS, isTierCode, xpMultiplier, type ModCode, type TierCode } from '@/core/tiers';
import { Button, Eyebrow, cx } from '../ui';
import { Icon } from '../ui/icons';

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
export function TapeLaunch({
  slug,
  locked,
  requiredTier = null,
}: {
  slug: string;
  locked: boolean;
  /**
   * §11.2's tier lock. When a tape requires a ruleset, the choice is not the player's — and the
   * surface says so rather than accepting a pick and quietly issuing something else.
   */
  requiredTier?: string | null;
}) {
  const [tier, setTier] = useState<TierCode>(
    isTierCode(requiredTier) ? requiredTier : 'NTZ',
  );
  const [mods, setMods] = useState<ModCode[]>([]);

  // The server enforces this too, and its answer is the one that counts. Locking the control here
  // only means a player is never shown a choice that will be taken away from them.
  const pinned = isTierCode(requiredTier) ? requiredTier : null;
  const effectiveTier = pinned ?? tier;
  const effectiveMods = pinned ? [] : mods;

  const selected = TIERS.find((t) => t.code === effectiveTier)!;
  const multiplier = xpMultiplier(selected, effectiveMods);
  const href = `/play?mode=tape&tape=${encodeURIComponent(slug)}&tier=${effectiveTier}${
    effectiveMods.length ? `&mods=${effectiveMods.join(',')}` : ''
  }`;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Ruleset</Eyebrow>
        {pinned && (
          <p className="text-attention-ink bg-attention/10 ring-attention/30 mt-2 rounded-md px-3 py-2 text-sm ring-1">
            This tape requires <span className="font-mono font-semibold">{pinned}</span>, so every
            result on it is comparable. Mods are off here for the same reason.
          </p>
        )}
        {/* A mutually exclusive choice is a radio group, not a row of toggles: `aria-pressed`
            announces each tier as an independent on/off, which is not what picking a ruleset is.
            Roving tabindex keeps the whole ladder to one tab stop with arrows inside it. */}
        <div role="radiogroup" aria-label="Ruleset" className="mt-2 grid gap-2 sm:grid-cols-2">
          {TIERS.map((option) => {
            const active = option.code === effectiveTier;
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={active}
                // Disabled rather than hidden: an operator's cohort should be able to see the rest
                // of the ladder and see that it is not on offer here.
                disabled={pinned !== null && !active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTier(option.code)}
                className={cx(
                  'press rounded-md border p-3 text-left transition-colors',
                  active
                    ? 'border-info-line bg-info-bg'
                    : 'border-line bg-surface-1 hover:border-line-strong',
                  pinned !== null && !active && 'cursor-not-allowed opacity-40',
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
                {/* The toolbox, as a count. Full Desk's whole reason for existing is the fourteen,
                    and the ladder was describing every rung without once saying how many tools it
                    hands you — which is now the axis the top two rungs differ on. */}
                <p className="text-ink-faint mt-1.5 inline-flex items-center gap-1 text-micro">
                  <Icon name="activity" size={11} />
                  {option.tools.length === 0
                    ? 'No tools'
                    : `${option.tools.length} tools`}
                  <span aria-hidden>·</span>
                  <Icon name="ruler" size={11} />
                  Ruler always
                </p>
              </button>
            );
          })}
        </div>

      </div>

      <div>
        <Eyebrow>Mods</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODS.map((mod) => {
            const active = effectiveMods.includes(mod.code);
            return (
              <button
                key={mod.code}
                type="button"
                aria-pressed={active}
                title={mod.effect}
                disabled={pinned !== null}
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
                  pinned !== null && 'cursor-not-allowed opacity-40',
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
          Multipliers are XP only. The ruleset refuses them in ranked on principle — &ldquo;every attempt
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

      {/*
        §10.1's other ladder, reachable from the same tape.

        Deliberately outside the ruleset picker above rather than inside it as an eighth tier. The
        tiers vary what the *player can see* — candles, timeframes, tools — and Manage varies what
        they can *do*, which is a different axis entirely. Folding it in would suggest Manage is a
        harder Naked, and §17 measures that it is neither harder nor easier: its distribution has a
        different median, so the two scores are not on the same scale at all.
      */}
      <div className="border-line-faint mt-1 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button as="a" href={`/manage?tape=${encodeURIComponent(slug)}`} variant="secondary" disabled={locked}>
            Manage this tape
          </Button>
          <span className="text-ink-dim font-mono text-xs">separate rating</span>
        </div>
        <p className="text-ink-dim mt-2 max-w-prose text-xs leading-relaxed">
          No target: the candles advance and you decide when to leave. Scored against 98 management
          policies rather than 98 brackets, on a ladder that never touches your Naked rating —
          because the point of having both is to find out whether they are the same skill.
        </p>
      </div>
    </div>
  );
}
