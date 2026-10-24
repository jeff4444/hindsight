'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIERS, type TierCode } from '@/core/tiers';
import {
  DRIFT_LIMIT,
  EMPTY_FILTER,
  TAPE_VOCABULARY,
  MIN_TAPE_CHARTS,
  describeFilter,
  hasAnyCondition,
  type TapeFilter,
  type Visibility,
} from '@/core/tapes';
import { Button, Eyebrow, Field, INPUT_CLASS, Panel, cx } from '../ui';

/**
 * §11.2's tape builder.
 *
 * The whole design problem here is that the consequential output is invisible. Someone picking
 * conditions cannot see whether they have described a third of the library or four charts, and
 * finding out at submit means starting again — so the count is live, it is the largest number on the
 * screen, and the create button refuses below §11.1's usable minimum.
 *
 * The vocabulary is closed on purpose and the reason is worth reading in `src/core/tapes.ts`: every
 * condition is a stored tag computed from the lead-in, which is what makes a tape's difficulty
 * distribution reproducible (§11.1) and what keeps §12.1 intact. Hand-picking, which §11.2 also
 * offers, is deliberately absent.
 */
export function TapeBuilder() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [blurb, setBlurb] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('unlisted');
  const [lockedTier, setLockedTier] = useState<TierCode | null>(null);
  const [filter, setFilter] = useState<TapeFilter>(EMPTY_FILTER);
  const [charts, setCharts] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounced, because the drift inputs fire on every keystroke and each one is a count over the
  // whole corpus. 250ms is below the threshold where a number feels stale and far above the rate a
  // person types digits.
  useEffect(() => {
    // No state reset on the empty case — `shownCharts` derives that below. Clearing it here would be
    // a render whose only job is to undo the previous one.
    if (!hasAnyCondition(filter)) return;
    const timer = setTimeout(async () => {
      setCounting(true);
      try {
        const response = await fetch('/api/tapes/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(filter),
        });
        const body = await response.json();
        setCharts(response.ok ? body.charts : null);
      } catch {
        setCharts(null);
      } finally {
        setCounting(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [filter]);

  const conditions = describeFilter(filter);
  // A count belongs to a filter. With no conditions there is nothing to count, and showing the last
  // filter's number beside no conditions would be showing someone a stale answer.
  const shownCharts = hasAnyCondition(filter) ? charts : null;
  const tooSmall = shownCharts !== null && shownCharts < MIN_TAPE_CHARTS;
  const ready = name.trim().length >= 3 && hasAnyCondition(filter) && shownCharts !== null && !tooSmall;

  async function create() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/tapes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, blurb, visibility, lockedTier, filter }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? 'Could not create the tape.');
      return;
    }
    router.push(`/tapes/${body.slug}`);
  }


  const conditionsBody = (
    <>

          <Group label="Regime">
            {TAPE_VOCABULARY.er.map((value) => (
              <Toggle
                key={value}
                active={filter.er.includes(value)}
                onClick={() =>
                  setFilter((f) => ({ ...f, er: toggle(f.er, value) }))
                }
              >
                {value}
              </Toggle>
            ))}
          </Group>

          <Group label="Volatility">
            {TAPE_VOCABULARY.vol.map((value) => (
              <Toggle
                key={value}
                active={filter.vol.includes(value)}
                onClick={() => setFilter((f) => ({ ...f, vol: toggle(f.vol, value) }))}
              >
                {value}
              </Toggle>
            ))}
          </Group>

          <Group label="Themes" hint="A chart qualifies if it carries any one of these.">
            {TAPE_VOCABULARY.themes.map((value) => (
              <Toggle
                key={value}
                active={filter.themes.includes(value)}
                onClick={() => setFilter((f) => ({ ...f, themes: toggle(f.themes, value) }))}
              >
                {value.replace(/-/g, ' ')}
              </Toggle>
            ))}
          </Group>

          <Group label="Drift across the window" hint={`In ATR, as displayed. The corpus runs to about ±14.`}>
            <label className="text-ink-lo flex items-center gap-2 text-sm">
              at most
              <input
                type="number"
                className={cx(INPUT_CLASS, 'w-24')}
                value={filter.driftBelow ?? ''}
                min={-DRIFT_LIMIT}
                max={DRIFT_LIMIT}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, driftBelow: numberOrNull(e.target.value) }))
                }
                placeholder="—"
              />
            </label>
            <label className="text-ink-lo flex items-center gap-2 text-sm">
              at least
              <input
                type="number"
                className={cx(INPUT_CLASS, 'w-24')}
                value={filter.driftAbove ?? ''}
                min={-DRIFT_LIMIT}
                max={DRIFT_LIMIT}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, driftAbove: numberOrNull(e.target.value) }))
                }
                placeholder="—"
              />
            </label>
          </Group>

          <Group label="The Panel">
            <Toggle
              active={filter.councilSplit}
              onClick={() => setFilter((f) => ({ ...f, councilSplit: !f.councilSplit }))}
            >
              the Panel takes opposite sides
            </Toggle>
          </Group>
        
    </>
  );

  const rulesBody = (
    <>
          <div className="flex flex-wrap gap-2">
            <Toggle active={lockedTier === null} onClick={() => setLockedTier(null)}>
              player chooses
            </Toggle>
            {TIERS.map((tier) => (
              <Toggle
                key={tier.code}
                active={lockedTier === tier.code}
                onClick={() => setLockedTier(tier.code)}
              >
                {tier.name}
              </Toggle>
            ))}
          </div>
        
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-5">
        <Step n={1} title="Pick the rule" hint="Which charts belong on this tape. Every condition reads only the history before the decision, so the tape never gives away how its charts end.">
          {conditionsBody}
        </Step>

        <Step n={2} title="Choose the rules" hint="Lock a ruleset and everyone plays this tape under it — what makes a cohort's results comparable. Or let each player choose.">
          {rulesBody}
        </Step>

        <Step n={3} title="Name it and share it">
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={INPUT_CLASS}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Week 1 — reading a falling chart"
            />
          </Field>
          <Field label="Description" hint="What this trains, and what it does not. Optional.">
            <textarea
              className={cx(INPUT_CLASS, 'min-h-24 resize-y')}
              value={blurb}
              maxLength={600}
              onChange={(e) => setBlurb(e.target.value)}
            />
          </Field>
        </div>

        <section>
          <div className="eyebrow text-ink-dim mt-5">Who can see it</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ['private', 'only me'],
                ['unlisted', 'anyone with the link'],
                ['public', 'anyone'],
              ] as const
            ).map(([value, label]) => (
              <Toggle key={value} active={visibility === value} onClick={() => setVisibility(value)}>
                {label}
              </Toggle>
            ))}
          </div>
          <p className="text-ink-dim mt-2 max-w-prose text-xs leading-relaxed">
            Unlisted: anyone with the link can play it, and it is listed nowhere. Public: it also appears under
            Community.
          </p>
        </section>
        </Step>
      </div>

      <Panel tone="hero" pad="md" className="rounded-3xl lg:sticky lg:top-8">
        <Eyebrow>In this tape</Eyebrow>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className={cx(
              'numeral text-display-sm font-semibold',
              tooSmall ? 'text-loss-ink' : 'text-ink-max',
              counting && 'opacity-50',
            )}
          >
            {shownCharts === null ? '—' : shownCharts.toLocaleString()}
          </span>
          <span className="text-ink-dim text-sm">charts</span>
        </div>

        {conditions.length > 0 ? (
          <ul className="text-ink-lo mt-4 space-y-1 text-sm">
            {conditions.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-dim mt-4 text-sm leading-relaxed">
            Pick at least one condition. A tape with none is the whole library, which already exists.
          </p>
        )}

        {tooSmall && (
          <p className="text-loss-ink mt-4 text-sm leading-relaxed">
            A tape needs at least {MIN_TAPE_CHARTS} charts. Below that the same ones come round inside a
            single sitting.
          </p>
        )}

        {error && <p className="text-loss-ink mt-4 text-sm">{error}</p>}

        <Button
          onClick={() => void create()}
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          disabled={!ready || busy}
        >
          {busy ? 'Creating…' : 'Create the tape'}
        </Button>
      </Panel>
    </div>
  );
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** Empty means "no bound", which is a different thing from zero — hence null rather than 0. */
function numberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="eyebrow text-ink-dim">{label}</div>
      {hint && <p className="text-ink-dim mt-1 text-xs">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'press rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors',
        active
          ? 'bg-thumb text-ink-max ring-line-strong shadow-e1'
          : 'bg-fill-1 text-ink-lo ring-line-faint hover:text-ink-hi',
      )}
    >
      {children}
    </button>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-surface-2 rounded-2xl border p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="numeral bg-gold-bg text-gold-ink ring-gold-line grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold ring-1">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-ink-max text-lg font-semibold">{title}</h2>
          {hint && <p className="text-ink-lo mt-1 max-w-prose text-sm leading-relaxed">{hint}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
