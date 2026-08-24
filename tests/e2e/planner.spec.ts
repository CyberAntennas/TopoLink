import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('renders the planner and inspects a site and link', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route('https://overpass-api.de/api/interpreter', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: [{
      id: 9001,
      type: 'way',
      tags: { building: 'yes', height: '150', name: 'Browser fixture obstruction' },
      geometry: [
        { lat: 43.76785, lon: 11.25255 },
        { lat: 43.76785, lon: 11.25295 },
        { lat: 43.76815, lon: 11.25295 },
        { lat: 43.76815, lon: 11.25255 },
        { lat: 43.76785, lon: 11.25255 },
      ],
    }] }) });
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const planner = page.locator('.topolink-planner');
  await expect(planner).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Add site' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Workspace inspector' })).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.topolink-planner__canvas-host')).toHaveAttribute('data-tower-models', '2');
  await expect(page.locator('.topolink-planner__canvas-host')).toHaveAttribute('data-radiation-patterns', '2');
  const mapHost = page.locator('.topolink-planner__map');
  await expect(mapHost).toHaveAttribute('data-building-height-status', /^(ready|cached)$/);
  await expect(mapHost).toHaveAttribute('data-link-obstacles', '1');
  await expect(page.locator('.topolink-planner__canvas-host')).toHaveAttribute('data-obstacle-cuts', '1');

  const viewport = page.viewportSize()!;
  const plannerBox = await planner.boundingBox();
  expect(plannerBox).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });

  await page.getByRole('button', { name: 'Map layers' }).click();
  const layerPalette = page.locator('.topolink-layer-palette');
  await expect(layerPalette).toBeVisible();
  await expect(layerPalette.locator('input[type="checkbox"]:checked')).toHaveCount(11);
  await expect(page.getByLabel('OSM public Wi-Fi')).not.toBeChecked();
  await expect(page.getByLabel('Basemap 3D buildings')).toBeChecked();
  await page.getByRole('button', { name: 'Map layers' }).click();

  await page.getByRole('button', { name: 'Duomo relay' }).click();
  await expect(page.locator('.topolink-planner__canvas-host')).toHaveAttribute('data-focused-site', 'site-duomo');
  const expectedFocusZoom = testInfo.project.name === 'mobile' ? '18.3' : '18.75';
  await expect(page.locator('.topolink-planner__canvas-host')).toHaveAttribute('data-focus-zoom', expectedFocusZoom);
  const productPicker = page.getByLabel('Installed Cyber Antennas product');
  await expect(productPicker.locator('option')).toHaveCount(24);
  await expect(productPicker).toHaveValue('A20');
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: testInfo.outputPath(`site-focus-${testInfo.project.name}.png`), fullPage: true });

  await page.getByRole('button', { name: /Florence primary/ }).click();
  await expect(page.getByText('Path loss')).toBeVisible();
  await expect(page.getByText('Estimated RX')).toBeVisible();
  await expect(page.getByText('Building loss')).toBeVisible();
  await expect(page.getByText('40.0 dB · 1 obstacle')).toBeVisible();
  await expect(page.getByText('Optimal alignment')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auto-align antennas' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Terrain and Fresnel clearance profile' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Reset 3D view' }).click();
  await page.waitForTimeout(1_000);

  const screenshot = await page.screenshot({
    path: testInfo.outputPath(`planner-${testInfo.project.name}.png`),
    fullPage: true,
  });
  const png = PNG.sync.read(screenshot);
  const colors = new Set<number>();
  const sampleWidth = Math.floor(png.width * 0.6);
  const sampleHeight = Math.floor(png.height * 0.45);
  for (let y = 0; y < sampleHeight; y += 4) {
    for (let x = 0; x < sampleWidth; x += 4) {
      const offset = (y * png.width + x) * 4;
      colors.add((png.data[offset]! << 16) | (png.data[offset + 1]! << 8) | png.data[offset + 2]!);
    }
  }
  expect(colors.size).toBeGreaterThan(100);
  expect(browserErrors).toEqual([]);
});
