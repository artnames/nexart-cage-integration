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

Install dependencies with `npm ci`.

Confirm the SDK pin with `npm ls @nexart/governed-execution`.

Expected dependency: `@nexart/governed-execution@0.4.0`.

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
