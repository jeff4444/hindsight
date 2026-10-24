'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx, IconButton } from './index';
import { Icon, type IconName } from './icons';
import {
  getMotionSnapshot,
  SERVER_MOTION,
  setMotionPref,
  subscribeMotion,
  type MotionPref,
} from '@/lib/motion';
import {
  getThemeSnapshot,
  SERVER_THEME,
  setPalette,
  setThemePref,
  subscribeTheme,
  type ThemeSnapshot,
} from '@/lib/theme';
import { GLOSSARY, type TermId } from '@/lib/glossary';
import { candlesFor } from '@/lib/palette';

/**
 * The stateful primitives.
 *
 * Split out of `./index` so that file can stay free of `'use client'` and remain importable from a
 * server component. This file must never be imported *by* `./index`.
 *
 * Radix was considered and declined. The four things it is genuinely worth having — focus
 * trapping, a top layer that escapes z-index, light dismiss and ESC handling — are all in the
 * platform now: `<dialog>.showModal()` gives the first three for free and the Popover API gives
 * the fourth. The top layer matters more here than anywhere: it escapes *every* stacking context
 * in the document, which is precisely the property an app built around one fragile stacking
 * context wants from its overlays. The only thing being hand-written that Radix would have
 * supplied is a positioner, and that is forty lines.
 */

/* ------------------------------------------------------------------ Toast */

type ToastTone = 'neutral' | 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

/**
 * The provider renders no wrapper element at all, and the viewport is portalled to `document.body`.
 *
 * Both matter. If the provider wrapped its children in a `<div>`, that `<div>` would sit above
 * `ChartFrame` in the tree on the play route, and one future `className` on it — a transform, an
 * opacity, a blur — would put the drag rails behind the canvas. A context provider that renders
 * nothing cannot become that ancestor.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = next.current++;
    // Three is the point at which a stack stops being readable and starts being a wall.
    setItems((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastViewport items={items} onDismiss={(id) => setItems((p) => p.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast requires a <ToastProvider> above it');
  return push;
}

const TOAST_TONE: Record<ToastTone, { ring: string; icon: IconName; ink: string }> = {
  neutral: { ring: 'ring-line', icon: 'info', ink: 'text-ink-lo' },
  success: { ring: 'ring-long-line', icon: 'check', ink: 'text-long-ink' },
  error: { ring: 'ring-short-line', icon: 'alert', ink: 'text-short-ink' },
};

/**
 * `false` while server-rendering, `true` once hydrated.
 *
 * A portal needs `document.body`, which does not exist during SSR. The usual
 * `useEffect(() => setMounted(true))` does the same job but as a state write inside an effect,
 * which triggers a second render pass for something that is really just "am I on the client".
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  if (!useHydrated()) return null;

  return createPortal(
    <div
      // `polite` rather than `assertive`: none of these interrupt a task, and an assertive region
      // cuts off whatever the reader was mid-sentence on.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {items.map((item) => {
        const tone = TOAST_TONE[item.tone];
        return (
          <div
            key={item.id}
            className={cx(
              'bg-surface-3 shadow-e4 animate-rise pointer-events-auto flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 ring-1',
              tone.ring,
            )}
          >
            <Icon name={tone.icon} size={16} className={cx('shrink-0', tone.ink)} />
            <span className="text-ink text-sm">{item.message}</span>
            <IconButton
              icon="x"
              label="Dismiss"
              size="sm"
              className="-mr-1.5 ml-1"
              onClick={() => onDismiss(item.id)}
            />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------- Live */

/**
 * A polite announcement region.
 *
 * The app had zero `aria-live` anywhere, which on a screen whose entire state machine is conveyed
 * by animation means a screen-reader user is told nothing between pressing Commit and reaching
 * the result.
 */
export function Live({ message }: { message: string | null }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {message ?? ''}
    </p>
  );
}

/* ----------------------------------------------------------------- Dialog */

