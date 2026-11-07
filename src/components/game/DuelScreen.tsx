'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DuelClient } from '@/lib/game/driver';
import type { DuelView } from '@/lib/game/types';
import { routes } from '@/lib/routes';
import { Button, Chip, EmptyState, cx } from '../ui';
import { useToast } from '../ui/client';
import { Icon } from '../ui/icons';
import { StartDuelButton } from './DuelButtons';

/**
 * A duel (docs/rules.md §23.6): two health bars, ten tapes, and whatever you can do next.
 *
 * A duel is asynchronous. Each seat plays its tapes in order and may run ahead of the other; a
 * tape deals its damage once both have played it. An opponent's grade on a tape is shown only once
 * you have played that tape, so the page polls while it is waiting on them and never earlier.
 */

const POLL_MS = 8000;

function HealthBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'me' | 'them' }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-hi truncate text-sm font-medium">{label}</span>
        <span className="numeral text-ink-max text-lg font-semibold">
          {value}
          <span className="text-ink-dim text-xs font-normal"> / {max}</span>
        </span>
      </div>
      <div className="bg-fill-2 mt-1.5 h-3 overflow-hidden rounded-full">
        <div
          className={cx('h-full rounded-full transition-[width] duration-700', tone === 'me' ? 'bg-long' : 'bg-short')}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function DuelScreen({ code }: { code: string }) {
  const router = useRouter();
  const toast = useToast();
  const [duel, setDuel] = useState<DuelView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    DuelClient.get(code)
      .then(setDuel)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The duel could not be loaded.'));
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll only while something the other seat does would change the page.
  const waiting = duel !== null && (duel.status === 'waiting' || duel.waitingOnThem);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const play = () => {
    setBusy(true);
    DuelClient.play(code)
      .then(({ roundId }) => router.push(routes.play.round(roundId)))
      .catch((reason: unknown) => {
        toast(reason instanceof Error ? reason.message : 'The tape could not be dealt.', 'error');
        setBusy(false);
        load();
      });
  };

  const join = () => {
    setBusy(true);
    DuelClient.join(code)
      .then((view) => setDuel(view))
      .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'You could not join this duel.', 'error'))
      .finally(() => setBusy(false));
  };

  if (error && !duel) {
    return <EmptyState icon="alert" title="No such duel." body={error} action={<Button href={routes.play.index}>Back to Play</Button>} />;
  }
  if (!duel) {
    return <div className="text-ink-dim py-16 text-center text-sm">Loading the duel…</div>;
  }

  const opponentName = duel.opponent?.name ?? 'Nobody yet';
  const link = typeof window !== 'undefined' ? `${window.location.origin}${routes.duel(duel.code)}` : routes.duel(duel.code);

  // Someone else's invitation.
  if (!duel.seated) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
        <div>
          <div className="eyebrow text-gold-ink">A duel</div>
          <h1 className="font-display text-ink-max mt-2 text-4xl leading-tight">
            {duel.status === 'waiting' ? `${duel.me.name} wants to duel.` : 'This duel already has two players.'}
          </h1>
          <p className="text-ink-lo mt-3">
            Ten tapes, the same ones for both of you. Each of you starts at 1000 points; on every tape the lower grade takes damage, and the bigger the gap the
            harder it hits. Knock them to zero, or have more left after ten.
          </p>
        </div>
        {duel.status === 'waiting' ? (
          <Button variant="primary" size="lg" loading={busy} onClick={join}>
            Take the other seat
          </Button>
        ) : (
          <Button href={routes.play.index} variant="secondary">
            Start your own
          </Button>
        )}
      </div>
    );
  }

  const result =
    duel.status === 'over'
      ? duel.winner === 'me'
        ? duel.knockout
          ? `You knocked out ${opponentName}.`
          : `You beat ${opponentName}.`
        : duel.winner === 'them'
          ? duel.knockout
            ? `${opponentName} knocked you out.`
            : `${opponentName} won.`
          : 'A draw.'
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-gold-ink">Duel</span>
          {duel.kind === 'school' && <Chip size="sm" tone="info">School</Chip>}
          {duel.status === 'over' && <Chip size="sm">Over</Chip>}
        </div>
        <h1 className="font-display text-ink-max text-4xl leading-tight md:text-5xl">
          {result ?? (duel.status === 'waiting' ? 'Waiting for an opponent.' : `You vs ${opponentName}.`)}
        </h1>
      </div>

      <div className="bg-surface-2 border-line flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:gap-8">
        <HealthBar label={`You · ${duel.me.name}`} value={duel.health.me} max={duel.maxHealth} tone="me" />
        <HealthBar label={opponentName} value={duel.health.them} max={duel.maxHealth} tone="them" />
      </div>

      {duel.status === 'waiting' && (
        <div className="bg-surface-2 border-line flex flex-col gap-3 rounded-2xl border p-5">
          <p className="text-ink-hi">Send this link to whoever you want to duel. The tapes are dealt when they open it: ten that neither of you has played.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="bg-surface-1 border-line-faint text-ink-hi flex-1 truncate rounded-lg border px-3 py-2 text-sm">{link}</code>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="text-ink-dim text-mini">This page checks every few seconds and starts the duel when they arrive.</p>
        </div>
      )}

      {duel.status === 'active' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-lo text-sm">
            {duel.next !== null
              ? duel.waitingOnThem
                ? `${opponentName} has not caught up yet. You can keep playing; damage lands once you have both played a tape.`
                : `Tape ${duel.next + 1} of ${duel.tapeLimit} is yours to play.`
              : `You have played every tape. Waiting on ${opponentName}.`}
          </p>
          {duel.next !== null && (
            <Button variant="primary" size="lg" loading={busy} onClick={play}>
              Play tape {duel.next + 1}
            </Button>
          )}
        </div>
      )}

      {duel.status === 'over' && (
        <div className="flex flex-wrap gap-2">
          <StartDuelButton school={duel.kind === 'school' ? duel.opponent?.code : undefined} label={duel.kind === 'school' ? `Duel ${opponentName} again` : 'Start another duel'} />
          <Button href={routes.play.index} variant="secondary">
            Back to Play
          </Button>
        </div>
      )}

      {duel.status !== 'waiting' && (
        <div className="bg-surface-2 border-line overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-dim text-mini border-line-faint border-b text-left">
                <th className="px-4 py-2 font-medium">Tape</th>
                <th className="px-4 py-2 font-medium">Market</th>
                <th className="px-4 py-2 text-right font-medium">You</th>
                <th className="px-4 py-2 text-right font-medium">{opponentName}</th>
                <th className="px-4 py-2 text-right font-medium">Damage</th>
              </tr>
            </thead>
            <tbody>
              {duel.tapes.map((tape) => (
                <tr key={tape.index} className="border-line-faint border-b last:border-b-0">
                  <td className="numeral text-ink-dim px-4 py-2.5">{tape.index + 1}</td>
                  <td className="text-ink-hi px-4 py-2.5">
                    {tape.roundId && tape.mine !== null ? (
                      <Link href={routes.play.round(tape.roundId)} className="hover:text-ink-max underline decoration-dotted underline-offset-4">
                        {tape.display ?? 'Review'}
                      </Link>
                    ) : tape.roundId ? (
                      <Link href={routes.play.round(tape.roundId)} className="text-gold-ink">
                        In progress
                      </Link>
                    ) : (
                      <span className="text-ink-dim">—</span>
                    )}
                  </td>
                  <td className="numeral text-ink-hi px-4 py-2.5 text-right">{tape.mine ?? '—'}</td>
                  <td className="numeral text-ink-hi px-4 py-2.5 text-right">{tape.theirs ?? (tape.mine !== null ? 'waiting' : '—')}</td>
                  <td
                    className={cx(
                      'numeral px-4 py-2.5 text-right font-semibold',
                      tape.to === 'me' ? 'text-short-ink' : tape.to === 'them' ? 'text-long-ink' : 'text-ink-dim',
                    )}
                  >
                    {tape.damage === null ? '—' : tape.to === null ? '0' : `${tape.to === 'me' ? 'you −' : 'them −'}${tape.damage}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
