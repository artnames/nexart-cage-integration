import crypto from "node:crypto";

import {
  validateCageExecution
} from "@nexart/governed-execution/cage";

const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const API_KEY =
  process.env.NEXART_API_KEY;

if (!API_KEY) {
  throw new Error(
    "NEXART_API_KEY is required for idempotency/mutation validation."
  );
}

const SCHEMA =
  "urn:cage:governance:v1:attestation-bundle";

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

function uuid() {
  return crypto.randomUUID();
}

function stateHash(
  value
) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function clone(
  value
) {
  return structuredClone(value);
}

function makeExecution() {
  const bundleId =
    uuid();

  const intakeId =
    uuid();

  const decisionId =
    uuid();

  const completeId =
    uuid();

  const base =
    Date.now();

  const bundle = {
    bundleId,

    threadId:
      `idempotency-${uuid()}`,

    steps: [
      {
        stepId:
          intakeId,

        nodeName:
          "intake",

        parentStepIds:
          [],

        timestampUtc:
          new Date(base)
            .toISOString(),

        durationMs:
          10,

        signals: {
          scenario:
            "idempotency-mutation"
        },

        metadata: {
          sequence:
            0
        },

        stateHash:
          stateHash(
            `state:${intakeId}`
          )
      },

      {
        stepId:
          decisionId,

        nodeName:
          "decision",

        parentStepIds: [
          intakeId
        ],

        timestampUtc:
          new Date(
            base + 1000
          ).toISOString(),

        durationMs:
          20,

        signals: {
          scenario:
            "idempotency-mutation"
        },

        metadata: {
          sequence:
            1
        },

        stateHash:
          stateHash(
            `state:${decisionId}`
          )
      },

      {
        stepId:
          completeId,

        nodeName:
          "complete",

        parentStepIds: [
          decisionId
        ],

        timestampUtc:
          new Date(
            base + 2000
          ).toISOString(),

        durationMs:
          5,

        signals: {
          scenario:
            "idempotency-mutation"
        },

        metadata: {
          sequence:
            2
        },

        stateHash:
          stateHash(
            `state:${completeId}`
          )
      }
    ],

    startedAt:
      new Date(base)
        .toISOString(),

    completedAt:
      new Date(
        base + 3000
      ).toISOString(),

    terminalPath:
      "happy_path"
  };

  const topology = {
    nodes: [
      "intake",
      "decision",
      "complete"
    ],

    parentEdges: {
      intake:
        [],

      decision: [
        "intake"
      ],

      complete: [
        "decision"
      ]
    },

    terminalNode:
      "complete",

    attestationNodes: [
      "intake",
      "decision",
      "complete"
    ]
  };

  return {
    bundle,
    topology
  };
}

function errorCodeOf(
  body
) {
  return (
    body?.code ||
    body?.errorCode ||
    body?.error?.code ||
    body?.error?.errorCode ||
    null
  );
}

function recordsOf(
  body
) {
  if (
    Array.isArray(
      body?.records
    )
  ) {
    return body.records;
  }

  if (
    Array.isArray(
      body?.cers
    )
  ) {
    return body.cers;
  }

  return [];
}

function snapshotRecords(
  body
) {
  return recordsOf(body)
    .map(
      record => ({
        certificateHash:
          record.certificateHash ??
          record.proof?.proofJson?.certificateHash ??
          null,

        proofId:
          record.proofId ??
          record.proof?.id ??
          record.proof?.proofId ??
          null,

        attestationId:
          record.attestationId ??
          record.proof?.attestationId ??
          record.attestation?.id ??
          null,

        usageEventId:
          record.usageEventId ??
          record.usage?.id ??
          null,

        proofJson:
          record.proofJson ??
          record.proof?.proofJson ??
          null
      })
    )
    .sort(
      (a, b) =>
        String(
          a.certificateHash
        ).localeCompare(
          String(
            b.certificateHash
          )
        )
    );
}

async function submit(
  bundle,
  topology
) {
  const response =
    await fetch(
      `${NODE_URL}/v1/cage/bundles`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            schema:
              SCHEMA,

            bundle,
            topology
          })
      }
    );

  let body;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  return {
    response,
    body
  };
}

function sameJson(
  a,
  b
) {
  return (
    JSON.stringify(a) ===
    JSON.stringify(b)
  );
}

const {
  bundle,
  topology
} =
  makeExecution();

/*
 * Confirm the execution is valid before creating
 * production evidence.
 */
const validation =
  validateCageExecution(
    bundle,
    topology
  );

assert(
  validation.valid,
  "Fresh idempotency fixture failed local CAGE validation"
);

/*
 * 1. Initial registration.
 */
const first =
  await submit(
    bundle,
    topology
  );

