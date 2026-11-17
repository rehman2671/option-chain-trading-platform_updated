# Adaptive Swing v2 — Phase29 explicitly authorized Upstox GET-only evidence capture

**DRAFT / UNMERGED / NO LIVE BROKER REQUEST EXECUTED IN THIS DEVELOPMENT.** Phase29 introduces a **manual, explicitly opt-in, local CLI** capable of sending a small fixed set of account-authorized GET requests *when* run by an authorized account operator from a whitelisted static-IP host, using an Upstox **Analytics Token** privately provisioned as an environment variable. No credentials were provided in this project conversation, and no real brokerage GET, stop or trade has been attempted or verified here.

## Provider facts verified (November 18, 2026)

Upstox's Analytics Token documentation states it is **read-only** (GET only), valid for up to one year and cannot place/modify/cancel orders. Its **User, Orders, GTT Orders, Portfolio, and Trade Profit and Loss** GET API categories require an approved **whitelisted static IP** for account endpoints. Upstox's `GET /v2/user/profile` response includes `data.user_id` (UCC), `data.broker`, `data.is_active`, `data.products` and `data.order_types`; `D` and `SL` are examples of product and order-type entitlements. The regular order book is **current-day-only**, and the day-trades GET provides **trades of the current day**, so neither can independently demonstrate an NRML native stop persisted overnight for 1W/2W/4W/8W holding periods.

Official docs:
- Analytics Token and static-IP requirements: https://upstox.com/developer/api-documentation/analytics-token/
- Static-IP read-only availability: https://upstox.com/developer/api-documentation/announcements/analytics-token-static-ip/
- Profile/UCC: https://upstox.com/developer/api-documentation/get-profile/
- Current positions: https://upstox.com/developer/api-documentation/get-positions/
- Current-day order book: https://upstox.com/developer/api-documentation/get-order-book/
- Current GTT rules, excludes completed history: https://upstox.com/developer/api-documentation/get-gtt-order-details/
- Current-day trades: https://upstox.com/developer/api-documentation/get-trade-history/

## Implementation

**`adaptiveUpstoxAuthorizedGetCapture.ts`** is an explicitly separate adapter, not imported by the server routing, background scheduler, trading engine or UI. A native transport is available only to the manually invoked CLI and its small fixed HTTPS allowlist:

| Step | Exact GET URL | Why |
|---|---|---|
| 1 | `https://api.upstox.com/v2/user/profile` | Compare account-scoped UCC and supported `D`/SL capabilities with separately supplied operator metadata |
| 2 | `https://api.upstox.com/v2/portfolio/short-term-positions` | Current positions |
| 3 | `https://api.upstox.com/v2/order/retrieve-all` | Current-day native orders |
| 4 | `https://api.upstox.com/v3/order/gtt` | Unfiltered current GTT rules, **not** completed history |
| 5 | `https://api.upstox.com/v2/order/trades/get-trades-for-day` | Current-day trade fills |

No user-configurable URLs, queries or HTTP method. The native transport always uses **GET**, disables redirect following, refuses redirected and changed-final-URL responses, requests JSON, disables HTTP cache, limits the timeout to 500–15000 ms, **does not retry**, and limits decoded body content to **90 KB per GET**. Failed HTTP/403/429, HTML, malformed JSON/UTF-8, incomplete `status:success` envelopes, unexpected final origin, oversized response or unsafe profile UCC **fail closed**. The operator must explicitly assert account-owner GET approval, registered static-IP egress, and Analytics Token kind before any request; these are **operator assertions, not independent proof**. Tokens are only passed in Authorization Bearer header, never URL/query/log/file/output.

The profile is fetched **first**. If its UCC differs from separately expected `expected.accountScopeId`, its `broker` is not `UPSTOX`, account inactive, no `D` product or no `SL`/`SL-M` order entitlement, the collector stops **before positions/orders/GTT/trades**. A profile match proves only that the returned profile claims the same UCC while using that token; it does **not** prove independent beneficial ownership, API app permission, native stop installation, or exchange execution.

Success produces a **private archive** with original *decoded* HTTP response body bytes in base64, SHA-256 checksums, and an `OfflineUpstoxLifecycleFrame` compatible with Phase27/Phase28. Decoded body bytes are **not raw TLS packet/wire bytes**, and Upstox does not sign the archived blob. The collector also calls Phase26's structural audit and retains a blocked result as private evidence for incident review; **no audit result authorizes trade execution**.

**`adaptiveUpstoxPrivateEvidenceArchive.ts`** provides a hardened on-disk sink: the parent directory must already exist, be owned by the local process and have private mode `0700` (no public/group permissions, no symlink); each capture creates an unpredictable new `0700` child, writes an exclusive `0600` JSON file, and flushes file + directory using fsync. No path or full account ID is printed. A failed/partial archive must be quarantined or cleaned by the operator; the module does **not** claim independent immutable/WORM retention or encrypted-at-rest storage.

