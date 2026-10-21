import test from 'node:test';
import assert from 'node:assert/strict';

test('seed is idempotent and its passwords are accepted by real authentication', async () => {
  process.env.DATABASE_PATH = ':memory:';
  const { db } = await import('../server/db.js');
  const { seed, DEMO_PASSWORD } = await import('../server/seed.js');
  const { verifyPassword } = await import('../server/auth.js');
  try {
    seed(db);
    const users = db.prepare('SELECT * FROM users ORDER BY id').all();
    assert.equal(users.length, 2);
    for (const user of users) assert.equal(await verifyPassword(DEMO_PASSWORD, user.password_hash), true);
    seed(db);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), users);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM patients').get().n, 2);
  } finally { db.close(); }
});
