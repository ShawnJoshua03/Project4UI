# Bedside: build spec (shared contract for all agents)

**Pitch:** Families can't always be at the hospital. Bedside gives a patient's family a calm, trustworthy
window into care (doctor visit summaries, appointments, secure messaging, emergency escalation) and gives
clinicians a fast triage view. Demo data only; no real PHI. Say so in the UI footer and README.

## Stack
- Node 20+, Express 4, `better-sqlite3`, plain ES modules, no frontend framework (vanilla JS + CSS custom properties).
- Tests: `node --test` (backend), Playwright smoke test (frontend, owned by the tests agent).
- One command to run: `npm start` (seeds DB if empty) at http://localhost:3000.

## Layout (each agent edits ONLY its own paths)
```
server/index.js            app wiring only            [backend]
server/db.js, schema.sql   SQLite + migrations         [backend]
server/auth.js             sessions, roles middleware  [backend]
server/routes/*.js         REST routes                 [backend]
server/realtime.js         SSE hub + emergency flow    [realtime]
server/seed.js             demo data                   [tests]
public/index.html, login   entry + auth UI             [frontend]
public/app/**              family + clinician views    [frontend]
public/css/**              design system               [frontend]
test/**, .github/**        tests + CI                  [tests]
README.md, docs/**         case study                  [claude]
```

## Roles
`family` (linked to one or more patients), `clinician` (assigned to patients). Demo accounts seeded:
`family@demo.test` / `clinician@demo.test`, password `demo-password`. Login page has "Try the demo as..." buttons.

## Auth
Password hashing with `crypto.scrypt`. Opaque session id in an HttpOnly, SameSite=Lax cookie; sessions in SQLite
with expiry. CSRF: reject non-GET requests lacking header `X-Requested-With: bedside`. Rate limit `/api/auth/login`
(5 per minute per IP). Authorization checked per patient on every route; a family user can never read a patient
they are not linked to (test this).

## REST API (JSON; errors are `{ "error": "message" }`)
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /api/auth/login | any | `{email,password}` -> `{user}` |
| POST | /api/auth/logout | any | |
| GET | /api/me | any | `{user}` or 401 |
| GET | /api/patients | any | patients visible to the user |
| GET | /api/patients/:id | linked | `{id,name,room,status,condition,updatedAt}` status in `stable|monitoring|critical` |
| GET | /api/patients/:id/visits | linked | doctor visit summaries, newest first |
| POST | /api/patients/:id/visits | clinician | `{summary}` |
| GET | /api/patients/:id/appointments | linked | |
| POST | /api/patients/:id/appointments | family | `{type:'video'|'in-person', requestedAt, note}` status `requested` |
| PATCH | /api/appointments/:id | clinician | `{status:'confirmed'|'declined', scheduledAt?}` |
| GET | /api/patients/:id/messages | linked | |
| POST | /api/patients/:id/messages | linked | `{body}` max 2000 chars |
| POST | /api/patients/:id/alerts | family | emergency alert `{reason}` ; clinician gets it live |
| GET | /api/patients/:id/alerts | linked | newest 50 persisted alerts, including resolved; `{alerts}` for reconnect recovery |
| PATCH | /api/alerts/:id | clinician | `{status:'acknowledged'|'resolved'}` |
| GET | /api/alerts | clinician | open alerts, oldest first |
| GET | /api/education | any | static curated articles |
| GET | /api/stream | any | SSE: events `message`, `alert`, `appointment`, `visit`, each `{patientId, ...}`; only events for visible patients |

## Emergency flow (the signature feature)
Family presses and holds "Send emergency alert" for 1.5s (prevents accidental taps), picks a reason, confirms.
Server stores the alert, pushes SSE to assigned clinicians, and the clinician UI shows a blocking banner with a
running "waiting" timer until acknowledged. Family sees live status: sent -> acknowledged -> resolved.

## UI requirements
- Two designed experiences: family (reassuring, one patient hero card, plain language) and clinician (dense triage
  list sorted by alert/critical first).
- Responsive down to 360px, dark mode via `prefers-color-scheme` + toggle, WCAG AA contrast, visible focus,
  keyboard-operable everything, `aria-live` for incoming messages/alerts, reduced-motion respected.
- No inline `alert()`; use toasts/dialogs. No inline event handlers (CSP-friendly). Send a strict CSP header.
- Original v1 look (baby blue, Arial) is retired.

## Definition of done per agent
Code runs with `npm start`, `npm test` green, no unrelated file edits, a short note in `docs/agent-notes/<role>.md`
listing what was done and what was left out. Commit on your own branch with clear messages. Do not push.

## Seams between agents
- `server/realtime.js` exports `registerRealtime(app, { requireAuth, db })` (mounts `/api/stream` and the alert routes)
  and `publish(type, patientId, payload)`; backend routes call `publish` after writes.
- `server/auth.js` exports `requireAuth`, `requireRole(role)`, `canAccessPatient(user, patientId)`.
- `server/db.js` exports the better-sqlite3 `db` handle; tables: users, sessions, patients, patient_users,
  visits, appointments, messages, alerts. The backend agent owns `schema.sql`; others read it, never edit it.
- Frontend talks only through `public/app/api.js` (one fetch wrapper that adds the CSRF header). Until the backend
  merges, the frontend may stub responses inside that file only.
