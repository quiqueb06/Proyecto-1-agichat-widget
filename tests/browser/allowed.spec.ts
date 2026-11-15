import { test, expect } from '@playwright/test';
import { prepare } from './fixtures';

test('abre exactamente dos pestañas automáticamente, aisladas y sin duplicados', async ({
  context,
  page,
}) => {
  await prepare(context, page);
  await page.getByRole('textbox', { name: 'Mensaje', exact: true }).fill('fast');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => context.pages().length).toBe(3);
  await expect.poll(() => page.evaluate(() => window.receivedActions.length)).toBe(2);
  for (const destination of context.pages().filter((item) => item !== page)) {
    await destination.waitForLoadState();
    expect(await destination.evaluate(() => window.opener === null)).toBe(true);
    expect(new URL(destination.url()).hostname).toMatch(/^(www\.imdb\.com|books\.google\.com)$/);
  }
  await expect(page.getByRole('link', { name: 'Google Books', exact: true })).toBeVisible();
});
