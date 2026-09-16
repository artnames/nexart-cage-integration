import crypto from "node:crypto";

import {
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const API_KEY =
  process.env.NEXART_API_KEY;

if (!API_KEY) {
  throw new Error(
    "NEXART_API_KEY is not set"
  );
}

const CAGE_SCHEMA =
  "urn:cage:governance:v1:attestation-bundle";

const uuid =
  () => crypto.randomUUID();

const stateHash =
  value =>
    crypto
      .createHash("sha256")
      .update(value)
      .digest("hex");

const startedAt =
  Date.now();

const intakeStepId =
  uuid();

const decisionStepId =
  uuid();

const completeStepId =
  uuid();

/*
 * Native CAGE AttestationBundle.
 *
 * Each step represents an executed step instance.
 * parentStepIds reference executed step IDs, not logical node names.
 */
const bundle = {
  bundleId:
    uuid(),

  threadId:
    `cage-example-${uuid()}`,

  steps: [
    {
      stepId:
        intakeStepId,

      nodeName:
        "intake",

      parentStepIds:
        [],

      timestampUtc:
        new Date(
          startedAt
        ).toISOString(),

      durationMs:
        10,

      signals: {
        outcome:
          "accepted"
      },

      metadata: {
        example:
          "nexart-cage-minimal-integration"
      },

      stateHash:
        stateHash(
          `state:${intakeStepId}`
        )
    },

    {
      stepId:
        decisionStepId,

      nodeName:
        "decision",

      parentStepIds: [
        intakeStepId
      ],

      timestampUtc:
        new Date(
          startedAt + 1000
        ).toISOString(),

      durationMs:
        20,

      signals: {
        decision:
          "continue"
      },

      metadata: {
        example:
          "nexart-cage-minimal-integration"
      },

      stateHash:
        stateHash(
          `state:${decisionStepId}`
        )
    },

    {
      stepId:
        completeStepId,

      nodeName:
        "complete",

      parentStepIds: [
        decisionStepId
      ],

      timestampUtc:
        new Date(
          startedAt + 2000
        ).toISOString(),

      durationMs:
        5,

      signals: {
        outcome:
          "completed"
      },

      metadata: {
        example:
          "nexart-cage-minimal-integration"
      },

      stateHash:
        stateHash(
          `state:${completeStepId}`
        )
    }
  ],

  startedAt:
    new Date(
      startedAt
    ).toISOString(),

  completedAt:
    new Date(
      startedAt + 3000
    ).toISOString(),

  terminalPath:
    "happy_path"
};

/*
 * GraphTopology describes the possible workflow structure.
 *
 * AttestationBundle.steps above describes the observed traversal.
 */
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

/*
 * 1. Validate the native CAGE execution before registration.
 */
const validation =
  validateCageExecution(
    bundle,
    topology
  );

if (!validation.valid) {
  console.error(
    JSON.stringify(
      validation,
      null,
      2
    )
  );

  throw new Error(
    "Native CAGE validation failed"
  );
}

console.log(
  "Native CAGE validation: PASS"
);

/*
 * 2. Register the execution with the NexArt Node.
 *
 * One CER is produced for each executed step.
 */
const registrationResponse =
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
            CAGE_SCHEMA,

          bundle,
          topology
        })
    }
  );

const registration =
  await registrationResponse.json();

if (!registrationResponse.ok) {
  console.error(
    JSON.stringify(
      registration,
      null,
      2
    )
  );

  throw new Error(
    `Registration failed: HTTP ${registrationResponse.status}`
  );
}

console.log(
  `Bundle registered: ${bundle.bundleId}`
);

console.log(
  `HTTP status: ${registrationResponse.status}`
);

/*
 * 3. Retrieve the persisted executed-step graph.
 */
const stepsResponse =
  await fetch(
    `${NODE_URL}/v1/cage/bundles/${bundle.bundleId}/steps`,
    {
      headers: {
        Authorization:
          `Bearer ${API_KEY}`
      }
    }
  );

const stepListing =
  await stepsResponse.json();

if (!stepsResponse.ok) {
  console.error(
    JSON.stringify(
      stepListing,
      null,
      2
    )
  );

  throw new Error(
    `Step retrieval failed: HTTP ${stepsResponse.status}`
  );
}

/*
 * 4. Verify each returned CER locally.
 */
for (
  const row
  of stepListing.steps
) {
  const cer =
    row.proof?.proofJson;

  if (!cer) {
    throw new Error(
      `Missing CER for step ${row.stepId}`
    );
  }

  const result =
    verifyCageStepCer(
      cer
    );

  if (!result.ok) {
    console.error(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    throw new Error(
      `CER verification failed for ${row.stepId}`
    );
  }

  console.log(
    `${row.nodeName}: ${row.certificateHash} — PASS`
  );
}

console.log(
  `Verified ${stepListing.steps.length} CERs`
);

console.log(
  "CAGE → NexArt integration complete."
);
