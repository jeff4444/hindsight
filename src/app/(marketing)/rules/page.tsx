import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { marked } from 'marked';

export const dynamic = 'force-static';

/**
 * The published ruleset.
 *
 * §12 makes the rules public, and §7.6 says to state the uncomfortable parts "in the product
 * rather than in a terms-of-service document". So this renders `docs/rules.md` itself rather than
 * a marketing paraphrase of it — the same file the engineers read, including the section that says
 * passing everything scores a mean 61st percentile.
 *
 * Read at build time from a file this repo authors, so the HTML is ours and there is nothing to
 * sanitise.
 */
export default async function RulesPage() {
  const source = readFileSync(join(process.cwd(), 'docs/rules.md'), 'utf8');
  const html = await marked.parse(source);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-ink-dim hover:text-ink-hi text-xs font-medium transition-colors">
        ← Hindsight
      </Link>
      <article className="rules mt-8" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
