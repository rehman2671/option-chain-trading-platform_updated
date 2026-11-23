# Paper/Staging RC1 integration freeze

**Status: DRAFT integration candidate. Not deployed, not merged to main, not licensed option market evidence, and not a LIVE NRML release.**

## Starting point

The default branch is main, whose reviewed SHA when RC work started was 8ba7b879179332b8138d75a552bac2087713fba5. The latest Phase132 research branch is its descendant, 1,270 commits ahead and zero behind at the audit. There were 131 open research draft PRs. Instead of another positional strategy phase, this RC collects the existing branch chain for one independently reviewed paper-only release candidate. GitHub compare may truncate changed files at 300; do not mistake truncated stats for complete diff review.

## Code freeze and runtime fixes

- The new branch release/paper-staging-rc1-integration starts at the existing Phase132 research tip. No default-branch rewrite or automatic merge performed.
- npm start runs the compiled dist/server.cjs, so npm run build is required first. A Node 22 deployment should not rely on a TypeScript source entrypoint.
- Four tracked top-level runtime databases (option_platform.sqlite, SQLite WAL/SHM sidecars, quant_trading.db) were untracked ONLY ON THIS RC BRANCH and ignored going forward. Their previous Git history still exists. This is not a secure purge, customer-data backup or security signoff; proper operator custody and any incident response are separate.
- The RC production server will refuse startup if PAPER_STAGING_MODE=1 is omitted; when set, strict admission requires NODE_ENV=production, DATA_PROVIDER=practice, strong JWT signing secret and no Upstox API keys, tokens, TOTP, PIN, user ID or aliases. An accidental credential or wrong provider denies startup before database open or HTTP listening. This is a staging defense, NOT a future live trading release switch.
- GET /api/release/status reports paper-only staging and all broker/NRML/exchange-stop/profitability certification booleans false. All /api/upstox/* auth/token/login/status endpoints return 403 in paper staging. The direct Upstox placeOrder, TOTP login and token injection helpers separately reject. Broker auth cron and streamer are not started in paper staging.
- The practice data provider cannot send actual broker orders. Synthetic practice quotes must not be misrepresented as licensed market L1 or executable bid/ask.

## Reproducible paper RC build and smoke

In a clean checkout with NO Upstox credentials:
1. npm ci
2. npm run lint
3. NODE_ENV=production npm run build
4. npm run smoke:paper-staging

The smoke script starts the compiled backend from a disposable isolated temp working directory with new test-only JWT and supervisor keys and no broker credentials or .env file. It verifies /api/health, /api/release/status, /api/system/health (mode PRACTICE), built React HTML at /, Upstox auth/token routes blocked with 403, and unauthenticated live-account/exit endpoints denied (401/403). It also bootstraps a one-time disposable SUPERADMIN, authenticates over the actual HTTP route, creates a virtual NIFTY option BUY, reads the paper portfolio, closes it with synthetic premium, verifies the closed ledger, and checks that the authenticated admin still cannot inject a broker token. It terminates the test process and cleans only the generated temp working directory. It does not open a pre-existing production operator database.

GitHub Actions workflow paper-staging-rc1-integration.yml checks no tracked SQLite/DB files, TypeScript, direct live broker denial unit tests, production bundle and this exact HTTP smoke under Node 22. The PR targeting main also invokes full EMA15M invariant, npm test and build workflows. A successful smoke does NOT prove all research modules integrated or certify any trading strategy.

## Manual acceptance STILL pending

- Human-reviewed isolated staging tenancy, HTTPS, admin onboarding, least privilege and secret management.
- Actually log in, open React trading terminal, load practice chains, place/close paper trades and inspect ledger/P&L, holdings and audit trail without any Upstox broker token. The scripted health probes do not claim this business workflow passed.
- Test quote outages, restart, auth/session expiry, permissions, database integrity, backup/rollback, user privacy and no duplicate paper orders. Confirm no real broker or money flows.
- Review all accumulated research diffs, including source histories and any old committed DB, plus local controls and independent owner approvals. A green CI check is necessary but insufficient.
- NO automatic merge, main release or hosting deployment. A local CI smoke is not an externally hosted staging deployment.

## Held-open LIVE NRML blockers

Licensed original NSE/BSE options Level-1 feed with exchange and availability clocks, effective-dated instrument/session/expiry/lot histories, independently verified original broker BUY and SELL child trades and complete GTT history, sanctioned close-only/no-short NRML stops with gap/restart tests, genuine 1/2/4/8-week untouched OOS with fees and tail risk, and independent human ops/risk/capital/security release.

**Decision: PAPER/STAGING CANDIDATE FOR HUMAN VALIDATION ONLY. No LIVE NRML BUY/SELL or positional automation.**
