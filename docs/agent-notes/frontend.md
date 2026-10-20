# Frontend agent

Implemented the vanilla ES-module UI in `public/index.html`, `public/login/`,
`public/app/`, and `public/css/`. This note is the frontend handoff required by
the spec's Definition of done; no other agent-owned files were edited.

- Original plum/sage design, family patient overview and care journal, and a
  clinician queue ordered by emergency alerts and critical condition.
- Login and both demo-account buttons; session expiry and sign-out.
- Care summaries, messaging, family visit requests, clinician confirmation with
  scheduling and decline, and the API-fed care library.
- A continuous 1.5-second pointer or keyboard hold, cancellation on early release,
  reason selection, explicit confirmation, and live sent/acknowledged/resolved
  status. Clinicians receive a blocking dialog with a running waiting timer and
  separate acknowledgement and resolution actions.
- One transport module (`api.js`), required CSRF headers, SSE/reconnection state,
  request errors, loading/empty states, draft preservation, duplicate submission
  protection, and protection against stale alert refreshes.
- 360px layouts, system/light/dark themes, visible focus, native dialogs,
  keyboard tabs, live announcements, reduced motion, escaped API content,
  safe article URLs, strict CSP meta policies, and demo-data footers.

## Verification

Passed JavaScript syntax checks and `git diff --check`. A temporary, uncommitted
Playwright/API fixture exercised separate family and clinician browser sessions:
authentication, both hold inputs and cancellation, live emergency lifecycle and
timer, messages and failed sends, delayed responses, retained drafts, visit
requests/confirmation/decline, care updates, keyboard tabs, library, multiple
patients, empty/error states, theme persistence, 360px overflow checks, session
expiry, and sign-out. No application runtime or CSP violations were observed;
all non-GET requests included `X-Requested-With: bedside`.

Axe WCAG 2/2.1 A/AA checks reported zero violations on the tested family and
clinician desktop views, blocking emergency dialog, family mobile dark view,
and login mobile dark view. Desktop/mobile screenshots were visually reviewed.
The temporary fixture is outside the repository; no API stubs ship in the UI.

## Left out / integration blockers

- `npm start` fails because `server/index.js` is absent on this branch.
- `npm test` fails because `test/` is absent. Real backend integration and the
  tests agent's committed Playwright suite remain unverified.
- The backend must send the strict CSP **response header**, including
  `frame-ancestors 'none'`; an HTML meta policy cannot supply that directive.
- The README demo-data disclaimer remains the documentation agent's work.
- Family alert progress survives reload in session storage. The specified REST
  contract has no family alert-history/status read endpoint, so recovery of
  alert-status events missed while disconnected requires server SSE replay or
  a future contract addition. Clinician open alerts refresh on reconnection.

No dependencies, package scripts, server files, legacy files, or test files
were changed. Committed on the existing frontend branch; not pushed.
