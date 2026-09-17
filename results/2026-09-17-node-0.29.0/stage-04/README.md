# Stage 04 — Static Topology Cycles vs Concrete Execution Cycles

Status: **PASS**

Baseline:

- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Schema: `urn:cage:governance:v1:attestation-bundle`

## Purpose

This stage validates the distinction between a static workflow topology
and an actual concrete execution graph.

A static topology may contain cycles or self-edges because topology
describes possible control flow.

A concrete execution record must remain causally valid.

## Positive cases

Two production bundles were accepted:

1. static self-edge topology
2. static mutual-cycle topology

Both concrete executions remained acyclic.

Production created:

- 2 bundles
- 8 CERs
- 8 unique certificate hashes

All CERs were read back and independently verified.

## Negative cases

Two invalid requests were submitted:

1. concrete causal cycle
2. unresolvable all-unrecorded contraction cycle

Both were rejected with HTTP 422 and
`CAGE_VALIDATION_FAILED`.

The concrete execution cycle included:

- `FUTURE_PARENT`
- `TIMESTAMP_INVERSION`
- `CAUSAL_CYCLE`

The contraction-cycle case included:

- `UNRESOLVABLE_CONTRACTION_CYCLE`
- `ILLEGAL_EXECUTED_EDGE`

After each rejection:

- bundle read returned 404
- steps read returned 404

No rejected execution was persisted.

## Security significance

NexArt does not reject a workflow merely because its possible topology
contains loops.

Instead, validation is applied to the concrete execution evidence.

This preserves valid agent/workflow loop structures while failing
closed when the recorded execution itself violates causal integrity.

## Claim boundary

This stage validates structural and causal evidence integrity.

It does not prove:

- execution truth
- CAGE producer authentication
- private stateHash preimages
- policy correctness
- safety
- legality
