import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTape } from '@/lib/viewer';
import { Button, Chip, Eyebrow, Panel } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { RulesetPicker, type TierOption } from '@/components/tapes/RulesetPicker';

export const dynamic = 'force-dynamic';

const TIERS: TierOption[] = [
  { code: 'FD', name: 'Full Desk', live: false, hint: 'Arrives with the ladder' },
  { code: 'NN', name: 'News Blind', live: false, hint: 'Arrives with the ladder' },
  { code: 'NT', name: 'No Tools', live: false, hint: 'Arrives with the ladder' },
  {
    code: 'NTZ',
    name: 'Naked',
    live: true,
    hint: '80 candles, one timeframe, volume, ATR badge, set and forget',
  },
  { code: 'NTVZ', name: 'Blackout', live: false, hint: 'Arrives with the ladder' },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tape = await getTape(slug);
  return { title: tape?.name ?? 'Tape' };
}

/**
 * A tape, and the settings you play it under.
 *
 * The tier selector shows all five tiers with only NTZ selectable. Hiding the other four would be
 * tidier and less honest — the ladder is the product's spine, and showing what is coming (dashed,
 * labelled) is worth more than pretending the shape does not exist.
 *
 * Two columns at `lg`, with the play panel sticky. On a page whose whole purpose is one button,
 * that button should not scroll away while you read the filter it applies to.
 */
export default async function TapePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tape = await getTape(slug);
  if (!tape) notFound();

  const locked = Boolean(tape.lockedReason);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/tapes"
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        Tapes
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div>
          <Eyebrow>Tape</Eyebrow>
          <h1 className="text-ink-max mt-1.5 text-3xl font-semibold text-balance">{tape.name}</h1>
          <p className="text-ink-lo mt-4 max-w-prose text-base leading-relaxed">
            {locked ? tape.lockedReason : tape.blurb}
          </p>

          <div className="mt-8">
            <Eyebrow>Ruleset</Eyebrow>
            <div className="mt-3">
              <RulesetPicker tiers={TIERS} value="NTZ" />
            </div>
            <p className="text-ink-lo mt-4 max-w-prose text-sm leading-relaxed">
              Naked is the ranked standard and the only tier built. The rest arrive with the ladder,
              each removing one reading aid from the one above it.
            </p>
          </div>
        </div>

        {/* The one button on the page, kept in view. */}
        <Panel tone="hero" pad="md" className="lg:sticky lg:top-6">
          <Eyebrow>In this tape</Eyebrow>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="numeral text-ink-max text-display-sm font-semibold">
              {tape.charts.toLocaleString()}
            </span>
            <span className="text-ink-dim text-sm">charts</span>
          </div>

          <div className="mt-6">
            {locked ? (
              <Chip tone="neutral" icon="lock">
                Not open yet
              </Chip>
            ) : (
              <Button
                as="a"
                href={`/play?mode=tape&tape=${tape.slug}`}
                variant="primary"
                size="lg"
                glow="brand"
                block
              >
                <Icon name="play" size={15} />
                Play this tape
              </Button>
            )}
          </div>

          <p className="text-ink-dim mt-4 text-sm leading-relaxed">
            Unlimited and never metered. Practice rounds are scored the same way the daily is, and
            they count towards your record.
          </p>
        </Panel>
      </div>
    </div>
  );
}
