import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/server';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Eyebrow, Panel } from '@/components/ui';
import { isAccent } from '@/lib/avatar';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = serviceClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, handle, handle_display, display_name, avatar_seed, avatar_accent, created_at')
    .eq('handle', handle.toLowerCase())
    .maybeSingle();

  if (!profile) notFound();

  const [{ data: rounds }, { data: streak }, { count: dailies }] = await Promise.all([
    supabase
      .from('rounds')
      .select('passed, percentile')
      .eq('user_id', profile.user_id)
      .eq('superseded', false)
      .not('committed_at', 'is', null),
    supabase
      .from('player_streaks')
      .select('longest_length, longest_perfect')
      .eq('user_id', profile.user_id)
      .maybeSingle(),
    supabase
      .from('daily_completions')
      .select('day', { count: 'exact', head: true })
      .eq('user_id', profile.user_id),
  ]);

  const rows = rounds ?? [];
  const scored = rows.map((r) => r.percentile as number | null).filter((p): p is number => p !== null);
  const mean = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const accent = isAccent(profile.avatar_accent) ? profile.avatar_accent : 'ember';
  const perfect = (streak?.longest_perfect ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-5">
        <MarketSignature seed={profile.avatar_seed} accent={accent} size={88} ring={perfect ? 'gold' : 'accent'} />
        <div>
          <h1 className="text-ink-max text-xl font-semibold">
            {profile.display_name ?? profile.handle_display ?? profile.handle}
          </h1>
          <div className="text-ink-dim mt-0.5 font-mono text-sm">@{profile.handle}</div>
          <div className="text-ink-faint text-mini mt-1">
            Reading charts since{' '}
            {new Date(profile.created_at as string).toLocaleDateString('en-GB', {
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-4" data-stagger>
        <Stat label="Rounds" value={String(rows.length)} i={0} />
        <Stat label="Dailies" value={String(dailies ?? 0)} i={1} />
        <Stat label="Longest streak" value={String(streak?.longest_length ?? 0)} i={2} />
        <Stat
          label="Mean percentile"
          value={rows.length < 10 ? '—' : mean === null ? '—' : String(Math.round(mean * 100))}
          hint={rows.length < 10 ? `needs ${10 - rows.length} more rounds` : undefined}
          i={3}
        />
      </div>

      <p className="text-ink-dim mt-8 text-xs leading-relaxed">
        A style badge — the school this player actually trades as, derived from which engine their
        entries match — arrives with the council (§5.12). It is earned, never chosen, which is why
        there is a space for it here and nothing in it yet.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, i }: { label: string; value: string; hint?: string; i: number }) {
  return (
    <Panel className="p-4" style={{ '--i': i } as React.CSSProperties}>
      <Eyebrow>{label}</Eyebrow>
      <div className="text-ink-max mt-1 font-mono text-xl tabular-nums">{value}</div>
      {hint && <div className="text-ink-faint text-micro mt-1">{hint}</div>}
    </Panel>
  );
}
