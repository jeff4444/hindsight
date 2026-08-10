import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cache } from 'react';
import { marked } from 'marked';
import { Eyebrow } from '@/components/ui';

/**
 * The published ruleset.
 *
 * §12 makes the rules public, and §7.6 says to state the uncomfortable parts "in the product
 * rather than in a terms-of-service document". So this renders `docs/rules.md` itself rather than
 * a marketing paraphrase of it — the same file the engineers read, including the section that says
 * passing everything scores a mean 61st percentile.
 *
 * Read from a file this repo authors, so the HTML is ours and there is nothing to sanitise.
 *
 * It lives inside the app shell rather than beside the marketing page, because it is a reference
 * a player consults *during* a session — "what does NTZ actually forbid" is a mid-round question.
 * Under the marketing group its only navigation was a back link to the landing page, which meant
 * checking a rule cost you your place.
 */
const ruleset = cache(async () => {
  const source = readFileSync(join(process.cwd(), 'docs/rules.md'), 'utf8');
  return marked.parse(source);
});

export const metadata = { title: 'Ruleset' };

export default async function RulesPage() {
  const html = await ruleset();

  return (
    <div className="mx-auto max-w-prose">
      <Eyebrow>Published in full</Eyebrow>
      <article className="rules mt-4" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
