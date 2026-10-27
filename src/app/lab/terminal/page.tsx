import { notFound } from 'next/navigation';
import { DemoTerminal } from '@/components/trading/DemoTerminal';
import { ToastProvider } from '@/components/ui/client';

/**
 * The trading terminal on a synthetic market, with no database. Development only, like the other
 * labs: it is where the terminal is driven by hand and by `e2e/terminal-lab.mjs`.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { seed } = await searchParams;
  const parsed = Number.parseInt(seed ?? '', 10);
  return (
    <ToastProvider>
      <DemoTerminal seed={Number.isFinite(parsed) ? parsed : 7} />
    </ToastProvider>
  );
}
