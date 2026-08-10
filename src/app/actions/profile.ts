'use server';

import { redirect } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/server';
import { currentViewer } from '@/lib/viewer';
import { isAccent } from '@/lib/avatar';

/**
 * Claim or change a handle and signature.
 *
 * Handle uniqueness, the reserved list and the format rules are all enforced in Postgres, so this
 * translates the constraint that fired into a sentence rather than re-checking them — one source
 * of truth, and no way for the two to drift apart.
 */
export async function saveProfile(formData: FormData): Promise<{ error?: string } | void> {
  const viewer = await currentViewer();
  if (!viewer.userId) return { error: 'You need to be signed in.' };

  const handle = String(formData.get('handle') ?? '').trim().toLowerCase();
  const seed = Number(formData.get('seed'));
  const accentRaw = String(formData.get('accent') ?? 'ember');
  const displayName = String(formData.get('displayName') ?? '').trim() || null;

  if (!handle) return { error: 'Pick a handle.' };
  if (!Number.isInteger(seed) || seed < 0) return { error: 'That signature is not valid.' };
  const accent = isAccent(accentRaw) ? accentRaw : 'ember';

  const supabase = serviceClient();

  const { data: reserved } = await supabase
    .from('reserved_handles')
    .select('handle')
    .eq('handle', handle)
    .maybeSingle();
  if (reserved) return { error: `"${handle}" is reserved. Try another.` };

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: viewer.userId,
      handle,
      handle_display: handle,
      display_name: displayName,
      avatar_seed: seed,
      avatar_accent: accent,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    if (error.code === '23505') return { error: `"${handle}" is taken. Try another.` };
    if (error.code === '23514') return { error: 'That handle has characters we cannot use in a URL.' };
    return { error: error.message };
  }

  redirect(`/u/${handle}`);
}
