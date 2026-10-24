import Link from 'next/link';
import { Chip, PageHeader, cx } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { MODES, MODE_GROUPS, type ModeInfo } from '@/lib/modes';
import { currentViewer, getDailyState } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Play' };

/**
 * Every way to play, in three groups. The daily leads while it is unplayed, because it is the one
 * thing that is different today; once it is done it takes its place in the grid like any other.
 */
export default async function PlayHub() {
  const viewer = await currentViewer();
  const daily = await getDailyState(viewer);
  const signedIn = viewer.profile !== null;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Play"
        title="Pick your game"
        lede="Every mode deals real charts with the ticker and date hidden. They differ in what you get to see, how long you get, and who you are up against."
      />

      {MODE_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`} className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id={`group-${group.id}`} className="text-ink-max text-xl font-semibold tracking-tight">
              {group.name}
            </h2>
            <p className="text-ink-dim text-sm">{group.blurb}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODES.filter((mode) => mode.group === group.id).map((mode) => (
              <ModeCard
                key={mode.id}
                mode={mode}
                featured={mode.id === 'daily' && !daily.complete}
                status={
                  mode.id === 'daily'
                    ? daily.complete
                      ? 'Done today'
                      : daily.played > 0
                        ? `${daily.played} of ${daily.total} played`
                        : undefined
                    : mode.account && !signedIn
                      ? 'Needs an account'
                      : undefined
                }
                href={mode.account && !signedIn ? `/sign-in?next=${encodeURIComponent(mode.href)}` : mode.href}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModeCard({
  mode,
  featured,
  status,
  href,
}: {
  mode: ModeInfo;
  featured?: boolean;
  status?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'press group relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5 transition-colors',
        featured
          ? 'border-gold-line bg-gold-bg hover:border-gold sm:col-span-2 xl:col-span-1'
          : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cx(
            'grid h-11 w-11 place-items-center rounded-xl ring-1',
            featured ? 'bg-gold text-on-gold ring-gold' : 'bg-fill-2 text-ink-hi ring-line',
          )}
        >
          <Icon name={mode.icon} size={20} />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {status && <Chip tone={featured ? 'gold' : 'neutral'}>{status}</Chip>}
          <Chip tone={mode.rated ? 'info' : 'neutral'}>{mode.rated ? 'Rated' : 'Unrated'}</Chip>
        </div>
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-ink-max text-lg font-semibold">{mode.name}</h3>
          <span className="numeral text-ink-dim text-xs">{mode.length}</span>
        </div>
        <p className="text-ink-hi mt-1 text-sm">{mode.tagline}</p>
        <p className="text-ink-lo mt-2 text-sm leading-relaxed">{mode.detail}</p>
      </div>
      <span className="text-ink-hi mt-auto flex items-center gap-1.5 text-sm font-medium">
        {mode.id === 'practice' ? 'Choose a tape' : mode.id === 'duel' || mode.id === 'race' ? 'Set it up' : 'Start'}
        <Icon name="chevron-right" size={15} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
