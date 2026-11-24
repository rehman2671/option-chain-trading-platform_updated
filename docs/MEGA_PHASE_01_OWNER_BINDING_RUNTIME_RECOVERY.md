# Mega Phase 01 — owner binding and runtime recovery

Checkpoint 2026-11-25 IST. Base main 050e0acdac18c9f812ebb72eb9a116a589721cd7, #152 merged after exact-head 276079b98979939af4a0f8ab92f0591bb44b4695 workflows 45478233332 and 45478233259 passed. #151 closed as superseded, not separately merged. #153 head 78b9cfa7abdbca9bfa316ac506a3cf01e89db59b: paper staging 45482741725 passed; EMA full/invariant regression 45482741820 pending at checkpoint.

| Existing IDs | Implemented | Remaining gate |
|---|---|---|
| P01-01/03/04/06/09/10/17/47 | Server-owned exact one-to-one broker account mapping, original JWT session version, active user readback, native account and epoch check; authenticated owner-only read-only HTTP recovery route | Actual hosted identity configuration and cross-browser acceptance; no owner guessing or shared account fallback |
| P01-13/14/15/16/20/28/38 | Initialize existing atomic intent/reservation/drawdown schemas on normal runtime database startup; recovery reads same file-backed journal, no handle exposed | Connect trusted candidate evidence to active preparation; verified equity provenance and reset |
| P01-23/24/25/26/29/35/36/40 | Account-wide orphan and UNKNOWN reservation quarantine, rollback new intents, preserve replay and independent account scope | Independently authenticated reconciliation, approved capital release, actual dispatch and rollback |
| P01-46/47/49/50 | Mapping rejection, session revocation, HTTP auth, query override and independent SQLite connection tests | Fresh exact-head CI, combined main and hosted checks |

## Deployment configuration (optional, fail closed)

In existing Google AI Studio server environment only, deployment owner can set BROKER_PREPARATION_OWNER_MAP to JSON array such as [{"ownerId":"EXACT_PLATFORM_USER_ID","accountId":"EXACT_BROKER_ACCOUNT_ID"}]. These are placeholders, not credentials or actual identities. No value is installed by this PR. Mapping must be explicitly verified by owner, one account per owner; duplicate mapping, missing value, GLOBAL, disabled account, revoked JWT or disconnected/wrong native account denies access. Current shared provider means only the currently connected matching account can be reviewed. Do not put mapping into client bundle or accept it from request body. No new hosting. Operator/admin role alone grants no cross-account access.

GET /api/auth/broker-preparation/recovery: no-store, original authenticated JWT session required; ignores client account/owner query parameters. Returns owner-scoped read-only journal state (including UNKNOWN), never an authorization. No endpoint to create orders, modify positions, clear quarantine or release funds. Normal database startup initializes new tables, no existing rows are deleted. Explicit corrupt database salvage workflow is not certified for these ledgers; preserve files and require manual review, never assume recovery after data loss.

New account-wide guard blocks new preparations with unresolved/orphan reservations or orphan prior intents across owners, even if apparent budget remains. Replay is non-dispatch and does not clear holds. This conservative quarantine can block additional preparation until future verified release workflow; no automatic expiry. Active legacy trading routes are unchanged and are NOT integrated with this guard. Candidate #153 remains independent pending full CI; actual trusted Greek/NAV and candidate-to-journal integration still pending.

Main counts 12 scoped implementations merged / 38 partial / 0 untouched; no full phase acceptance. New work advances existing IDs only. No real broker orders, live release, production credentials or deployment changes. Require exact-head CI.
