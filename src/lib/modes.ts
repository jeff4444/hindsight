/**
 * Every way to play, described once.
 *
 * The hub, Today's quick-play row and the landing page all list modes, and before this each
 * described them in its own words — Streak was "Untimed" on one screen and carried a 90-second clock
 * on the next. One table, one set of claims, each checked against the rules the server enforces.
 */

import type { IconName } from '@/components/ui/icons';
import { routes } from './routes';

export type ModeId = 'daily' | 'ranked' | 'practice' | 'manage' | 'storm' | 'survival' | 'duel' | 'race';

export type ModeGroup = 'compete' | 'practice' | 'arcade';

export interface ModeInfo {
  id: ModeId;
  name: string;
  group: ModeGroup;
  icon: IconName;
  /** One line: what you do. */
  tagline: string;
  /** What the mode trains or tests, for the hub card. */
  detail: string;
  /** Roughly how long it takes, as players read it. */
  length: string;
  rated: boolean;
  /** Needs an account to start. */
  account?: boolean;
  /** Where its button goes. Modes that need a choice first (a tape, an opponent) go to that page. */
  href: string;
}

export const MODES: readonly ModeInfo[] = [
  {
    id: 'daily',
    name: 'Daily',
    group: 'compete',
    icon: 'sun',
    tagline: 'Five charts. Same for everyone. Once a day.',
    detail: 'The one everybody plays. Compare your score with the whole field and share a card that spoils nothing.',
    length: '≈ 6 min',
    rated: true,
    href: routes.play.daily,
  },
  {
    id: 'ranked',
    name: 'Ranked',
    group: 'compete',
    icon: 'shield',
    tagline: 'Five charts, at least three trades, 90 seconds each.',
    detail: 'The ladder. Your rating moves after every session and names your division.',
    length: '≈ 8 min',
    rated: true,
    account: true,
    href: routes.play.ranked(),
  },
  {
    id: 'duel',
    name: 'Duel',
    group: 'compete',
    icon: 'swords',
    tagline: 'Same charts as a friend. Bigger gap, bigger hit.',
    detail: 'Send a link. Each chart you outscore them on takes health off their bar. Never moves your rating.',
    length: '5–15 charts',
    rated: false,
    href: routes.versus.index,
  },
  {
    id: 'practice',
    name: 'Practice',
    group: 'practice',
    icon: 'tape',
    tagline: 'Unlimited charts from any tape, under any rules.',
    detail: 'Pick a tape — a regime, a pattern, a kind of move — and the rules you want. Turn on the sandbox to learn without a rating.',
    length: 'Endless',
    rated: true,
    href: routes.tapes.index(),
  },
  {
    id: 'manage',
    name: 'Manage',
    group: 'practice',
    icon: 'sliders',
    tagline: 'Open a trade, then run it bar by bar.',
    detail: 'Trail the stop, take half, move to breakeven or bail. The other half of trading, with its own rating.',
    length: '≈ 2 min a chart',
    rated: true,
    href: routes.play.manage('open'),
  },
  {
    id: 'storm',
    name: 'Storm',
    group: 'arcade',
    icon: 'bolt',
    tagline: 'Three minutes of thinking time. Beat par for a point.',
    detail: 'Only your decision time counts; the reveal is free. Combos build, a stop-out costs ten seconds, sitting out scores nothing.',
    length: '3 min',
    rated: true,
    href: routes.play.storm(),
  },
  {
    id: 'survival',
    name: 'Survival',
    group: 'arcade',
    icon: 'heart',
    tagline: 'Keep beating par. One miss ends it.',
    detail: 'Every chart is on the clock. You get one sit-out per run — a second one ends the run, so spend it well.',
    length: 'Until you miss',
    rated: true,
    href: routes.play.survival(),
  },
  {
    id: 'race',
    name: 'Race',
    group: 'arcade',
    icon: 'flag',
    tagline: 'One sequence, against everyone who ran it.',
    detail: 'Race recorded runs of the same charts, labelled as recordings. Read well, not fast: it scores quality, not speed.',
    length: '5–15 charts',
    rated: false,
    href: routes.versus.index,
  },
];

export const MODE_GROUPS: { id: ModeGroup; name: string; blurb: string }[] = [
  { id: 'compete', name: 'Compete', blurb: 'Against the field, the ladder, or a friend.' },
  { id: 'practice', name: 'Practice', blurb: 'Unlimited, never metered.' },
  { id: 'arcade', name: 'Arcade', blurb: 'Fast reps against the clock.' },
];

export function modeById(id: ModeId): ModeInfo {
  return MODES.find((mode) => mode.id === id)!;
}
