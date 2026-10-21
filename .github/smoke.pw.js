import { test, expect } from '@playwright/test';

test('family can sign in and see their bedside patient', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /family/i })).toBeVisible();
  await page.getByRole('button', { name: /try the demo as.*family/i }).click();
  await expect(page.getByText(/sam morgan/i)).toBeVisible({ timeout: 10_000 });
});
