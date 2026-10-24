import {
  CALIBRATION_SPEC,
  calibrationCurve,
  decompose,
  describe as describeCalibration,
  skillScore,
  type Forecast,
} from '@/core/calibration';
import { Eyebrow, Meter, Panel, cx } from '@/components/ui';

/**
 * §4.7's calibration curve — the one measurement in this product with published evidence behind it.
 *
 * A sub-one-hour training module improved Brier scores by 6–11% in the Good Judgment Project, and
 * the effect held across years. Nothing else here has that: §14.7 could not separate a trading
 * school from a coin flip, and §13.8 found nine detectors of ten no better than a shuffle. So this
 * panel is the one place the product is entitled to say *this is trainable, and here is your curve*.
 *
 * ## What the picture has to show, and why a single number will not do
 *
 * Murphy's decomposition splits the Brier into two things that fail differently:
 *
 * - **Reliability** — does 70% mean 70%? This is the diagonal, and the thing training moves.
 * - **Resolution** — do you say *different* numbers on different charts and turn out to be right?
 *   A forecaster who says 39% on everything is perfectly calibrated and has learned nothing.
 *
 * Reporting only the Brier would leave a player unable to tell which half they lack, and the two
 * have opposite remedies: one says be less certain, the other says have more of an opinion.
 *
 * The reference is drawn on the chart as well as quoted. A Brier of 0.22 sounds poor and is in fact
 * better than the 0.2384 that saying the corpus base rate on every chart scores — a number without
 * its null is exactly what this project keeps refusing to ship.
 */
export function CalibrationCurve({ forecasts }: { forecasts: Forecast[] }) {
  const ready = forecasts.length >= CALIBRATION_SPEC.minForecasts;
  const curve = calibrationCurve(forecasts);
  const parts = decompose(forecasts);
  const skill = skillScore(forecasts);
  const sentence = describeCalibration(forecasts);
  const reference = CALIBRATION_SPEC.baseRate * (1 - CALIBRATION_SPEC.baseRate);

  return (
    <Panel pad="md" className="mt-3">
      <Eyebrow>How well you know what you know</Eyebrow>

      {forecasts.length === 0 ? (
        <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
          You have not staked a probability on a trade yet. The control sits beside Commit — say how
          likely you think the trade is to finish green, and this becomes a curve. It is optional on
          every round, and a round you skip it on is simply absent here rather than counted as a
          shrug.
        </p>
      ) : (
        <>
          <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
            {sentence ??
              `${forecasts.length} of ${CALIBRATION_SPEC.minForecasts} forecasts. The curve is drawn below as it fills, but nothing is diagnosed from it until there are enough — ten proportions over twenty forecasts is ten pieces of noise.`}
          </p>

          {!ready && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-lo text-sm">
                <span className="numeral text-ink font-semibold">
                  {CALIBRATION_SPEC.minForecasts - forecasts.length}
                </span>{' '}
                more to go.
              </p>
              <Meter
                value={forecasts.length}
                max={CALIBRATION_SPEC.minForecasts}
                tone="info"
                size="lg"
                className="w-40"
                label={`${forecasts.length} of ${CALIBRATION_SPEC.minForecasts} forecasts`}
              />
            </div>
          )}

          {/*
            The curve: said against happened, one row per bucket.

            A table of bars rather than a scatter plot, because the thing a player must be able to
            read at a glance is *which side of the diagonal they sit on* — over-confidence and
            under-confidence are different diagnoses with opposite remedies, and a dot near a line
            does not say which.
          */}
          <ul className="mt-4 flex flex-col gap-1.5">
            {curve
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => {
                const gap = bucket.stated - bucket.observed;
                return (
                  <li key={bucket.from} className="flex items-center gap-3 text-sm">
                    <span className="numeral text-ink-lo w-14 shrink-0">
                      {Math.round(bucket.from * 100)}–{Math.round(bucket.to * 100)}
                    </span>
                    <span className="bg-fill-2 relative h-2.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-info absolute inset-y-0 left-0"
                        style={{ width: `${bucket.observed * 100}%` }}
                      />
                      {/* Where they said it would land, as a mark on the same scale. */}
                      <span
                        className="bg-ink-max absolute inset-y-0 w-0.5"
                        style={{ left: `${bucket.stated * 100}%` }}
                        aria-hidden
                      />
                    </span>
                    <span className="numeral text-ink-lo w-24 shrink-0 text-right text-xs">
                      {Math.round(bucket.observed * 100)}% of {bucket.count}
                    </span>
                    {ready && (
                      <span
                        className={cx(
                          'numeral w-16 shrink-0 text-right text-xs',
                          Math.abs(gap) < 0.05 ? 'text-ink-dim' : 'text-attention-ink',
                        )}
                      >
                        {gap >= 0 ? '+' : ''}
                        {Math.round(gap * 100)}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>

          {ready && parts && (
            <dl className="border-line-faint mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-4">
              <Stat label="Brier" value={parts.brier.toFixed(3)} hint={`${reference.toFixed(3)} is no opinion`} />
              <Stat
                label="Skill"
                value={`${skill !== null && skill >= 0 ? '+' : ''}${skill?.toFixed(3) ?? '—'}`}
                hint="against the base rate"
              />
              <Stat label="Reliability" value={parts.reliability.toFixed(3)} hint="lower is better" />
              <Stat label="Resolution" value={parts.resolution.toFixed(3)} hint="higher is better" />
            </dl>
          )}
        </>
      )}

      <p className="text-ink-dim mt-3 max-w-prose text-xs leading-relaxed">
        Scored with the Brier score, which is <em>proper</em>: the way to score best is to state what
        you actually believe, so there is no shading that helps. Read it against{' '}
        <span className="numeral">{reference.toFixed(3)}</span> — what saying the corpus base rate of{' '}
        {Math.round(CALIBRATION_SPEC.baseRate * 100)}% on every chart would score. This is the one
        thing here with published evidence of being trainable.
      </p>
    </Panel>
  );
}

/** A local stat, so this panel does not depend on the play surface's layout choices. */
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-ink-dim text-[0.6875rem] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="numeral text-ink-max mt-0.5 text-lg font-semibold">{value}</dd>
      <dd className="text-ink-dim text-xs">{hint}</dd>
    </div>
  );
}
