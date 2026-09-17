import fs from "node:fs";
import path from "node:path";

import {
  validateCageExecution
} from "@nexart/governed-execution/cage";

const SOURCE =
  path.resolve(
    "results/2026-09-17-node-0.29.0/" +
    "stage-02/canonical-fixtures/" +
    "01_single_path_happy.json"
  );

const FIXTURE_DIR =
  path.resolve(
    "fixtures/stage-06"
  );

const RESULT_DIR =
  path.resolve(
    "results/2026-09-17-node-0.29.0/stage-06"
  );

const SCHEMA =
  "urn:cage:governance:v1:attestation-bundle";

const base =
  JSON.parse(
    fs.readFileSync(
      SOURCE,
      "utf8"
    )
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

function findIssue(
  report,
  code
) {
  return allIssues(report)
    .find(
      issue =>
        issue.code === code
    );
}

function topologyFor(bundle) {
  const nodes = [
    ...new Set(
      bundle.steps.map(
        step => step.nodeName
      )
    )
  ];

  const parentEdges =
    Object.fromEntries(
      nodes.map(
        node => [
          node,
          []
        ]
      )
    );

  const byId =
    new Map(
      bundle.steps.map(
        step => [
          step.stepId,
          step
        ]
      )
    );

  for (
    let i = 1;
    i < bundle.steps.length;
    i++
  ) {
    const child =
      bundle.steps[i];

    const parents =
      child.parentStepIds
        .map(
          id =>
            byId.get(id)?.nodeName
        )
        .filter(Boolean);

    parentEdges[
      child.nodeName
    ] = [
      ...new Set(parents)
    ];
  }

  return {
    nodes,
    parentEdges,

    terminalNode:
      bundle.steps.at(-1).nodeName,

    attestationNodes:
      [...nodes]
  };
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

  if (
    topology !== undefined
  ) {
    request.topology =
      topology;
  }

  fs.writeFileSync(
    path.join(
      FIXTURE_DIR,
      `${name}.json`
    ),

    JSON.stringify(
      request,
      null,
      2
    ) + "\n"
  );
}

/*
 * ==================================================
 * POSITIVE CONTROL
 *
 * Bundle IDs are generic UUIDs.
 * Concrete step IDs remain strict UUIDv4.
 * ==================================================
 */

const genericBundle =
  clone(base);

genericBundle.bundleId =
  "50000000-0000-1000-8000-000000000001";

genericBundle.threadId =
  "stage06-generic-bundle-uuid";

/*
 * ==================================================
 * 1. MISSING_PARENT
 * ==================================================
 */

const missingParent =
  clone(base);

missingParent.bundleId =
  "60000000-0000-4000-8000-000000000001";

missingParent.threadId =
  "stage06-missing-parent";

missingParent.steps[1]
  .parentStepIds = [
    "60000099-0000-4000-8000-000000000099"
  ];

/*
 * ==================================================
 * 2. FUTURE_PARENT
 *
 * First concrete step references the second.
 *
 * Extra CAUSAL_CYCLE / TIMESTAMP_INVERSION diagnostics
 * are allowed. FUTURE_PARENT is mandatory.
 * ==================================================
 */

const futureParent =
  clone(base);

futureParent.bundleId =
  "60000000-0000-4000-8000-000000000002";

futureParent.threadId =
  "stage06-future-parent";

futureParent.steps[0]
  .parentStepIds = [
    futureParent.steps[1].stepId
  ];

/*
 * ==================================================
 * 3. SELF_PARENT
 * ==================================================
 */

const selfParent =
  clone(base);

selfParent.bundleId =
  "60000000-0000-4000-8000-000000000003";

selfParent.threadId =
  "stage06-self-parent";

selfParent.steps[1]
  .parentStepIds = [
    selfParent.steps[1].stepId
  ];

/*
 * ==================================================
 * 4. DUPLICATE_PARENT
 * ==================================================
 */

const duplicateParent =
  clone(base);

duplicateParent.bundleId =
  "60000000-0000-4000-8000-000000000004";

duplicateParent.threadId =
  "stage06-duplicate-parent";

duplicateParent.steps[1]
  .parentStepIds = [
    duplicateParent.steps[0].stepId,
    duplicateParent.steps[0].stepId
  ];

/*
 * ==================================================
 * 5. UNKNOWN_NODE
 *
 * Topology is generated BEFORE node mutation so the
 * executed node becomes genuinely undeclared.
 * ==================================================
 */

const unknownNode =
  clone(base);

unknownNode.bundleId =
  "60000000-0000-4000-8000-000000000005";

unknownNode.threadId =
  "stage06-unknown-node";

const unknownNodeTopology =
  topologyFor(
    unknownNode
  );

unknownNode.steps[1]
  .nodeName =
  "stage06_unknown_node";

/*
 * ==================================================
 * 6. INVALID_UUID
 *
 * Mutate the final step only so no child references
 * need to be rewritten.
 *
 * UUID syntax is valid, but it is version 1 rather
 * than RFC 4122 version 4.
 * ==================================================
 */

const invalidStepUuid =
  clone(base);

invalidStepUuid.bundleId =
  "60000000-0000-4000-8000-000000000006";

invalidStepUuid.threadId =
  "stage06-invalid-step-uuid";

invalidStepUuid.steps.at(-1)
  .stepId =
  "60000006-0000-1000-8000-000000000004";

/*
 * ==================================================
 * 7. INVALID_PARENT_IDS
 *
 * Parent reference is UUID-shaped but non-v4.
 *
 * MISSING_PARENT may also be emitted. The critical
 * strict UUID boundary is INVALID_PARENT_IDS.
 * ==================================================
 */

const invalidParentUuid =
  clone(base);

invalidParentUuid.bundleId =
  "60000000-0000-4000-8000-000000000007";

invalidParentUuid.threadId =
  "stage06-invalid-parent-uuid";

invalidParentUuid.steps[1]
  .parentStepIds = [
    "60000007-0000-1000-8000-000000000001"
  ];

/*
 * ==================================================
 * CASE DEFINITIONS
 * ==================================================
 */

const cases = [
  {
    name:
      "00_generic_bundle_uuid_allowed",

    bundle:
      genericBundle,

    expectation:
      "ACCEPT"
  },

  {
    name:
      "01_missing_parent",

    bundle:
      missingParent,

    expectation:
      "REJECT",

    requiredCodes: [
      "MISSING_PARENT"
    ],

    expectedPath:
      "bundle.steps[1].parentStepIds"
  },

  {
    name:
      "02_future_parent",

    bundle:
      futureParent,

    expectation:
      "REJECT",

    requiredCodes: [
      "FUTURE_PARENT"
    ],

    expectedPath:
      "bundle.steps[0].parentStepIds"
  },

  {
    name:
      "03_self_parent",

    bundle:
      selfParent,

    expectation:
      "REJECT",

    requiredCodes: [
      "SELF_PARENT"
    ],

    expectedPath:
      "bundle.steps[1].parentStepIds"
  },

  {
    name:
      "04_duplicate_parent",

    bundle:
      duplicateParent,

    expectation:
      "REJECT",

    requiredCodes: [
      "DUPLICATE_PARENT"
    ],

    expectedPath:
      "bundle.steps[1].parentStepIds"
  },

  {
    name:
      "05_unknown_node",

    bundle:
      unknownNode,

    topology:
      unknownNodeTopology,

    expectation:
      "REJECT",

    requiredCodes: [
      "UNKNOWN_NODE"
    ],

    expectedPath:
      "bundle.steps[1].nodeName"
  },

  {
    name:
      "06_invalid_step_uuid",

    bundle:
      invalidStepUuid,

    expectation:
      "REJECT",

    requiredCodes: [
      "INVALID_UUID"
    ],

    expectedPath:
      "bundle.steps[3].stepId"
  },

  {
    name:
      "07_invalid_parent_uuid",

    bundle:
      invalidParentUuid,

    expectation:
      "REJECT",

    requiredCodes: [
      "INVALID_PARENT_IDS"
    ],

    expectedPath:
      "bundle.steps[1].parentStepIds"
  }
];

const summary = {
  stage:
    "06a-local-uuid-and-structural-fail-closed",

  sdk:
    "0.4.0",

  cases: [],

  status:
    "PASS"
};

for (
  const testCase of cases
) {
  writeFixture(
    testCase.name,
    testCase.bundle,
    testCase.topology
  );

  const report =
    validateCageExecution(
      testCase.bundle,
      testCase.topology
    );

  const codes =
    issueCodes(report);

  let pass =
    false;

  const requiredIssues =
    [];

  if (
    testCase.expectation ===
    "ACCEPT"
  ) {
    pass =
      report.valid === true;
  } else {
    for (
      const code of
      testCase.requiredCodes
    ) {
      const found =
        findIssue(
          report,
          code
        );

      requiredIssues.push({
        code,

        found:
          Boolean(found),

        path:
          found?.path ?? null
      });
    }

    const codesPresent =
      testCase.requiredCodes.every(
        code =>
          codes.includes(code)
      );

    const primaryIssue =
      findIssue(
        report,
        testCase.requiredCodes[0]
      );

    const pathMatches =
      typeof primaryIssue?.path ===
        "string" &&
      primaryIssue.path.includes(
        testCase.expectedPath
      );

    pass =
      report.valid === false &&
      codesPresent &&
      pathMatches;
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

    expectedPath:
      testCase.expectedPath ?? null,

    requiredIssues,

    report,

    status:
      pass
        ? "PASS"
        : "FAIL"
  };

  summary.cases.push(
    result
  );

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

  if (
    testCase.expectedPath
  ) {
    const issue =
      findIssue(
        report,
        testCase.requiredCodes[0]
      );

    console.log(
      `requiredIssuePath=${issue?.path ?? "MISSING"}`
    );
  }

  console.log(
    `RESULT=${result.status}`
  );
}

fs.writeFileSync(
  path.join(
    RESULT_DIR,
    "stage-06a-summary.json"
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
  "STAGE 6A SUMMARY"
);

console.log(
  "=========================================="
);

console.log(
  `Cases: ${summary.cases.length}/8`
);

console.log(
  `Passed: ${
    summary.cases.filter(
      x => x.status === "PASS"
    ).length
  }/8`
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !==
  "PASS"
) {
  process.exitCode = 1;
}
