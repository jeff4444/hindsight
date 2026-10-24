'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Motion that needs a measurement or a memory.
 *
 * Three pieces, each of which CSS alone cannot do:
 *
 * - `Indicator` is the thing that slides. A selected tab, a segment, a nav item — the highlight
 *   travels from the old choice to the new one instead of blinking between them, which is what tells
 *   the eye that these options are one control and that only one can be chosen. Its leading edge
 *   moves faster than its trailing edge, so it stretches toward where it is going and settles there.
 * - `NumberRoll` is an odometer. Digits roll to their new value — upward when the number grows,
 *   downward when it shrinks — so a stepper or a score shows the direction of the change, not just
 *   its result.
 * - `usePresence` keeps something mounted long enough to animate out.
 *
 * All motion runs on the duration tokens, so the reduced-motion setting zeroes it without any code
 * here knowing about it.
 *
 * Separate from `./motion` (the choreography helpers: `Beat`, `CountUp`, `Stagger`) because that
 * file imports `cx` from `./index`, and `./index` imports from this one. This module imports nothing
 * from `./index`, `./client` or `./motion`, so there is no cycle, and `./index` stays importable from
 * a server component: it gets a client reference for these exports and nothing else.
 */

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function join(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------- Indicator */

type Edge = 'fill' | 'top' | 'bottom' | 'left';

interface IndicatorOptions {
  match: string;
  edge: Edge;
  thickness: number;
  length?: number;
  inset: number;
  offset: number;
  optimistic?: string;
}

interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
}

/**
 * A highlight that slides to whichever item inside its parent matches `match`.
 *
 * Render it as a child of the control, anywhere among the items. The parent must be positioned and
 * should be `isolate`, so the indicator can sit at `-z-10` underneath the items' text. Until the
 * indicator has measured, the parent has no `data-indicator` attribute and the active item should
 * draw its own highlight; once it has, the parent carries `data-indicator="ready"` and items drop
 * theirs with `in-data-[indicator=ready]:`. So server HTML, a page before hydration and a browser
 * with scripts off all still show which item is selected.
 *
 * `optimistic` is for items that navigate. A tab that is a link only becomes `aria-current` when
 * the server answers, which can be half a second; the indicator moves on the click instead, and
 * snaps to whatever the page actually marks once it does.
 */
