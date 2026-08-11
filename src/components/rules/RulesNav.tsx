"use client";

import { useEffect, useState } from "react";
import { Disclosure, cx } from "../ui";

export interface RulesSection {
  id: string;
  title: string;
}

/**
 * The way into a document nobody reads end to end.
 *
 * Sticky beside the prose at `lg`, and a plain disclosure above it below that — a fourteen-item
 * list pinned to a phone screen would cost more of the page than the section it helps you reach.
 *
 * The active section is computed from geometry rather than from an intersection *event*, and that
 * is not the obvious choice. The obvious one — an `IntersectionObserver` with a `rootMargin` that
 * narrows the viewport to a detection band near the top — is what this was first, and it has a hole
 * in it: the band is a couple of hundred pixels tall, a heading can cross it entirely between two
 * frames, and no entry ever fires. Anchor jumps and fast wheel scrolls do exactly that, so the nav
 * would sit on section one while you read section eleven. Asking "which heading is above the line
 * right now" cannot miss, because it is not watching for a moment.
 *
 * The listener does the work directly rather than deferring it to `requestAnimationFrame`. Deferring
 * is the usual advice and it is the wrong trade here: a browser already fires `scroll` at most once
 * per frame, the work is fourteen `getBoundingClientRect` calls against a layout that is about to be
 * read anyway, and routing it through rAF adds a dependency on the page actually painting — which
 * is one more way for the answer to be silently stale.
 */
export function RulesNav({ sections }: { sections: RulesSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const headings = sections
      .map((section) => document.getElementById(section.id))
      .filter((node): node is HTMLElement => node !== null);
    if (headings.length === 0) return;

    /** Where a heading counts as "the one you are reading". */
    const LINE = 96;

    const measure = () => {
      // The last heading at or above the line; the first one before you reach any of them.
      let current = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= LINE) current = heading;
        else break;
      }
      setActive(current.id);
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [sections]);

  if (sections.length === 0) return null;

  const list = (
    <ol className="flex flex-col gap-0.5">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            aria-current={active === section.id ? "true" : undefined}
            className={cx(
              "block rounded-md py-1.5 pr-2 pl-3 text-sm leading-snug transition-colors",
              "border-l-2",
              active === section.id
                ? "border-info text-ink-hi bg-fill-1"
                : "text-ink-dim hover:text-ink-hi border-transparent",
            )}
          >
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      {/* Above the prose on a phone, closed, so it costs one line until it is wanted. */}
      <Disclosure
        tone="panel"
        label="Jump to a section"
        aside={sections.length}
        className="mt-4 lg:hidden"
      >
        {list}
      </Disclosure>

      <nav
        aria-label="Sections"
        className="sticky top-6 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto lg:block"
      >
        <p className="eyebrow text-ink-dim mb-2 pl-3">Sections</p>
        {list}
      </nav>
    </>
  );
}
