import { Button, Eyebrow } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="animate-rise">
      <span className="bg-info-bg text-info-ink ring-info-line grid h-12 w-12 place-items-center rounded-full ring-1">
        <Icon name="check" size={22} />
      </span>
      <Eyebrow className="mt-5">Check your inbox</Eyebrow>
      <h1 className="text-ink-max mt-2 text-2xl font-semibold">A link is on its way</h1>
      <p className="text-ink-lo mt-3 text-base leading-relaxed">
        Sent to <span className="text-ink-hi numeral">{email ?? 'your email'}</span>. Open it on
        this device, so the round history on this browser is the one that gets claimed.
      </p>
      <p className="text-ink-dim mt-6 text-sm leading-relaxed">
        Nothing arrived? It can take a minute, and it sometimes lands in spam.
      </p>
      <div className="mt-7 flex flex-wrap gap-2">
        <Button as="a" href="/sign-in" variant="secondary" size="lg">
          Try a different address
        </Button>
        <Button as="a" href="/play" variant="ghost" size="lg">
          Keep playing
        </Button>
      </div>
    </div>
  );
}
