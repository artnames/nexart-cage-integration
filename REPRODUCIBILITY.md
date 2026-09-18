# NexArt ↔ Google CAGE Reproducibility

This document describes how to review and reproduce the local portions of the NexArt × Google CAGE conformance evidence.

Historical production-writing tests must not be blindly rerun.

## Frozen baseline

Google CAGE:

- repository: `google/cybernetic-agent-governance-engine`
- commit: `8162958ac23d958871fd4016f349a7062627fd4d`
- integration boundary: `provider_02`

NexArt:

- Canonical Node baseline: `0.29.0`
- `@nexart/governed-execution`: `0.4.0`

Stage 09 CAGE runtime:

- Python `3.11.15`

## Dependency baseline

The current repository dependency is `@nexart/governed-execution@0.4.1`.

Install current dependencies with `npm ci`.

Confirm the SDK pin with `npm ls @nexart/governed-execution`.

The frozen Stage 01 through Stage 10 evidence under `results/2026-09-17-node-0.29.0/` was generated against `@nexart/governed-execution@0.4.0` and remains unchanged as historical evidence.

## Frozen evidence

The validated evidence set is stored under:

`results/2026-09-17-node-0.29.0/`

Each completed stage contains a frozen summary and artifact evidence.

## Stage 08 cryptographic verification

Stage 08 validates frozen evidence independently, including certificate hashes, receipt signatures, verification-envelope signatures and protected-field tamper detection.

Stage 08 performs no production writes.

Frozen package:

`results/2026-09-17-node-0.29.0/stage-08/`

## Stage 09 real CAGE adapter evidence

Stage 09 generated evidence using the real pinned CAGE `provider_02` adapter.

Accepted production fixture:

`results/2026-09-17-node-0.29.0/stage-09/fixtures/01_real_adapter_cbf_block.json`

Fixture SHA-256:

`698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9`

Bundle ID:

`613702d8-fdc0-40bc-9723-c21111c216db`

## Important production restriction

The Stage 09B production authorization was consumed when the single production POST returned HTTP `201`.

Do not rerun the Stage 09B production POST as part of ordinary reproducibility.

Use the frozen production evidence under:

`results/2026-09-17-node-0.29.0/stage-09/production/`

## stateHash boundary

`stateHash` is producer-generated.

NexArt binds the supplied commitment into the CER but does not independently reconstruct the private AgentState preimage.

Expected result:

`stateHashVerification = not-performed`

## CAGE HITL evidence

The frozen HITL fixture is retained as negative evidence and must not be submitted to production in its current form.

See `UPSTREAM_CAGE_GAPS.md`.

## Secrets

Production credentials are not part of this repository.

Do not commit live NexArt credentials, private signing keys or environment files containing production secrets.

## Final evidence manifest

The final repository-level evidence manifest is:

`results/2026-09-17-node-0.29.0/conformance-evidence-manifest.json`

## Stage 11 current HITL remediation evidence

Stage 11 is the current positive HITL interoperability evidence.

Pinned inputs:

- CAGE repository: `google/cybernetic-agent-governance-engine`
- current validated commit: `fcb98bef0b5faea1afcc5a430148fe065b985ef4`
- HITL remediation commit: `a0fec6667f4cb21b87f22f2d22a9281064a5fa12`
- `@nexart/governed-execution`: `0.4.1`
- Canonical Node: `0.29.1`
- source artifact SHA-256: `d372c22782ef230bfd20f72b77bc3e89262d0fdd2d5a82a92974fb6979de1f41`

Evidence:

`results/2026-09-18-node-0.29.1/stage-11-hitl-production/`

The single authorized Stage 11 production POST has already been consumed and returned HTTP `201`.

Do not reproduce Stage 11 by submitting the bundle to production again.

Ordinary reproduction should use the stored source artifact, production responses, readbacks, final summary and artifact manifest. Local CER verification and Ed25519 verification may be repeated without making any production write.

Historical Stage 09 evidence remains intentionally unchanged and documents the behavior of the earlier CAGE / SDK / Node baseline.
