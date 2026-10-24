import { currentViewer, listCommunityTapes, listMyTapes, listTapes, type Tape } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { TapeCard } from '@/components/home/TapeCard';
import { Button, EmptyState, LinkTabs, PageHeader } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tapes' };

type Tab = 'official' | 'community' | 'yours';

/**
 * Tapes: playlists of charts that share one rule.
 *
 * Three shelves — the official tapes, the ones other players made public, and yours. The two
 * methodology paragraphs that used to open this page (why tapes are filters and never hand-picked,
 * why there is no canonical definition of a sweep) moved to Methods, where the reader who wants
 * them will look. The rule each tape applies is still printed on every card.
 */
export default async function TapesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const tab: Tab = params.tab === 'community' || params.tab === 'yours' ? params.tab : 'official';
  const viewer = await currentViewer();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Practice"
        title="Tapes"
        lede="Playlists of charts that share one rule — a regime, a pattern, a kind of move. Play as many as you like."
        actions={
          <Button href={routes.tapes.create} variant="secondary">
            <Icon name="plus" size={15} />
            Make a tape
          </Button>
        }
      />

      <LinkTabs
        label="Tape shelves"
        active={tab}
        tabs={[
          { value: 'official', label: 'Official', href: routes.tapes.index() },
          { value: 'community', label: 'Community', href: routes.tapes.index('community') },
          { value: 'yours', label: 'Yours', href: routes.tapes.index('yours') },
        ]}
      />

      {/* The cards are h3s, so each shelf needs an h2 above them for the outline to hold. */}
      <h2 className="sr-only">{tab === 'official' ? 'Official tapes' : tab === 'community' ? 'Community tapes' : 'Your tapes'}</h2>
      {tab === 'official' && <Official />}
      {tab === 'community' && <Community />}
      {tab === 'yours' &&
        (viewer.userId ? (
          <Yours userId={viewer.userId} />
        ) : (
          <EmptyState
            icon="tape"
            title="Make tapes of your own"
            body="Sign in to build a tape from a rule, share it by link, and see how everyone who plays it does."
            action={
              <Button href={routes.signIn(routes.tapes.index('yours'))} variant="secondary">
                Sign in
              </Button>
            }
          />
        ))}
    </div>
  );
}

async function Official() {
  const tapes = await listTapes();
  const open = tapes.filter((t) => !t.lockedReason);
  const locked = tapes.filter((t) => t.lockedReason);
  return (
    <>
      <Grid tapes={open} />
      {locked.length > 0 && (
        <section className="space-y-4 pt-4">
          <h2 className="text-ink-max text-lg font-semibold">Coming later</h2>
          <Grid tapes={locked} />
        </section>
      )}
    </>
  );
}

async function Community() {
  const tapes = await listCommunityTapes();
  if (tapes.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No public tapes yet"
        body="Be the first: pick a rule, name it, and make it public. Anyone with the link can play it."
        action={
          <Button href={routes.tapes.create} variant="secondary">
            Make a tape
          </Button>
        }
      />
    );
  }
  return <Grid tapes={tapes} />;
}

async function Yours({ userId }: { userId: string }) {
  const tapes = await listMyTapes(userId);
  if (tapes.length === 0) {
    return (
      <EmptyState
        icon="tape"
        title="Make your first tape"
        body="A tape is a rule over the library — say, choppy charts with a sweep in them. Name it, share it, and see how your cohort does."
        action={
          <Button href={routes.tapes.create} variant="secondary">
            Make a tape
          </Button>
        }
      />
    );
  }
  return <Grid tapes={tapes} />;
}

function Grid({ tapes }: { tapes: Tape[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
      {tapes.map((tape, i) => (
        <TapeCard key={tape.slug} tape={tape} index={i} />
      ))}
    </div>
  );
}
