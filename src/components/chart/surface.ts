/**
 * What the drawing tools need from a chart, and nothing more.
 *
 * `DrawLayer` re-projects every drawing from chart space — an index and a price — on every frame.
 * Both charts implement this: the game's `Chart` with an index of hours into the window, and the
 * trading terminal's `TerminalChart` with an index of minutes from the start of the tape, which
 * stays put when the timeframe changes.
 */

export interface ChartSurface {
  indexToX(index: number): number | null;
  xToIndex(x: number): number | null;
  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
}