/**
 * `<dialog>` with `showModal()`.
 *
 * Native focus trap, native ESC, native `inert` on the rest of the document, and the top layer —
 * so it paints above everything regardless of what stacking contexts exist between here and the
 * root. `::backdrop` is styled in the element's own class list via the `backdrop:` variant.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  placement = 'center',
  size = 'sm',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /**
   * `bottom` is a sheet on a phone and still a sheet on desktop — use it for stacked choices.
   * `side` is a bottom sheet on a phone and a full-height panel from the right on desktop — use it
   * for a dossier or a detail view that sits beside what it explains.
   */
  placement?: 'center' | 'bottom' | 'side';
  /**
   * How much room the content needs.
   *
   * `sm` is a confirmation. `lg` is a settings surface — the studies panel carries nine rows of
   * label, explanation, published formula and a period input, and at the confirm width the word
   * "Moving averages" wrapped onto two lines and its note onto nine.
   */
  size?: 'sm' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // ESC and backdrop-click both route through the one `onClose` so state cannot desync from
      // the element's own open flag.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cx(
        'bg-surface-2 text-ink shadow-e4 border-line m-0 border p-0 backdrop:bg-scrim',
        placement === 'side'
          ? 'fixed inset-x-0 bottom-0 top-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:h-dvh md:w-[28rem] md:rounded-none md:rounded-l-2xl'
          : placement === 'bottom'
          ? cx(
              'fixed inset-x-0 bottom-0 top-auto w-full max-w-none rounded-t-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
              size === 'lg' ? 'sm:w-[40rem]' : 'sm:w-[26rem]',
            )
          : cx(
              'fixed left-1/2 top-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl',
              size === 'lg' ? 'max-w-[40rem]' : 'max-w-[30rem]',
            ),
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 id={titleId} className="text-ink-max text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descId} className="text-ink-lo mt-1 text-sm">
              {description}
            </p>
          )}
        </div>
        <IconButton icon="x" label="Close" size="sm" className="-mr-1.5 -mt-1" onClick={onClose} />
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="border-line-faint flex justify-end gap-2 border-t px-5 py-3.5">{footer}</div>}
    </dialog>
  );
}

/* ----------------------------------------------------------------- Select */

/**
 * A styled trigger around the native `<select>`.
 *
 * The engine stays native on purpose. It costs zero bytes, it brings keyboard typeahead and the
 * full accessibility tree for free, and on iOS it opens the system wheel picker — which beats any
 * custom listbox anyone is going to write. Escalate to a real listbox only when an option row
 * needs an icon and a description, which is not a thing this product has.
 *
 * This replaces the one unstyled control in the app: a raw `<select>` with a `text-[0.5rem]`
 * unicode triangle sitting next to it.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  tone = 'neutral',
  size = 'sm',
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Visually hidden; the control needs a name. */
  label: string;
  tone?: 'neutral' | 'restraint';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const numeric = typeof value === 'number';
  return (
    <span className={cx('relative inline-flex items-center', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange((numeric ? Number(event.target.value) : event.target.value) as T)}
        className={cx(
          'press cursor-pointer appearance-none rounded-md font-mono ring-1 transition-colors',
          size === 'md' ? 'h-9 pl-3 pr-8 text-sm' : 'h-8 pl-2.5 pr-7 text-xs',
          tone === 'restraint'
            ? 'bg-restraint-bg text-restraint-ink ring-restraint-line hover:bg-restraint/25'
            : 'bg-fill-2 text-ink ring-line hover:bg-fill-3',
        )}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value} className="bg-surface-2 text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={size === 'md' ? 15 : 13}
        className={cx(
          'pointer-events-none absolute',
          size === 'md' ? 'right-2.5' : 'right-2',
          tone === 'restraint' ? 'text-restraint-ink' : 'text-ink-dim',
        )}
      />
    </span>
  );
}

/* ---------------------------------------------------------------- Tooltip */

/**
 * Hover and focus tooltip on the Popover API.
 *
 * The app had a dozen `title=` attributes carrying real explanation — what MFE means, what the
 * oracle is, how many freezes are left. `title` never appears on touch at all, and on a keyboard
 * it appears late or not at all. This wires the same strings to `aria-describedby` and shows them
 * on focus, and keeps `title` as the no-JS fallback.
 *
 * Positioned on open with `getBoundingClientRect` rather than CSS anchor positioning, which is
 * still not in Firefox.
 */
