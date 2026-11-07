import Link from 'next/link';
import { GAME_SCHOOLS } from '@/lib/game/schools';
import { getDuels, getRecord } from '@/lib/game/server/queries';
import { routes } from '@/lib/routes';
import { formatUsd } from '@/lib/trading/format';
import { currentViewer } from '@/lib/viewer';
import { Button, Chip, PageHeader, cx } from '@/components/ui';
import { StartDuelButton } from '@/components/game/DuelButtons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Play' };

/**
 * Play: the three ways to use a grade (docs/rules.md §23), and what you have done with them.
 *
 * A round is one trade on a fresh $500, graded 0 to 1000 against the best and worst the tape
 * allowed. Training grounds score it; a duel turns the gap between two grades into damage; a
 * school is a duel whose opponent shows its working afterwards.
 */
export default async function PlayPage() {
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const [record, duels] = await Promise.all([getRecord(owner), getDuels(owner)]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Play"
        title="One trade. Sixty hours. A grade out of 1000."
        lede="Read a real market, draw your levels, place one trade with its take-profit and stop on a fresh $500, and lock it in. Then the tape plays, and you are graded against the best and the worst trade it allowed."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card eyebrow="Training grounds" title="Just you and the tape." body="A real market you have not seen. Your grade is your score.">
          <Button href={routes.play.new} variant="primary" block>
            Deal a tape
          </Button>
        </Card>
        <Card eyebrow="Duel" title="You against a friend." body="Ten tapes, the same for both. The lower grade takes damage, and a bigger gap hits harder.">
          <StartDuelButton label="Start a duel" block />
        </Card>
        <Card eyebrow="Schools" title="Learn from an opponent." body="Duel a school, then read what it saw on every tape and why it traded it.">
          {GAME_SCHOOLS.slice(0, 1).map((school) => (
            <StartDuelButton key={school.code} school={school.code} label={`Duel ${school.name}`} variant="secondary" block />
          ))}
          <Link href={routes.schools} className="text-ink-lo hover:text-ink-hi mt-2 block text-center text-xs underline underline-offset-4">
            About the schools
          </Link>
        </Card>
      </div>

      {duels.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow text-ink-dim">Your duels</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {duels.map((duel) => {
              const state =
                duel.status === 'waiting'
                  ? 'Waiting for an opponent'
                  : duel.status === 'over'
                    ? duel.winner === 'me'
                      ? 'Won'
                      : duel.winner === 'them'
                        ? 'Lost'
                        : 'Drawn'
                    : duel.next !== null
                      ? `Your move: tape ${duel.next + 1}`
                      : 'Their move';
              return (
                <Link
                  key={duel.code}
                  href={routes.duel(duel.code)}
                  className="press bg-surface-2 border-line hover:border-line-strong flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-ink-hi truncate font-medium">vs {duel.opponent?.name ?? 'nobody yet'}</div>
                    <div className="text-ink-dim text-mini">{state}</div>
                  </div>
                  <div className="numeral shrink-0 text-right text-sm">
                    <span className="text-long-ink">{duel.health.me}</span>
                    <span className="text-ink-dim"> · </span>
                    <span className="text-short-ink">{duel.health.them}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow text-ink-dim">Your rounds</h2>
          {record.meanGrade !== null && (
            <span className="text-ink-lo text-sm">
              {record.rounds} played · average grade <span className="numeral text-ink-hi font-semibold">{record.meanGrade}</span>
            </span>
          )}
        </div>
        {record.recent.length === 0 ? (
          <p className="text-ink-lo text-sm">Nothing yet. Deal a tape: the first one takes a few minutes, most of which is reading.</p>
        ) : (
          <div className="bg-surface-2 border-line divide-line-faint divide-y overflow-hidden rounded-xl border">
            {record.recent.map((round) => (
              <Link key={round.id} href={routes.play.round(round.id)} className="hover:bg-fill-1 flex items-center justify-between gap-3 px-4 py-3 transition-colors">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-ink-hi truncate text-sm">{round.display ?? 'A tape you are reading'}</span>
                  {round.mode === 'duel' && <Chip size="sm">Duel</Chip>}
                </div>
                <div className="flex shrink-0 items-baseline gap-4">
                  {round.result !== null && (
                    <span className={cx('numeral text-sm', round.result >= 500 ? 'text-long-ink' : 'text-short-ink')}>{formatUsd(round.result)}</span>
                  )}
                  <span className="numeral text-ink-max w-12 text-right font-semibold">{round.grade ?? '—'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border-line flex flex-col gap-4 rounded-2xl border p-5">
      <div className="flex-1">
        <div className="eyebrow text-gold-ink">{eyebrow}</div>
        <h2 className="text-ink-max mt-2 text-xl font-semibold">{title}</h2>
        <p className="text-ink-lo mt-1 text-sm">{body}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}
