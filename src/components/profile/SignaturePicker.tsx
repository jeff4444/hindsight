'use client';

import { useState, useTransition } from 'react';
import { ACCENTS, ACCENT_HEX, ACCENT_LABEL, randomSeed, type Accent } from '@/lib/avatar';
import { MarketSignature } from '../ui/MarketSignature';
import { Button, Eyebrow, cx } from '../ui';

/**
 * Choose a handle and a signature.
 *
 * The first thing a new player does that is purely theirs, so it is worth making pleasant rather
 * than a form. The signature redraws on every reroll with the sparkline animating in, which turns
 * "pick an avatar" into something you do a few more times than you need to — which is the point.
 *
 * The handle field is checked as you type against the same rules the database enforces, so the
 * failure arrives before the submit rather than after it.
 */
export function SignaturePicker({
  initialHandle = '',
  initialSeed,
  initialAccent = 'ember',
  submitLabel = 'Claim it',
  action,
}: {
  initialHandle?: string;
  initialSeed: number;
  initialAccent?: Accent;
  submitLabel?: string;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [seed, setSeed] = useState(initialSeed);
  const [accent, setAccent] = useState<Accent>(initialAccent);
  const [handle, setHandle] = useState(initialHandle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Bumped on every reroll so the SVG remounts and replays its draw animation.
  const [nonce, setNonce] = useState(0);

  const localError = validateHandle(handle);

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await action(formData);
          if (result && 'error' in result && result.error) setError(result.error);
        });
      }}
      data-stagger
    >
      <input type="hidden" name="seed" value={seed} />
      <input type="hidden" name="accent" value={accent} />

      <div className="flex flex-col items-center" style={{ '--i': 0 } as React.CSSProperties}>
        <MarketSignature key={nonce} seed={seed} accent={accent} size={132} ring="accent" animate />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => {
            setSeed(randomSeed());
            setNonce((n) => n + 1);
          }}
        >
          Reroll
        </Button>
      </div>

      <div className="mt-5" style={{ '--i': 1 } as React.CSSProperties}>
        <Eyebrow>Accent</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENTS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === accent}
              title={ACCENT_LABEL[option]}
              onClick={() => setAccent(option)}
              className={cx(
                'press h-8 w-8 rounded-full transition-transform',
                option === accent ? 'ring-ink-hi scale-110 ring-2 ring-offset-2 ring-offset-(--color-surface-0)' : 'ring-line ring-1',
              )}
              style={{ background: ACCENT_HEX[option] }}
            >
              <span className="sr-only">{ACCENT_LABEL[option]}</span>
            </button>
          ))}
        </div>
        <p className="text-ink-faint text-micro mt-2">
          The accent colours the line and the ring only — never a candle, so it can never be
          mistaken for direction.
        </p>
      </div>

      <label className="mt-6 block" style={{ '--i': 2 } as React.CSSProperties}>
        <span className="text-ink-lo text-xs font-medium">Handle</span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-ink-faint font-mono text-sm">@</span>
          <input
            name="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tapereader"
            className="border-line bg-surface-1 text-ink placeholder:text-ink-faint h-11 w-full rounded-md border px-3 font-mono text-sm"
          />
        </div>
        <p className={cx('mt-1.5 text-xs', localError && handle ? 'text-short-ink' : 'text-ink-faint')}>
          {handle && localError ? localError : '3–22 characters. Letters, numbers, single dashes or underscores.'}
        </p>
      </label>

      {error && (
        <div className="border-short-line bg-short-bg text-short-ink mt-4 rounded-md border p-3 text-xs" role="alert">
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        className="mt-6"
        loading={pending}
        disabled={Boolean(localError)}
        style={{ '--i': 3 } as React.CSSProperties}
      >
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}

/** Mirrors the CHECK constraints on `profiles`, so the error arrives before the round trip. */
function validateHandle(handle: string): string | null {
  if (!handle) return null;
  if (handle.length < 3) return 'At least 3 characters.';
  if (handle.length > 22) return 'At most 22 characters.';
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(handle)) {
    return 'Start and end with a letter or number.';
  }
  if (/[_-]{2}/.test(handle)) return 'No two separators in a row.';
  return null;
}
