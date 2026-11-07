import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '@/lib/glossary';

/**
 * Every link into the rulebook lands on a heading.
 *
 * The rulebook page derives its anchors from the headings (`/learn/rulebook/page.tsx`), so renaming
 * a section silently breaks every link to it — the browser just stays at the top. The app links to
 * sections from Learn, Schools, the landing page and the glossary; this reads them all and checks
 * each against the headings in docs/rules.md, slugged the way the page slugs them.
 */

const slug = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const rules = readFileSync(join(process.cwd(), 'docs/rules.md'), 'utf8');
const anchors = new Set(
  rules
    .split('\n')
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) => slug(line.replace(/^#+ /, '').replace(/[*`]/g, ''))),
);

describe('links into the rulebook', () => {
  it('every routes.learn.rulebook(…) in the app names a heading', () => {
    const missing: string[] = [];
    let found = 0;
    for (const dir of ['src/app', 'src/components', 'src/lib']) {
      for (const file of walk(join(process.cwd(), dir))) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/rulebook\('([^']+)'\)/g)) {
          found += 1;
          if (!anchors.has(match[1])) missing.push(`${file.replace(process.cwd() + '/', '')}: #${match[1]}`);
        }
      }
    }
    // A floor, so a regex that silently matches nothing cannot pass.
    expect(found).toBeGreaterThan(2);
    expect(missing).toEqual([]);
  });

  it('every glossary "read more" names a heading', () => {
    const missing = Object.entries(GLOSSARY)
      .map(([id, term]) => [id, term.more] as const)
      .filter(([, more]) => more?.startsWith('/learn/rulebook#'))
      .filter(([, more]) => !anchors.has(more!.slice('/learn/rulebook#'.length)))
      .map(([id, more]) => `${id}: ${more}`);
    expect(missing).toEqual([]);
  });

  it('§23 has the sections the game cites', () => {
    for (const section of ['23-the-game', '231-a-round', '232-the-best-and-worst-the-tape-allowed', '233-the-grade', '236-duels', '237-against-a-school', '238-what-a-school-must-be']) {
      expect(anchors.has(section), section).toBe(true);
    }
  });

  it('§22 has the sections the code cites', () => {
    for (const section of ['22-trading', '224-fills', '225-costs', '228-accounts-and-sessions', '229-integrity']) {
      expect(anchors.has(section), section).toBe(true);
    }
  });
});