export function Indicator({
  match,
  edge = 'fill',
  thickness = 2,
  length,
  inset = 0,
  offset = 0,
  optimistic,
  className,
}: {
  /** A selector for the active item, searched inside the indicator's parent. */
  match: string;
  /** `fill` covers the item; the others draw a bar along that side of it. */
  edge?: Edge;
  /** A bar's thickness, in px. */
  thickness?: number;
  /** A bar shorter than its item, centred on it, in px. */
  length?: number;
  /** Shortens a bar at both ends, in px. */
  inset?: number;
  /** Moves a `left` bar outward from the item, in px — for a bar that sits at a rail's edge. */
  offset?: number;
  /** A selector for clickable items, to move on click before the page confirms. */
  optimistic?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const options = useRef<IndicatorOptions>({ match, edge, thickness, length, inset, offset, optimistic });
  const last = useRef<Box | null>(null);
  const pending = useRef<{ el: Element; until: number } | null>(null);
  const place = useRef<() => void>(() => {});

  useIsoLayoutEffect(() => {
    options.current = { match, edge, thickness, length, inset, offset, optimistic };
    place.current();
  });

  useIsoLayoutEffect(() => {
    const node = ref.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const watched = new Set<Element>();

    const hide = () => {
      node.style.opacity = '0';
      last.current = null;
    };

    place.current = () => {
      const o = options.current;
      let target: HTMLElement | null = null;
      const p = pending.current;
      if (p && p.until > performance.now() && parent.contains(p.el)) target = p.el as HTMLElement;
      else pending.current = null;
      target ??= parent.querySelector<HTMLElement>(o.match);
      parent.dataset.indicator = 'ready';
      if (!target) return hide();

      if (!watched.has(target)) {
        watched.add(target);
        resize.observe(target);
      }
      const pr = parent.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      if (tr.width === 0 && tr.height === 0) return hide();

      // In the parent's padding box, and in its scrolled content, so a scrolling tab rail carries
      // the indicator with it rather than leaving it behind.
      const x = tr.left - pr.left - parent.clientLeft + parent.scrollLeft;
      const y = tr.top - pr.top - parent.clientTop + parent.scrollTop;
      let box: Box;
      if (o.edge === 'fill') {
        box = { l: x, t: y, w: tr.width, h: tr.height };
      } else if (o.edge === 'left') {
        const h = o.length ?? tr.height - 2 * o.inset;
        box = { l: x - o.offset, t: y + (tr.height - h) / 2, w: o.thickness, h };
      } else {
        const w = o.length ?? tr.width - 2 * o.inset;
        box = { l: x + (tr.width - w) / 2, t: o.edge === 'top' ? y : y + tr.height - o.thickness, w, h: o.thickness };
      }

      const prev = last.current;
      const s = node.style;
      // Measured again without moving — a re-render, a resize that changed nothing. Leave the
      // transition that is running alone rather than rewriting its timing.
      if (
        prev &&
        Math.abs(box.l - prev.l) < 0.5 &&
        Math.abs(box.t - prev.t) < 0.5 &&
        Math.abs(box.w - prev.w) < 0.5 &&
        Math.abs(box.h - prev.h) < 0.5
      ) {
        s.opacity = '1';
        return;
      }
      // The edge in front travels on the short duration and the one behind on the long one, so a
      // move reads as a stretch toward the new item that then catches up. No move: no transition.
      const fast = 'var(--dur-4)';
      const slow = 'var(--dur-5)';
      const instant = '0s';
      let dl = instant;
      let dr = instant;
      let dt = instant;
      let db = instant;
      if (prev) {
        if (box.l > prev.l + 0.5) [dl, dr] = [slow, fast];
        else if (box.l < prev.l - 0.5) [dl, dr] = [fast, slow];
        else dl = dr = fast;
        if (box.t > prev.t + 0.5) [dt, db] = [slow, fast];
        else if (box.t < prev.t - 0.5) [dt, db] = [fast, slow];
        else dt = db = fast;
      }
      s.transitionProperty = 'left, right, top, bottom, opacity, background-color';
      s.transitionDuration = `${dl}, ${dr}, ${dt}, ${db}, var(--dur-3), var(--dur-4)`;
      s.transitionTimingFunction = 'var(--ease-entrance)';
      s.left = `${box.l}px`;
      s.right = `${parent.clientWidth - box.l - box.w}px`;
      s.top = `${box.t}px`;
      s.bottom = `${parent.clientHeight - box.t - box.h}px`;
      s.opacity = '1';
      last.current = box;
    };

    const resize = new ResizeObserver(() => place.current());
    resize.observe(parent);
    const mutation = new MutationObserver(() => {
      // The page has said what is active; a click's guess gives way to it.
      pending.current = null;
      place.current();
    });
    mutation.observe(parent, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-checked', 'aria-current', 'aria-selected', 'aria-pressed', 'data-active', 'hidden'],
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Capture phase: `next/link` prevents the default on its own click handler, and a bubbling
    // listener would only ever see a prevented event.
    const onClick = (event: MouseEvent) => {
      const selector = options.current.optimistic;
      if (!selector || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const item = (event.target as Element | null)?.closest(selector);
      if (!item || !parent.contains(item) || item.getAttribute('target') === '_blank') return;
      pending.current = { el: item, until: performance.now() + 4000 };
      place.current();
      clearTimeout(timer);
      // If the navigation never lands, return to whatever is really active.
      timer = setTimeout(() => place.current(), 4100);
    };
    parent.addEventListener('click', onClick, true);

    place.current();
    let alive = true;
    void document.fonts?.ready.then(() => alive && place.current());

    return () => {
      alive = false;
      clearTimeout(timer);
      resize.disconnect();
      mutation.disconnect();
      parent.removeEventListener('click', onClick, true);
      delete parent.dataset.indicator;
    };
  }, []);

  return <span ref={ref} aria-hidden className={join('pointer-events-none absolute -z-10 opacity-0', className)} />;
}

/* ------------------------------------------------------------- NumberRoll */

const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);

function numeric(text: string): number {
  return Number.parseFloat(text.replace(/[^\d.-]/g, ''));
}

/**
 * A number whose digits roll to their new value.
 *
 * Pass the formatted string (`"1.25"`, `"+0.40"`, `"3:07"`); anything that is not a digit is drawn
 * as it is. Digits are matched from the right, so a fixed-decimal value keeps its decimal point
 * still while the digits around it turn. When the value grows every changing digit rolls up, and
 * when it shrinks they all roll down — a 9 going to 0 on the way up passes through nothing, it just
 * keeps turning — which is why each wheel holds three copies of 0–9 and re-centres itself after
 * every move.
 *
 * `rollIn` spins every digit up from zero on mount, for a figure being revealed. The real value is
 * always present for a screen reader; the wheels are decoration.
 */
export function NumberRoll({
  value,
  rollIn,
  className,
}: {
  value: string | number;
  rollIn?: boolean;
  className?: string;
}) {
  const text = String(value);
  const [memo, setMemo] = useState({ text, dir: 0 });
  let dir = memo.dir;
  if (memo.text !== text) {
    const a = numeric(text);
    const b = numeric(memo.text);
    dir = Number.isFinite(a) && Number.isFinite(b) ? Math.sign(a - b) || 1 : 1;
    setMemo({ text, dir });
  }

  const chars = text.split('');
  return (
    <span className={join('whitespace-nowrap', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {chars.map((char, i) => {
          const fromRight = chars.length - i;
          return /\d/.test(char) ? (
            <DigitWheel key={`d${fromRight}`} digit={Number(char)} dir={dir} rollIn={rollIn} order={i} />
          ) : (
            <span key={`c${fromRight}-${char}`}>{char}</span>
          );
        })}
      </span>
    </span>
  );
}

function DigitWheel({ digit, dir, rollIn, order }: { digit: number; dir: number; rollIn?: boolean; order: number }) {
  const strip = useRef<HTMLSpanElement>(null);
  const pos = useRef<number | null>(null);
  // Fixed at mount: after that the wheel is driven directly, and a changing style prop would have
  // React fight the transition.
  const [initial] = useState(() => ({ transform: `translateY(${-(rollIn ? 10 : 10 + digit) * 100}%)` }));

  useIsoLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const set = (p: number, animate: boolean) => {
      el.style.transition = animate
        ? `transform var(--dur-6) var(--ease-entrance) ${Math.min(order, 6) * 35}ms`
        : 'none';
      el.style.transform = `translateY(${-p * 100}%)`;
      pos.current = p;
    };
    if (pos.current === null) {
      set(rollIn ? 10 : 10 + digit, false);
      if (rollIn && digit !== 0) {
        void el.getBoundingClientRect();
        set(10 + digit, true);
      }
      return;
    }
    const current = pos.current;
    const at = ((current % 10) + 10) % 10;
    if (at === digit) return;
    const forward = (digit - at + 10) % 10;
    const backward = (at - digit + 10) % 10;
    set(dir < 0 ? current - backward : current + forward, true);
  }, [digit, dir, rollIn, order]);

  const recentre = () => {
    const el = strip.current;
    const p = pos.current;
    if (!el || p === null || (p >= 10 && p < 20)) return;
    const centred = 10 + (((p % 10) + 10) % 10);
    el.style.transition = 'none';
    el.style.transform = `translateY(${-centred * 100}%)`;
    pos.current = centred;
  };

  return (
    <span className="relative inline-block">
      <span className="invisible">{digit}</span>
      {/* The window reaches a little above and below the line so tall glyphs are never clipped. */}
      <span className="absolute inset-x-0 -top-[0.2em] -bottom-[0.2em] overflow-hidden">
        <span ref={strip} className="absolute inset-0 will-change-transform" style={initial} onTransitionEnd={recentre}>
          {STRIP.map((d, i) => (
            <span key={i} className="flex h-full items-center justify-center">
              {d}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------ usePresence */

/**
 * Keeps something mounted for `ms` after it closes, so it can play its way out. `state` is what to
 * put on `data-state` for the CSS to key off.
 */
export function usePresence(open: boolean, ms = 140): { mounted: boolean; state: 'open' | 'closed' } {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, mounted, ms]);
  return { mounted: open || mounted, state: open ? 'open' : 'closed' };
}
