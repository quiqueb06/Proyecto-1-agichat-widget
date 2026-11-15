import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { OpenUrlAction } from '../../src/types';

declare global {
  interface Window {
    receivedActions: OpenUrlAction[];
  }
}

export async function prepare(context: BrowserContext, page: Page) {
  // Even opened tabs stay offline: never contact IMDb, Books or any external API in CI.
  await context.route(/^https:\/\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Destino simulado</title>' }),
  );
  await page.goto('/');
  await expect(page.getByText('En línea', { exact: true })).toBeVisible();
}