export function Tooltip({
  label,
  placement = 'top',
  children,
}: {
  label: string;
  /** `right` is for a vertical rail, where a label above the button covers the button above it. */
  placement?: 'top' | 'bottom' | 'right';
  children: ReactNode;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    setPos(
      placement === 'right'
        ? { top: box.top + box.height / 2, left: box.right + 8 }
        : { top: placement === 'top' ? box.top - 8 : box.bottom + 8, left: box.left + box.width / 2 },
    );
  }, [placement]);

  const hide = useCallback(() => setPos(null), []);

  // A scroll or a resize invalidates the measurement, and a stale tooltip is worse than none.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos, hide]);

  return (
    <>
      <span
        ref={anchor}
        aria-describedby={pos ? id : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
        className="inline-flex"
      >
        {children}
      </span>
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className={cx(
              'bg-surface-3 text-ink shadow-e3 ring-line animate-fade pointer-events-none fixed z-50 max-w-56 rounded-md px-2.5 py-1.5 text-xs ring-1',
              placement === 'right' ? '-translate-y-1/2' : '-translate-x-1/2',
              placement === 'top' ? '-translate-y-full' : '',
            )}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}

/* -------------------------------------------------------------- Countdown */

/** A live clock to a fixed instant. `DailyCard`'s reset time is currently static prose. */
export function Countdown({ to, className }: { to: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, to - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <span className={cx('numeral tabular-nums', className)}>
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}
    </span>
  );
}

/* ------------------------------------------------------- MotionPreference */


/**
 * The control for a setting that has been fully plumbed and completely inert since it was written:
 * globals.css keys off `data-motion` and `useReducedMotion` reads it, and nothing anywhere ever
 * wrote it.
 */
