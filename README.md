# NexArt × CAGE

Reference integration and reproducible validation for using NexArt as `provider_02` with native execution schemas from the Cybernetic Agent Governance Engine (CAGE).

This repository demonstrates how native CAGE execution evidence can be turned into cryptographically verifiable execution evidence using NexArt.

It is an integration and validation repository. It is not a fork of CAGE, does not modify CAGE governance semantics, and does not imply endorsement by Google or the upstream CAGE maintainers.

## Architecture

CAGE remains responsible for:

- governance execution
- policy and control decisions
- workflow semantics
- execution topology
- terminal-path classification
- the execution data supplied to the evidence provider

NexArt is responsible for:

- validating the supported native CAGE evidence contract
- producing one Certified Execution Record (CER) per executed step
- preserving `parentStepIds`
- cryptographically binding protected execution evidence
- Node attestation
- immutable execution identity and mutation detection
- persisted executed-step relationships
- independent verification

```text
CAGE
  |
  | AttestationBundle + GraphTopology
  v
@nexart/governed-execution/cage
  |
  | native validation
  v
NexArt Node
  |
  +-- one CER per executed step
  +-- parentStepIds preserved
  +-- execution identity protected
  +-- Ed25519 Node attestation
  +-- DAG persistence and queries
  |
  v
Independent verification
JCS + SHA-256 + Ed25519
```

## Native CAGE contract

The validated native schemas are:

```text
urn:cage:governance:v1:step-entry
urn:cage:governance:v1:attestation-bundle
urn:cage:governance:v1:graph-topology
```

The NexArt CER family used for native CAGE step evidence is:

```text
cer.governed.execution.step.v1
version: "1"
```

Validated SDK:

```text
@nexart/governed-execution@0.3.0
```

## CER integrity model

Each executed CAGE step produces one CER.

The certificate hash protects this seven-field projection:

```json
{
  "bundleType": "...",
  "version": "...",
  "schema": {},
  "bundleId": "...",
  "threadId": "...",
  "step": {},
  "protectedSet": {}
}
```

The projection is canonicalized using JCS and hashed with SHA-256.

The NexArt Node separately signs an attestation envelope using Ed25519.

This separates certificate integrity from Node attestation authenticity and allows both to be independently verified.

## Production validation

Five native CAGE execution scenarios were exercised against the production NexArt Node:

```text
4-step happy path
3-step CBF block
6-step loop-breaker execution
3-step NeMo block
22-step branching/merging DAG
```

These produced 38 baseline CERs.

Additional focused validation covered fail-closed input handling, schema dispatch, replay, mutation protection, tamper detection, selective publication, producer-side privacy commitments, independent cryptographic verification and a minimal integration from zero.

Validated properties include:

- 38/38 baseline CER certificate hashes verified
- executed-step parent relationships preserved
- repeated `nodeName` values represented as distinct executed step instances
- parents, children, ancestors, descendants and path queries
- 22-step branching and merging DAG persistence
- malformed native CAGE executions rejected fail-closed
- duplicate step IDs rejected
- missing parents rejected
- self-parent relationships rejected
- executed cycles rejected
- malformed `stateHash` values rejected
- unsupported CAGE schema versions rejected explicitly
- exact replay returned the original CER identities
- schema-valid mutation returned `409 EXECUTION_MUTATION_DETECTED`
- protected-content tampering produced `CERTIFICATE_HASH_MISMATCH`
- records remained hidden by default
- selective publication did not expose hidden sibling CERs
- producer-side HMAC commitments were demonstrated for sensitive values
- SHA-256 certificate integrity was independently reproduced
- Ed25519 Node signatures were independently verified
- altered payloads, signatures and unrelated signing keys failed independent verification

Curated machine-readable summaries of the recorded validation are retained under [`results/`](./results/). They describe the original acceptance run; the artifact manifest binds the current repository files.

## Independent verification

Verification does not require trusting the NexArt SDK verifier or Node-provided verification flags.

A third party can independently:

1. reconstruct the protected CAGE certificate projection;
2. JCS-canonicalize it;
3. compute SHA-256;
4. compare it with the published certificate hash;
5. resolve the Node signing key by `kid`;
6. reconstruct the signed verification envelope; and
7. verify the Ed25519 signature.

The NexArt Node publishes its public signing keys at:

```text
https://node.nexart.io/.well-known/nexart-node.json
```

See [`VERIFICATION.md`](./VERIFICATION.md) for the verification model and [`tests/independent-crypto.mjs`](./tests/independent-crypto.mjs) for an implementation using standard Node cryptography.

## What the evidence proves

The validated evidence supports verification of:

- cryptographic integrity of the protected CER
- binding of protected CAGE step evidence
- NexArt Node attestation authenticity
- preserved executed-step parent relationships
- mutation detection for an existing execution identity

## What the evidence does not prove

NexArt does not independently establish:

- execution truth
- correctness of a `stateHash` preimage
- completeness of producer-supplied execution history
- policy correctness
- model correctness
- safety
- legal or regulatory compliance

A CER proves the integrity and attestation of the evidence that was captured. It does not turn an unverified source claim into a verified fact.

## Privacy

Native CAGE evidence does not automatically redact arbitrary `signals` or `metadata`.

If evidence may become public, sensitive values should be omitted or transformed before certification.

The recorded privacy evidence and read-only validation harness demonstrate producer-side HMAC commitments. NexArt certifies the resulting commitments; it does not claim that native CAGE performed the privacy transformation.

See [`PRIVACY.md`](./PRIVACY.md).

## Minimal integration

Start with:

```text
examples/minimal-integration.mjs
```

The minimal flow is:

```text
AttestationBundle + GraphTopology
        |
        v
validateCageExecution()
        |
        v
POST /v1/cage/bundles
        |
        v
one CER per executed step
        |
        v
retrieve persisted execution graph
        |
        v
verify resulting CERs
```

See [`INTEGRATION.md`](./INTEGRATION.md) for the complete integration contract.

## Repository structure

```text
examples/     developer-facing integration example
tests/        reproducible validation harnesses
fixtures/     public and synthetic evidence fixtures
results/      recorded machine-readable validation evidence
references/   upstream design references
```

## Validation commands

Public read-only validation requires no credential:

```bash
npm run test:public
```

Authenticated baseline tests retrieve private recorded evidence and require `NEXART_API_KEY`. They do not create new evidence:

```bash
npm run test:integrity
npm run test:dag
npm run test:minimal-recorded
```

The minimal example and idempotency/mutation test submit evidence to the configured Node. Review [`SECURITY.md`](./SECURITY.md) before running them.

Generate and verify the repository artifact manifest with:

```bash
npm run manifest:generate
npm run manifest:check
```

## Upstream reference

The integration follows the CAGE native-schema handoff design in:

```text
google/cybernetic-agent-governance-engine
plans/provider_02_native_schema_handoff.md
```

Pinned upstream design commit used during integration:

```text
eb828d9deeb39d774959fdc5560798e463a50518
```

This repository is maintained by NexArt and does not imply endorsement by Google or the upstream CAGE maintainers.

## Security

Never commit a real NexArt API key.

Read [`SECURITY.md`](./SECURITY.md) before running authenticated examples or tests.
