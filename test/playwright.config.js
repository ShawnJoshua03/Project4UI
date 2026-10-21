export default {
  testDir: '../.github',
  testMatch: '**/smoke.pw.js',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3087', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3087',
    env: { PORT: '3087', DATABASE_PATH: ':memory:', NODE_ENV: 'test' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
};
