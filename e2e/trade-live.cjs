/**
 * Drives a real trading session through the server: open a pair, buy with a stop-loss, reload the
 * page mid-session (the server holds the clock and the log, so nothing may be lost), end, and read
 * the review with the market's real identity and dates.
 *
 * Needs a running app with a database that has migrations 0030–0033 and at least a BTCUSDT chart.
 * Locally: see README "Running the trading stack locally".
 *
 *   node e2e/trade-live.cjs [baseUrl] [screenshotDir]
 */
const { chromium } = require('playwright');
const path = require('node:path');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? '.';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  await page.goto(`${BASE}/trade/new?market=pair&symbol=BTCUSDT`);
  await page.waitForURL(/\/trade\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const sessionUrl = page.url();
  await page.getByText('BTC/USDT').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Play the replay' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Pause the replay' }).click();
  await page.waitForTimeout(500);

  const ticket = page.locator('aside');
  await ticket.getByRole('textbox', { name: 'Amount' }).fill('10000');
  await ticket.getByRole('switch', { name: 'Stop-loss' }).click();
  await ticket.getByRole('button', { name: /^Buy [\d.,]+/ }).click();
  await page.getByText(/Bought .* at /).first().waitFor({ timeout: 10_000 });
  await shot('live-01-bought');

  // Reload: the position and its stop must come back from the server.
  await page.reload();
  await page.getByText('BTC/USDT').first().waitFor({ timeout: 30_000 });
  await page.getByRole('tab', { name: /Positions/ }).click();
  await page.getByText('Long', { exact: true }).first().waitFor({ timeout: 10_000 });
  await page.getByRole('tab', { name: /Open orders/ }).click();
  await page.locator('table').getByText('Stop-loss').first().waitFor();
  await shot('live-02-after-reload');

  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'Close out and end' }).click();
  await page.getByText('Market closed').waitFor({ timeout: 10_000 });
  await page.getByRole('link', { name: 'See the review' }).click();
  await page.waitForURL(/\/review$/, { timeout: 30_000 });
  await page.getByText('Session review').waitFor({ timeout: 30_000 });
  await page.getByText(/May 2021/).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await shot('live-03-review');

  // A closed session redirects nowhere strange: its URL still loads, closed.
  await page.goto(sessionUrl);
  await page.getByText('Market closed').waitFor({ timeout: 30_000 });

  await browser.close();
  if (errors.length) {
    console.log('ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('live trade: ok');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
