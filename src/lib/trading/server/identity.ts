import 'server-only';
import { authClient } from '@/lib/supabase/auth-server';

/** The signed-in user, or null. Never throws: a broken auth cookie is just a signed-out visitor. */
export async function currentUserId(): Promise<string | null> {
  try {
    const auth = await authClient();
    const { data } = await auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
