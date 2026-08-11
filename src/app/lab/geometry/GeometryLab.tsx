'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Chart, type ChartHandle, type Overlay } from '@/components/Chart';
import type { Bar } from '@/core/bars';
import { PATH_BARS_PER_DISPLAY_BAR } from '@/core/config';
import { visibleAt } from '@/core/causal';
import {
  SWING_GRADES,
  atGrade,
  persistentSwings,
  walkFromBars,
  walkFromPath,
  type SwingGrade,
} from '@/core/geometry/swings';
import { candidates, selected } from '@/core/geometry/trendlines';
import { fitChannel, railsAt } from '@/core/geometry/channels';
import { levelsFrom } from '@/core/geometry/levels';
import { volumeProfile } from '@/core/geometry/volumeProfile';
import { TOOL_COLOUR } from '@/lib/toolOverlays';
import { cx } from '@/components/ui';
import { Select } from '@/components/ui/client';

/**
 * The eye test for Layer 2.
 *
 * Every control here exists to answer a question the automated suites cannot:
 *
 * - **the grade selector** — are the three nested thresholds the three a reader would pick?
 * - **"visible at bar t"** — does anything appear before its `knownAt`? This is the fastest way to
 *   see repainting, and repainting is the failure §6 rules ZigZag out for.
 * - **the minute-path toggle** — does resolving intrabar ordering from real one-minute data change
 *   the picture, or was the convention harmless all along?
 *
 * Round-number levels are deliberately absent. `npm run leak` measured what drawing them costs
 * under §12.2 — the grid names a single chart 94% of the time — so the module is analysis-only and
 * `tests/geometry/roundNumbers.boundary.test.ts` fails if anything under `src/app` imports it.
 * Including it here "just for development" is exactly how that boundary would erode.
 */

/**
 * The lab draws the same things the toolbox does, so it draws them in the same colours.
 *
 * It had its own eight hex values, which is how the two drifted: the lab kept a green channel and a
 * red point of control long after the toolbox learned that teal means long and red means short, and
 * its candidate trendlines were `#4c1d95` — a violet so dark it was very nearly invisible against
 * `surface-0`, on a screen whose entire job is looking at them.
 */
const COLOUR = {
  swingHigh: TOOL_COLOUR.swingHigh,
  swingLow: TOOL_COLOUR.swingLow,
  trendline: TOOL_COLOUR.trendline,
  /** Rejected candidates: the same hue as a selected trendline, stepped down rather than blacked out. */
  candidate: '#6b5a9e',
  channel: TOOL_COLOUR.channel,
  level: TOOL_COLOUR.level,
  poc: TOOL_COLOUR.poc,
  valueArea: TOOL_COLOUR.valueArea,
} as const;

interface LabChart {
  id: string;
  bars: Bar[];
  minutes: Bar[];
  atr: number;
  entry: number;
  mirrored: boolean;
  regime: string;
}

type Layer = 'swings' | 'trendlines' | 'candidates' | 'channel' | 'levels' | 'profile';

/**
 * Prose, and the colour each layer draws in.
 *
 * The toggles were labelled with the internal identifiers — `swings`, `candidates`, `profile` —
 * which is fine for the person who wrote them and opaque to anyone else looking at the same screen
 * a month later, including its author.
 */
const LAYER_LABEL: Record<Layer, string> = {
  swings: 'Swings',
  trendlines: 'Trendlines',
  candidates: 'Rejected candidates',
  channel: 'Channel',
  levels: 'Levels',
  profile: 'Volume profile',
};

const LAYER_COLOUR: Record<Layer, string> = {
  swings: COLOUR.swingHigh,
  trendlines: COLOUR.trendline,
  candidates: COLOUR.candidate,
  channel: COLOUR.channel,
  levels: COLOUR.level,
  profile: COLOUR.poc,
};

