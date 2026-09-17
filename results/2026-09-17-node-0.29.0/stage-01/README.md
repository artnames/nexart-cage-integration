# Stage 01 — Production Integrity and Signing-Key Continuity

Status: **PASS**

This stage established the production cryptographic baseline for the
NexArt Canonical Node used by the CAGE conformance programme.

Validated properties included:

- production Node discovery
- active signing-key discovery
- signing-key continuity
- Ed25519 attestation verification
- certificate binding
- negative cryptographic controls

Baseline:

- Canonical Node: `0.29.0`
- Node ID: `nexart-node-prod-1`
- active signing kid: `k1`

The authoritative machine-readable result is:

`stage-01-summary.json`

The original Stage 01 summary is preserved unchanged.

## Claim boundary

This stage validates NexArt-issued cryptographic evidence and Node
attestation authenticity.

It does not establish:

- truth of producer-supplied execution facts
- CAGE producer authentication
- policy correctness
- safety
- legality
