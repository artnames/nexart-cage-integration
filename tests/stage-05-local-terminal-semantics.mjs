import fs from "node:fs";
import path from "node:path";

import {
  sealCageBundleSteps,
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const SOURCE_DIR = path.resolve(
  "results/2026-09-17-node-0.29.0/stage-02/canonical-fixtures"
);

const FIXTURE_DIR =
  path.resolve("fixtures/stage-05");

const RESULT_DIR =
  path.resolve(
    "results/2026-09-17-node-0.29.0/stage-05"
  );

const SCHEMA =
  "urn:cage:governance:v1:attestation-bundle";

function load(name) {
  return JSON.parse(
    fs.readFileSync(
      path.join(SOURCE_DIR, name),
      "utf8"
    )
  );
}

function clone(value) {
  return structuredClone(value);
}

function issueCodes(report) {
  return [
    ...(report.schemaErrors ?? []),
    ...(report.causalErrors ?? []),
    ...(report.topologyErrors ?? []),
    ...(report.resourceErrors ?? [])
  ].map(x => x.code);
}

function topologyFor(
  bundle,
  { terminalReached = true } = {}
) {
  const nodes = [
    ...new Set(
      bundle.steps.map(
        step => step.nodeName
      )
    )
  ];

  const parentEdges =
    Object.fromEntries(
      nodes.map(node => [node, []])
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

  /*
   * Match the current Node-test topology style:
   * node-level relationships derived from concrete
   * parent step relationships.
   *
   * Repeated node names can therefore produce
   * static cycles while concrete step IDs remain
   * ordered.
   */
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

  let terminalNode =
    bundle.steps.at(-1).nodeName;

  if (!terminalReached) {
    terminalNode =
      "successful_terminal";

    if (
      !nodes.includes(
        terminalNode
      )
    ) {
      nodes.push(
        terminalNode
      );
    }

    parentEdges[
      terminalNode
    ] = [
      bundle.steps.at(-1).nodeName
    ];
  }

  return {
    nodes,
    parentEdges,
    terminalNode,
    attestationNodes: [
      ...new Set(
        bundle.steps.map(
          step => step.nodeName
        )
      )
    ]
  };
}

function writeFixture(
  name,
  bundle,
  topology
) {
  fs.writeFileSync(
    path.join(
      FIXTURE_DIR,
      `${name}.json`
    ),
    JSON.stringify(
      {
        schema: SCHEMA,
        bundle,
        topology
      },
      null,
      2
    ) + "\n"
  );
}

function verifyPositive(
  bundle
) {
  const sealed =
    sealCageBundleSteps(
      bundle
    );

  return {
    count:
      sealed.records.length,

    allVerify:
      sealed.records.every(
        record =>
          verifyCageStepCer(
            record.cer
          ).ok === true
      )
  };
}

/*
 * ==================================================
 * SOURCE FIXTURES
 * ==================================================
 */

const happy =
  load(
    "01_single_path_happy.json"
  );

const cbf =
  load(
    "02_cbf_block.json"
  );

const loop =
  load(
    "03_loop_breaker.json"
  );

const nemo =
  load(
    "04_nemo_policy_block.json"
  );

/*
 * ==================================================
 * CASE 1
 *
 * Normal happy path:
 * configured terminal node is reached.
 * ==================================================
 */

const c1 =
  clone(happy);

c1.bundleId =
  "50000000-0000-4000-8000-000000000001";

c1.threadId =
  "stage05-happy-terminal-reached";

const t1 =
  topologyFor(
    c1,
    {
      terminalReached: true
    }
  );

/*
 * ==================================================
 * CASE 2
 *
 * Terminal precedence:
 *
 * Even if a CBF BLOCK marker exists, reaching the
 * configured successful terminal node is authoritative.
 *
 * Expected classification remains happy_path.
 * ==================================================
 */

const c2 =
  clone(happy);

c2.bundleId =
  "50000000-0000-4000-8000-000000000002";

c2.threadId =
  "stage05-terminal-precedence";

c2.steps[1].signals = {
  ...(c2.steps[1].signals ?? {}),
  cbf_verdict:
    "BLOCKED",
  stage05InjectedMarker:
    true
};

const t2 =
  topologyFor(
    c2,
    {
      terminalReached: true
    }
  );

/*
 * ==================================================
 * CASE 3
 *
 * Explicit CBF block:
 * successful terminal is NOT reached.
 * ==================================================
 */

const c3 =
  clone(cbf);

c3.bundleId =
  "50000000-0000-4000-8000-000000000003";

c3.threadId =
  "stage05-cbf-block";

const t3 =
  topologyFor(
    c3,
    {
      terminalReached: false
    }
  );

/*
 * ==================================================
 * CASE 4
 *
 * Explicit loop breaker:
 * successful terminal is NOT reached.
 * ==================================================
 */

const c4 =
  clone(loop);

c4.bundleId =
  "50000000-0000-4000-8000-000000000004";

c4.threadId =
  "stage05-loop-breaker";

const t4 =
  topologyFor(
    c4,
    {
      terminalReached: false
    }
  );

/*
 * ==================================================
 * CASE 5
 *
 * Explicit NeMo policy block:
 * successful terminal is NOT reached.
 * ==================================================
 */

const c5 =
  clone(nemo);

c5.bundleId =
  "50000000-0000-4000-8000-000000000005";

c5.threadId =
  "stage05-nemo-block";

const t5 =
  topologyFor(
    c5,
    {
      terminalReached: false
    }
  );

/*
 * ==================================================
 * CASE 6
 *
 * CBF vs loop precedence:
 *
 * Add loop-breaker evidence to an already valid
 * cbf_block execution.
 *
 * Expected classification stays cbf_block.
 * ==================================================
 */

const c6 =
  clone(cbf);

c6.bundleId =
  "50000000-0000-4000-8000-000000000006";

c6.threadId =
  "stage05-cbf-over-loop";

c6.steps.at(-1).metadata = {
  ...(c6.steps.at(-1).metadata ?? {}),
  loop_breaker:
    true
};

const t6 =
  topologyFor(
    c6,
    {
      terminalReached: false
    }
  );

/*
 * ==================================================
 * CASE 7
 *
 * Loop vs NeMo precedence:
 *
 * Add a NeMo block marker to an already valid
 * loop_breaker execution.
 *
 * Expected classification stays loop_breaker.
 * ==================================================
 */

const c7 =
  clone(loop);

c7.bundleId =
  "50000000-0000-4000-8000-000000000007";

c7.threadId =
  "stage05-loop-over-nemo";

c7.steps.at(-1).signals = {
  ...(c7.steps.at(-1).signals ?? {}),
  nemo_verdict:
    "BLOCKED"
};

const t7 =
  topologyFor(
    c7,
    {
      terminalReached: false
    }
  );

/*
 * ==================================================
 * CASE 8
 *
 * Declared path mismatch:
 *
 * Concrete/topology evidence derives cbf_block,
 * but the producer claims happy_path.
 *
 * Must fail with TERMINAL_PATH_MISMATCH.
 * ==================================================
 */

const c8 =
  clone(cbf);

c8.bundleId =
  "50000000-0000-4000-8000-000000000008";

c8.threadId =
  "stage05-terminal-mismatch";

c8.terminalPath =
  "happy_path";

const t8 =
  topologyFor(
    c8,
    {
      terminalReached: false
    }
  );

/*
 * ==================================================
 * TEST DEFINITIONS
 * ==================================================
 */

const cases = [
  {
    name:
      "01_happy_terminal_reached",
    bundle: c1,
    topology: t1,
    expectation: "ACCEPT",
    expectedPath:
      "happy_path"
  },

  {
    name:
      "02_terminal_wins_over_cbf",
    bundle: c2,
    topology: t2,
    expectation: "ACCEPT",
    expectedPath:
      "happy_path"
  },

  {
    name:
      "03_cbf_block",
    bundle: c3,
    topology: t3,
    expectation: "ACCEPT",
    expectedPath:
      "cbf_block"
  },

  {
    name:
      "04_loop_breaker",
    bundle: c4,
    topology: t4,
    expectation: "ACCEPT",
    expectedPath:
      "loop_breaker"
  },

  {
    name:
      "05_nemo_block",
    bundle: c5,
    topology: t5,
    expectation: "ACCEPT",
    expectedPath:
      "nemo_block"
  },

  {
    name:
      "06_cbf_wins_over_loop",
    bundle: c6,
    topology: t6,
    expectation: "ACCEPT",
    expectedPath:
      "cbf_block"
  },

  {
    name:
      "07_loop_wins_over_nemo",
    bundle: c7,
    topology: t7,
    expectation: "ACCEPT",
    expectedPath:
      "loop_breaker"
  },

  {
    name:
      "08_terminal_path_mismatch",
    bundle: c8,
    topology: t8,
    expectation: "REJECT",
    requiredCodes: [
      "TERMINAL_PATH_MISMATCH"
    ]
  }
];

const summary = {
  stage:
    "05a-local-terminal-path-semantics",

  sdk:
    "0.4.0",

  cases: [],

  status:
    "PASS"
};

for (const testCase of cases) {
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

  let sealed =
    null;

  if (
    testCase.expectation ===
    "ACCEPT"
  ) {
    sealed =
      verifyPositive(
        testCase.bundle
      );

    pass =
      report.valid === true &&
      testCase.bundle.terminalPath ===
        testCase.expectedPath &&
      sealed.count ===
        testCase.bundle.steps.length &&
      sealed.allVerify === true;
  } else {
    pass =
      report.valid === false &&
      testCase.requiredCodes.every(
        code =>
          codes.includes(code)
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

    declaredTerminalPath:
      testCase.bundle.terminalPath,

    expectedPath:
      testCase.expectedPath ?? null,

    valid:
      report.valid,

    issueCodes:
      codes,

    requiredCodes:
      testCase.requiredCodes ?? [],

    sealedRecordCount:
      sealed?.count ?? null,

    allCersVerify:
      sealed?.allVerify ?? null,

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
    `declaredTerminalPath=${testCase.bundle.terminalPath}`
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

  if (sealed) {
    console.log(
      `sealedRecords=${sealed.count}`
    );

    console.log(
      `allCersVerify=${sealed.allVerify}`
    );
  }

  console.log(
    `RESULT=${result.status}`
  );
}

fs.writeFileSync(
  path.join(
    RESULT_DIR,
    "stage-05a-summary.json"
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
  "STAGE 5A SUMMARY"
);

console.log(
  "=========================================="
);

console.log(
  `Cases: ${summary.cases.length}/8`
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
