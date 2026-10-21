import { test, expect } from '@playwright/test';

async function signIn(page, role) {
  await page.goto('/');
  await page.getByRole('button', { name: role === 'family' ? 'A family member' : 'A clinician', exact: true }).click();
  await expect(page.getByRole('heading', { name: role === 'family' ? 'Care, within reach.' : 'Your care queue.' })).toBeVisible();
  await expect(page.getByText('Live updates on', { exact: true })).toBeVisible();
  await expect(page.locator('.patient-hero')).toContainText('Sam Morgan');
}

test('family and clinician complete care, messaging, visits and emergency recovery', async ({ browser }, testInfo) => {
  const familyContext = await browser.newContext();
  const clinicianContext = await browser.newContext();
  const family = await familyContext.newPage();
  const clinician = await clinicianContext.newPage();
  const errors = [];
  for (const page of [family, clinician]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/Content Security Policy|violates.*directive/i.test(message.text())) errors.push(message.text());
    });
  }
  try {
    await signIn(family, 'family');
    await signIn(clinician, 'clinician');
    await expect(clinician.getByRole('button', { name: /Taylor Reed/ })).toBeVisible();
    await expect(family.getByText('Taylor Reed')).toHaveCount(0);
    await family.screenshot({ path: testInfo.outputPath('family-desktop.png'), fullPage: true });
    await clinician.screenshot({ path: testInfo.outputPath('clinician-desktop.png'), fullPage: true });
    await clinician.getByLabel('Share a care update').fill('Sam is comfortable and ready for a family visit.');
    await clinician.getByRole('button', { name: 'Publish update' }).click();
    await expect(family.locator('.timeline')).toContainText('Sam is comfortable and ready for a family visit.');
    await family.getByRole('tab', { name: /Messages/ }).click();
    await family.locator('#message-body').fill('Thank you. Can we visit tomorrow?');
    await family.getByRole('button', { name: /Send message/ }).click();
    await clinician.getByRole('tab', { name: /Messages/ }).click();
    await expect(clinician.locator('#care-panel')).toContainText('Thank you. Can we visit tomorrow?');
    await family.getByRole('button', { name: /Request a visit/ }).click();
    const visitTime = new Date(Date.now() + 86400000);
    const localTime = new Date(visitTime.getTime() - visitTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await family.getByLabel('Preferred date and time').fill(localTime);
    await family.getByRole('button', { name: 'Request visit', exact: true }).click();
    await expect(family.locator('#action-dialog')).not.toBeVisible();
    await clinician.getByRole('tab', { name: 'Visits & calls' }).click();
    await clinician.getByRole('button', { name: 'Confirm', exact: true }).click();
    await clinician.getByRole('button', { name: 'Confirm visit', exact: true }).click();
    await family.getByRole('tab', { name: 'Visits & calls' }).click();
    await expect(family.locator('#care-panel .appointment')).toContainText('Confirmed');
    // A quick click must not open the emergency confirmation flow.
    await family.locator('#emergency-hold').click();
    await expect(family.locator('#action-dialog')).not.toBeVisible();
    await family.locator('#emergency-hold').focus();
    await family.keyboard.down('Space');
    await expect(family.getByLabel('Reason for the alert')).toBeVisible({ timeout: 5000 });
    await family.keyboard.up('Space');
    await family.getByLabel('Reason for the alert').selectOption({ label: 'Breathing concern' });
    await family.getByLabel('More detail').fill('Please check on Sam.');
    await family.getByRole('button', { name: 'Review alert' }).click();
    await family.getByRole('button', { name: 'Confirm & send alert' }).click();
    await expect(family.locator('#family-alert-status')).toContainText('Your alert has been sent');
    await expect(clinician.locator('#alert-dialog')).toBeVisible();
    await expect(clinician.locator('#alert-dialog')).toContainText('Breathing concern');
    await clinician.screenshot({ path: testInfo.outputPath('emergency-desktop.png') });
    // Leave the app while the clinician acknowledges: no SSE event can be received.
    await family.goto('about:blank');
    await clinician.getByRole('button', { name: 'Acknowledge alert', exact: true }).click();
    await expect(clinician.locator('#alert-dialog')).not.toBeVisible();
    await family.goto('/');
    await expect(family.locator('#family-alert-status')).toContainText('The care team has acknowledged your alert');
    await clinician.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(family.locator('#family-alert-status')).toContainText('The care team has resolved your alert');
    await family.reload();
    await expect(family.locator('#family-alert-status')).toContainText('The care team has resolved your alert');
    await family.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(family.getByRole('button', { name: 'A family member', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await familyContext.close();
    await clinicianContext.close();
  }
});

test('360px dark-mode family view remains usable with keyboard and no overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page, 'family');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Care updates' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Messages/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /Messages/ })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('family-mobile-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Care library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The care library.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
