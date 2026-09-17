# Stage 09 — Real Google CAGE provider_02 Interoperability

Status: **PASS**

## Baseline

Google CAGE:

- repository: `google/cybernetic-agent-governance-engine`
- commit: `8162958ac23d958871fd4016f349a7062627fd4d`
- adapter: `src/integrations/provider_02/adapter.py`

NexArt:

- `@nexart/governed-execution`: `0.4.0`
- Canonical Node: `0.29.0`

## Stage 09A — Real adapter generation

The evidence fixtures were generated directly by the pinned Google CAGE
`provider_02` adapter.

They were not hand-authored by NexArt.

### CBF execution

The adapter generated:

- `nemo_guardrail`
- `evaluator`
- `safety_check`
- `explainer`

Terminal classification:

`cbf_block`

Local NexArt result:

- validation: PASS
- CERs sealed: 4
- CERs verified: 4/4
- unique certificate hashes: 4

This exact fixture became the Stage 09B production candidate.

### HITL execution

The real adapter-generated HITL bundle was rejected unchanged.

Two upstream compatibility gaps were confirmed.

#### HITL stateHash omitted

The synthetic `hitl_interrupt` step carries an empty `stateHash`.

NexArt result:

`INVALID_STATE_HASH`

#### Synthetic HITL node absent from topology

The adapter emits `hitl_interrupt`, but the supplied finance topology does
not declare that node.

After diagnostically repairing only the stateHash syntax on a derivative
copy, NexArt additionally exposed:

- `UNKNOWN_NODE`
- `ILLEGAL_EXECUTED_EDGE`

The diagnostic derivative is not CAGE-authored evidence and was never
eligible for production submission.

A further causal observation showed that the subsequent
`governed_trader` step does not reference the synthetic HITL step in
`parentStepIds`.

NexArt validation was not weakened to accommodate these conditions.

## Stage 09B — Production interoperability

Exactly one production POST was authorized.

Frozen fixture SHA-256:

`698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9`

Bundle:

`613702d8-fdc0-40bc-9723-c21111c216db`

Preflight:

- bundle lookup: HTTP 404

Production submission:

- HTTP 201
- `replayed=false`
- `terminalPath=cbf_block`
- 4 records

Authenticated read-back:

- persisted bundle: PASS
- terminal path preserved: PASS
- 4 persisted steps
- 4/4 CERs verified
- 4 unique certificate hashes

The production certificate hashes matched the CER hashes produced locally
from the same frozen CAGE evidence.

## Result

This stage demonstrates production interoperability between unchanged
Google CAGE `provider_02` CBF execution evidence and NexArt's verifiable
execution infrastructure.

The HITL path remains an upstream CAGE compatibility issue and was not
submitted to production.

## Claim boundary

This stage does not claim:

- verification of the private `stateHash` preimage
- CAGE producer authentication
- execution truth
- policy correctness
- safety
- legality
