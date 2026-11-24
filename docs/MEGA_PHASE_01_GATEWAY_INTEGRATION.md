# Mega Phase 01 — consolidated gateway preparation and integration

Checkpoint: 2026-11-25 IST. Main base d6ea6154f038c1635cc2eab89e665b1e7dd9faef. #148, #149 and #150 merged after both exact-head workflows passed. #151 passed both workflows on 53fffe9fd12fb942262c01449bd84523c5d735a0 but GitHub rejected merge (HTTP 405 conflicts); the changed-file comparison showed overlap only in the three canonical documents. Carry all seven changed/new source and test files plus its detailed report onto the latest main, reconcile documentation, and retest as one replacement integration PR. Do not claim #151 merged or close it before replacement acceptance.

| Task IDs | Implemented in this combined batch | Remaining boundary |
|---|---|---|
| P01-03/04/08/09/10/14/15 | Carry #151 verified login/MFA/JWT and administrator write-readback changes | Browser token lifecycle, hosted auth and concurrent mutation checks |
| P01-13/16/17/19/20/21/25 | Unified internal preparation function, binds account, owner, session, complete portfolio and fresh budget; durable intent and reservation in a single SQLite immediate transaction; rollback on any child rejection | Authenticated broker snapshot assembly, proposed-order risk, true gateway caller/dispatch integration |
| P01-23/24/26/35 | Immutable intent reconciliation, monotonic order evidence, retain all capital even after terminal no-fill; no implicit retry | Independent account/position/open-order evidence, safe capital release and live rollback integration |
| P01-27/28/29/36/37/38/39/40 | Reopen-safe ledgers, owner-scoped bounded recovery, explicit orphan review, durable drawdown prerequisite and sticky halt | Existing active execution controller and actual equity/Greek provenance, session fence for equity, authorized reset |
| P01-47/49/50 | New transaction, fault injection, replay, cross-owner, terminal and restart fixtures | Combined CI and actual hosted acceptance |

The integrated entryPreparationJournal is an internal prerequisite with no broker dispatch, API route, runtime order authority or release authority. A PREPARED return does not certify projected risk, valid market order, product release, or account authentication. No live NRML/MIS safety gates loosened. No real broker or hosted changes. No automatic capital release or recovery trade. Authentication compatibility caveats from #151 preserved.

Current main coverage: 12 scoped merged, 38 partial, 0 untouched, no full phase acceptance. #150 advances P01-37 to partial; do not double-count prior task scope. New work advances existing tasks only. Require exact-head full CI and combined main validation. External #17–#22 still gate release.
