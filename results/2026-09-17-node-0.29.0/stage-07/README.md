# Stage 07 — Replay and Mutation Protection

Status: **PASS**

Baseline:

- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Schema: `urn:cage:governance:v1:attestation-bundle`

## Purpose

This stage validates deterministic replay and conflicting-content
protection for a single CAGE execution identity.

## Fresh registration

A previously unused bundle identity was submitted.

Result:

- HTTP 201
- `replayed=false`
- 4 persisted CERs
- 4 unique certificate hashes

## Exact replay

The exact same request bytes were submitted again using a different
`X-Idempotency-Key`.

Result:

- HTTP 200
- `replayed=true`
- complete four-record manifest returned
- no new CER set created
- all persisted certificate hashes unchanged
- persisted CER content unchanged

This demonstrates that CAGE identity/content determinism is not derived
from the retry header.

## Mutation attempt

The same CAGE identity was submitted again with one native protected
value changed:

`bundle.steps[3].stateHash`

The mutated request remained structurally valid, ensuring the request
reached the identity/content mutation guard rather than failing schema or
structural validation first.

Result:

- HTTP 409
- `EXECUTION_MUTATION_DETECTED`
- mutated value not persisted

## Final immutability read-back

After the rejected mutation:

- the original four CERs remained present
- all four certificate hashes remained unchanged
- CER content remained unchanged
- the original stateHash remained persisted
- the mutated stateHash was absent

## Claim boundary

`stateHash` is treated as a producer-supplied opaque commitment.

This stage does not claim:

- knowledge or verification of the private stateHash preimage
- CAGE producer authentication
- execution truth
- policy correctness
- safety
- legality
