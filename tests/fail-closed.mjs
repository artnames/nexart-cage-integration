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
    "NEXART_API_KEY is required for fail-closed Node validation."
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

function makeValidExecution() {
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
      `fail-closed-${uuid()}`,

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
          test:
            "fail-closed"
        },

        metadata: {
          fixture:
            "valid-base"
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
          10,

        signals: {
          test:
            "fail-closed"
        },

        metadata: {
          fixture:
            "valid-base"
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
          10,

        signals: {
          test:
            "fail-closed"
        },

        metadata: {
          fixture:
            "valid-base"
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

async function postExecution(
  bundle,
  topology,
  includeAuth = true
) {
  const headers = {
    "Content-Type":
      "application/json"
  };

  if (includeAuth) {
    headers.Authorization =
      `Bearer ${API_KEY}`;
  }

  const response =
    await fetch(
      `${NODE_URL}/v1/cage/bundles`,
      {
        method:
          "POST",

        headers,

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

async function assertNotPersisted(
  bundleId
) {
  /*
   * Only query persistence when bundleId is a valid UUID.
   */
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(bundleId)
  ) {
    return;
  }

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

const cases = [
  {
    name:
      "invalid-step-id-uuid",

    mutate({
      bundle
    }) {
      bundle.steps[0].stepId =
        "not-a-uuid";
    }
  },

  {
    name:
      "invalid-state-hash",

    mutate({
      bundle
    }) {
      bundle.steps[1].stateHash =
        "not-a-valid-state-hash";
    }
  },

  {
    name:
      "duplicate-step-id",

    mutate({
      bundle
    }) {
      bundle.steps[1].stepId =
        bundle.steps[0].stepId;
    }
  },

  {
    name:
      "missing-parent-reference",

    mutate({
      bundle
    }) {
      bundle.steps[1].parentStepIds = [
        uuid()
      ];
    }
  },

  {
    name:
      "self-parent-reference",

    mutate({
      bundle
    }) {
      bundle.steps[1].parentStepIds = [
        bundle.steps[1].stepId
      ];
    }
  },

  {
    name:
      "executed-cycle",

    mutate({
      bundle
    }) {
      bundle.steps[0].parentStepIds = [
        bundle.steps[2].stepId
      ];
    }
  },

  {
    name:
      "invalid-terminal-path",

    mutate({
      bundle
    }) {
      bundle.terminalPath =
        "invalid_terminal_path";
    }
  },

  {
    name:
      "invalid-bundle-id-uuid",

    mutate({
      bundle
    }) {
      bundle.bundleId =
        "not-a-uuid";
    }
  },

  {
    name:
      "topology-terminal-node-missing",

    mutate({
      topology
    }) {
      topology.terminalNode =
        "missing-terminal";
    }
  },

  {
    name:
      "topology-parent-ghost-node",

    mutate({
      topology
    }) {
      topology.parentEdges.decision = [
        "ghost-node"
      ];
    }
  },

  {
    name:
      "executed-node-absent-from-topology",

    mutate({
      topology
    }) {
      topology.nodes = [
        "intake",
        "complete"
      ];

      topology.parentEdges = {
        intake:
          [],

        complete: [
          "intake"
        ]
      };

      topology.attestationNodes = [
        "intake",
        "complete"
      ];
    }
  }
];

for (const testCase of cases) {
  const execution =
    makeValidExecution();

  const fixture = {
    bundle:
      clone(
        execution.bundle
      ),

    topology:
      clone(
        execution.topology
      )
  };

  testCase.mutate(
    fixture
  );

  /*
   * 1. SDK must reject the malformed execution.
   */
  const local =
    validateCageExecution(
      fixture.bundle,
      fixture.topology
    );

  assert(
    !local.valid,
    `${testCase.name}: SDK unexpectedly accepted invalid evidence`
  );

  /*
   * 2. Node must independently fail closed.
   */
  const {
    response,
    body
  } =
    await postExecution(
      fixture.bundle,
      fixture.topology
    );

  assert(
    response.status === 422,
    `${testCase.name}: expected HTTP 422, got ${response.status}: ${JSON.stringify(body)}`
  );

  assert(
    errorCodeOf(body) ===
      "CAGE_VALIDATION_FAILED",
    `${testCase.name}: expected CAGE_VALIDATION_FAILED, got ${errorCodeOf(body)}`
  );

  /*
   * 3. Invalid evidence must not persist.
   */
  await assertNotPersisted(
    fixture.bundle.bundleId
  );

  console.log(
    `${testCase.name}: PASS`
  );
}

/*
 * A structurally valid request without authentication
 * must be rejected and must not persist.
 */
{
  const {
    bundle,
    topology
  } =
    makeValidExecution();

  const local =
    validateCageExecution(
      bundle,
      topology
    );

  assert(
    local.valid,
    "Authentication-control fixture must be structurally valid"
  );

  const {
    response
  } =
    await postExecution(
      bundle,
      topology,
      false
    );

  assert(
    response.status === 401,
    `Expected unauthenticated valid request to return 401, got ${response.status}`
  );

  await assertNotPersisted(
    bundle.bundleId
  );

  console.log(
    "valid request without API key: 401 PASS"
  );
}

/*
 * Malformed JSON must fail at the transport/parser boundary.
 */
{
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
          '{"schema":'
      }
    );

  assert(
    response.status === 400,
    `Malformed JSON expected HTTP 400, got ${response.status}`
  );

  console.log(
    "malformed JSON: 400 PASS"
  );
}

console.log();
console.log(
  `Invalid fixtures rejected: ${cases.length}/${cases.length}`
);

console.log(
  "Fail-closed validation: PASS"
);
