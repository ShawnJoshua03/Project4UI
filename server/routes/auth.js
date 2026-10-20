import { Router } from 'express';
import { db } from '../db.js';
import { createSession, destroySession, publicUser, requireAuth, verifyPassword } from '../auth.js';
import { asyncRoute, fail } from './utils.js';

export function authRoutes() {
  const router = Router();
  router.post('/auth/login', asyncRoute(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || email.trim().length === 0 || email.length > 254
      || typeof password !== 'string' || password.length === 0 || password.length > 1024) {
      return fail(res, 'A valid email and password are required');
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password' });
    createSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  }));

  router.post('/auth/logout', (req, res) => {
    destroySession(req, res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
  return router;
}
