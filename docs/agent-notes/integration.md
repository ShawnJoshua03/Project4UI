# Integration handoff

Integrated the backend, frontend, realtime, and test branches on `codex/bedside-integration`. The original component notes describe their pre-integration state; the blockers listed there are resolved here.

- Declared and pinned Express, better-sqlite3, and Playwright; committed a reproducible npm lockfile.
- Shared password hashing between authentication and the seed. Removed temporary backend seed/realtime fallbacks so missing application components fail visibly.
- Aligned alert creation with `created_by` and stored acknowledgement/resolution timestamps.
- Added authenticated patient alert reads and family reconciliation on reload/reconnect, with protection against stale reads overwriting newer events.
- Checked stream session validity before delivery and on heartbeats; isolated client failures from other recipients and committed writes.
- Matched alert length validation to the schema so a reason plus the UI's maximum detail fits.
- Isolated API and browser tests in memory, corrected browser selectors, and configured CI for Node 20/22.
- Added setup instructions, architecture/limitations, a case study, demo-only notices, and real application screenshots.
- Adjusted the narrow-screen patient header after screenshot review.

Validation: `npm test` (14 API/seed checks), `npm run test:e2e` (two integrated browser scenarios), and `git diff --check`. Browser scenarios use the real backend and separate role sessions; they cover missed-event recovery and 360px dark mode. Local validation runs on Node 22; the Node 20 CI matrix has not run remotely. No public deployment is part of this work.
