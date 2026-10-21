import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE = 'bedside.sid';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 60_000;
const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export async function verifyPassword(password, encoded = dummyPasswordHash) {
  if (typeof password !== 'string' || password.length > 1024 || typeof encoded !== 'string') return false;
  const match = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  const actual = await deriveKey(password, match[1], 64);
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function sessionToken(req) {
  const cookies = (req.headers.cookie ?? '').split(';');
  const cookie = cookies.find(value => value.trim().startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.trim().slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token ?? '') ? token : null;
}

function sessionId(token) {
  return createHash('sha256').update(token).digest('hex');
}

const cookieOptions = req => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });

export function destroySession(req, res) {
  const token = sessionToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId(token));
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

export function createSession(req, res, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.transaction(() => {
    const previous = sessionToken(req);
    if (previous) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId(previous));
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sessionId(token), userId, expiresAt);
  })();
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_DURATION_MS });
}

export function requireAuth(req, res, next) {
  const token = sessionToken(req);
  const user = token && db.prepare(`
    SELECT u.id, u.name, u.email, u.role FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?
  `).get(sessionId(token), new Date().toISOString());
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = publicUser(user);
  req.sessionId = sessionId(token);
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Permission denied' });
    next();
  };
}

export function validId(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
}

export function canAccessPatient(user, patientId) {
  if (!user || !validId(patientId)) return false;
  return Boolean(db.prepare('SELECT 1 FROM patient_users WHERE patient_id = ? AND user_id = ?')
    .get(Number(patientId), user.id));
}

export function requirePatientAccess(req, res, next) {
  if (!canAccessPatient(req.user, req.params.id)) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  next();
}

export function requireCsrf(req, res, next) {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'bedside') {
    return res.status(403).json({ error: 'X-Requested-With: bedside is required' });
  }
  next();
}

export function rateLimitLogin(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const recent = (loginAttempts.get(key) ?? []).filter(time => time > now - LOGIN_WINDOW_MS);
  if (recent.length >= 5) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((recent[0] + LOGIN_WINDOW_MS - now) / 1000))));
    return res.status(429).json({ error: 'Too many login attempts. Try again in a minute.' });
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  next();
}

const cleanup = setInterval(() => {
  const cutoff = Date.now() - LOGIN_WINDOW_MS;
  for (const [ip, attempts] of loginAttempts) {
    if (attempts.at(-1) <= cutoff) loginAttempts.delete(ip);
  }
  if (db.open) db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}, LOGIN_WINDOW_MS);
cleanup.unref();
