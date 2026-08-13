import { INDEX_BASE, mirrorBar } from '../src/core/normalize';
import { atr } from '../src/core/atr';
import type { Bar } from '../src/core/bars';

function rising(n = 60, step = 1.008): Bar[] {
  const bars: Bar[] = []; let p = INDEX_BASE;
  for (let i = 0; i < n; i++) { const o = p; p *= step;
    bars.push({ o, h: Math.max(o, p) * 1.002, l: Math.min(o, p) * 0.998, c: p, v: 1 }); }
  return bars;
}
for (const step of [1.008, 1.002, 1.0005]) {
  const up = rising(60, step), down = up.map(mirrorBar);
  const show = (bs: Bar[], tag: string) => {
    const a = atr(bs)!, e = bs[bs.length - 1].c, f = bs[0].c;
    const d = Math.log(e / f) / (a / e);
    console.log(`  ${tag}  first=${f.toFixed(2)} last=${e.toFixed(2)} atr=${a.toFixed(4)} atr/entry=${(a/e).toFixed(5)} drift=${d.toFixed(4)}`);
    return d;
  };
  console.log(`step ${step}`);
  const a = show(up, 'up  '), b = show(down, 'down');
  console.log(`  asymmetry ${(Math.abs(a + b) / Math.abs(a) * 100).toFixed(2)}%\n`);
}
