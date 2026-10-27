import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cache } from 'react';
import { marked } from 'marked';
import Link from 'next/link';
import { Eyebrow } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { routes } from '@/lib/routes';
import { RulesNav, type RulesSection } from '@/components/rules/RulesNav';

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
 *
 * ## Why it needed a table of contents
 *
 * A mid-round question is only answerable if the answer is findable. The document has grown to
 * fourteen top-level sections and well over a thousand lines — Layer 2's geometry alone runs four
 * hundred — and the page offered one continuous scroll with no way in. `globals.css` has been
 * setting `scroll-margin-top: 5rem` on `.rules h2` since the redesign, which is a hash-link
 * affordance for hash links that did not exist yet.
 *
 * The headings come from `marked.lexer()` rather than from a regex over the source, so a `##` in a
 * fenced code block cannot become a phantom entry.
 */
const ruleset = cache(async () => {
  const source = readFileSync(join(process.cwd(), 'docs/rules.md'), 'utf8');

  /**
   * The ids, ours.
   *
   * `marked` stopped emitting heading ids by default at v5 — they moved out to a GFM extension —
   * so `.rules h2 { scroll-margin-top }` had been styling an anchor target that did not exist, and
   * the first version of this nav linked to fourteen hashes that resolved to nothing. Generated
   * here and rendered by the override below, so the list and the document cannot disagree about
   * what a section is called.
   */
  const slug = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-');

  const renderer = new marked.Renderer();
  renderer.heading = function heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = slug(this.parser.parseInline(tokens).replace(/<[^>]*>/g, ''));
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  const sections: RulesSection[] = marked
    .lexer(source)
    .flatMap((token) =>
      token.type === 'heading' && token.depth === 2
        ? [{ id: slug(token.text), title: token.text }]
        : [],
    );

  return { html: await marked.parse(source, { renderer }), sections };
});

export const metadata = {
  title: 'Rulebook',
  description:
    'The whole ruleset, published: how markets are dealt, how orders fill, what is charged, and the parts that are uncomfortable to state.',
};

export default async function RulesPage() {
  const { html, sections } = await ruleset();

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-10">
      <div className="mx-auto w-full max-w-prose lg:mx-0">
        <Link href={routes.learn.index} className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors">
          <Icon name="arrow-left" size={14} />
          Learn
        </Link>
        <div className="border-line bg-surface-2 mt-5 rounded-2xl border p-5">
          <Eyebrow>The rulebook, in full</Eyebrow>
          <p className="text-ink-lo mt-2 text-sm leading-relaxed">
            Every rule the game enforces, written for whoever wants to check it — including the measurements and the
            parts that do not flatter us. For the short version, read{' '}
            <Link href={routes.learn.index} className="text-ink-hi underline decoration-gold-line underline-offset-4">
              how it works
            </Link>
            .
          </p>
        </div>
        <article className="rules mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <RulesNav sections={sections} />
    </div>
  );
}
