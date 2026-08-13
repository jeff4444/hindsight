import { ManageSurface } from '@/components/play/ManageSurface';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Manage' };

/**
 * §10.1's Manage ladder, on its own route rather than a mode of `/play`.
 *
 * The two loops share almost nothing. Naked commits a bracket and then watches; Manage opens a
 * position and keeps deciding, against a server clock, with no target at all. `PlaySurface` is a
 * phase machine built around the first of those, and threading a second one through it would make
 * the file that owns the reveal — the most delicate code in the product — answer to two masters.
 *
 * They also score against different distributions, and that difference is the entire point of the
 * ladder existing (§17).
 */
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ tape?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-5xl">
      <ManageSurface tape={params.tape ?? 'open'} />
    </div>
  );
}
