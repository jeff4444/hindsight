import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Player-facing copy speaks plainly.
 *
 * The rulebook cites its sections and the code comments cite the scope document, and both are
 * right to. A player's screen is not: "§3.2 puts a clock on deliberation" is an internal
 * reference leaking into the product. This strips comments and fails on any `§` left in what
 * renders — JSX text, string literals and template strings under src/app and src/components.
 * The rulebook page renders docs/rules.md, which is exempt by being a markdown file.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('no section citations on a player screen', () => {
  it('finds no § outside comments', () => {
    const offenders: string[] = [];
    for (const dir of ['src/app', 'src/components']) {
      for (const file of walk(join(process.cwd(), dir))) {
        if (file.includes('/lab/')) continue;
        const code = stripComments(readFileSync(file, 'utf8'));
        code.split('\n').forEach((line, i) => {
          if (line.includes('§')) offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
