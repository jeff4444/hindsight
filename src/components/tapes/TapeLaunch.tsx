'use client';

import { useState } from 'react';
import { TIERS, isTierCode, type TierCode } from '@/core/tiers';
import { routes, type RulesCode } from '@/lib/routes';
import { Button, Segmented, Toggle, cx } from '../ui';
import { Term } from '../ui/client';
import { Icon } from '../ui/icons';

/**
 * Play a tape: pick the rules, then go.
 *
 * One control for the ruleset — the four rated rungs, in order of how much they take away — and a
 * sandbox switch for learning without a rating. Mods and their XP multipliers are gone from here:
 * XP never existed, and several mods were not even drawn on screen. A tape that requires a ruleset
 * says so and pins the control, rather than accepting a pick and quietly issuing something else.
 */

const RUNGS = TIERS.filter((tier) => tier.code !== 'SBX');

export function TapeLaunch({
  slug,
  locked,
  requiredTier = null,
}: {
  slug: string;
  locked: boolean;
  requiredTier?: string | null;
}) {
  const pinned = isTierCode(requiredTier) && requiredTier !== 'SBX' ? (requiredTier as RulesCode) : null;
  const [tier, setTier] = useState<RulesCode>(pinned ?? 'NTZ');
  const [sandbox, setSandbox] = useState(false);
  const effective = pinned ?? tier;
  const rung = RUNGS.find((r) => r.code === effective)!;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow text-ink-dim">
            <Term id="rules">Rules</Term>
          </span>
          {pinned && <span className="text-ink-dim text-xs">this tape requires {rung.name}</span>}
        </div>
        <Segmented
          label="Rules"
          size="sm"
          block
          value={effective}
          onChange={(value) => setTier(value as RulesCode)}
          className="mt-2"
          options={RUNGS.map((r) => ({
            value: r.code as TierCode,
            label: r.name,
            disabled: Boolean(pinned) && r.code !== pinned,
          }))}
        />
        <RungFacts code={effective} />
      </div>

      {!pinned && (
        <Toggle
          on={sandbox}
          onChange={setSandbox}
          label="Sandbox"
          hint="Everything on — every tool, every timeframe, no clock — and nothing rated. For learning, not proving."
        />
      )}

      <div className="flex flex-col gap-2">
        <Button
          href={routes.play.tape(slug, sandbox ? { sandbox: true } : { rules: effective })}
          variant="primary"
          size="lg"
          block
          disabled={locked}
          className={cx(locked && 'pointer-events-none opacity-45')}
        >
          <Icon name="play" size={15} />
          {sandbox ? 'Play in the sandbox' : `Play under ${rung.name}`}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button href={routes.play.manage(slug)} variant="secondary" className={cx(locked && 'pointer-events-none opacity-45')}>
            <Icon name="sliders" size={15} />
            Manage it live
          </Button>
          <Button href={`${routes.versus.index}?tape=${encodeURIComponent(slug)}`} variant="secondary" className={cx(locked && 'pointer-events-none opacity-45')}>
            <Icon name="swords" size={15} />
            Duel on it
          </Button>
        </div>
      </div>
    </div>
  );
}

function RungFacts({ code }: { code: string }) {
  const tier = TIERS.find((t) => t.code === code);
  if (!tier) return null;
  const facts = [
    `${tier.candles} candles`,
    tier.timeframes.length > 1 ? `${tier.timeframes.length} timeframes` : 'one timeframe',
    tier.tools.length > 0 ? 'tools and indicators' : 'no tools',
    tier.volume ? 'volume' : 'no volume',
    tier.clockSeconds ? `${tier.clockSeconds}s clock` : 'no clock',
  ];
  return (
    <p className="text-ink-dim mt-2 text-xs">
      {facts.join(' · ')}
      {code === 'NTZ' && <span className="text-ink-lo"> · the ranked standard</span>}
    </p>
  );
}
