import Link from 'next/link';
import { routes } from '@/lib/routes';
import { Icon, type IconName } from '../ui/icons';

/**
 * Four ways to keep playing once the daily is done, one tap each. The longer explanations live on
 * the Play hub; these are for the player who already knows what they want.
 */
const QUICK: { href: string; icon: IconName; title: string; hint: string }[] = [
  { href: routes.play.storm(), icon: 'bolt', title: 'Storm', hint: '3 minutes' },
  { href: routes.play.survival(), icon: 'heart', title: 'Survival', hint: 'until you miss' },
  { href: routes.play.tape('open'), icon: 'shuffle', title: 'Shuffle', hint: 'any chart' },
  { href: routes.versus.index, icon: 'swords', title: 'Duel a friend', hint: 'send a link' },
];

export function QuickPlay() {
  return (
    <section aria-labelledby="quick-heading" className="border-line bg-surface-2 rounded-3xl border p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="quick-heading" className="eyebrow text-ink-dim">
          Keep playing
        </h2>
        <Link href={routes.play.hub} className="text-ink-dim hover:text-ink-hi text-xs">
          Every mode
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {QUICK.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="press lift bg-fill-1 hover:bg-fill-2 ring-line-faint group flex items-center gap-3 rounded-2xl p-3 ring-1 transition-colors"
          >
            <span className="bg-surface-3 text-ink-hi grid h-9 w-9 shrink-0 place-items-center rounded-xl">
              <Icon name={item.icon} size={17} />
            </span>
            <span className="min-w-0">
              <span className="text-ink-max block truncate text-sm font-semibold">{item.title}</span>
              <span className="text-ink-dim block truncate text-xs">{item.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
