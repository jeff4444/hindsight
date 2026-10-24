'use client';

import { usePathname } from 'next/navigation';
import { isStage } from '@/components/shell/AppShell';

/**
 * Pages settle in rather than appearing.
 *
 * A template remounts whenever the top-level segment changes — Today to Tapes, Tapes to Ranks — and
 * not for a query change, so a tab switch inside a page keeps its sliding indicator instead of
 * being rebuilt. The animation is a short fade and a 6px settle (`.page-in`), with a `backwards`
 * fill so nothing is left on the element once it ends.
 *
 * The play stage is excluded. Everything above the chart frame is kept free of opacity and
 * transforms so the stop and target rails stay above the canvas (`tests/stacking.test.ts`), and a
 * stage that fades in would break that for the length of the fade.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className={isStage(pathname) ? undefined : 'page-in'}>{children}</div>;
}
