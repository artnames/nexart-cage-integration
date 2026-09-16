# Native CAGE Integration

This document describes the production integration between a native CAGE execution producer and NexArt.

## Responsibility boundary

CAGE owns:

- governance execution
- workflow semantics
- policy and control decisions
- terminal-path classification
- execution topology
- execution data supplied to the evidence provider

NexArt owns:

- validation of the supported native CAGE evidence contract
- construction of one Certified Execution Record (CER) per executed step
- certificate hashing
- preservation of executed-step parent relationships
- Node attestation
- immutable execution identity
- replay handling
- mutation detection
- DAG persistence and queries
- independent verification

The integration intentionally does not duplicate CAGE governance logic inside NexArt.

## Requirements

- Node.js 20 or later
- `@nexart/governed-execution@0.3.0`
- a NexArt API key for authenticated registration
- a native CAGE `AttestationBundle`
- optionally, a native CAGE `GraphTopology`

Install the SDK:

```bash
npm install @nexart/governed-execution@0.3.0
```

Set credentials locally:

```bash
export NEXART_API_KEY="..."
export NODE_URL="https://node.nexart.io"
```

Never commit a real API key.

## Supported native schemas

The integration accepts the native CAGE schema namespace:

```text
urn:cage:governance:v1:attestation-bundle
```

Related schemas are:

```text
urn:cage:governance:v1:step-entry
urn:cage:governance:v1:graph-topology
```

The native NexArt CER family is:

```text
cer.governed.execution.step.v1
version: "1"
```

## AttestationBundle semantics

An `AttestationBundle` contains:

```text
bundleId
threadId
steps[]
startedAt
completedAt
terminalPath
```

Each step contains:

```text
stepId
nodeName
parentStepIds
timestampUtc
durationMs
signals
metadata
stateHash
```

Important execution semantics:

- `stepId` identifies an executed step instance.
- `nodeName` identifies the logical CAGE node.
- `parentStepIds` contains executed parent step-instance IDs.
- repeated execution of the same logical node uses the same `nodeName` but a different `stepId`.
- loops are therefore represented as distinct executed step instances rather than cyclic step IDs.
- the observed execution itself must remain acyclic.

## GraphTopology semantics

`GraphTopology` describes the possible workflow graph.

It contains:

```text
nodes
parentEdges
terminalNode
interruptNode
attestationNodes
```

`interruptNode` and `attestationNodes` are optional.

The important distinction is:

```text
GraphTopology
    = possible workflow structure

AttestationBundle.steps
    = observed executed traversal
```

NexArt preserves that distinction.

## Validate before registration

Import the CAGE validation helpers:

```javascript
import {
  validateCageExecution
} from "@nexart/governed-execution/cage";
```

Validate the native bundle and topology:

```javascript
const validation =
  validateCageExecution(
    bundle,
    topology
  );

if (!validation.valid) {
  throw new Error(
    JSON.stringify(validation)
  );
}
```

The validator performs structural, causal and topology checks.

Examples of rejected evidence include:

- malformed step UUIDs
- malformed bundle UUIDs
- malformed `stateHash`
- duplicate step IDs
- missing parent step references
- self-parent relationships
- executed cycles
- invalid terminal paths
- topology references to unknown nodes
- executed nodes absent from the supplied topology

The integration fails closed rather than normalizing invalid evidence into a valid CER.

## Register a native CAGE execution

Endpoint:

```text
POST /v1/cage/bundles
```

Headers:

```text
Authorization: Bearer <NEXART_API_KEY>
Content-Type: application/json
```

Body:

```json
{
  "schema": "urn:cage:governance:v1:attestation-bundle",
  "bundle": {},
  "topology": {}
}
```

Example:

```javascript
const response =
  await fetch(
    "https://node.nexart.io/v1/cage/bundles",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${process.env.NEXART_API_KEY}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        schema:
          "urn:cage:governance:v1:attestation-bundle",

        bundle,
        topology
      })
    }
  );
```

For a fresh accepted execution, the Node returns HTTP `201`.

