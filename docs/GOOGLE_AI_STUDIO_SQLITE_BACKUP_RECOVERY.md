# Google AI Studio: SQLite snapshot and recovery runbook

**Scope:** operator-invoked backup tooling only. This does not create persistent Cloud Run storage, deploy the platform, certify recovery of real accounts, or authorize LIVE NRML orders. Continue using the existing Google AI Studio workflow; no hosting migration is prescribed.

## Storage boundary

The normal app currently opens `option_platform.sqlite` under its working directory; the isolated paper-staging mode instead requires an explicit mounted `PAPER_STAGING_DB_DIR`. A container-local filesystem is not a durable account ledger across replacement, scaling, redeployment, or shutdown. A local snapshot is not off-site storage. Do not mount SQLite WAL on a filesystem without verified compatible locking and persistence semantics. Do not run multiple independent trading instances against separate copies of the ledger.

Before production account-state use, the owner must approve a durable storage architecture, access controls, backup custody, database migration and recovery test. Google AI Studio deployment must be verified in the actual hosting project. No secret values or customer data should appear in GitHub, support chats, CI logs or test fixtures.

## Snapshot command (Node 22, installed dependencies)

Use an explicitly selected existing database, and a separately provisioned private, writable backup directory. The destination must be a new absolute filename ending in .sqlite. On POSIX, the destination directory must not be group/world accessible. Do not reuse a destination; create a separate filename each time.

```sh
node scripts/backup_sqlite_verified.mjs \
  --source /absolute/path/option_platform.sqlite \
  --destination /private/backup/option-platform-20261124.sqlite
```

The command opens the source read-only, takes a SQLite online backup (committed WAL content included), runs integrity_check and checks required platform tables, hashes the finished file, and publishes without overwrite. It does not place orders or start the app. A successful report includes SHA-256 and byte count; remote durability and live-trading authorization remain false.

Store the snapshot and expected digest in approved encrypted storage outside the repository and runtime instance. Restrict access because the database may contain user identities, credential hashes and trading records. Do not log or upload its contents. Backups contain database state only; runtime environment secrets, external broker state and other resources are not backed up by this command. Confirm retention, encryption, independent storage and retrieval.

## Restore rehearsal (isolated PRACTICE only)

1. Keep the existing deployment and broker orders untouched. Use a separate disposable isolated practice workspace with no broker credentials and a distinct data directory.
2. Obtain a verified copy of the snapshot from authorized storage; confirm SHA-256 against the independently recorded expected digest. Retain the original snapshot read-only.
3. Stop the isolated application before copying files. Never replace a running database or mix WAL/SHM sidecars from another generation. Start with a fresh empty target directory and copy the verified snapshot to the expected database name, preserving restrictive permissions.
4. Start the practice app on the matching reviewed source and verify schema migrations, roles, account isolation, balances, positions, trade ledger and restart behavior. Use synthetic/test records when possible. Existing environment-managed bootstrap credentials remain authoritative.
5. Reconcile the restored database against separately authorized account/broker records before considering any production recovery. No automatic resubmission or order restoration is permitted; unknown broker state requires manual reconciliation.
6. Record the tested source revision, snapshot digest, restore time, results and recovery limitations. Obtain operator approval before any actual production restore.

Never restore onto a live database automatically, delete historical state, or use a storage snapshot as proof of external fills, GTT protection, or trading profitability. Issues #17–#22 remain open until the required independent evidence and operator approvals exist.

## Acceptance evidence

Automated synthetic tests cover committed WAL content, snapshot integrity/checksum, unchanged source, destination no-overwrite, missing source, non-platform schema, existing sidecars and unsafe paths. A local CI result is not actual cloud persistence or encrypted remote backup acceptance. The operator must still demonstrate the selected hosted storage surviving a replacement and a recovery rehearsal.
