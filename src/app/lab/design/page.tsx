import { notFound } from 'next/navigation';
import { DesignLab } from './DesignLab';

/**
 * Every primitive in the Afterglow system on one page, in whichever theme is active. Development
 * only, like the geometry lab: it is a workbench, not a destination.
 */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignLab />;
}
