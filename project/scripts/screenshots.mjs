import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const browser = await chromium.launch({
  executablePath: process.env.BATCAVE_CHROMIUM,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  ...devices['iPhone 13 Mini'],
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e)));
await page.goto('http://127.0.0.1:4173/batcave-reader/');
await page.getByRole('heading', { name: 'Библиотека', exact: true }).waitFor();
mkdirSync('docs/screenshots', { recursive: true });
await page.screenshot({ path: 'docs/screenshots/library.png' });
await page.screenshot({ path: 'docs/screenshots/library-full.png', fullPage: true });
await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
await page.screenshot({ path: 'docs/screenshots/collection.png' });
await page.getByRole('button', { name: 'Профиль', exact: true }).click();
await page.screenshot({ path: 'docs/screenshots/profile.png' });
await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
await page.getByTestId('comic-file-input').setInputFiles(resolve('tests/fixtures/sample.pdf'));
await page.getByRole('button', { name: 'Сохранить в библиотеку' }).waitFor();
await page.getByLabel('Название', { exact: true }).fill('Тестовая история / PDF');
await page.getByRole('button', { name: 'Сохранить в библиотеку' }).click();
await page.getByRole('heading', { name: 'Тестовая история / PDF', exact: true }).click();
await page.getByRole('button', { name: 'Читать', exact: true }).click();
await page.locator('canvas[data-page="0"]').waitFor();
await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);
await page.screenshot({ path: 'docs/screenshots/reader.png' });
console.log(JSON.stringify({ pageErrors: problems }));
await browser.close();
