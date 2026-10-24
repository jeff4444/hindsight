import { describe, expect, it } from 'vitest';
import { shouldIgnoreKey } from '@/lib/useHotkeys';

describe('shortcuts give way to the focused control', () => {
  it('ignores everything while a modal is open', () => {
    expect(shouldIgnoreKey('Enter', null, true)).toBe(true);
    expect(shouldIgnoreKey('l', { tag: 'DIV' }, true)).toBe(true);
  });

  it('leaves Enter and Space to a focused button, link, disclosure or radio', () => {
    expect(shouldIgnoreKey('Enter', { tag: 'BUTTON' }, false)).toBe(true);
    expect(shouldIgnoreKey(' ', { tag: 'A' }, false)).toBe(true);
    expect(shouldIgnoreKey('Enter', { tag: 'SUMMARY' }, false)).toBe(true);
    expect(shouldIgnoreKey('Enter', { tag: 'DIV', role: 'radio' }, false)).toBe(true);
  });

  it('still lets other shortcuts through a focused button', () => {
    expect(shouldIgnoreKey('l', { tag: 'BUTTON' }, false)).toBe(false);
    expect(shouldIgnoreKey('ArrowUp', { tag: 'BUTTON' }, false)).toBe(false);
  });

  it('handles Enter on the page itself', () => {
    expect(shouldIgnoreKey('Enter', { tag: 'BODY' }, false)).toBe(false);
    expect(shouldIgnoreKey('Enter', null, false)).toBe(false);
  });
});
