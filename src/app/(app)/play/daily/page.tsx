import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Daily' };

export default function DailyPage() {
  return <PlaySurface mode="daily" />;
}
