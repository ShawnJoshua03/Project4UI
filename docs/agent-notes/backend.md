# Backend agent

Implemented the Express 4 API, versioned SQLite schema, scrypt passwords, opaque
12-hour SQLite sessions, role and patient-link authorization, login throttling
(five attempts per minute per IP), CSRF header enforcement, strict CSP, and JSON
validation/errors. Patient reads and writes, visits, appointments, messages, and
curated education are implemented. Mutations publish after the transaction commits;
publication failures do not turn a saved write into an error that invites retries.
Demo data only; no real PHI.

`server/index.js` imports `server/realtime.js` defensively. If only that file is
missing, startup succeeds and its stream/alert endpoints return authenticated 503
responses. Broken imports inside an existing realtime module fail startup. The
realtime agent still owns SSE delivery and the emergency lifecycle. The same
optional-import pattern supports the tests agent's `server/seed.js` (named `seed`,
default function, or import side effects); an empty-database fallback currently
provides both demo accounts, two patients, and a visit/message. Existing data is
preserved. Both demo accounts use `demo-password`.

Integration contract:

- Database: exported `db`; schema is root `schema.sql`, migration `user_version=1`,
  foreign keys enabled, WAL, five-second busy timeout. `DATABASE_PATH` (or `DB_PATH`)
  selects a file or `:memory:`; default is root `bedside.db`.
- SQL names use snake_case, API fields camelCase, timestamps UTC ISO-8601 text.
  List responses are JSON arrays; creates/updates return the resource object.
- `users`: `id,name,email,password_hash,role,created_at`. Password encoding is
  `scrypt:<32 hex salt>:<128 hex key>`, using scrypt(password, salt, 64).
  `hashPassword` and async `verifyPassword` are exported from `server/auth.js`.
- `sessions`: `id,user_id,expires_at,created_at`. `id` stores SHA-256 of the opaque
  `bedside.sid` cookie value. Use `requireAuth` instead of joining raw cookies.
- `patient_users`: `patient_id,user_id` composite key; both family links and
  clinician assignments live here. Unlinked resources return 404.
- `visits.clinician_id`, `appointments.requested_by`, and `messages.sender_id`
  reference users. Full definitions and indexes are in `schema.sql`.
- `alerts`: `id,patient_id,created_by,reason,status,acknowledged_at,resolved_at,
  created_at,updated_at`; status is `sent|acknowledged|resolved`, initially `sent`.
- Realtime seam: `registerRealtime(app, { requireAuth, db })` and
  `publish(type, patientId, payload)`. Visit/appointment/message payloads are the
  returned resource fields (including `patientId`). The hub must filter each
  recipient by current patient assignment and enforce patient authorization on
  alert routes. `canAccessPatient` and `requireRole` are exported as specified.
- `app` is a named/default export; importing it does not bind a port. `npm start`
  binds port 3000, overridable with `PORT`.

Validation: `npm start` launched with the absent realtime/seed files. A temporary
Node `node:test` harness passed 12 checks (13 tests counting the parent), exercising
schema constraints, seed idempotence, hashing, cookies, CSRF, patient isolation on
all patient endpoints, clinician assignments, role restrictions, visits/messages/
appointments, validation, CSP, JSON errors, fallback behavior, expired/revoked/
rotated sessions, and the login limit. The harness left no test-agent files behind.
Additional in-memory module-loader checks verified existing realtime registration,
publish-after-write payloads, and startup failure for a missing transitive realtime
dependency. All backend JavaScript passed `node --check`.

Remaining outside backend ownership: `package.json` currently declares no
dependencies. Local verification used
`npm install --no-save --package-lock=false express@4 better-sqlite3@12.4.1`
(Express 4.22.3, better-sqlite3 12.4.1); use a SQLite package version supporting
Node 20, as current version 13 requires Node 22. A clean install needs dependencies
declared by the manifest owner. `npm test` currently fails with
`Could not find 'test/'`; the tests
agent's tests/CI and final seed file are absent. Frontend/static files, the README
demo notice, and the realtime module were not edited. The full Definition of done
therefore remains dependent on those separately owned files.
