'use client';

import { useState } from 'react';
import { DUEL_SPEC, RACE_SPEC } from '@/core/duel';
import { routes } from '@/lib/routes';
import { Button, Panel, Segmented, cx } from '../ui';
import { Select, useToast } from '../ui/client';
import { Icon, type IconName } from '../ui/icons';

/**
 * Set up a duel or a race: the format, the tape, how many charts — then a link to send.
 *
 * Neither needs anyone online. A duel is a link your opponent answers whenever they arrive; a race
 * is a fixed sequence anyone can run, against everyone who ran it before. Both are unrated, which
 * the panel says in one line instead of a paragraph about the ladder.
 */
export function VersusLauncher({
  tapes,
  initialTape = 'open',
}: {
  tapes: { slug: string; name: string; charts: number }[];
  initialTape?: string;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'duel' | 'race'>('duel');
  const [tape, setTape] = useState(tapes.some((t) => t.slug === initialTape) ? initialTape : 'open');
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
    const link = `${window.location.origin}${routes.versus.match(opened.id)}`;
    const share = async () => {
      try {
        if (navigator.share) await navigator.share({ text: `${opened.mode === 'duel' ? 'Duel me' : 'Race me'} on Hindsight`, url: link });
        else {
          await navigator.clipboard.writeText(link);
          toast('Link copied', 'success');
        }
      } catch {
        // Dismissed.
      }
    };
    return (
      <Panel tone="hero" pad="lg" className="animate-rise mx-auto max-w-xl rounded-3xl text-center">
        <span className="bg-gold-bg text-gold-ink ring-gold-line mx-auto grid h-12 w-12 place-items-center rounded-full ring-1">
          <Icon name={opened.mode === 'duel' ? 'swords' : 'flag'} size={22} />
        </span>
        <h2 className="font-display text-ink-max mt-4 text-4xl">{opened.mode === 'duel' ? 'Your duel is open.' : 'Your race is open.'}</h2>
        <p className="text-ink-lo mx-auto mt-2 max-w-md text-sm leading-relaxed">
          {opened.mode === 'duel'
            ? 'Send the link. The charts are drawn when your opponent takes the seat, from ones neither of you has played.'
            : 'Send the link to anyone. The sequence is set, so each runner plays it on their own time.'}
        </p>
        <div className="border-line bg-surface-1 text-ink-hi mt-5 flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-4 text-left">
          <code className="numeral min-w-0 flex-1 truncate text-sm">{link}</code>
          <Button onClick={() => void share()} variant="secondary" size="sm">
            <Icon name="share" size={14} />
            Share
          </Button>
        </div>
        <div className="mt-5 flex justify-center">
          <Button href={opened.mode === 'race' ? routes.play.race(opened.id) : routes.versus.match(opened.id)} variant="primary" size="lg">
            {opened.mode === 'race' ? 'Start running' : 'Go to the duel'}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-6">
        <div role="radiogroup" aria-label="Format" className="grid gap-3 sm:grid-cols-2">
          <Format
            active={mode === 'duel'}
            onClick={() => setMode('duel')}
            icon="swords"
            title="Duel"
            line="You against one friend."
            body={`Same charts, ${DUEL_SPEC.health} health each. Every chart you outscore them on hits their bar — capped at ${DUEL_SPEC.damageCap}, so no single chart decides it.`}
          />
          <Format
            active={mode === 'race'}
            onClick={() => setMode('race')}
            icon="flag"
            title="Race"
            line={`Up to ${RACE_SPEC.maxPlayers} runners, one sequence.`}
            body="Everyone plays the same charts on their own time. Scored on how well you read them, not how fast."
          />
        </div>

        <div className="border-line bg-surface-2 grid gap-5 rounded-2xl border p-5 sm:grid-cols-2">
          <div>
            <div className="eyebrow text-ink-dim">Tape</div>
            <Select
              label="Tape"
              size="md"
              value={tape}
              onChange={setTape}
              className="mt-2 w-full [&>select]:w-full"
              options={tapes.map((t) => ({ value: t.slug, label: `${t.slug === 'open' ? 'Shuffle' : t.name} · ${t.charts.toLocaleString()}` }))}
            />
          </div>
          <div>
            <div className="eyebrow text-ink-dim">Charts</div>
            <Segmented
              label="How many charts"
              size="md"
              block
              className="mt-2"
              value={length}
              onChange={setLength}
              options={[5, 7, 10, 15].map((n) => ({ value: n, label: String(n) }))}
            />
            <p className="text-ink-dim mt-2 text-xs">{mode === 'duel' ? 'Most duels end before the last chart.' : 'Longer races separate readers from lucky streaks.'}</p>
          </div>
        </div>
      </div>

      <Panel tone="hero" pad="md" className="rounded-3xl lg:sticky lg:top-8">
        <div className="eyebrow text-ink-dim">Unrated</div>
        <p className="text-ink-lo mt-2 text-sm leading-relaxed">Versus never moves your rating. Play loose.</p>
        {error && <p className="text-loss-ink mt-4 text-sm">{error}</p>}
        <Button onClick={() => void open()} variant="primary" size="lg" block loading={busy} className="mt-5">
          {mode === 'duel' ? 'Open a duel' : 'Open a race'}
        </Button>
      </Panel>
    </div>
  );
}

function Format({
  active,
  onClick,
  icon,
  title,
  line,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  title: string;
  line: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'press flex flex-col gap-3 rounded-2xl border p-5 text-left transition-colors',
        active ? 'border-gold bg-gold-bg' : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      <span className={cx('grid h-11 w-11 place-items-center rounded-xl ring-1', active ? 'bg-gold text-on-gold ring-gold' : 'bg-fill-2 text-ink-hi ring-line')}>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <div className="text-ink-max text-lg font-semibold">{title}</div>
        <div className="text-ink-hi text-sm">{line}</div>
        <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{body}</p>
      </div>
    </button>
  );
}
