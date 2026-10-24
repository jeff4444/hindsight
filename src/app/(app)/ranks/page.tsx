import Link from 'next/link';
import { currentViewer, getRating, listTapes, type Viewer } from '@/lib/viewer';
import { dailyNumber } from '@/lib/daily';
import {
  TAPE_BOARD_MIN_ROUNDS,
  getDailyBoard,
  getDailyField,
  getLadder,
  getLadderPosition,
  getTapeBoard,
} from '@/lib/leaderboards';
import { divisionFor, isPlaced, roundsToPlacement } from '@/core/divisions';
import { routes } from '@/lib/routes';
import { DivisionBadge, EmptyState, FogPanel, LinkTabs, PageHeader, cx } from '@/components/ui';
import { FieldHistogram } from '@/components/ranks/FieldHistogram';
import { Leaderboard } from '@/components/ranks/Leaderboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ranks' };

type Board = 'daily' | 'ranked' | 'tapes';

/**
 * The field: today's daily, the ranked ladder, and every tape's best.
 *
 * Every board is gated on a sample. A ladder position waits for the rating to settle; a tape board
 * waits for ten rounds on that tape. The gate is said once, in a line, rather than drawn as a lock.
 */
export default async function RanksPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; day?: string; tape?: string }>;
}) {
  const params = await searchParams;
  const board: Board = params.board === 'ranked' || params.board === 'tapes' ? params.board : 'daily';
  const viewer = await currentViewer();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader eyebrow="Ranks" title="The field" lede="Everyone plays the same charts, so every number here is comparable." />
      <LinkTabs
        label="Boards"
        active={board}
        tabs={[
          { value: 'daily', label: 'Daily', href: routes.ranks('daily') },
          { value: 'ranked', label: 'Ranked ladder', href: routes.ranks('ranked') },
          { value: 'tapes', label: 'Tapes', href: routes.ranks('tapes') },
        ]}
      />
      {board === 'daily' && <DailyBoard day={params.day === 'yesterday' ? 'yesterday' : 'today'} owner={viewer.userId ?? viewer.sessionId} viewerId={viewer.userId} />}
      {board === 'ranked' && <RankedBoard viewer={viewer} />}
      {board === 'tapes' && <TapeBoards tape={params.tape} viewerId={viewer.userId} />}
    </div>
  );
}

const NOT_YET = (
  <FogPanel className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center">
    <p className="font-display text-ink-max text-2xl">The boards are being set up.</p>
    <p className="text-ink-lo max-w-sm text-sm">They will fill in as soon as the leaderboard update reaches the database.</p>
  </FogPanel>
);

async function DailyBoard({ day, owner, viewerId }: { day: 'today' | 'yesterday'; owner: string; viewerId: string | null }) {
  const today = todayNumber();
  const number = day === 'yesterday' ? today - 1 : today;
  const [field, rows] = await Promise.all([getDailyField(number, owner), getDailyBoard(number)]);
  if (field === null || rows === null) return NOT_YET;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink-max text-xl font-semibold tracking-tight">Daily #{number}</h2>
        <div className="bg-fill-2 ring-line-faint inline-flex rounded-full p-1 ring-1">
          {(['today', 'yesterday'] as const).map((option) => (
            <Link
              key={option}
              href={`${routes.ranks('daily')}${option === 'yesterday' ? '&day=yesterday' : ''}`}
              scroll={false}
              aria-current={day === option ? 'page' : undefined}
              className={cx(
                'rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                day === option ? 'bg-thumb text-ink-max shadow-e1' : 'text-ink-lo hover:text-ink-hi',
              )}
            >
              {option}
            </Link>
          ))}
        </div>
      </div>

      {field.players === 0 ? (
        <EmptyState icon="sun" title="Nobody has finished yet" body="Be the first on the board." />
      ) : (
        <div className="border-line bg-surface-2 rounded-2xl border p-5">
          <FieldHistogram histogram={field.histogram} players={field.players} you={field.you} />
        </div>
      )}

      <Leaderboard
        rows={rows}
        viewerId={viewerId}
        format={(value) => String(Math.round(value * 100))}
        detail={(row) => (row.detail === null ? null : `traded ${row.detail} of 5`)}
        empty={<p className="text-ink-dim text-sm">Signed-in players appear here by name once they finish.</p>}
      />
    </div>
  );
}

