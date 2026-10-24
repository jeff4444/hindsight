import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAVICON, markSvg } from '@/components/ui/brand';

/**
 * The favicon is a static file, so it cannot import the mark. This is what keeps the two from
 * drifting apart the way the four hand-copied versions did before `brand.ts` existed.
 * Regenerate with: npx tsx -e "import {markSvg,FAVICON} from './src/components/ui/brand.ts'; process.stdout.write(markSvg(FAVICON)+'\n')" > src/app/icon.svg
 */
describe('the favicon is the mark', () => {
  it('matches markSvg(FAVICON) exactly', () => {
    const file = readFileSync(join(process.cwd(), 'src/app/icon.svg'), 'utf8').trim();
    expect(file).toBe(markSvg(FAVICON));
  });
});
