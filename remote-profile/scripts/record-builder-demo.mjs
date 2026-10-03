/**
 * Records a short drag-and-drop walkthrough of the profile editor.
 *
 * Requires the API (4050) and Vite app (5174) to already be running.
 * Does not click Save, so the seeded profile is left unchanged.
 *
 *   mkdir -p /tmp/pw-dnd && cd /tmp/pw-dnd && npm init -y && npm install playwright
 *   npx playwright install chromium
 *   PLAYWRIGHT_PACKAGE=/tmp/pw-dnd/node_modules/playwright/index.mjs \
 *     node remote-profile/scripts/record-builder-demo.mjs
 *
 * Writes docs/media/remote-profile-builder.gif
 */
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mediaDir = path.join(root, 'docs/media');
const workDir = path.join(root, 'remote-profile/scripts/.demo-out');
const baseUrl = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:5174';
const gifPath = path.join(mediaDir, 'remote-profile-builder.gif');

const { chromium } = await import(process.env.PLAYWRIGHT_PACKAGE ?? 'playwright');

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });
await mkdir(mediaDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const setup = await browser.newContext();
const loginPage = await setup.newPage();
await loginPage.goto(`${baseUrl}/login`);
await loginPage.getByRole('button', { name: 'Sign in' }).click();
await loginPage.waitForURL((url) => !url.pathname.endsWith('/login'));
await loginPage.goto(`${baseUrl}/profiles/heart-rate-monitor/v/2`);
await loginPage.getByRole('heading', { name: 'Services' }).waitFor();
const statePath = path.join(workDir, 'state.json');
await setup.storageState({ path: statePath });
await setup.close();

const context = await browser.newContext({
  storageState: statePath,
  viewport: { width: 1040, height: 720 },
  recordVideo: { dir: workDir, size: { width: 1040, height: 720 } },
});
const page = await context.newPage();
page.on('pageerror', (error) => console.error('pageerror', error));
await page.goto(`${baseUrl}/profiles/heart-rate-monitor/v/2`);
await page.getByRole('heading', { name: 'Services' }).waitFor();
await page.locator('.panel-services').scrollIntoViewIfNeeded();
await page.waitForTimeout(700);

const heartRate = serviceCard(page, 'Heart Rate');
const battery = serviceCard(page, 'Battery');
await heartRate.locator(':scope > .builder-header .builder-title-btn').click();
await battery.locator(':scope > .builder-header .builder-title-btn').click();
await page.waitForTimeout(400);

const controlPoint = charCard(heartRate, 'Heart Rate Control Point');
const batteryLevel = charCard(battery, 'Battery Level');
if (await batteryLevel.locator('.builder-body').count()) {
  await batteryLevel.locator(':scope > .builder-header .builder-title-btn').click();
  await page.waitForTimeout(250);
}

await dragCard(page, controlPoint, batteryLevel);
await page.waitForTimeout(1400);

const batteryNames = await battery.locator('.tone-char .builder-title-label').allInnerTexts();
if (!batteryNames.includes('Heart Rate Control Point')) {
  await page.screenshot({ path: path.join(workDir, 'failed.png') });
  throw new Error(`Cross-service drop did not land. Battery characteristics: ${batteryNames.join(', ')}`);
}

const video = page.video();
await context.close();
await browser.close();
const webmPath = await video.path();
const stagedWebm = path.join(workDir, 'demo.webm');
await rename(webmPath, stagedWebm);

const palette = path.join(workDir, 'palette.png');
const gifFilters = 'fps=10,scale=880:-1:flags=lanczos';
run('ffmpeg', ['-y', '-ss', '0.8', '-i', stagedWebm, '-vf', `${gifFilters},palettegen=stats_mode=diff`, '-update', '1', palette]);
run('ffmpeg', [
  '-y',
  '-ss',
  '0.8',
  '-i',
  stagedWebm,
  '-i',
  palette,
  '-lavfi',
  `${gifFilters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
  gifPath,
]);

console.log(`Wrote ${gifPath}`);

function serviceCard(page, name) {
  return page
    .locator('.panel-services .tone-service')
    .filter({
      has: page.locator(':scope > .builder-header .builder-title-label', {
        hasText: new RegExp(`^${name}$`),
      }),
    })
    .first();
}

function charCard(service, name) {
  return service
    .locator('.tone-char')
    .filter({
      has: pageLocator(service, name),
    })
    .first();
}

function pageLocator(service, name) {
  return service.page().locator(':scope > .builder-header .builder-title-label', {
    hasText: new RegExp(`^${name}$`),
  });
}

async function dragCard(page, sourceCard, targetCard) {
  const grip = sourceCard.locator(':scope > .builder-header .builder-grip');
  const from = await grip.boundingBox();
  const to = await targetCard.boundingBox();
  if (!from || !to) throw new Error('Could not measure the drag handles');
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + Math.min(28, to.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 24;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
    await page.waitForTimeout(32);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} failed`);
  }
}
