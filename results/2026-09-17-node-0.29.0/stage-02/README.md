# Stage 02 — Canonical CAGE Production Conformance

Status: **PASS**

Validation baseline:

- Google CAGE commit:
  `8162958ac23d958871fd4016f349a7062627fd4d`
- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Native schema:
  `urn:cage:governance:v1:attestation-bundle`

## What was validated

Five byte-pinned Provider 02 canonical fixtures were validated
locally and submitted unchanged to the NexArt production Node.

Production accepted all five fixtures with HTTP 201 and persisted:

- 5 CAGE bundles
- 38 ordered execution steps
- 38 CAGE step CERs

Authenticated read-back subsequently retrieved all 38 persisted
CERs.

Each CER was independently verified using
`@nexart/governed-execution@0.4.0`.

The verification confirmed preservation and certificate binding of:

- `stepId`
- `nodeName`
- `parentStepIds`
- `stateHash`

All 38 certificate hashes were unique.

## Stage 02B harness finding

The initial production submission harness incorrectly expected the
CER at:

`body.records[i].cer`

The registration response is an issuance manifest and does not expose
the CER there.

The persisted CER is available through authenticated step read-back at:

`row.proof.proofJson`

This caused Stage 02B's local post-response verification to report
FAIL even though all five production ingestions and persistence checks
succeeded.

Stage 02C corrected the read path and independently verified all
38 persisted CERs.

The original Stage 02B evidence is intentionally retained rather than
rewritten.

## Claim boundary

This stage validates execution-evidence integrity and persistence.

It does not establish:

- truth of the underlying execution
- correctness of the `stateHash` private preimage
- CAGE producer authentication
- policy correctness
- governance approval
- safety or legality

`stateHash` is preserved and certificate-bound but its private preimage
is not independently verified.
