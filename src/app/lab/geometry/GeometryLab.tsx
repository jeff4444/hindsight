'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

const COLOUR = {
  swingHigh: '#f97316',
  swingLow: '#38bdf8',
  trendline: '#a78bfa',
  candidate: '#4c1d95',
  channel: '#22c55e',
  level: '#eab308',
  poc: '#ef4444',
  valueArea: '#7f1d1d',
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
    <main className="flex h-screen flex-col gap-3 bg-surface-0 p-4 font-mono text-xs text-ink">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-sm text-ink-max">Geometry lab</h1>
        <span className="text-ink-dim">
          {chart.regime} · ATR {chart.atr.toFixed(3)} · {chart.mirrored ? 'mirrored' : 'upright'} ·{' '}
          {chart.minutes.length} minute bars
        </span>
        <nav className="ml-auto flex gap-3">
          {link(-1) && <a className="underline" href={link(-1)}>← previous</a>}
          <span className="text-ink-faint">
            {index >= 0 ? `${index + 1} / ${ids.length}` : chart.id.slice(0, 8)}
          </span>
          {link(1) && <a className="underline" href={link(1)}>next →</a>}
        </nav>
      </header>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line py-2">
        {(Object.keys(layers) as Layer[]).map((layer) => (
          <label key={layer} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={() => setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
            />
            {layer}
          </label>
        ))}

        <label className="flex items-center gap-1.5">
          grade
          <select
            className="bg-surface-1 px-1 py-0.5"
            value={grade}
            onChange={(event) => setGrade(event.target.value as SwingGrade)}
          >
            {SWING_GRADES.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name} ({option.atrMultiple}× ATR)
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-1.5" title="Resolve intrabar ordering from the stored one-minute path instead of the close-direction convention">
          <input
            type="checkbox"
            checked={useMinutes}
            disabled={chart.minutes.length === 0}
            onChange={() => setUseMinutes((prev) => !prev)}
          />
          minute path
        </label>

        <label className="flex flex-1 items-center gap-2" title="Applies visibleAt: nothing may appear before its knownAt">
          visible at bar {visibleTo}
          <input
            className="flex-1"
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
