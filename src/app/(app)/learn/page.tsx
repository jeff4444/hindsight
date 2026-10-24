import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';
import { routes } from '@/lib/routes';

export const metadata = { title: 'Learn' };

const DOORS: { href: string; icon: IconName; title: string; body: string }[] = [
  {
    href: routes.learn.rulebook(),
    icon: 'rules',
    title: 'The rulebook',
    body: 'Every rule the game enforces, in full: how charts are chosen, how trades resolve, how scores and ratings are computed.',
  },
  {
    href: routes.learn.methods,
    icon: 'eye',
    title: 'Methods',
    body: 'The Panel, school by school, with sources and track records. What we measured, what we could not, and where the evidence is thin.',
  },
];

export default function LearnPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Learn" title="How Hindsight works" lede="Read the chart, call the trade, watch it play out, see how it ranked." />
      <div className="grid gap-3 md:grid-cols-2">
        {DOORS.map((door) => (
          <Link key={door.href} href={door.href} className="press border-line bg-surface-2 hover:border-line-strong group rounded-2xl border p-6 transition-colors">
            <Icon name={door.icon} size={22} className="text-gold-ink" />
            <h2 className="text-ink-max mt-4 text-lg font-semibold">{door.title}</h2>
            <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{door.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
