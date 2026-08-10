'use client';

import { useEffect, useRef } from 'react';

/**
 * Window-level keyboard shortcuts.
 *
 * The guard is the point of extracting this. It used to be `event.target instanceof
 * HTMLInputElement`, which is true of an `<input>` and of nothing else — so with the timeframe
 * `<select>` focused, `Enter` fell straight through to the play surface and **committed the
 * order**, and `r` reset the view out from under a player who was only choosing a resolution.
 *
 * That was already reachable by keyboard alone before this phase. With sign-in forms, a handle
 * field and a settings page arriving it stops being an edge case, so the check covers every
 * element that legitimately owns a keystroke.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target.isContentEditable;
}

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

/**
 * Keys are matched case-insensitively; use `Enter`, `Escape`, `' '` and single letters. A handler
 * that wants the browser default suppressed calls `preventDefault` itself.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const current = useRef(map);
  useEffect(() => {
    current.current = map;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      // A shortcut must never shadow a browser or OS command.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const handler = current.current[event.key] ?? current.current[event.key.toLowerCase()];
      handler?.(event);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