export function GeometryLab({ chart, ids }: { chart: LabChart; ids: string[] }) {
  const handle = useRef<ChartHandle>(null);

  /**
   * `major` rather than `intermediate`, on the evidence of looking at it.
   *
   * On a representative 80-bar chart the three grades emit 108, 48 and 12 swings. Forty-eight marks
   * on eighty candles is not an annotation, it is a fog — and 2b has to publish a default, so this
   * is the observation that default should be argued from. The ladder itself is sound: each grade
   * is a strict subset of the one below and the counts fall the way the ATR multiples predict.
   */
  const [grade, setGrade] = useState<SwingGrade>('major');
  const [useMinutes, setUseMinutes] = useState(chart.minutes.length > 0);
  const [visibleTo, setVisibleTo] = useState(chart.bars.length - 1);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    swings: true,
    trendlines: true,
    candidates: false,
    channel: true,
    levels: true,
    profile: true,
  });

  /**
   * Everything is recomputed from the prefix, never computed once and filtered.
   *
   * That distinction is asserted in `tests/lookahead.test.ts`: the hull is causal but not monotone
   * in time, so `visibleAt(candidates(everything), t)` is *not* what a viewer at t would have
   * drawn. Swings and levels carry `knownAt` and are gated with `visibleAt`, which is the correct
   * treatment for them because they are emitted only once settled.
   */
  const geometry = useMemo(() => {
    const prefix = chart.bars.slice(0, visibleTo + 1);
    const minutePrefix = chart.minutes.slice(0, (visibleTo + 1) * PATH_BARS_PER_DISPLAY_BAR);

    const walk =
      useMinutes && minutePrefix.length > 0
        ? walkFromPath(minutePrefix, PATH_BARS_PER_DISPLAY_BAR)
        : walkFromBars(prefix);

    const allSwings = persistentSwings(walk);
    const swings = visibleAt(atGrade(allSwings, chart.atr, grade), visibleTo);

    return {
      prefix,
      swings,
      levels: visibleAt(levelsFrom(visibleAt(allSwings, visibleTo), chart.atr), visibleTo),
      resistance: selected(prefix, 'upper'),
      support: selected(prefix, 'lower'),
      upperCandidates: candidates(prefix, 'upper'),
      lowerCandidates: candidates(prefix, 'lower'),
      channel: fitChannel(prefix),
      profile: volumeProfile(minutePrefix.length > 0 ? minutePrefix : prefix, chart.atr),
      swingCount: allSwings.length,
    };
  }, [chart, grade, useMinutes, visibleTo]);

  const overlays = useMemo((): Overlay[] => {
    const out: Overlay[] = [];
    const last = chart.bars.length - 1;
    const span = (price: number, colour: string, width = 1, dashed = false): Overlay => ({
      points: [
        { index: 0, price },
        { index: last, price },
      ],
      color: colour,
      width,
      dashed,
    });

    if (layers.profile && geometry.profile) {
      out.push(span(geometry.profile.poc, COLOUR.poc, 2));
      out.push(span(geometry.profile.vah, COLOUR.valueArea, 1, true));
      out.push(span(geometry.profile.val, COLOUR.valueArea, 1, true));
    }

    if (layers.levels) {
      for (const level of geometry.levels) out.push(span(level.value.price, COLOUR.level));
    }

    if (layers.candidates) {
      for (const edge of [...geometry.upperCandidates, ...geometry.lowerCandidates]) {
        out.push({
          points: [
            { index: edge.value.from.index, price: edge.value.from.price },
            { index: edge.value.to.index, price: edge.value.to.price },
          ],
          color: COLOUR.candidate,
        });
      }
    }

    if (layers.trendlines) {
      for (const line of [geometry.resistance, geometry.support]) {
        if (!line) continue;
        out.push({
          points: [
            { index: line.value.from.index, price: line.value.from.price },
            { index: line.value.to.index, price: line.value.to.price },
          ],
          color: COLOUR.trendline,
          width: 2,
        });
      }
    }

    if (layers.channel && geometry.channel) {
      const channel = geometry.channel.value;
      for (const rail of ['upper', 'mid', 'lower'] as const) {
        out.push({
          points: [0, channel.bars - 1].map((index) => ({
            index,
            price: railsAt(channel, index)[rail],
          })),
          color: COLOUR.channel,
          dashed: rail === 'mid',
        });
      }
    }

    if (layers.swings) {
      for (const swing of geometry.swings) {
        // A dash whose half-width grows with persistence, so the grading is visible rather than
        // merely available. A boolean detector would draw every one of these the same length.
        const reach = Math.max(1, Math.round(swing.value.persistence / chart.atr));
        out.push({
          points: [
            { index: Math.max(0, swing.value.index - reach), price: swing.value.price },
            { index: Math.min(last, swing.value.index + reach), price: swing.value.price },
          ],
          color: swing.value.kind === 'high' ? COLOUR.swingHigh : COLOUR.swingLow,
          width: 2,
        });
      }
    }

    return out;
  }, [chart.bars.length, chart.atr, geometry, layers]);

  useEffect(() => {
    handle.current?.setClock(1, 0);
    handle.current?.setBars(chart.bars);
    handle.current?.setLogical({ from: -2, to: chart.bars.length + 2 });
  }, [chart]);

  useEffect(() => {
    handle.current?.setOverlays(overlays);
  }, [overlays]);

  const index = ids.indexOf(chart.id);
  const link = (offset: number) =>
    index >= 0 && ids[index + offset] ? `/lab/geometry?id=${ids[index + offset]}` : undefined;

  return (
    <main className="bg-surface-0 text-ink flex h-dvh flex-col gap-3 p-4 font-mono text-xs">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-sm text-ink-max">Geometry lab</h1>
        <span className="text-ink-dim">
          {chart.regime} · ATR {chart.atr.toFixed(3)} · {chart.mirrored ? 'mirrored' : 'upright'} ·{' '}
          {chart.minutes.length} minute bars
        </span>
        <nav className="ml-auto flex gap-3">
          {link(-1) && <Link className="underline" href={link(-1)!}>← previous</Link>}
          <span className="text-ink-faint">
            {index >= 0 ? `${index + 1} / ${ids.length}` : chart.id.slice(0, 8)}
          </span>
          {link(1) && <Link className="underline" href={link(1)!}>next →</Link>}
        </nav>
      </header>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line py-2">
        {/* Chips rather than six browser-default checkboxes, which rendered as system-blue boxes
            on a near-black surface — the only unstyled controls left in the product. Each carries
            the colour it draws in, so the legend is the control. */}
        {(Object.keys(layers) as Layer[]).map((layer) => (
          <button
            key={layer}
            type="button"
            aria-pressed={layers[layer]}
            onClick={() => setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
            className={cx(
              'press ring-line inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 transition-colors',
              layers[layer] ? 'bg-surface-3 text-ink-max' : 'text-ink-dim hover:text-ink',
            )}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: LAYER_COLOUR[layer], opacity: layers[layer] ? 1 : 0.4 }}
            />
            {LAYER_LABEL[layer]}
          </button>
        ))}

        <Select
          label="Swing grade"
          size="sm"
          value={grade}
          options={SWING_GRADES.map((option) => ({
            value: option.name,
            label: `${option.name} (${option.atrMultiple}× ATR)`,
          }))}
          onChange={(value) => setGrade(value as SwingGrade)}
        />

        <button
          type="button"
          aria-pressed={useMinutes}
          disabled={chart.minutes.length === 0}
          onClick={() => setUseMinutes((prev) => !prev)}
          title="Resolve intrabar ordering from the stored one-minute path instead of the close-direction convention"
          className={cx(
            'press ring-line rounded-md px-2 py-1 ring-1 transition-colors disabled:opacity-40',
            useMinutes ? 'bg-surface-3 text-ink-max' : 'text-ink-dim enabled:hover:text-ink',
          )}
        >
          minute path
        </button>

        <label className="flex flex-1 items-center gap-2" title="Applies visibleAt: nothing may appear before its knownAt">
          visible at bar {visibleTo}
          <input
            className="accent-info flex-1"
            type="range"
            min={1}
            max={chart.bars.length - 1}
            value={visibleTo}
            onChange={(event) => setVisibleTo(Number(event.target.value))}
          />
        </label>
      </div>

      <Chart ref={handle} className="min-h-0 flex-1" />

      <section className="max-h-40 shrink-0 overflow-auto border-t border-line pt-2">
        <p className="mb-1 text-ink-dim">
          {geometry.swings.length} swings shown of {geometry.swingCount} settled · {geometry.levels.length} levels ·{' '}
          {geometry.upperCandidates.length + geometry.lowerCandidates.length} hull edges
          {geometry.profile ? ` · POC ${geometry.profile.poc.toFixed(2)}` : ''}
        </p>
        <table className="w-full text-left tabular-nums">
          <thead className="text-ink-faint">
            <tr>
              <th className="pr-4 font-normal">feature</th>
              <th className="pr-4 font-normal">price</th>
              <th className="pr-4 font-normal">persistence</th>
              <th className="pr-4 font-normal">exists</th>
              <th className="pr-4 font-normal">known</th>
              <th className="font-normal">lag</th>
            </tr>
          </thead>
          <tbody>
            {geometry.swings.map((swing) => (
              <tr key={`${swing.value.kind}-${swing.value.index}-${swing.value.price}`}>
                <td className="pr-4" style={{ color: swing.value.kind === 'high' ? COLOUR.swingHigh : COLOUR.swingLow }}>
                  {swing.value.kind}
                </td>
                <td className="pr-4">{swing.value.price.toFixed(2)}</td>
                <td className="pr-4">{(swing.value.persistence / chart.atr).toFixed(2)} ATR</td>
                <td className="pr-4">{swing.existsAt}</td>
                <td className="pr-4">{swing.knownAt}</td>
                <td>{swing.knownAt - swing.existsAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
