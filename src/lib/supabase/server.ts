import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The service-role client. Server only.
 *
 * `charts` and `rounds` both have RLS enabled with no policies and no grants to anon or
 * authenticated, so this is the only credential that can read either table. That is
 * deliberate: `charts.reveal_bars` and `charts.resolution_path` are the future, and §12.1
 * makes putting the future within reach of a client the one mistake that invalidates every
 * leaderboard in the product.
 *
 * The `server-only` import above turns an accidental client import into a build error rather
 * than a leaked key.
 */
let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Copy .env.local.example to .env.local and set ' +
        'SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
