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

/**
 * Whether a key should be left alone for the element that has it.
 *
 * Two cases the typing guard above did not cover, both of which shipped as bugs:
 *
 *   **A modal is open.** The studies panel is a `<dialog>`, and with it open, Enter on one of its
 *   toggles flipped the study *and* committed the trade underneath. While a modal owns the page,
 *   the page's shortcuts are off; the dialog handles its own Escape.
 *
 *   **A control has focus and the key is how you press it.** Enter on a focused Replay button
 *   replayed *and* advanced to the next chart. Enter and Space belong to the focused button, link,
 *   disclosure or radio; every other shortcut still works around it.
 *
 * Pure, so the rule is testable without a DOM.
 */
export function shouldIgnoreKey(key: string, target: { tag?: string; role?: string | null } | null, modalOpen: boolean): boolean {
  if (modalOpen) return true;
  if (key !== 'Enter' && key !== ' ') return false;
  const tag = target?.tag?.toUpperCase();
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
  const role = target?.role;
  return role === 'button' || role === 'radio' || role === 'tab' || role === 'switch' || role === 'checkbox' || role === 'link';
}

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

/**
 * Keys are matched case-insensitively; use `Enter`, `Escape`, `' '` and single letters. A handler
 * that wants the browser default suppressed calls `preventDefault` itself.
 *
 * A binding may be prefixed `mod+` to require ⌘ on a Mac or Ctrl elsewhere — `mod+z` for undo.
 * That is an opt-in and stays one: the bare rule below is that a shortcut must never shadow a
 * browser or OS command, and it holds. ⌘Z is the exception that proves it, because the command it
 * would shadow only exists inside an editable field and `isTypingTarget` has already bailed out of
 * every one of those.
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
      const element = event.target instanceof HTMLElement ? event.target : null;
      const modalOpen = document.querySelector('dialog[open]') !== null;
      if (shouldIgnoreKey(event.key, element ? { tag: element.tagName, role: element.getAttribute('role') } : null, modalOpen)) {
        return;
      }

      // `mod+` bindings are looked up first, and only they may carry ⌘/Ctrl.
      if (event.metaKey || event.ctrlKey) {
        if (event.altKey) return;
        const key = `mod+${event.key.toLowerCase()}`;
        current.current[key]?.(event);
        return;
      }

      // A shortcut must never shadow a browser or OS command.
      if (event.altKey) return;

      // `shift+` bindings take precedence when Shift is held; letters still match bare, because a
      // capital L is the same intention as l.
      const lower = event.key.toLowerCase();
      const handler =
        (event.shiftKey ? current.current[`shift+${lower}`] : undefined) ??
        current.current[event.key] ??
        current.current[lower];
      handler?.(event);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
