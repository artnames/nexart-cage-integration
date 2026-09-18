# NexArt ↔ Google CAGE Evidence Matrix

This matrix maps each validation stage to the property established by
the frozen evidence.

| Stage | Scope | Result |
|---|---|---|
| 00 | Inventory, versions and baseline selection | PASS |
| 01 | Production integrity and signing-key continuity | PASS |
| 02 | Five canonical CAGE fixtures | PASS |
| 03 | Ancestor contraction and DAG semantics | PASS |
| 04 | Static versus concrete cycle behaviour | PASS |
| 05 | Terminal-path semantics | PASS |
| 06 | Structural and UUID fail-closed validation | PASS |
| 07 | Replay and execution mutation | PASS |
| 08 | CER hash, signature and tamper validation | PASS |
| 09 | Real CAGE adapter production interoperability | PASS |
| 10 | Consolidation and conformance documentation | PASS |

## Stage 01 — Cryptographic production baseline

Established the production Node identity, active signing key and
independent Ed25519 verification baseline.

The original frozen Stage 01 summary remains unchanged.

## Stage 02 — Canonical execution fixtures

Five canonical CAGE execution scenarios were exercised.

Production result:

- 38 CERs verified
- 38 unique certificate hashes

The scenarios covered happy-path, CBF-block, loop-breaker, NeMo-block
and larger execution shapes.

## Stage 03 — DAG and ancestor contraction

Validated:

- nearest recorded ancestor contraction
- traversal through unrecorded nodes
- convergent DAG branches
- repeated recorded nodes
- causal parent preservation

Production result:

- 8 CERs verified
- 8 unique certificate hashes

## Stage 04 — Cycle semantics

Validated the distinction between:

- topology containing a static cycle
- a concrete execution containing a causal cycle

Static cycles were permitted where valid.

Concrete execution cycles were rejected.

Accepted production evidence produced:

- 8 verified CERs
- 8 unique certificate hashes

## Stage 05 — Terminal-path semantics

Validated terminal classification precedence and fail-closed mismatch
behaviour.

Production result:

- 13 verified CERs
- 13 unique certificate hashes

A bundle whose declared terminal path disagreed with the execution
evidence was rejected.

## Stage 06 — Structural fail-closed behaviour

Production negative controls included:

- missing parent
- unknown node
- invalid step UUID
- invalid parent UUID

All were rejected.

Rejected requests produced:

- 0 persisted bundles
- 0 persisted CERs

## Stage 07 — Replay and mutation

A fresh execution identity was registered once.

An exact replay with a different transport idempotency key returned the
existing evidence.

A changed execution using the same logical identity was rejected.

The original evidence remained unchanged.

Production evidence:

- 1 persisted bundle
- 4 CERs
- 4 unique certificate hashes

## Stage 08 — Independent cryptographic integrity

Validated:

- 4/4 independently recomputed CER hashes
- 4/4 SDK CER verifications
- 4/4 receipt Ed25519 signatures
- 4/4 verification-envelope Ed25519 signatures
- 16/16 protected-field tamper controls
- 4/4 final untouched CER re-verifications

Production writes:

- 0

## Stage 09 — Real CAGE adapter interoperability

The production candidate was generated directly by the pinned Google
CAGE `provider_02` adapter.

Frozen fixture:

`698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9`

Bundle:

`613702d8-fdc0-40bc-9723-c21111c216db`

Production result:

- preflight: HTTP `404`
- submission: HTTP `201`
- `replayed=false`
- `terminalPath=cbf_block`
- 4 persisted steps
- 4/4 CERs verified
- 4 unique certificate hashes

The unchanged CAGE HITL fixture was not submitted because Stage 09A
identified upstream evidence-contract incompatibilities.

## Stage 10 — Consolidation

Stage 10 performs no production calls.

Its purpose is to consolidate the frozen evidence into:

- conformance documentation
- explicit claim boundaries
- upstream compatibility findings
- reproducibility instructions
- repository-level evidence manifests

## Stage 11 - Current CAGE HITL remediation validation

Stage 11 validates the remediated current Google CAGE `provider_02` HITL path against `@nexart/governed-execution@0.4.1` and production Canonical Node `0.29.1`.

| Evidence | Result |
|---|---|
| Current CAGE commit `fcb98bef0b5faea1afcc5a430148fe065b985ef4` | PASS |
| HITL remediation commit `a0fec6667f4cb21b87f22f2d22a9281064a5fa12` | PASS |
| Exact source artifact SHA-256 preserved | PASS |
| HITL `stateHash` syntax accepted | PASS |
| `hitl_interrupt` present in topology and attestation nodes | PASS |
| `safety_check -> hitl_interrupt -> governed_trader` concrete causality | PASS |
| Possible-parent subset semantics | PASS |
| Local governed-execution `0.4.1` validation | PASS |
| Production Node `0.29.1` submission | HTTP 201 |
| New submission (`replayed=false`) | PASS |
| Persisted steps | 6/6 |
| Unique certificate hashes | 6/6 |
| Local-to-production deterministic certificate hashes | PASS |
| Source CAGE step preservation | 6/6 PASS |
| CER integrity verification | 6/6 PASS |
| Node receipt Ed25519 verification | 6/6 PASS |
| Verification-envelope Ed25519 verification | 6/6 PASS |
| Active signing key continuity (`k1`) | PASS |

Evidence directory:

`results/2026-09-18-node-0.29.1/stage-11-hitl-production/`

Final summary:

`results/2026-09-18-node-0.29.1/stage-11-hitl-production/stage-11-final-summary.json`

Artifact manifest:

`results/2026-09-18-node-0.29.1/stage-11-hitl-production/artifact-manifest.json`
