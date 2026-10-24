'use client';

import { useState } from 'react';
import {
  Button,
  Chip,
  DivisionBadge,
  EmptyState,
  Eyebrow,
  Field,
  FogPanel,
  Panel,
  PersonaAvatar,
  ScoreRing,
  Segmented,
  Stat,
  Toggle,
} from '@/components/ui';
import { PalettePreference, Tabs, Term, ThemePreference } from '@/components/ui/client';
import { Wordmark, Mark } from '@/components/ui/icons';
import { DIVISIONS } from '@/core/divisions';
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
  const [rules, setRules] = useState('NTZ');
  const [tab, setTab] = useState('daily');
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
        <h1 className="font-display text-ink-max text-5xl md:text-6xl">In hindsight, short was the trade.</h1>
        <p className="font-display text-ink-hi text-3xl italic">Clean read.</p>
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">Section heading in Inter</h2>
        <p className="text-ink max-w-prose text-base">
          Body copy. Read the chart, call the trade, watch it play out. Your <Term id="score" /> ranks
          your trade against every one you could have placed, and <Term id="par" /> is the typical one.
        </p>
        <p className="numeral text-ink-max text-display">+2.40R</p>
      </section>

      <section className="space-y-4">
        <Eyebrow>Actions</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" kbd="⏎">Lock in</Button>
          <Button size="lg">Sit out</Button>
          <Button variant="ghost" size="lg">Replay</Button>
          <Button variant="danger">Leave session</Button>
          <Button variant="primary" loading>Locking in</Button>
          <Button href="/lab/design" variant="subtle">A link</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>Naked · 1h · 90s</Chip>
          <Chip tone="long" dot>Long</Chip>
          <Chip tone="short" dot>Short</Chip>
          <Chip tone="restraint">Sat out</Chip>
          <Chip tone="gold">Best in hindsight</Chip>
          <Chip tone="info" mono>3/5</Chip>
        </div>
        <Segmented
          label="Rules"
          value={rules}
          onChange={setRules}
          size="md"
          options={[
            { value: 'FD', label: 'Full Desk' },
            { value: 'NT', label: 'No Tools' },
            { value: 'NTZ', label: 'Naked' },
            { value: 'NTVZ', label: 'Blackout' },
          ]}
        />
        <Tabs
          label="Boards"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'daily', label: 'Daily', count: 1203 },
            { value: 'ranked', label: 'Ranked' },
            { value: 'tapes', label: 'Tapes' },
          ]}
        />
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <Panel pad="md" className="flex flex-col items-center gap-4">
          <ScoreRing score={78} />
          <div className="numeral text-long-ink text-3xl font-semibold">+1.40R</div>
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
          <Eyebrow>Divisions</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <DivisionBadge division={null} placing={18} />
            {DIVISIONS.map((division) => (
              <DivisionBadge key={division.id} division={division} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <Panel pad="md" className="space-y-4">
          <Stat label="Rating" value="1,532" delta={12} />
          <Stat label="Score" value="78" tone="long" />
          <Toggle on={on} onChange={setOn} label="Sound" hint="A tick per candle, a chime at the target." />
        </Panel>
        <Panel pad="md" className="space-y-4">
          <Field id="email" label="Email" placeholder="you@example.com" />
          <Mark size={48} tone="duo" />
        </Panel>
        <FogPanel label="60h ahead" className="min-h-44" />
      </section>

      <EmptyState icon="tape" title="Make your first tape" body="A tape is a playlist of charts that share one rule." action={<Button variant="primary">New tape</Button>} />
    </main>
  );
}
