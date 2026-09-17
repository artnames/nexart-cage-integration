# Upstream Google CAGE Compatibility Findings

Tested repository:

`google/cybernetic-agent-governance-engine`

Tested commit:

`8162958ac23d958871fd4016f349a7062627fd4d`

Integration boundary:

`provider_02`

These findings are intentionally separated from NexArt conformance
behaviour.

NexArt remained fail-closed.

## 1. HITL synthetic step omits stateHash

The tested CAGE adapter emits a synthetic execution step named:

`hitl_interrupt`

The adapter-generated step contained:

`stateHash = ""`

The unchanged bundle was rejected by NexArt with:

`INVALID_STATE_HASH`

### Required upstream direction

If `hitl_interrupt` is represented as execution evidence, CAGE should
generate a valid producer-side state commitment following the same
evidence contract as other recorded execution steps.

NexArt should not manufacture a missing producer commitment.

## 2. Synthetic HITL node is absent from supplied topology

The adapter emits:

`hitl_interrupt`

but the supplied finance topology does not declare that node.

To isolate this separately from the empty `stateHash`, Stage 09 created
a diagnostic-only derivative in which only the invalid `stateHash`
syntax was replaced with a syntactically valid placeholder.

That diagnostic derivative was not treated as CAGE-authored evidence and
was never eligible for production submission.

Once the earlier schema error was isolated, NexArt reported:

- `UNKNOWN_NODE`
- `ILLEGAL_EXECUTED_EDGE`

### Required upstream direction

If the synthetic interruption is intended to exist as a node in the
execution graph, CAGE should represent it explicitly in the producer
topology.

Alternatively, CAGE should define a different typed representation for
the interruption.

NexArt should not silently extend or rewrite producer topology.

## 3. HITL causal-linkage observation

The real adapter-generated HITL execution also showed that the subsequent:

`governed_trader`

step did not reference the synthetic:

`hitl_interrupt`

step in `parentStepIds`.

This is recorded as an observed causal-model finding.

It is not independently classified here as a separate implementation
defect because the intended upstream HITL causal semantics must be
defined by CAGE.

### Required upstream direction

CAGE should explicitly define whether human approval or interruption is
part of the execution DAG.

If it is part of the DAG, the producer should emit the corresponding
causal relationship.

## 4. Producer authentication remains outside the tested contract

The tested `provider_02` evidence does not provide a complete typed
producer-authentication contract containing all elements needed for
independent signature verification.

NexArt therefore does not infer or invent:

- producer signature semantics
- producer signing-key identity
- signature algorithm
- signed preimage
- producer key manifest

CAGE producer authentication remains outside the validated claim set
until an interoperable producer-authentication contract is defined.

## Compatibility policy

These gaps originate in producer-side execution-evidence semantics.

They should be corrected in CAGE or in the agreed integration contract.

NexArt validation should not be weakened to make malformed or incomplete
producer evidence appear conformant.

## Current interoperability status

The tested CBF path is production-conformant.

The tested HITL path is not currently production-conformant.

The HITL fixture was not submitted to production.