One CER is produced for each executed step.

A 4-step observed execution produces 4 CERs.

A 22-step observed execution produces 22 CERs.

## CER construction

Each executed step is represented using:

```text
cer.governed.execution.step.v1
```

The protected certificate projection is exactly:

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

The projection is:

1. canonicalized using JCS;
2. hashed using SHA-256; and
3. represented as:

```text
sha256:<hex>
```

Fields such as `startedAt`, `completedAt`, `terminalPath`, `stepIndex`, `createdAt` and parent certificate hashes are not inserted into the native step CER certificate projection.

The executed parent relationship is preserved through:

```text
step.parentStepIds
```

## Replay and mutation protection

Execution identity is bound to:

```text
authenticated tenant
+
schema namespace/version
+
bundleId
```

### Exact replay

Re-sending the same logical execution under the same identity returns the existing evidence:

```text
HTTP 200
replayed: true
```

The replay does not generate replacement CER identities for the execution.

### Mutation

A schema-valid request using the same execution identity but different evidence is rejected:

```text
HTTP 409
EXECUTION_MUTATION_DETECTED
```

This prevents evidence from being silently replaced under an already-used execution identity.

Use the same `bundleId` only for retries of the same logical execution.

Use a new `bundleId` for a different execution.

## Retrieve an execution

List CAGE bundles:

```text
GET /v1/cage/bundles
```

Retrieve one bundle:

```text
GET /v1/cage/bundles/:bundleId
```

Retrieve its executed steps:

```text
GET /v1/cage/bundles/:bundleId/steps
```

Retrieve one executed step:

```text
GET /v1/cage/bundles/:bundleId/steps/:stepId
```

## DAG relationship queries

Persisted executed-step relationships can be queried through:

```text
/steps/:stepId/parents
/steps/:stepId/children
/steps/:stepId/ancestors
/steps/:stepId/descendants
/path
```

These operate on executed step instances, not just logical `nodeName` values.

This matters for looped workflows where the same logical node may execute multiple times.

## Verify a returned CER

Import:

```javascript
import {
  verifyCageStepCer
} from "@nexart/governed-execution/cage";
```

Verify:

```javascript
const result =
  verifyCageStepCer(cer);

if (!result.ok) {
  throw new Error(
    result.code ||
    "CER verification failed"
  );
}
```

A successful verification establishes structural validity and certificate integrity for the protected CER.

The SDK deliberately preserves trust boundaries such as:

```text
stateHashVerification: not-performed
executionTruth: not-claimed
```

These are intentional.

NexArt does not independently verify the preimage that produced `stateHash`, nor does it claim that producer-supplied execution facts are true.

## Node attestation

The NexArt Node separately signs an attestation envelope using Ed25519.

This provides a second verification layer:

```text
CER certificate integrity
        +
Node attestation authenticity
```

A third party can independently verify both without relying on Node-provided verification booleans.

See [`VERIFICATION.md`](./VERIFICATION.md).

## Visibility

Native CAGE CERs are hidden by default.

A CER must be explicitly published before it can be resolved through the public verification surface.

Selective publication is supported.

Publishing one step CER does not automatically make sibling CERs public.

## Privacy

Native CAGE does not automatically redact arbitrary values placed in:

```text
signals
metadata
```

If evidence may become public, sensitive values should be:

- omitted;
- transformed before ingestion; or
- represented using an appropriate commitment mechanism.

See [`PRIVACY.md`](./PRIVACY.md).

## Minimal example

The developer-facing example is:

```text
examples/minimal-integration.mjs
```

Run it with:

```bash
npm run example:minimal
```

The example creates a fresh three-step production execution.

Because NexArt produces one CER per executed step, running the example consumes three certification units.

Review the source before running it against production.

## Trust boundary

This integration provides verifiable evidence integrity and Node attestation for the captured execution record.

It does not independently establish:

- execution truth
- completeness of producer-supplied history
- `stateHash` preimage correctness
- policy correctness
- model correctness
- safety
- legal or regulatory compliance
