import { ManageSurface } from '@/components/play/ManageSurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manage' };

export default async function ManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div data-theme="dark" className="bg-surface-0 text-ink min-h-dvh px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <ManageSurface tape={decodeURIComponent(slug)} />
      </div>
    </div>
  );
}
