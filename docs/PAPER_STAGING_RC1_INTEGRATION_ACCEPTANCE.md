# Paper/Staging RC1 integration freeze

**Status: DRAFT integration candidate. Not deployed, not merged to main, not licensed option market evidence, and not a LIVE NRML release.**

## Starting point

The default branch is main, whose reviewed SHA when RC work started was 8ba7b879179332b8138d75a552bac2087713fba5. The latest Phase132 research branch is its descendant, 1,270 commits ahead and zero behind at the audit. There were 131 open research draft PRs. Instead of another positional strategy phase, this RC collects the existing branch chain for one independently reviewed paper-only release candidate. GitHub compare may truncate changed files at 300; do not mistake truncated stats for complete diff review.

## Code freeze and runtime fixes

- The new branch release/paper-staging-rc1-integration starts at the existing Phase132 research tip. No default-branch rewrite or automatic merge performed.
- npm start runs the compiled dist/server.cjs, so npm run build is required first. A Node 22 deployment should not rely on a TypeScript source entrypoint.
- Four tracked top-level runtime databases (option_platform.sqlite, SQLite WAL/SHM sidecars, quant_trading.db) were untracked ONLY ON THIS RC BRANCH and ignored going forward. Their previous Git history still exists. This is not a secure purge, customer-data backup or security signoff; proper operator custody and any incident response are separate.
- All launch commands on this RC branch (including npm start and npm run dev) ALWAYS enforce the paper-staging admission before opening SQLite or listening; there is no non-staging fallback. The explicit PAPER_STAGING_MODE=1 and NODE_ENV=production are mandatory along with DATA_PROVIDER=practice, strong JWT signing secret and no Upstox API keys, tokens, TOTP, PIN, user ID or aliases. An accidental credential or wrong provider denies startup before database open or HTTP listening. This is a staging defense, NOT a future live trading release switch.
- GET /api/release/status reports paper-only staging and all broker/NRML/exchange-stop/profitability certification booleans false. All /api/upstox/* auth/token/login/status endpoints return 403 in paper staging. Paper-staging /api/paper-trading/* routes additionally require authenticated users, preventing anonymous guest ledger reads and simulated orders from sharing userId=null state. The direct Upstox placeOrder, TOTP login and token injection helpers separately reject. Broker auth cron and streamer are not started in paper staging.
- The practice data provider cannot send actual broker orders. Synthetic practice quotes must not be misrepresented as licensed market L1 or executable bid/ask.

## Reproducible paper RC build and smoke

In a clean checkout with NO Upstox credentials:
1. npm ci
2. npm run lint
3. NODE_ENV=production npm run build
4. npm run smoke:paper-staging

The smoke script starts the compiled backend from a disposable isolated temp working directory with new test-only JWT and supervisor keys and no broker credentials or .env file. It verifies /api/health, /api/release/status, /api/system/health (mode PRACTICE), built React HTML at /, Upstox auth/token routes blocked with 403, and unauthenticated live-account/exit endpoints denied (401/403). It also verifies guest paper portfolio reads and virtual order POSTs return 401; then bootstraps a one-time disposable SUPERADMIN, authenticates over the actual HTTP route, creates a virtual NIFTY option BUY, reads the paper portfolio, closes it with synthetic premium, verifies the closed ledger, and checks that the authenticated admin still cannot inject a broker token. It terminates the test process and cleans only the generated temp working directory. It does not open a pre-existing production operator database.

GitHub Actions workflow paper-staging-rc1-integration.yml checks no tracked SQLite/DB files, TypeScript, direct live broker denial unit tests, production bundle and this exact HTTP smoke under Node 22. The PR targeting main also invokes full EMA15M invariant, npm test and build workflows. A successful smoke does NOT prove all research modules integrated or certify any trading strategy.

## Paper-staging container operations (NOT a LIVE release)

The checked-in Dockerfile.paper-staging is a multi-stage Node 22 Debian build. The final image runs as the unprivileged node user and has a health check for the explicit paper-only release status. The Docker build context excludes Git history, .env, old SQLite/WAL blobs, locally captured research market data, key files, and local backups. No broker token may be injected. This is a staging image, not a production/live image.

Staging environment settings must explicitly contain NODE_ENV=production, PAPER_STAGING_MODE=1, DATA_PROVIDER=practice, PAPER_STAGING_DB_DIR=/data, a strong unique JWT_SECRET (at least 32 characters), and a different, one-off ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD (at least 12 characters). PORT may be assigned by the host (valid integer 1 to 65535; 3000 default). Configure the domain/APP_BASE_URL for HTTPS application links as needed. Do not put Upstox PIN, TOTP, UCC, API key, secret, access token or legacy aliases into a staging environment; the admission guard will reject them. Manage secrets outside Git and Docker image layers.

### Explicit isolated operator deployment steps (require prior authorisation)

1. Verify the intended Git commit SHA is approved, manual owner/operator roles are assigned, the historical tracked SQLite blobs were reviewed, and the staging tenant/domain are private with HTTPS and access restrictions.
2. Build only from this draft RC branch: docker build -f Dockerfile.paper-staging -t option-paper-staging:rc1 .
3. Create an operator-managed named persistent data volume: docker volume create option-paper-staging-data. Ensure its backups, encryption, capacity and destruction policy are governed by the host owner. A container filesystem alone is NOT durable storage.
4. Store the environment variables above in a host-managed private env file with filesystem owner-only permissions, or provider-native secret configuration. DO NOT put the file in the repository or build context.
5. Run with non-root, read-only app filesystem, dedicated writable data volume and no public unencrypted service port. Illustrative local-only command (replace PRIVATE_ENV_FILE with an existing secure external file):

    docker run -d --name option-paper-staging-rc1 --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=64m -v option-paper-staging-data:/data -p 127.0.0.1:3000:3000 --env-file PRIVATE_ENV_FILE option-paper-staging:rc1

6. Check GET /api/health, GET /api/release/status (paperOnly=true, brokerOrders=false), and GET /api/system/health (PRACTICE). Authenticate using the staging-only administrator in a browser over an approved HTTPS private reverse proxy. Confirm anonymous paper-trading GET/POST are denied and authenticated simulated entry/close/ledger works. All /api/upstox/* must remain blocked even for the admin.
7. Restart the container with the SAME mounted data volume, verify existing closed paper trades persist, test account/session expiry, data-migration and crash/recovery handling, and inspect logs for secrets or broker HTTP requests. Do not send real funds/orders. CI tests a disposable named Docker volume, but operator-hosted persistence and backup still need manual proof.

### CI evidence and limits

The dedicated GitHub workflow runs the source-level paper admission tests, TypeScript compilation, production React+backend build and isolated on-host HTTP smoke. Its container job separately builds the actual non-root Docker image and runs it on a Docker named volume with read-only root, no extra Linux capabilities and no-new-privileges. It performs an authenticated simulated option BUY/close, restarts the container against the same volume and checks the CLOSED position is still present. Both are synthetic tests. A successful Docker CI run is NOT a public hosting deployment or permission to trade live.

### Backup and rollback gate

Before any staging migration or deployment replacement, stop new paper writes and take an operator-approved encrypted backup/snapshot of the mounted SQLite directory using a SQLite-consistent method; do not copy only the main .sqlite file while WAL writes are active. Maintain test-only credentials and account isolation. Retain the previous approved image digest. On rollback, verify schema compatibility with the saved database snapshot before restarting; rolling back code alone after destructive migrations is NOT safe. Never delete a live named volume as part of CI or a routine container replacement. In a failed migration, hold service, preserve evidence and restore only an independently validated snapshot.

**Hosting connection, external deployment, DNS, TLS, human browser acceptance and independent security/release signoff are all still outstanding.**

## Manual acceptance STILL pending

- Human-reviewed isolated staging tenancy, HTTPS, admin onboarding, least privilege and secret management.
- Actually log in, open React trading terminal, load practice chains, place/close paper trades and inspect ledger/P&L, holdings and audit trail without any Upstox broker token. The scripted health probes do not claim this business workflow passed.
- Test quote outages, restart, auth/session expiry, permissions, database integrity, backup/rollback, user privacy and no duplicate paper orders. Confirm no real broker or money flows.
- Review all accumulated research diffs, including source histories and any old committed DB, plus local controls and independent owner approvals. A green CI check is necessary but insufficient.
- NO automatic merge, main release or hosting deployment. A local CI smoke is not an externally hosted staging deployment.

## Held-open LIVE NRML blockers

Licensed original NSE/BSE options Level-1 feed with exchange and availability clocks, effective-dated instrument/session/expiry/lot histories, independently verified original broker BUY and SELL child trades and complete GTT history, sanctioned close-only/no-short NRML stops with gap/restart tests, genuine 1/2/4/8-week untouched OOS with fees and tail risk, and independent human ops/risk/capital/security release.

**Decision: PAPER/STAGING CANDIDATE FOR HUMAN VALIDATION ONLY. No LIVE NRML BUY/SELL or positional automation.**
