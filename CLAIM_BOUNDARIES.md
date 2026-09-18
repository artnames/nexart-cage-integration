# NexArt ↔ Google CAGE Claim Boundaries

This document defines what the conformance evidence supports and what
must not be inferred from it.

## Validated claims

### Execution-evidence integrity

NexArt can cryptographically bind protected CAGE execution evidence into
Certified Execution Records (CERs).

Changes to protected evidence alter the expected cryptographic binding
and are detectable during verification.

The tested protected evidence includes:

- execution signals
- metadata
- `stateHash`
- causal parent references

### NexArt attestation authenticity

The tested NexArt Node attestations can be independently verified using
the public Ed25519 signing key advertised by the production Node.

The validation included:

- signing-key discovery
- key continuity
- certificate-hash reconstruction
- receipt-signature verification
- verification-envelope signature verification

### Execution identity protection

The tested implementation distinguishes between:

- an exact replay of an existing logical execution
- a conflicting mutation using the same logical execution identity

An exact replay returned the existing evidence.

A conflicting mutation was rejected.

The transport idempotency key is therefore not treated as the execution
identity itself.

### Causal execution structure

The tested implementation validates execution-graph properties including:

- parent references
- nearest recorded ancestor contraction
- traversal through unrecorded nodes
- convergent DAG branches
- repeated recorded nodes
- concrete execution-cycle rejection

### Terminal-path consistency

The tested implementation validates that the declared terminal path is
consistent with the execution evidence.

A conflicting terminal-path declaration was rejected.

### Production interoperability

An unchanged CBF execution bundle generated directly by the pinned
Google CAGE `provider_02` adapter was accepted by the production NexArt
Node.

That production execution produced:

- 4 persisted execution steps
- 4 CERs
- 4 unique certificate hashes
- 4/4 successful CER verifications

This validates production interoperability for the tested CBF path.

## Explicit non-claims

### `stateHash` private preimage

`stateHash` is treated as a producer-supplied opaque commitment.

NexArt validates the value's required representation and cryptographically
binds the supplied commitment into the resulting evidence.

NexArt does not possess the producer's private AgentState preimage and
does not independently recompute that private preimage.

Accordingly:

`stateHashVerification = not-performed`

is intentional and accurate.

### CAGE producer authentication

The tested CAGE evidence contract does not provide sufficient typed
producer-authentication material for NexArt to independently establish
cryptographic CAGE producer identity.

The conformance evidence therefore does not claim CAGE producer
authentication.

### Execution truth

Cryptographic integrity demonstrates that protected accepted evidence
has not changed under the tested integrity model.

It does not independently prove that every producer-supplied statement
was true when originally created.

### Policy correctness

Evidence that a governance or policy decision was recorded does not prove
that the underlying policy was correct.

### Model correctness

The evidence layer does not establish that an AI model's reasoning,
prediction or output was correct.

### Safety

Execution-evidence integrity is not a safety certification.

### Legal or regulatory compliance

This conformance result is not a legal or regulatory compliance
certification.

## Evidence versus observability

Logs, traces and telemetry help operators understand system behaviour.

NexArt serves a different function in this integration.

The validated capability is an execution-evidence layer providing:

- cryptographic integrity
- attestation
- stable evidence identities
- tamper detection
- independent verification

Observability data may contribute evidence.

Observability itself is not equivalent to independently verifiable
execution evidence.

## Stage 11 HITL validation does not expand claims

The successful Stage 11 CAGE HITL validation does not expand NexArt claims beyond the established evidence boundary.

It demonstrates:

- interoperability of the captured current CAGE `provider_02` HITL evidence with NexArt;
- deterministic CER construction;
- preservation of concrete execution evidence;
- cryptographic integrity of the resulting CERs;
- Node attestation under Ed25519 key `k1`;
- independent verification of the persisted CERs and Node signatures.

It does not establish:

- truthfulness of the underlying execution;
- independent verification of the private CAGE AgentState preimage;
- CAGE producer authentication;
- completeness of every possible topology edge;
- policy correctness;
- system safety;
- legal or regulatory compliance.

`stateHash` remains a producer-supplied opaque commitment. NexArt preserves and certificate-binds it, while `stateHashVerification` remains `not-performed`.

Static `parentEdges` represents possible legal parent relationships. Acceptance of a concrete `parentStepIds` subset must not be interpreted as proof of graph completeness.
