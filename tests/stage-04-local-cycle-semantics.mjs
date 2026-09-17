import fs from "node:fs";
import path from "node:path";

import {
  sealCageBundleSteps,
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const SCHEMA =
  "urn:cage:governance:v1:attestation-bundle";

const BASE_FIXTURE = path.resolve(
  "results/2026-09-17-node-0.29.0/" +
  "stage-02/canonical-fixtures/" +
  "01_single_path_happy.json"
);

const FIXTURE_DIR =
  path.resolve("fixtures/stage-04");

const RESULT_DIR =
  path.resolve(
    "results/2026-09-17-node-0.29.0/stage-04"
  );

const base =
  JSON.parse(
    fs.readFileSync(BASE_FIXTURE, "utf8")
  );

function clone(value) {
  return structuredClone(value);
}

function allIssues(report) {
  return [
    ...(report.schemaErrors ?? []),
    ...(report.causalErrors ?? []),
    ...(report.topologyErrors ?? []),
    ...(report.resourceErrors ?? [])
  ];
}

function issueCodes(report) {
  return [
    ...new Set(
      allIssues(report)
        .map(issue => issue.code)
    )
  ].sort();
}

function hasCode(report, code) {
  return issueCodes(report)
    .includes(code);
}

function writeFixture(
  name,
  bundle,
  topology = undefined
) {
  const request = {
    schema: SCHEMA,
    bundle
  };

  if (topology !== undefined) {
    request.topology = topology;
  }

  fs.writeFileSync(
    path.join(
      FIXTURE_DIR,
      `${name}.json`
    ),
    JSON.stringify(request, null, 2) + "\n"
  );
}

function verifyPositive(bundle) {
  const sealed =
    sealCageBundleSteps(bundle);

  const allVerify =
    sealed.records.every(
      record =>
        verifyCageStepCer(record.cer).ok === true
    );

  return {
    sealedRecordCount:
      sealed.records.length,

    allCersVerify:
      allVerify
  };
}

/*
 * --------------------------------------------------
 * CASE 1
 *
 * Static self-edge + reverse static edge.
 *
 * This topology contains a static cycle:
 *
 * input_validator -> input_validator
 * report_generator -> input_validator
 *
 * The concrete execution itself remains the normal
 * acyclic canonical happy-path execution.
 * --------------------------------------------------
 */

const topologySelfEdge = {
  nodes: [
    "input_validator",
    "safety_check",
    "governed_executor",
    "report_generator"
  ],

  parentEdges: {
    input_validator: [
      "input_validator",
      "report_generator"
    ],

    safety_check: [
      "input_validator"
    ],

    governed_executor: [
      "safety_check"
    ],

    report_generator: [
      "governed_executor"
    ]
  },

  terminalNode:
    "report_generator",

  attestationNodes: [
    "input_validator",
    "safety_check",
    "governed_executor",
    "report_generator"
  ]
};

const selfEdgeBundle =
  clone(base);

selfEdgeBundle.bundleId =
  "40000000-0000-4000-8000-000000000001";

selfEdgeBundle.threadId =
  "stage04-static-self-edge";

writeFixture(
  "01_static_self_edge_allowed",
  selfEdgeBundle,
  topologySelfEdge
);

/*
 * --------------------------------------------------
 * CASE 2
 *
 * Add a disconnected mutual cycle between static
 * topology nodes that are not concrete attestation
 * steps.
 *
 * static_a <-> static_b
 * --------------------------------------------------
 */

const topologyMutual = {
  nodes: [
    ...topologySelfEdge.nodes,
    "static_a",
    "static_b"
  ],

  parentEdges: {
    ...topologySelfEdge.parentEdges,

    static_a: [
      "static_b"
    ],

    static_b: [
      "static_a"
    ]
  },

  terminalNode:
    "report_generator",

  attestationNodes:
    topologySelfEdge.attestationNodes
};

const mutualBundle =
  clone(base);

mutualBundle.bundleId =
  "40000000-0000-4000-8000-000000000002";

mutualBundle.threadId =
  "stage04-static-mutual-cycle";

writeFixture(
  "02_static_mutual_cycle_allowed",
  mutualBundle,
  topologyMutual
);

/*
 * --------------------------------------------------
 * CASE 3
 *
 * Concrete execution cycle.
 *
 * Make the first concrete step depend on the final
 * concrete step.
 *
 * The existing canonical chain then creates:
 *
 * step1 <- step4 <- step3 <- step2 <- step1
 *
 * This MUST be rejected.
 * --------------------------------------------------
 */

const concreteCycleBundle =
  clone(base);

concreteCycleBundle.bundleId =
  "40000000-0000-4000-8000-000000000003";

concreteCycleBundle.threadId =
  "stage04-concrete-cycle";

concreteCycleBundle.steps[0].parentStepIds = [
  concreteCycleBundle.steps.at(-1).stepId
];

writeFixture(
  "03_concrete_cycle_rejected",
  concreteCycleBundle
);

/*
 * --------------------------------------------------
 * CASE 4
 *
 * Ancestor contraction enters an all-unrecorded
 * static cycle:
 *
 * omitted_a <-> omitted_b
 *
 * leaf points into that cycle.
 *
 * The SDK must fail closed rather than loop or
 * fabricate an ancestor.
 * --------------------------------------------------
 */

const contractionCycleBundle = {
  bundleId:
    "40000000-0000-4000-8000-000000000004",

  threadId:
    "stage04-unresolvable-contraction-cycle",

  startedAt:
    "2026-09-17T13:00:00.000Z",

  completedAt:
    "2026-09-17T13:00:01.000Z",

  terminalPath:
    "happy_path",

  steps: [
    {
      stepId:
        "40000004-0000-4000-8000-000000000001",

      nodeName:
        "root",

      parentStepIds: [],

      timestampUtc:
        "2026-09-17T13:00:00.000Z",

      durationMs: 1,

      signals: {},

      metadata: {
        fixture:
          "stage-04"
      },

      stateHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },

    {
      stepId:
        "40000004-0000-4000-8000-000000000002",

      nodeName:
        "leaf",

      parentStepIds: [
        "40000004-0000-4000-8000-000000000001"
      ],

      timestampUtc:
        "2026-09-17T13:00:01.000Z",

      durationMs: 1,

      signals: {},

      metadata: {
        fixture:
          "stage-04"
      },

      stateHash:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" +
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ]
};

const contractionCycleTopology = {
  nodes: [
    "root",
    "omitted_a",
    "omitted_b",
    "leaf"
  ],

  parentEdges: {
    root: [],

    omitted_a: [
      "omitted_b"
    ],

    omitted_b: [
      "omitted_a"
    ],

    leaf: [
      "omitted_a"
    ]
  },

  terminalNode:
    "leaf",

  attestationNodes: [
    "root",
    "leaf"
  ]
};

writeFixture(
  "04_unresolvable_contraction_cycle_rejected",
  contractionCycleBundle,
  contractionCycleTopology
);

/*
 * --------------------------------------------------
 * EXECUTION
 * --------------------------------------------------
 */

const cases = [
  {
    name:
      "01_static_self_edge_allowed",

    expectation:
      "ACCEPT",

    bundle:
      selfEdgeBundle,

    topology:
      topologySelfEdge
  },

  {
    name:
      "02_static_mutual_cycle_allowed",

    expectation:
      "ACCEPT",

    bundle:
      mutualBundle,

    topology:
      topologyMutual
  },

  {
    name:
      "03_concrete_cycle_rejected",

    expectation:
      "REJECT",

    bundle:
      concreteCycleBundle,

    topology:
      undefined,

    requiredCodes: [
      "FUTURE_PARENT",
      "CAUSAL_CYCLE"
    ]
  },

  {
    name:
      "04_unresolvable_contraction_cycle_rejected",

    expectation:
      "REJECT",

    bundle:
      contractionCycleBundle,

    topology:
      contractionCycleTopology,

    requiredCodes: [
      "UNRESOLVABLE_CONTRACTION_CYCLE"
    ]
  }
];

const summary = {
  stage:
    "04a-local-static-vs-concrete-cycle-semantics",

  sdk:
    "0.4.0",

  cases: [],

  status:
    "PASS"
};

for (const testCase of cases) {
  const report =
    validateCageExecution(
      testCase.bundle,
      testCase.topology
    );

  const codes =
    issueCodes(report);

  let pass = false;
  let cerResult = null;

  if (
    testCase.expectation === "ACCEPT"
  ) {
    cerResult =
      verifyPositive(
        testCase.bundle
      );

    pass =
      report.valid === true &&
      cerResult.sealedRecordCount ===
        testCase.bundle.steps.length &&
      cerResult.allCersVerify === true;
  } else {
    const required =
      testCase.requiredCodes ?? [];

    pass =
      report.valid === false &&
      required.every(
        code =>
          hasCode(report, code)
      );
  }

  if (!pass) {
    summary.status =
      "FAIL";
  }

  const result = {
    name:
      testCase.name,

    expectation:
      testCase.expectation,

    valid:
      report.valid,

    issueCodes:
      codes,

    requiredCodes:
      testCase.requiredCodes ?? [],

    sealedRecordCount:
      cerResult?.sealedRecordCount ?? null,

    allCersVerify:
      cerResult?.allCersVerify ?? null,

    report,

    status:
      pass
        ? "PASS"
        : "FAIL"
  };

  summary.cases.push(result);

  console.log();
  console.log(
    testCase.name
  );

  console.log(
    `expectation=${testCase.expectation}`
  );

  console.log(
    `valid=${report.valid}`
  );

  console.log(
    `issueCodes=${JSON.stringify(codes)}`
  );

  if (cerResult) {
    console.log(
      `sealedRecords=${cerResult.sealedRecordCount}`
    );

    console.log(
      `allCersVerify=${cerResult.allCersVerify}`
    );
  }

  console.log(
    `RESULT=${result.status}`
  );
}

fs.writeFileSync(
  path.join(
    RESULT_DIR,
    "stage-04a-summary.json"
  ),

  JSON.stringify(
    summary,
    null,
    2
  ) + "\n"
);

console.log();
console.log(
  "=========================================="
);

console.log(
  "STAGE 4A SUMMARY"
);

console.log(
  "=========================================="
);

console.log(
  `Cases: ${summary.cases.length}/4`
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
