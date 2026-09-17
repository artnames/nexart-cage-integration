import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  validateCageExecution,
  sealCageBundleSteps,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const FIXTURE_DIR = path.resolve("fixtures/stage-03");
const RESULT_DIR = path.resolve(
  "results/2026-09-17-node-0.29.0/stage-03"
);

function step(stepId, nodeName, parentStepIds, second) {
  return {
    stepId,
    nodeName,
    parentStepIds,
    timestampUtc:
      `2026-09-17T12:00:0${second}.000Z`,
    durationMs: second + 1,
    signals: {
      stage03: true,
      ordinal: second
    },
    metadata: {
      fixture: "stage-03"
    },
    stateHash: crypto
      .createHash("sha256")
      .update(`${stepId}:${nodeName}`)
      .digest("hex")
  };
}

const fixtures = [
  {
    name: "01_ancestor_contraction_linear",
    bundle: {
      bundleId:
        "30000000-0000-4000-8000-000000000001",
      threadId:
        "stage03-ancestor-contraction-linear",
      startedAt:
        "2026-09-17T12:00:00.000Z",
      completedAt:
        "2026-09-17T12:00:02.000Z",
      terminalPath: "happy_path",
      steps: [
        step(
          "30000001-0000-4000-8000-000000000001",
          "root",
          [],
          0
        ),
        step(
          "30000001-0000-4000-8000-000000000002",
          "leaf",
          [
            "30000001-0000-4000-8000-000000000001"
          ],
          1
        )
      ]
    },
    topology: {
      nodes: [
        "root",
        "omitted_a",
        "omitted_b",
        "leaf"
      ],
      parentEdges: {
        root: [],
        omitted_a: ["root"],
        omitted_b: ["omitted_a"],
        leaf: ["omitted_b"]
      },
      terminalNode: "leaf",
      attestationNodes: [
        "root",
        "leaf"
      ]
    }
  },

  {
    name: "02_convergent_contraction",
    bundle: {
      bundleId:
        "30000000-0000-4000-8000-000000000002",
      threadId:
        "stage03-convergent-contraction",
      startedAt:
        "2026-09-17T12:01:00.000Z",
      completedAt:
        "2026-09-17T12:01:04.000Z",
      terminalPath: "happy_path",
      steps: [
        {
          ...step(
            "30000002-0000-4000-8000-000000000001",
            "root_a",
            [],
            0
          ),
          timestampUtc:
            "2026-09-17T12:01:00.000Z"
        },
        {
          ...step(
            "30000002-0000-4000-8000-000000000002",
            "root_b",
            [],
            1
          ),
          timestampUtc:
            "2026-09-17T12:01:01.000Z"
        },
        {
          ...step(
            "30000002-0000-4000-8000-000000000003",
            "join",
            [
              "30000002-0000-4000-8000-000000000001",
              "30000002-0000-4000-8000-000000000002"
            ],
            2
          ),
          timestampUtc:
            "2026-09-17T12:01:02.000Z"
        }
      ]
    },
    topology: {
      nodes: [
        "root_a",
        "root_b",
        "hidden_a",
        "hidden_b",
        "join"
      ],
      parentEdges: {
        root_a: [],
        root_b: [],
        hidden_a: ["root_a"],
        hidden_b: ["root_b"],
        join: [
          "hidden_a",
          "hidden_b"
        ]
      },
      terminalNode: "join",
      attestationNodes: [
        "root_a",
        "root_b",
        "join"
      ]
    }
  },

  {
    name: "03_repeated_node_occurrences",
    bundle: {
      bundleId:
        "30000000-0000-4000-8000-000000000003",
      threadId:
        "stage03-repeated-node-occurrences",
      startedAt:
        "2026-09-17T12:02:00.000Z",
      completedAt:
        "2026-09-17T12:02:04.000Z",
      terminalPath: "happy_path",
      steps: [
        {
          ...step(
            "30000003-0000-4000-8000-000000000001",
            "repeat",
            [],
            0
          ),
          timestampUtc:
            "2026-09-17T12:02:00.000Z"
        },
        {
          ...step(
            "30000003-0000-4000-8000-000000000002",
            "repeat",
            [
              "30000003-0000-4000-8000-000000000001"
            ],
            1
          ),
          timestampUtc:
            "2026-09-17T12:02:01.000Z"
        },
        {
          ...step(
            "30000003-0000-4000-8000-000000000003",
            "repeat",
            [
              "30000003-0000-4000-8000-000000000002"
            ],
            2
          ),
          timestampUtc:
            "2026-09-17T12:02:02.000Z"
        }
      ]
    },
    topology: {
      nodes: ["repeat"],
      parentEdges: {
        repeat: ["repeat"]
      },
      terminalNode: "repeat",
      attestationNodes: ["repeat"]
    }
  }
];

const summary = {
  stage:
    "03a-local-contraction-repetition-convergence",
  sdk: "0.4.0",
  fixtures: [],
  status: "PASS"
};

for (const fixture of fixtures) {
  const fixturePath =
    path.join(
      FIXTURE_DIR,
      `${fixture.name}.json`
    );

  fs.writeFileSync(
    fixturePath,
    JSON.stringify(
      {
        schema:
          "urn:cage:governance:v1:attestation-bundle",
        bundle: fixture.bundle,
        topology: fixture.topology
      },
      null,
      2
    ) + "\n"
  );

  const validation =
    validateCageExecution(
      fixture.bundle,
      fixture.topology
    );

  const sealed =
    validation.valid
      ? sealCageBundleSteps(
          fixture.bundle
        )
      : null;

  const verified =
    sealed?.records?.every(
      record =>
        verifyCageStepCer(
          record.cer
        ).ok === true
    ) ?? false;

  const fixtureStatus =
    validation.valid &&
    sealed.records.length ===
      fixture.bundle.steps.length &&
    verified
      ? "PASS"
      : "FAIL";

  if (fixtureStatus !== "PASS") {
    summary.status = "FAIL";
  }

  const result = {
    fixture: fixture.name,
    bundleId:
      fixture.bundle.bundleId,
    stepCount:
      fixture.bundle.steps.length,
    validation,
    sealedRecordCount:
      sealed?.records?.length ?? 0,
    allCersVerify: verified,
    status: fixtureStatus
  };

  summary.fixtures.push(result);

  console.log();
  console.log(fixture.name);
  console.log(
    `validation=${validation.valid}`
  );
  console.log(
    `sealedRecords=${result.sealedRecordCount}`
  );
  console.log(
    `allCersVerify=${verified}`
  );
  console.log(
    `RESULT=${fixtureStatus}`
  );
}

fs.writeFileSync(
  path.join(
    RESULT_DIR,
    "stage-03a-summary.json"
  ),
  JSON.stringify(summary, null, 2) + "\n"
);

console.log();
console.log("==============================");
console.log("STAGE 3A SUMMARY");
console.log("==============================");
console.log(`Fixtures: ${summary.fixtures.length}/3`);
console.log(`FINAL RESULT: ${summary.status}`);

if (summary.status !== "PASS") {
  process.exitCode = 1;
}