export function MotionPreference({ className }: { className?: string }) {
  // Read through the same store `useReducedMotion` reads, so the control cannot disagree with the
  // thing it controls, and it stays right if the preference is changed from another tab.
  const pref = useSyncExternalStore(
    subscribeMotion,
    () => getMotionSnapshot().pref,
    () => SERVER_MOTION.pref,
  );

  const options: { value: MotionPref; label: string; hint: string }[] = useMemo(
    () => [
      { value: 'system', label: 'System', hint: 'Follow your device setting' },
      { value: 'full', label: 'Full', hint: 'Animations on, even if your device asks for less' },
      {
        value: 'reduced',
        label: 'Reduced',
        hint: 'Entrances and flourishes off. The reveal still plays — it is the content.',
      },
    ],
    [],
  );

  return (
    <div className={className}>
      <div className="bg-fill-2 ring-line-faint inline-flex rounded-full p-1 ring-1" role="radiogroup" aria-label="Motion">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={pref === option.value}
            onClick={() => setMotionPref(option.value)}
            className={cx(
              'press h-9 rounded-full px-4 text-sm font-medium transition-colors',
              pref === option.value ? 'bg-thumb text-ink-max shadow-e1' : 'text-ink-lo hover:text-ink-hi',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-ink-dim mt-2 text-xs">{options.find((o) => o.value === pref)?.hint}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Popover */

/**
 * A tap-or-click panel anchored to its trigger.
 *
 * The difference from `Tooltip` is the whole point: a tooltip is hover, and hover does not exist on
 * a phone. Anything a player needs to *read* — a definition, a ruleset, an explanation of a figure —
 * opens on tap, stays open until dismissed, and is reachable by keyboard. Portalled, so no stacking
 * context between here and the root can clip it.
 */
export function Popover({
  trigger,
  label,
  children,
  placement = 'bottom',
  width = 'w-72',
  className,
}: {
  /** The visible trigger content. Rendered inside a button. */
  trigger: ReactNode;
  /** The trigger's accessible name when its content is not text. */
  label?: string;
  children: ReactNode;
  placement?: 'top' | 'bottom';
  width?: string;
  className?: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => setPos(null), []);
  const toggle = useCallback(() => {
    setPos((current) => {
      if (current) return null;
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return null;
      const half = 144;
      const left = Math.min(Math.max(box.left + box.width / 2, half + 12), window.innerWidth - half - 12);
      return { top: placement === 'top' ? box.top - 8 : box.bottom + 8, left };
    });
  }, [placement]);

  useEffect(() => {
    if (!pos) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        anchor.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos, close]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        aria-expanded={pos !== null}
        aria-controls={pos ? id : undefined}
        onClick={toggle}
        className={className}
      >
        {trigger}
      </button>
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            style={{ top: pos.top, left: pos.left }}
            // A link inside navigates without unmounting the trigger (the shell persists), so close
            // explicitly or the menu would float over the next page.
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) close();
            }}
            className={cx(
              'bg-surface-3 text-ink shadow-e4 ring-line animate-fade fixed z-50 -translate-x-1/2 rounded-xl p-4 text-sm ring-1',
              placement === 'top' && '-translate-y-full',
              width,
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------- Term */

/**
 * A term of art, with its definition one tap away. The word keeps its place in the sentence; the
 * dotted underline is the only signal that there is more.
 */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const term = GLOSSARY[id];
  return (
    <Popover
      trigger={children ?? term.label}
      label={`What is ${term.label}?`}
      className="decoration-ink-dim hover:decoration-ink-hi cursor-help rounded-xs underline decoration-dotted decoration-1 underline-offset-4 transition-colors"
    >
      <p className="text-ink-max font-semibold">{term.label}</p>
      <p className="text-ink-lo mt-1.5 leading-relaxed">{term.body}</p>
      {term.more && (
        <a href={term.more} className="text-ink-hi decoration-gold-line mt-2.5 inline-block text-xs underline underline-offset-4">
          Read the full rule
        </a>
      )}
    </Popover>
  );
}

/* ------------------------------------------------------------------- Tabs */

/**
 * Tabs with arrow-key roving, per the ARIA tabs pattern. Controlled: the parent owns which panel is
 * showing, so a tab can be driven by a URL param as easily as by state.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].value);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('border-line-faint no-scrollbar flex gap-1 overflow-x-auto border-b', className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKey(event, index)}
            className={cx(
              'relative -mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              active ? 'border-gold text-ink-max' : 'text-ink-lo hover:text-ink-hi border-transparent',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="numeral bg-fill-2 text-ink-dim rounded-full px-1.5 text-mini">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- ThemePreference */

const THEME_OPTIONS: { value: ThemeSnapshot['pref']; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follow your device' },
  { value: 'light', label: 'Daylight', hint: 'Warm paper. The play screen stays dark.' },
  { value: 'dark', label: 'Afterglow', hint: 'Ink and gold, everywhere' },
];

export function ThemePreference({ className }: { className?: string }) {
  const snap = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => SERVER_THEME);
  return (
    <div className={className}>
      <div className="bg-fill-2 ring-line-faint inline-flex rounded-full p-1 ring-1" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={snap.pref === option.value}
            onClick={() => setThemePref(option.value)}
            className={cx(
              'press h-9 rounded-full px-4 text-sm font-medium transition-colors',
              snap.pref === option.value ? 'bg-thumb text-ink-max shadow-e1' : 'text-ink-lo hover:text-ink-hi',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-ink-dim mt-2 text-xs">{THEME_OPTIONS.find((o) => o.value === snap.pref)?.hint}</p>
    </div>
  );
}

export function PalettePreference({ className }: { className?: string }) {
  const snap = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => SERVER_THEME);
  const options = [
    { value: 'standard' as const, label: 'Green and red' },
    { value: 'cb' as const, label: 'Blue and orange' },
  ];
  return (
    <div className={className}>
      <div className="bg-fill-2 ring-line-faint inline-flex rounded-full p-1 ring-1" role="radiogroup" aria-label="Direction colours">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={snap.palette === option.value}
            onClick={() => setPalette(option.value)}
            className={cx(
              'press flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
              snap.palette === option.value ? 'bg-thumb text-ink-max shadow-e1' : 'text-ink-lo hover:text-ink-hi',
            )}
          >
            <span aria-hidden className="flex gap-0.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: candlesFor(option.value).up }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: candlesFor(option.value).down }} />
            </span>
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-ink-dim mt-2 text-xs">Blue and orange separate under every common form of colour blindness.</p>
    </div>
  );
}

/** The current theme snapshot, for components that draw on canvas. */
export function useThemeSnapshot(): ThemeSnapshot {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => SERVER_THEME);
}
