# Stage 08 — CER Hash, Signature and Tamper Validation

Status: **PASS**

Baseline:

- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Evidence source: frozen Stage 7 production CERs

## Independent CER integrity

Four persisted CAGE CERs were independently reconstructed and hashed using
the protected CAGE projection and JCS-compatible SHA-256 canonical hashing.

Results:

- certificate hashes: 4/4 PASS
- SDK CER verification: 4/4 PASS
- unique certificate hashes: 4

## Node attestation authenticity

Public signing-key discovery was performed using:

`/.well-known/nexart-node.json`

All evidence used signing kid `k1`.

Results:

- receipt Ed25519 signatures: 4/4 PASS
- verification-envelope Ed25519 signatures: 4/4 PASS

## Tamper controls

Each CER was independently modified in four protected areas:

- signals
- metadata
- stateHash
- parentStepIds

Total negative controls:

- 16 attempted
- 16 detected

For each mutation:

- the independently recomputed certificate hash changed
- SDK verification returned certificate-hash mismatch
- the original receipt signature remained cryptographically valid over the
  unchanged receipt
- receipt-to-mutated-evidence binding failed
- the verification-envelope signature failed against the modified protected
  projection

This distinction is intentional: a receipt signs the certificate hash, while
the verification envelope directly signs the protected CAGE projection.

## Final verification

After all negative controls, all four original CERs were verified again.

Result: 4/4 PASS.

## Claim boundary

This stage proves cryptographic integrity and NexArt Node attestation
authenticity for the captured evidence.

It does not prove:

- the private preimage represented by stateHash
- CAGE producer authentication
- execution truth
- policy correctness
- safety
- legality