The same module also **strengthens the Phase28 CLI**: after independently re-verifying Phase28 two pinned Ed25519 signatures and Phase27 chronological audit, it atomically claims a one-use account+nonce hash using `O_EXCL` inside a separate private `0700` nonce registry. Reusing that account/challenge in the **same durable registry** fails. The registry must remain retained, protected and backed up by the authorized operator; resetting/replacing the directory defeats local replay protection. This is **not a globally distributed nonce service, signed trusted timestamp, broker-authenticated witness, or independent signer registry**.

## Explicit local opt-in; not automatically running

Only an account owner or suitably authorized person should run this on an approved static-IP egress host, after external token controls, legal/compliance/privacy approvals and separate project safety/security review. **Never paste a real token, raw UCC, position book, private order/trade IDs or capture files into chat, issues, PRs, CI logs or source control.**

Create an existing owner-private absolute directory:

```bash
install -d -m 700 /private/approved-upstox-audit-captures
```

Ensure `/private/expected-position.json` contains the Phase25 `ReadOnlyExpectedPosition` shape with independently approved actual Upstox UCC as `accountScopeId`, and separately lock a `ReadOnlyNrmlAuditPolicy`. A single collector invocation:

```bash
# Provision UPSTOX_ANALYTICS_READONLY_TOKEN securely out of band first.
# Do not include token in shell history, command arguments or git files.
npx tsx scripts/capture-adaptive-upstox-authorized-get.ts \
  --approve-get-only \
  --confirm-whitelisted-static-ip \
  --expected /private/expected-position.json \
  --policy /private/locked-position-risk-policy.json \
  --private-parent /private/approved-upstox-audit-captures \
  --sequence 1
```

The command is only present as a deliberately separate **manual CLI**, not integrated into the app or trading runner. No operator token or static-IP proof was available to run it here. Its output includes only redacted status, SHA-256 digests, counts and safe issue codes; the actual body/UCC and trade/order IDs stay in the private `0600` archive. A capture that is collected but **structurally blocked** is persisted for investigation but yields a nonzero CLI exit code. A successful CLI exit indicates **five GET payloads collected and structurally consistent but still UNVERIFIED**, not native stop safety.

Once 2–64 complete frames have been collected, an authorized independent reviewer may assemble them into Phase27/28's offline witness package, obtain **independently pinned** capturer and reviewer signatures, and use the strengthened CLI. A private, durable replay registry is now mandatory:

```bash
install -d -m 700 /private/phase28-nonce-registry

npx tsx scripts/audit-adaptive-upstox-dual-witness.ts \
  /private/signed-lifecycle-witness.json \
  --policy /private/locked-position-risk-policy.json \
  --external-trust /private/independent-pinned-reviewer-keys.json \
  --nonce-registry-dir /private/phase28-nonce-registry
```

A signed witness can only claim a challenge once per registry. No private signing keys are generated/stored in the application. Keep nonce registry and capture archives out of this repository and ensure access-controlled retention, backup and incident-review procedures.

## What Phase29 does **not** establish

- **No actual broker API call was run by the developer or CI**; only mocked network tests. Real token access, static-IP whitelist enforcement, API permissions, account ownership and error rates are **not yet independently tested**. The explicit collector is a *prepared capability* for a separately authorized operator, not a working authenticated integration demonstrated in this PR.
- Node `fetch` + HTTPS gives conventional transport security if appropriately configured and deployed, **not cryptographically broker-signed responses**, independent request-header provenance, exchange order ACK, guaranteed GTT conversion, official expired-contract calendar, order survival across closing/overnight sessions or absolute account ownership.
- The complete 1–8 week NRML lifecycle cannot be independently proven from current-day order/trade GETs. Existing Phase27 overnight fail-closed blocker is preserved. No permissions to place, modify, cancel, restore or square off NRML orders.
- No licensed original historical NIFTY/BANKNIFTY/SENSEX option L1 source, matched historical cost/slippage analysis, independently preregistered OOS profitability validation, or release/operator signoff.
- No public API route, OAuth token exchange, broker credential persistence, webhooks, server job, automated polling, production activation, native stop repair, or actual positional NRML order management is added.
- The legacy **EMA23/50 intraday MIS 15:15 square-off stays unchanged**; positional NRML does **not** inherit it.
- The feature is stacked as a **DRAFT** on Phase28 Draft PR #33; earlier PRs remain DRAFT/unmerged. Outstanding issues **#17–#22 remain open**.

## Unchanging safety flags

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
nativeOrderInstruction=null
```

**Phase30 candidate:** independent static-IP and token provenance attestation, signed/WORM operator archive and session-spanning broker order-history state machine, formal security review and shadow-only live read authorization. Only after independently verified option market data, OOS risk, native stop operating behavior and explicit signoff may any later PR even propose a separate NRML execution engine.
