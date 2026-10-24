import { ManageSurface } from '@/components/play/ManageSurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manage' };

export default async function ManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ManageSurface tape={decodeURIComponent(slug)} />;
}
