export default {
  testDir: '../.github',
  testMatch: '**/smoke.pw.js',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium' },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
};
