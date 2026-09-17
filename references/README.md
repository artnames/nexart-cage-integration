# References

This directory records the upstream CAGE design reference and the NexArt interfaces used by this integration.

## CAGE upstream

Repository:

```text
https://github.com/google/cybernetic-agent-governance-engine
```

Native schema handoff design:

```text
plans/provider_02_native_schema_handoff.md
```

Pinned upstream commit used during the NexArt integration work:

```text
eb828d9deeb39d774959fdc5560798e463a50518
```

The integration described in this repository was implemented against the native CAGE handoff model associated with that commit.

## NexArt SDK

Package:

```text
@nexart/governed-execution@0.3.0
```

Native CAGE helpers are exposed through:

```text
@nexart/governed-execution/cage
```

The supported native schemas are:

```text
urn:cage:governance:v1:step-entry
urn:cage:governance:v1:attestation-bundle
urn:cage:governance:v1:graph-topology
```

The native CAGE CER family is:

```text
cer.governed.execution.step.v1
version: "1"
```

## NexArt production Node

Production Node:

```text
https://node.nexart.io
```

Public discovery document:

```text
https://node.nexart.io/.well-known/nexart-node.json
```

The discovery document exposes the public verification keys used for Node attestation.

## Public verification

Public verifier:

```text
https://verify.nexart.io
```

Publicly published CERs can be independently checked for:

```text
certificate integrity
Node attestation authenticity
```

using JCS, SHA-256 and Ed25519 verification.

## Integration boundary

CAGE owns:

```text
governance execution
policy/control decisions
workflow semantics
execution topology
terminal-path classification
producer-supplied execution evidence
```

NexArt owns:

```text
supported native-schema validation
CER construction
certificate hashing
Node attestation
executed-step persistence
DAG queries
replay protection
mutation detection
independent verification
```

The distinction is intentional.

NexArt does not attempt to reproduce CAGE governance semantics inside the evidence provider.

## Verification boundary

The integration supports independent verification of:

```text
protected CER integrity
Node attestation authenticity
executed-step parent relationships
mutation protection
```

It does not independently establish:

```text
execution truth
stateHash preimage correctness
producer completeness
policy correctness
model correctness
safety
legal or regulatory compliance
```

## Upstream relationship

This repository is maintained by NexArt.

It is not an upstream CAGE repository.

It does not imply endorsement, partnership or sponsorship by Google or the upstream CAGE maintainers.