async function RankedBoard({ viewer }: { viewer: Viewer }) {
  const viewerId = viewer.userId;
  const [rows, position, rating] = await Promise.all([
    getLadder(),
    viewerId ? getLadderPosition(viewerId) : Promise.resolve(null),
    viewerId ? getRating(viewer) : Promise.resolve(null),
  ]);
  if (rows === null) return NOT_YET;

  const placed = rating && rating.rating !== null && rating.rd !== null && isPlaced(rating.attempts, rating.rd);

  return (
    <div className="space-y-6">
      <div className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
        <div>
          <div className="eyebrow text-ink-dim">You</div>
          {placed && rating?.rating ? (
            <div className="mt-2 flex items-center gap-3">
              <DivisionBadge division={divisionFor(rating.rating)} size="lg" />
              <span className="numeral text-ink-hi text-lg font-semibold">{Math.round(rating.rating)}</span>
            </div>
          ) : (
            <div className="mt-2">
              <DivisionBadge division={null} placing={viewerId ? roundsToPlacement(rating?.attempts ?? 0) : undefined} size="lg" />
            </div>
          )}
        </div>
        <p className="text-ink-lo text-sm">
          {position?.position
            ? `#${position.position} of ${position.players.toLocaleString()} on the ladder`
            : viewerId
              ? 'You join the ladder once your rating settles.'
              : 'Sign in and play rated charts to join the ladder.'}
        </p>
      </div>

      <Leaderboard
        rows={rows}
        viewerId={viewerId}
        format={(value) => String(Math.round(value))}
        detail={(row) => divisionFor(row.value).name}
        empty={<EmptyState icon="trophy" title="Nobody is placed yet" body="A player joins the ladder after 30 rated charts, once their rating settles." />}
      />
    </div>
  );
}

async function TapeBoards({ tape, viewerId }: { tape?: string; viewerId: string | null }) {
  const tapes = (await listTapes()).filter((t) => !t.lockedReason);
  const chosen = tapes.find((t) => t.slug === tape) ?? tapes.find((t) => t.slug !== 'open') ?? tapes[0];
  if (!chosen) return null;
  const rows = await getTapeBoard(chosen.slug);
  if (rows === null) return NOT_YET;

  return (
    <div className="space-y-6">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {tapes.map((t) => (
          <Link
            key={t.slug}
            href={`${routes.ranks('tapes')}&tape=${encodeURIComponent(t.slug)}`}
            scroll={false}
            aria-current={t.slug === chosen.slug ? 'page' : undefined}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors',
              t.slug === chosen.slug ? 'bg-thumb text-ink-max ring-line-strong shadow-e1' : 'bg-fill-1 text-ink-lo ring-line-faint hover:text-ink-hi',
            )}
          >
            {t.slug === 'open' ? 'Shuffle' : t.name}
          </Link>
        ))}
      </div>
      <Leaderboard
        rows={rows}
        viewerId={viewerId}
        format={(value) => String(Math.round(value * 100))}
        detail={(row) => (row.detail === null ? null : `${row.detail} rounds`)}
        empty={
          <EmptyState
            icon="tape"
            title={`No one on ${chosen.slug === 'open' ? 'Shuffle' : chosen.name} yet`}
            body={`Players appear after ${TAPE_BOARD_MIN_ROUNDS} rounds on a tape, ranked by average score.`}
          />
        }
      />
    </div>
  );
}

/** Today's daily number, read outside render. */
function todayNumber(): number {
  return dailyNumber(Date.now());
}
