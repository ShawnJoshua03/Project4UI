import { spawn } from 'node:child_process';
import { once } from 'node:events';

export async function startServer() {
  const port = 3100 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${output}`);
    try {
      await fetch(`${baseUrl}/api/me`);
      return { child, baseUrl, stop: () => child.kill() };
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`Server did not become ready:\n${output}`);
}

export async function login(baseUrl, email, password = 'demo-password') {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Requested-With': 'bedside' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  return { response, cookie, body: await response.json() };
}

export function api(baseUrl, cookie, path, options = {}) {
  const method = options.method ?? 'GET';
  const headers = { ...(options.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET') headers['X-Requested-With'] = 'bedside';
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  return fetch(`${baseUrl}${path}`, { ...options, method, headers });
}