assert(
  first.response.status === 201,
  `Initial registration expected HTTP 201, got ${first.response.status}: ${JSON.stringify(first.body)}`
);

assert(
  first.body?.replayed !== true,
  "Initial registration must not be marked as replayed"
);

const firstRecords =
  snapshotRecords(
    first.body
  );

assert(
  firstRecords.length === 3,
  `Expected 3 CER records, got ${firstRecords.length}`
);

const hashes =
  firstRecords
    .map(
      record =>
        record.certificateHash
    );

assert(
  hashes.every(Boolean),
  "Initial registration returned a record without certificateHash"
);

assert(
  new Set(hashes).size === 3,
  "Expected three unique certificate hashes"
);

console.log(
  "Initial registration: 201 PASS"
);

/*
 * 2. Exact replay.
 */
const replay =
  await submit(
    bundle,
    topology
  );

assert(
  replay.response.status === 200,
  `Exact replay expected HTTP 200, got ${replay.response.status}: ${JSON.stringify(replay.body)}`
);

assert(
  replay.body?.replayed === true,
  "Exact replay must be marked replayed=true"
);

const replayRecords =
  snapshotRecords(
    replay.body
  );

assert(
  replayRecords.length === 3,
  `Replay expected 3 CER records, got ${replayRecords.length}`
);

assert(
  sameJson(
    replayRecords,
    firstRecords
  ),
  "Exact replay did not return the same proof-linked records"
);

console.log(
  "Exact replay: 200 replayed=true PASS"
);

/*
 * 3. Schema-valid metadata mutation.
 *
 * Keep the same execution identity and alter protected
 * evidence. This must not be treated as replay.
 */
const metadataMutation =
  clone(
    bundle
  );

metadataMutation
  .steps[1]
  .metadata
  .mutationProbe =
    "changed-after-registration";

const metadataValidation =
  validateCageExecution(
    metadataMutation,
    topology
  );

assert(
  metadataValidation.valid,
  "Metadata mutation must remain structurally valid CAGE evidence"
);

const mutatedMetadataResponse =
  await submit(
    metadataMutation,
    topology
  );

assert(
  mutatedMetadataResponse
    .response
    .status === 409,
  `Metadata mutation expected HTTP 409, got ${mutatedMetadataResponse.response.status}: ${JSON.stringify(mutatedMetadataResponse.body)}`
);

assert(
  errorCodeOf(
    mutatedMetadataResponse.body
  ) ===
    "EXECUTION_MUTATION_DETECTED",
  `Metadata mutation expected EXECUTION_MUTATION_DETECTED, got ${errorCodeOf(mutatedMetadataResponse.body)}`
);

console.log(
  "Schema-valid metadata mutation: 409 EXECUTION_MUTATION_DETECTED PASS"
);

/*
 * 4. Schema-valid threadId mutation.
 */
const threadMutation =
  clone(
    bundle
  );

threadMutation.threadId =
  `${bundle.threadId}-mutated`;

const threadValidation =
  validateCageExecution(
    threadMutation,
    topology
  );

assert(
  threadValidation.valid,
  "threadId mutation must remain structurally valid CAGE evidence"
);

const mutatedThreadResponse =
  await submit(
    threadMutation,
    topology
  );

assert(
  mutatedThreadResponse
    .response
    .status === 409,
  `threadId mutation expected HTTP 409, got ${mutatedThreadResponse.response.status}: ${JSON.stringify(mutatedThreadResponse.body)}`
);

assert(
  errorCodeOf(
    mutatedThreadResponse.body
  ) ===
    "EXECUTION_MUTATION_DETECTED",
  `threadId mutation expected EXECUTION_MUTATION_DETECTED, got ${errorCodeOf(mutatedThreadResponse.body)}`
);

console.log(
  "Schema-valid threadId mutation: 409 EXECUTION_MUTATION_DETECTED PASS"
);

/*
 * 5. Replay the original again.
 *
 * Mutation attempts must not alter the original evidence.
 */
const finalReplay =
  await submit(
    bundle,
    topology
  );

assert(
  finalReplay.response.status === 200,
  `Final replay expected HTTP 200, got ${finalReplay.response.status}`
);

assert(
  finalReplay.body?.replayed === true,
  "Final original request must still be recognized as an exact replay"
);

const finalRecords =
  snapshotRecords(
    finalReplay.body
  );

assert(
  sameJson(
    finalRecords,
    firstRecords
  ),
  "Original evidence changed after mutation attempts"
);

console.log(
  "Original evidence preserved after mutation attempts: PASS"
);

console.log();
console.log(
  `Bundle: ${bundle.bundleId}`
);

console.log(
  "Idempotency and mutation protection: PASS"
);
