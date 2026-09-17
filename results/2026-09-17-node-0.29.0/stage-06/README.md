# Stage 06 — UUID and Structural Fail-Closed Validation

Status: **PASS**

Baseline:

- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Schema: `urn:cage:governance:v1:attestation-bundle`

## Local validation

Eight structural cases were tested.

A generic UUID bundle identifier was accepted.

The following invalid concrete evidence failed closed:

- missing parent
- future parent
- self parent
- duplicate parent
- unknown topology node
- non-v4 step UUID
- invalid parent UUID

## Production validation

Four representative structural-invalid requests were submitted:

- `MISSING_PARENT`
- `UNKNOWN_NODE`
- `INVALID_UUID`
- `INVALID_PARENT_IDS`

All four returned HTTP 422 with `CAGE_VALIDATION_FAILED`.

Every rejected bundle subsequently returned:

- bundle lookup: 404
- steps lookup: 404

Production persisted:

- 0 rejected bundles
- 0 rejected CERs

## Identity boundary

Bundle IDs may be generic UUIDs.

Concrete step IDs are strict RFC 4122 UUIDv4 identifiers.

Parent step identifiers are also validated strictly.

## Claim boundary

This stage validates structural fail-closed behavior.

It does not prove:

- execution truth
- CAGE producer authentication
- private stateHash preimages
- policy correctness
- safety
- legality
