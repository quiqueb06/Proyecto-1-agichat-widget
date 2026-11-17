import { test, expect } from '@playwright/test';
import { prepare } from './fixtures';

test('respuesta tardía: conserva respaldos cuando se rechaza window.open y permite abrirlos con click', async ({
  context,
  page,
}) => {
  // Headless browser popup policies vary. Simulate the denial deterministically;
  // allowed.spec.ts separately verifies actual, unmodified window.open in both engines.
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await prepare(context, page);
  await page.getByRole('textbox', { name: 'Mensaje', exact: true }).fill('slow');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'IMDb', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('link', { name: 'Google Books', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'No permitido', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.receivedActions.length)).toBe(2);
  expect(context.pages()).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath('actions.png') });
  for (const name of ['IMDb', 'Google Books']) {
    const newTab = context.waitForEvent('page');
    await page.getByRole('link', { name, exact: true }).click();
    const destination = await newTab;
    await destination.waitForLoadState();
    expect(await destination.evaluate(() => window.opener === null)).toBe(true);
    await destination.close();
  }
  await page.getByRole('button', { name: 'Cerrar chat', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
  await expect(page.getByRole('link', { name: 'IMDb', exact: true })).toBeVisible();
  expect(context.pages()).toHaveLength(1);
});
