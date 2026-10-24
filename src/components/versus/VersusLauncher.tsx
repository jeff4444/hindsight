'use client';

import { useState } from 'react';
import { DUEL_SPEC, RACE_SPEC } from '@/core/duel';
import { Button, Eyebrow, Panel, cx } from '../ui';

/**
 * Open a duel or a race (§10.1).
 *
 * ## A duel is a link, not a lobby, and that is a fairness rule rather than a shortcut
 *
 * The charts are drawn when the second player joins, from charts **neither** has played — because
 * both must see the same ones, and a chart either has already played is one they have been shown the
 * answer to. The opponent therefore has to be known before the sequence can exist, so the flow is:
 * open it, send the link, and play when they have taken the seat.
 *
 * That also makes the mode asynchronous for free. Nobody has to be online at the same time, which
 * matters rather a lot for a product whose player base is currently one person.
 */
export function VersusLauncher({ tapes }: { tapes: { slug: string; name: string; charts: number }[] }) {
  const [mode, setMode] = useState<'duel' | 'race'>('duel');
  const [tape, setTape] = useState('open');
  const [length, setLength] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ id: string; mode: 'duel' | 'race' } | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, tape, length }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? 'Could not open it.');
      return;
    }
    setOpened({ id: body.matchId, mode });
  }

  if (opened) {
    const link = `${window.location.origin}/versus/${opened.id}`;
    return (
      <Panel pad="lg" className="mt-6">
        <Eyebrow>{opened.mode === 'duel' ? 'Duel opened' : 'Race opened'}</Eyebrow>
        <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
          {opened.mode === 'duel'
            ? 'Send this link. The charts are drawn when your opponent takes the seat — from charts neither of you has played, which is why they do not exist yet.'
            : 'Send this link. The sequence already exists, so anyone can run it whenever they like and their time is theirs alone.'}
        </p>
        <code className="border-line bg-surface-1 text-ink mt-4 block overflow-x-auto rounded-md border px-3 py-2 font-mono text-sm">
          {link}
        </code>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => void navigator.clipboard?.writeText(link)}
            variant="secondary"
          >
            Copy the link
          </Button>
          {opened.mode === 'race' ? (
            <Button as="a" href={`/play?mode=race&match=${opened.id}`} variant="primary">
              Start running
            </Button>
          ) : (
            <Button as="a" href={`/versus/${opened.id}`} variant="primary">
              Open the duel
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="space-y-6">
        <section>
          <Eyebrow>Mode</Eyebrow>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Choice
              active={mode === 'duel'}
              onClick={() => setMode('duel')}
              title="Duel"
              body={`Two players, the same charts, a ${DUEL_SPEC.health}-point bar each. Damage is the gap between your two readings of a chart, capped at ${DUEL_SPEC.damageCap}. A chart you both read equally well does nothing.`}
            />
            <Choice
              active={mode === 'race'}
              onClick={() => setMode('race')}
              title="Race"
              body={`Up to ${RACE_SPEC.maxPlayers} runners on one sequence, each against their own clock. Scored on how well you read them, not on how many you got through.`}
            />
          </div>
        </section>

        <section>
          <Eyebrow>Tape</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            {tapes.map((t) => (
              <button
                key={t.slug}
                type="button"
                aria-pressed={tape === t.slug}
                onClick={() => setTape(t.slug)}
                className={cx(
                  'press rounded-md border px-3 py-1.5 text-sm transition-colors',
                  tape === t.slug
                    ? 'border-info-line bg-info-bg text-info-ink'
                    : 'border-line bg-surface-1 text-ink-hi hover:border-line-strong',
                )}
              >
                {t.name}{' '}
                <span className="numeral text-ink-faint text-xs">{t.charts.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <Eyebrow>Charts</Eyebrow>
          <p className="text-ink-faint mt-1 text-xs">
            A duel usually ends before it runs out — a median of 8 charts against a{' '}
            {DUEL_SPEC.health}-point bar, and 15 at the 99th percentile.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[5, 7, 10, 15].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={length === n}
                onClick={() => setLength(n)}
                className={cx(
                  'press numeral rounded-md border px-3 py-1.5 text-sm transition-colors',
                  length === n
                    ? 'border-info-line bg-info-bg text-info-ink'
                    : 'border-line bg-surface-1 text-ink-hi hover:border-line-strong',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      </div>

      <Panel tone="hero" pad="md" className="lg:sticky lg:top-6">
        <Eyebrow>Unrated</Eyebrow>
        <p className="text-ink-lo mt-2 text-sm leading-relaxed">
          Versus never moves your rating. Play loose, play a friend, play the ghosts.
        </p>
        {error && <p className="text-loss-ink mt-4 text-sm">{error}</p>}
        <Button onClick={() => void open()} variant="primary" size="lg" className="mt-5 w-full" disabled={busy}>
          {busy ? 'Opening…' : mode === 'duel' ? 'Open a duel' : 'Open a race'}
        </Button>
      </Panel>
    </div>
  );
}

function Choice({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'press rounded-md border p-3 text-left transition-colors',
        active ? 'border-info-line bg-info-bg' : 'border-line bg-surface-1 hover:border-line-strong',
      )}
    >
      <div className={cx('text-sm font-semibold', active ? 'text-info-ink' : 'text-ink-hi')}>
        {title}
      </div>
      <p className="text-ink-lo mt-1 text-xs leading-relaxed">{body}</p>
    </button>
  );
}
