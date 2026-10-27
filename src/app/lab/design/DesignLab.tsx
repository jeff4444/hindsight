'use client';

import { useState } from 'react';
import {
  Button,
  Chip,
  EmptyState,
  Eyebrow,
  Field,
  Panel,
  PersonaAvatar,
  Segmented,
  Stat,
  Toggle,
} from '@/components/ui';
import { PalettePreference, Tabs, Term, ThemePreference } from '@/components/ui/client';
import { Wordmark, Mark } from '@/components/ui/icons';
import { PANEL } from '@/lib/panel';

const SWATCHES = [
  'surface-0',
  'surface-1',
  'surface-2',
  'surface-3',
  'ink-max',
  'ink',
  'ink-lo',
  'ink-dim',
  'gold',
  'long',
  'short',
  'restraint',
  'info',
];

export function DesignLab() {
  const [type, setType] = useState('limit');
  const [tab, setTab] = useState('positions');
  const [on, setOn] = useState(true);

  return (
    <main className="mx-auto max-w-5xl space-y-14 px-5 py-12">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <Wordmark size="lg" />
        <div className="flex flex-wrap gap-6">
          <ThemePreference />
          <PalettePreference />
        </div>
      </header>

      <section className="space-y-4">
        <Eyebrow>Palette</Eyebrow>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7">
          {SWATCHES.map((name) => (
            <div key={name} className="space-y-1.5">
              <div className="ring-line h-14 rounded-lg ring-1" style={{ background: `var(--color-${name})` }} />
              <div className="numeral text-ink-dim text-mini">{name}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Eyebrow>Type</Eyebrow>
        <h1 className="font-display text-ink-max text-5xl md:text-6xl">Trade the past like it is live.</h1>
        <p className="font-display text-ink-hi text-3xl italic">A clean session.</p>
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">Section heading in Inter</h2>
        <p className="text-ink max-w-prose text-base">
          Body copy. Read the market, place the order, watch it fill. Your <Term id="equity" /> is what
          the account is worth, and <Term id="buyingPower" /> is how much more it can take on.
        </p>
        <p className="numeral text-ink-max text-display">+$2,412.80</p>
      </section>

      <section className="space-y-4">
        <Eyebrow>Actions</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" kbd="⏎">Buy 0.25 BTC</Button>
          <Button size="lg">Cancel all</Button>
          <Button variant="ghost" size="lg">Step</Button>
          <Button variant="danger">End session</Button>
          <Button variant="primary" loading>Placing</Button>
          <Button href="/lab/design" variant="subtle">A link</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>Binance spot</Chip>
          <Chip tone="long" dot>Long</Chip>
          <Chip tone="short" dot>Short</Chip>
          <Chip tone="info">Practice</Chip>
          <Chip tone="gold">Ranked</Chip>
          <Chip tone="info" mono>15m/s</Chip>
        </div>
        <Segmented
          label="Order type"
          value={type}
          onChange={setType}
          size="md"
          options={[
            { value: 'market', label: 'Market' },
            { value: 'limit', label: 'Limit' },
            { value: 'stop', label: 'Stop' },
          ]}
        />
        <Tabs
          label="Account"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'positions', label: 'Positions', count: 1 },
            { value: 'orders', label: 'Open orders', count: 2 },
            { value: 'fills', label: 'Fills' },
          ]}
        />
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <Panel pad="md" className="flex flex-col items-center justify-center gap-1">
          <div className="numeral text-long-ink text-3xl font-semibold">+$1,402.16</div>
          <div className="numeral text-long-ink text-sm">+1.40% on $100,000.00</div>
        </Panel>
        <Panel pad="md" className="space-y-4">
          <Eyebrow>The Panel</Eyebrow>
          <div className="flex flex-wrap gap-3">
            {PANEL.map((persona, i) => (
              <PersonaAvatar
                key={persona.engine}
                persona={persona}
                direction={i % 3 === 0 ? 'long' : i % 3 === 1 ? 'short' : null}
                muted={i % 3 === 2}
              />
            ))}
          </div>
        </Panel>
        <Panel pad="md" className="space-y-3">
          <Eyebrow>Terms</Eyebrow>
          <p className="text-ink-lo text-sm leading-relaxed">
            <Term id="liquidation" />, <Term id="maker" /> and <Term id="taker" />, <Term id="oco" />.
          </p>
        </Panel>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <Panel pad="md" className="space-y-4">
          <Stat label="Equity" value="$101,402.16" delta={0.014} />
          <Stat label="Win rate" value="62%" tone="long" />
          <Toggle on={on} onChange={setOn} label="Take-profit" hint="Close the position at a price on the winning side." />
        </Panel>
        <Panel pad="md" className="space-y-4">
          <Field id="email" label="Email" placeholder="you@example.com" />
          <Mark size={48} tone="duo" />
        </Panel>
        <Panel pad="md" className="space-y-2">
          <Eyebrow>Fee schedule</Eyebrow>
          <Stat label="Maker" value="0.10%" size="sm" />
          <Stat label="Taker" value="0.10%" size="sm" />
        </Panel>
      </section>

      <EmptyState icon="candle" title="No sessions yet." body="Open a market, place a trade, and it shows up here with its result and a full review." action={<Button variant="primary">Browse markets</Button>} />
    </main>
  );
}
