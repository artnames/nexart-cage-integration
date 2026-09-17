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
    "NEXART_API_KEY is required for schema-registry validation."
  );
}

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

function hashState(
  value
) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function makeValidExecution() {
  const bundleId =
    uuid();

  const stepId =
    uuid();

  const now =
    Date.now();

  const bundle = {
    bundleId,

    threadId:
      `schema-registry-${uuid()}`,

    steps: [
      {
        stepId,

        nodeName:
          "complete",

        parentStepIds:
          [],

        timestampUtc:
          new Date(now)
            .toISOString(),

        durationMs:
          5,

        signals: {
          test:
            "schema-registry"
        },

        metadata: {
          fixture:
            "schema-dispatch"
        },

        stateHash:
          hashState(
            `state:${stepId}`
          )
      }
    ],

    startedAt:
      new Date(now)
        .toISOString(),

    completedAt:
      new Date(
        now + 1000
      ).toISOString(),

    terminalPath:
      "happy_path"
  };

  const topology = {
    nodes: [
      "complete"
    ],

    parentEdges: {
      complete:
        []
    },

    terminalNode:
      "complete",

    attestationNodes: [
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

async function submit(
  schema,
  bundle,
  topology
) {
  const requestBody = {
    bundle,
    topology
  };

  if (
    schema !== undefined
  ) {
    requestBody.schema =
      schema;
  }

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
          JSON.stringify(
            requestBody
          )
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

async function assertNotPersisted(
  bundleId
) {
  const response =
    await fetch(
      `${NODE_URL}/v1/cage/bundles/${bundleId}`,
      {
        headers: {
          Authorization:
            `Bearer ${API_KEY}`
        }
      }
    );

  assert(
    response.status === 404,
    `Rejected bundle ${bundleId} unexpectedly persisted; GET returned HTTP ${response.status}`
  );
}

/*
 * First prove the underlying native CAGE fixture is valid.
 *
 * The schema-registry test is about dispatch behavior,
 * not malformed execution evidence.
 */
{
  const {
    bundle,
    topology
  } =
    makeValidExecution();

  const validation =
    validateCageExecution(
      bundle,
      topology
    );

  assert(
    validation.valid,
    "Base CAGE fixture must be locally valid"
  );
}

const cases = [
  {
    name:
      "missing-schema",

    schema:
      undefined,

    expectedStatus:
      400,

    expectedCode:
      "CAGE_SCHEMA_UNKNOWN"
  },

  {
    name:
      "unknown-schema-namespace",

    schema:
      "urn:example:unknown:v1:attestation-bundle",

    expectedStatus:
      400,

    expectedCode:
      "CAGE_SCHEMA_UNKNOWN"
  },

  {
    name:
      "near-match-invalid-cage-schema",

    schema:
      "urn:cage:governance:v1:attestation",

    expectedStatus:
      400,

    expectedCode:
      "CAGE_SCHEMA_UNKNOWN"
  },

  {
    name:
      "unsupported-future-cage-version",

    schema:
      "urn:cage:governance:v2:attestation-bundle",

    expectedStatus:
      400,

    expectedCode:
      "CAGE_SCHEMA_VERSION_UNSUPPORTED"
  }
];

for (
  const testCase
  of cases
) {
  const {
    bundle,
    topology
  } =
    makeValidExecution();

  const validation =
    validateCageExecution(
      bundle,
      topology
    );

  assert(
    validation.valid,
    `${testCase.name}: base execution fixture unexpectedly invalid`
  );

  const {
    response,
    body
  } =
    await submit(
      testCase.schema,
      bundle,
      topology
    );

  assert(
    response.status ===
      testCase.expectedStatus,
    `${testCase.name}: expected HTTP ${testCase.expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`
  );

  const code =
    errorCodeOf(
      body
    );

  assert(
    code ===
      testCase.expectedCode,
    `${testCase.name}: expected ${testCase.expectedCode}, got ${code}`
  );

  await assertNotPersisted(
    bundle.bundleId
  );

  console.log(
    `${testCase.name}: ${response.status} ${code} PASS`
  );
}

console.log();
console.log(
  `Schema-registry cases: ${cases.length}/${cases.length} PASS`
);

console.log(
  "Schema registry validation: PASS"
);
