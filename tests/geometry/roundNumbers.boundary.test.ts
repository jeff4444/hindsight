import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAK_MEASUREMENT } from '@/core/geometry/roundNumbers';

/**
 * Round-number levels are analysis-only, and this is the guard that keeps them that way.
 *
 * `npm run leak` measured what drawing them costs under §12.2, and the answer was not close:
 * **the grid names a single chart 94% of the time** on a 1,000-chart corpus, taking the instruments
 * still possible from 314 to one. The leak is in the *spacing* — consecutive levels are
 * `0.25 · 10^m · factor` apart, and since the first candle is indexed to 100 by construction, that
 * spacing gives `firstOpen = 25 · 10^m / S`: the real opening price exactly, up to a power of ten,
 * read off the chart with a ruler.
 *
 * So the module stays, because Osler's evidence is real and theme tagging, the engine council and
 * the 2c null all want it. It does not reach a player.
 *
 * A comment saying so would be a comment. This is a test: wiring `roundNumbers` into anything under
 * `src/app` fails the build, and whoever does it has to delete this file and read why it exists on
 * the way past.
 */

const APP_DIR = join(process.cwd(), 'src', 'app');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('the round-number module does not reach a player', () => {
  const files = sourceFiles(APP_DIR);

  it('has something to check', () => {
    // A guard that scans an empty list guards nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  it('is imported by nothing under src/app', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /from\s+['"][^'"]*geometry\/roundNumbers['"]/.test(source);
    });
    expect(
      offenders.map((file) => file.replace(process.cwd() + '/', '')),
      'round-number levels leak the instrument — see the measurement in this file',
    ).toEqual([]);
  });

  it('carries the measurement that decided it, so a later change re-argues rather than inherits', () => {
    expect(LEAK_MEASUREMENT.gridNamesOneChart).toBeGreaterThan(0.9);
    expect(LEAK_MEASUREMENT.singleLevelMedianInstruments).toBeLessThan(
      LEAK_MEASUREMENT.corpusInstruments,
    );
  });
});
