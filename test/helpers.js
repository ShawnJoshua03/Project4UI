import { spawn } from 'node:child_process';

export async function startServer() {
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: '0', NODE_ENV: 'test', DATABASE_PATH: ':memory:' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const deadline = Date.now() + 15000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Server exited early:\n${output}`);
      const port = /listening at http:\/\/localhost:(\d+)/.exec(output)?.[1];
      if (port) {
        const baseUrl = `http://127.0.0.1:${port}`;
        await fetch(`${baseUrl}/api/me`, { signal: AbortSignal.timeout(1000) });
        return { child, baseUrl, stop: () => child.kill() };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    child.kill();
    throw error;
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

export async function openStream(baseUrl, cookie) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/stream`, {
    headers: { cookie }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
  });
  if (response.status !== 200) throw new Error(`Stream failed: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    close: () => controller.abort(),
    async next() {
      while (true) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const type = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (type && data) return { type, data: JSON.parse(data) };
        } else {
          const { value, done } = await reader.read();
          if (done) return null;
          buffer += decoder.decode(value, { stream: true });
        }
      }
    },
  };
}
