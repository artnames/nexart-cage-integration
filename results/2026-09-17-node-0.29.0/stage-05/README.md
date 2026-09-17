# Stage 05 — Terminal Path Semantics and Precedence

Status: **PASS**

Baseline:

- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Schema: `urn:cage:governance:v1:attestation-bundle`

## Purpose

This stage validates CAGE terminal-path semantics and precedence.

The declared terminal path is not accepted merely as producer metadata.
It must agree with the execution evidence and supplied topology.

## Locally validated terminal classes

The following terminal classes were validated:

- `happy_path`
- `cbf_block`
- `loop_breaker`
- `nemo_block`

The local suite also validated the configured precedence rules:

1. reaching the configured terminal node wins
2. CBF block takes precedence over loop-breaker evidence
3. loop-breaker takes precedence over NeMo block evidence
4. an incorrect declared terminal path fails closed

Eight local cases passed.

## Production precedence validation

Production exercised the three precedence boundaries directly.

### Terminal node over CBF marker

A `happy_path` execution containing an injected CBF block marker was
accepted because the configured terminal node was reached.

### CBF over loop breaker

A valid `cbf_block` execution containing additional loop-breaker
metadata remained classified as `cbf_block`.

### Loop breaker over NeMo

A valid `loop_breaker` execution containing a NeMo block marker remained
classified as `loop_breaker`.

Production persisted:

- 3 bundles
- 13 CERs
- 13 unique certificate hashes

All 13 CERs were read back and independently verified.

## Terminal mismatch rejection

A bundle declaring `happy_path` while the execution evidence derived
`cbf_block` was rejected with:

- HTTP 422
- `CAGE_VALIDATION_FAILED`
- `TERMINAL_PATH_MISMATCH`

After rejection:

- bundle read returned 404
- steps read returned 404

The invalid semantic claim was not persisted.

## Harness recovery note

The initial Stage 5B harness successfully submitted the first positive
production bundle but then read the authenticated bundle response using
the wrong wrapper path.

The API returns the persisted bundle inside `response.bundle`.

The failure was therefore a harness defect, not a production failure.

The successful first request was not replayed.

A recovery harness:

1. verified the existing bundle read-only
2. verified all four CERs
3. confirmed the remaining three bundle IDs were absent
4. executed only the three outstanding authorized requests

The final production result is PASS.

## Claim boundary

This stage validates terminal-path evidence semantics and certificate
integrity.

It does not prove:

- execution truth
- CAGE producer authentication
- private stateHash preimages
- policy correctness
- safety
- legality
