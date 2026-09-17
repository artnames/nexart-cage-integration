# Stage 03 — Ancestor Contraction, Repeated Nodes and Convergent DAGs

Status: **PASS**

Baseline:

- `@nexart/governed-execution`: `0.4.0`
- NexArt Canonical Node: `0.29.0`
- Schema: `urn:cage:governance:v1:attestation-bundle`

## Validated semantics

Three dedicated execution vectors were validated locally and against
the production NexArt Node.

### Ancestor contraction

A concrete execution recorded only `root` and `leaf`, while the static
topology contained two unrecorded intermediary nodes.

The concrete `leaf` parent was validated and persisted as `root`.

### Convergent multi-parent DAG

Two recorded roots traversed separate unrecorded topology branches and
converged at one recorded `join` step.

The persisted `join` retained both concrete root step IDs as parents.

### Repeated node occurrences

Three separate concrete execution steps shared the same `nodeName`.

Each occurrence retained a distinct UUIDv4 `stepId`, and the concrete
parent chain was preserved correctly.

This demonstrates that concrete execution identity is based on step
identity rather than node-name uniqueness.

## Production evidence

Production created:

- 3 CAGE bundles
- 8 step CERs
- 8 unique certificate hashes

All 8 CERs were read back and independently verified with
`@nexart/governed-execution@0.4.0`.

Four production DAG parent queries matched the expected concrete
relationships.

## Harness note

The first Stage 3B invocation did not execute because the harness file
was placed under `/tmp`, where Node ESM resolution could not locate the
repository dependency.

No JavaScript ran and no production POST occurred during that failed
attempt.

The identical harness source was then executed from the repository,
after which a fresh production existence preflight confirmed that all
three bundle IDs were absent before submission.

## Claim boundary

This stage validates structural execution-evidence semantics and
certificate integrity.

It does not prove execution truth, CAGE producer authentication,
private `stateHash` preimages, policy correctness, safety or legality.
