import Link from 'next/link';
import type { Accent } from '@/lib/avatar';
import { personaFor } from '@/lib/panel';
import { routes } from '@/lib/routes';
import { Chip, PersonaAvatar } from '../ui';
import { MarketSignature } from '../ui/MarketSignature';

/** Who a leaderboard row is: a player by handle, or a school by its persona — and which is which. */
export function Trader({
  kind,
  handle,
  displayName,
  avatarSeed,
  avatarAccent,
  botCode,
  highlight,
}: {
  kind: 'player' | 'bot';
  handle: string | null;
  displayName: string | null;
  avatarSeed: number | null;
  avatarAccent: Accent;
  botCode: string | null;
  highlight?: boolean;
}) {
  if (kind === 'bot' && botCode) {
    const persona = personaFor(botCode);
    return (
      <Link href={routes.strategies.show(botCode)} className="flex items-center gap-2.5 hover:underline">
        {persona && <PersonaAvatar persona={persona} size={28} />}
        <span className="text-ink-hi font-medium">{persona?.name ?? botCode}</span>
        <Chip size="sm">School</Chip>
      </Link>
    );
  }
  return (
    <Link href={handle ? routes.profile(handle) : '#'} className="flex items-center gap-2.5 hover:underline">
      <MarketSignature seed={avatarSeed ?? 0} accent={avatarAccent} size={28} ring={highlight ? 'gold' : 'accent'} />
      <span className="text-ink-hi font-medium">{displayName ?? `@${handle}`}</span>
    </Link>
  );
}
