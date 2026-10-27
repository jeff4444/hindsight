/**
 * Drives the trading terminal on /lab/terminal (the synthetic market, no database) through a real
 * session in Chromium: open, play, buy with a stop-loss, rest a limit, flip, end, and the review.
 *
 *   npm run dev   # in another terminal
 *   node e2e/terminal-lab.cjs [baseUrl] [screenshotDir]
 *
 * Outside `tests/` on purpose: vitest never collects it, and it needs a running server.
 */
const { chromium } = require('playwright');
const path = require('node:path');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? '.';

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  const shot = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  desktop.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  desktop.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await desktop.goto(`${BASE}/lab/terminal?seed=7`);
  await desktop.getByText('DEMO/USDT').first().waitFor({ timeout: 30_000 });
  await desktop.waitForTimeout(800);
  await shot(desktop, '01-opened');

  // Play for a moment, then pause.
  await desktop.getByRole('button', { name: 'Play the replay' }).click();
  await desktop.waitForTimeout(2500);
  await desktop.getByRole('button', { name: 'Pause the replay' }).click();
  await desktop.waitForTimeout(400);

  const ticket = desktop.locator('aside');
  // Buy $20,000 at market with a stop-loss.
  await ticket.getByRole('textbox', { name: 'Amount' }).fill('20000');
  await ticket.getByRole('switch', { name: 'Stop-loss' }).click();
  await ticket.getByRole('button', { name: /^Buy [\d.,]+/ }).click();
  await desktop.getByText(/Bought .* at /).first().waitFor({ timeout: 10_000 });
  await desktop.getByRole('tab', { name: /Positions/ }).click();
  await desktop.getByText('Long', { exact: true }).first().waitFor();
  await shot(desktop, '02-long-with-stop');

  // Rest a sell limit 3% above the market.
  await ticket.getByRole('radio', { name: 'Sell' }).click();
  await ticket.getByRole('radio', { name: 'Limit' }).click();
  const priceField = ticket.getByRole('textbox', { name: 'Limit price' });
  const current = Number((await priceField.inputValue()).replace(/,/g, ''));
  await priceField.fill((current * 1.03).toFixed(2));
  await ticket.getByRole('textbox', { name: 'Amount' }).fill('5000');
  await ticket.getByRole('button', { name: /^Sell [\d.,]+/ }).click();
  await desktop.waitForTimeout(600);
  await desktop.getByRole('tab', { name: /Open orders/ }).click();
  const working = await desktop.locator('table').getByText('Limit', { exact: true }).count();
  if (working < 1) throw new Error('the resting limit is not in Open orders');

  // Drag the stop-loss line down a little: the order should be modified.
  const sl = desktop.locator('[data-line$=":sl"] >> text=/^SL/').first();
  const box = await sl.boundingBox();
  if (box) {
    await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await desktop.mouse.down();
    await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 6 });
    await desktop.mouse.up();
    await desktop.waitForTimeout(600);
  } else {
    errors.push('no stop-loss line found to drag');
  }
  await shot(desktop, '03-orders-and-lines');

  // Run the replay faster for a while.
  await desktop.getByRole('combobox', { name: 'Replay speed' }).selectOption('60');
  await desktop.getByRole('button', { name: 'Play the replay' }).click();
  await desktop.waitForTimeout(3000);
  await desktop.getByRole('button', { name: 'Pause the replay' }).click();

  // Flip: sell 2x whatever is held, if anything is.
  await desktop.getByRole('tab', { name: /Positions/ }).click();
  const reverse = desktop.getByRole('button', { name: 'Reverse' });
  if (await reverse.count()) {
    await reverse.click();
    await desktop.waitForTimeout(600);
  }
  await shot(desktop, '04-after-flip');

  // End the session and open the review.
  await desktop.getByRole('button', { name: 'End' }).click();
  await desktop.getByRole('button', { name: 'Close out and end' }).click();
  await desktop.getByText('Market closed').waitFor({ timeout: 10_000 });
  await shot(desktop, '05-closed');
  await desktop.getByRole('button', { name: 'See the review' }).click();
  await desktop.getByText('Session review').waitFor({ timeout: 15_000 });
  await desktop.waitForTimeout(800);
  await shot(desktop, '06-review');
  await desktop.screenshot({ path: path.join(OUT, '06-review-full.png'), fullPage: true });

  // The phone layout.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', (error) => errors.push(`phone pageerror: ${error.message}`));
  await phone.goto(`${BASE}/lab/terminal?seed=9`);
  await phone.getByText('DEMO/USDT').first().waitFor({ timeout: 30_000 });
  await phone.waitForTimeout(800);
  await shot(phone, '07-phone');
  await phone.getByRole('button', { name: 'Buy', exact: true }).last().click();
  await phone.waitForTimeout(500);
  await shot(phone, '08-phone-ticket');

  await browser.close();
  if (errors.length) {
    console.log('ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('terminal lab: ok');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
