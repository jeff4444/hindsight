import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No React key carries an owner or a session id.
 *
 * A seat or a round is owned by `coalesce(user_id, session_id)`, and for an anonymous player that is
 * the `hs_session` cookie itself. React serialises a server component's element keys into the payload
 * it sends the browser, so `key={p.owner}` on the match page published the session of every anonymous
 * player in the match to anyone holding the link. Nothing on screen showed it, which is why it is
 * checked here rather than trusted to review.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

describe('keys never carry an identity', () => {
  it('finds no key built from an owner or a session', () => {
    const offenders: string[] = [];
    for (const dir of ['src/app', 'src/components']) {
      for (const file of walk(join(process.cwd(), dir))) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/key=\{[^}]*(owner|session)/i.test(line)) offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
