import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  sealCageBundleSteps,
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const FIX =
  path.resolve(
    "fixtures/stage-09"
  );

const RES =
  path.resolve(
    "results/2026-09-17-node-0.29.0/stage-09"
  );

const EXPECTED = {
  cbf:
    "698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9",

  hitl:
    "70e15316a345601ed23d62f5b5b373ac873d25a96c4eb6ba98805c40ff250052"
};

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(file)
    )
    .digest("hex");
}

function issues(report) {
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
      issues(report).map(
        item => item.code
      )
    )
  ];
}

function load(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

const cbfPath =
  path.join(
    FIX,
    "01_real_adapter_cbf_block.json"
  );

const hitlPath =
  path.join(
    FIX,
    "02_real_adapter_hitl_probe.json"
  );

/*
 * ==================================================
 * PIN REAL ADAPTER OUTPUT
 * ==================================================
 */

const cbfHash =
  sha256File(cbfPath);

const hitlHash =
  sha256File(hitlPath);

if (
  cbfHash !==
  EXPECTED.cbf
) {
  throw new Error(
    `CBF fixture changed\n` +
    `expected=${EXPECTED.cbf}\n` +
    `actual=${cbfHash}`
  );
}

if (
  hitlHash !==
  EXPECTED.hitl
) {
  throw new Error(
    `HITL fixture changed\n` +
    `expected=${EXPECTED.hitl}\n` +
    `actual=${hitlHash}`
  );
}

console.log(
  "FIXTURE HASHES: PASS"
);

const cbf =
  load(cbfPath);

const hitl =
  load(hitlPath);

/*
 * ==================================================
 * CASE 1
 * REAL GOOGLE CAGE CBF OUTPUT
 * ==================================================
 */

console.log();
console.log(
  "=== REAL CAGE ADAPTER: CBF BUNDLE ==="
);

const cbfReport =
  validateCageExecution(
    cbf.bundle,
    cbf.topology
  );

console.log(
  "valid:",
  cbfReport.valid
);

console.log(
  "terminalPath:",
  cbf.bundle.terminalPath
);

console.log(
  "nodes:",
  cbf.bundle.steps.map(
    step => step.nodeName
  )
);

console.log(
  "issues:",
  issueCodes(cbfReport)
);

if (
  cbfReport.valid !== true
) {
  console.log(
    JSON.stringify(
      cbfReport,
      null,
      2
    )
  );

  throw new Error(
    "Real adapter CBF bundle unexpectedly failed NexArt validation"
  );
}

if (
  cbf.bundle.terminalPath !==
  "cbf_block"
) {
  throw new Error(
    "Real CAGE adapter did not classify CBF bundle as cbf_block"
  );
}

const sealed =
  sealCageBundleSteps(
    cbf.bundle,
    cbf.topology
  );

if (
  sealed.records.length !==
  cbf.bundle.steps.length
) {
  throw new Error(
    "CBF sealed CER count mismatch"
  );
}

const cbfCertificates = [];

for (
  let i = 0;
  i < sealed.records.length;
  i++
) {
  const record =
    sealed.records[i];

  const verification =
    verifyCageStepCer(
      record.cer
    );

  if (
    verification.ok !== true ||
    verification.certificateIntegrity !==
      "valid"
  ) {
    throw new Error(
      `CBF CER ${i + 1} failed verification`
    );
  }

  cbfCertificates.push(
    record.certificateHash
  );

  console.log(
    `CBF CER ${i + 1}/${sealed.records.length}: PASS ${record.certificateHash}`
  );
}

if (
  new Set(
    cbfCertificates
  ).size !==
  cbfCertificates.length
) {
  throw new Error(
    "CBF adapter bundle produced duplicate certificate hashes"
  );
}

/*
 * ==================================================
 * CASE 2
 * RAW REAL GOOGLE CAGE HITL OUTPUT
 * ==================================================
 */

console.log();
console.log(
  "=== REAL CAGE ADAPTER: RAW HITL BUNDLE ==="
);

const hitlNodes =
  hitl.bundle.steps.map(
    step => step.nodeName
  );

const hitlIndex =
  hitl.bundle.steps.findIndex(
    step =>
      step.nodeName ===
      "hitl_interrupt"
  );

if (
  hitlIndex < 0
) {
  throw new Error(
    "Real adapter did not emit expected hitl_interrupt step"
  );
}

const hitlStep =
  hitl.bundle.steps[
    hitlIndex
  ];

const rawHitlReport =
  validateCageExecution(
    hitl.bundle,
    hitl.topology
  );

const rawHitlIssues =
  issues(
    rawHitlReport
  );

const rawHitlCodes =
  issueCodes(
    rawHitlReport
  );

console.log(
  "valid:",
  rawHitlReport.valid
);

console.log(
  "terminalPath:",
  hitl.bundle.terminalPath
);

console.log(
  "nodes:",
  hitlNodes
);

console.log(
  "issues:",
  rawHitlCodes
);

console.log(
  "hitl stateHash:",
  JSON.stringify(
    hitlStep.stateHash
  )
);

const invalidStateHash =
  rawHitlIssues.find(
    issue =>
      issue.code ===
        "INVALID_STATE_HASH" &&
      String(issue.path)
        .includes(
          `bundle.steps[${hitlIndex}].stateHash`
        )
  );

if (
  rawHitlReport.valid !== false ||
  !invalidStateHash
) {
  console.log(
    JSON.stringify(
      rawHitlReport,
      null,
      2
    )
  );

  throw new Error(
    "Expected real-adapter HITL stateHash incompatibility not observed"
  );
}

if (
  hitlStep.stateHash !== ""
) {
  throw new Error(
    "Expected synthetic HITL stateHash to be empty"
  );
}

if (
  hitl.bundle.terminalPath !==
  "unknown"
) {
  throw new Error(
    "Expected real adapter HITL traversal to classify as unknown"
  );
}

if (
  hitl.topology.nodes.includes(
    "hitl_interrupt"
  )
) {
  throw new Error(
    "Expected published topology not to contain synthetic hitl_interrupt"
  );
}

console.log(
  "RAW HITL GAP 1: PASS — synthetic HITL step has no valid stateHash"
);

console.log(
  "RAW HITL GAP 2: PASS — synthetic hitl_interrupt is absent from supplied topology"
);

/*
 * ==================================================
 * DIAGNOSTIC ONLY
 *
 * Repair ONLY the syntactic stateHash defect on a
 * copy so NexArt validation can progress far enough
 * to expose the second structural incompatibility.
 *
 * This is NOT treated as CAGE-generated evidence and
 * is NEVER a production candidate.
 * ==================================================
 */

console.log();
console.log(
  "=== HITL DIAGNOSTIC: STATEHASH-SYNTAX REPAIR ONLY ==="
);

const diagnostic =
  structuredClone(
    hitl
  );

diagnostic.bundle
  .steps[
    hitlIndex
  ]
  .stateHash =
  crypto
    .createHash("sha256")
    .update(
      "stage09-diagnostic-only-not-a-producer-state-preimage"
    )
    .digest("hex");

const diagnosticReport =
  validateCageExecution(
    diagnostic.bundle,
    diagnostic.topology
  );

const diagnosticIssues =
  issues(
    diagnosticReport
  );

const diagnosticCodes =
  issueCodes(
    diagnosticReport
  );

console.log(
  "valid:",
  diagnosticReport.valid
);

console.log(
  "issues:",
  diagnosticCodes
);

const unknownNode =
  diagnosticIssues.find(
    issue =>
      issue.code ===
        "UNKNOWN_NODE" &&
      String(issue.path)
        .includes(
          `bundle.steps[${hitlIndex}].nodeName`
        )
  );

if (!unknownNode) {
  console.log(
    JSON.stringify(
      diagnosticReport,
      null,
      2
    )
  );

  throw new Error(
    "Expected UNKNOWN_NODE after isolating stateHash defect"
  );
}

console.log(
  "DIAGNOSTIC GAP CONFIRMATION: PASS — UNKNOWN_NODE(hitl_interrupt)"
);

fs.writeFileSync(
  path.join(
    RES,
    "diagnostic-hitl-statehash-syntax-repair.json"
  ),

  JSON.stringify(
    {
      warning:
        "Diagnostic derivative only. Not CAGE-authored evidence and not eligible for production submission.",

      purpose:
        "Isolate the topology incompatibility after the raw CAGE HITL bundle failed earlier on INVALID_STATE_HASH.",

      modifiedField:
        `bundle.steps[${hitlIndex}].stateHash`,

      report:
        diagnosticReport
    },
    null,
    2
  ) + "\n"
);

/*
 * ==================================================
 * CAUSAL OBSERVATION
 * ==================================================
 */

const governedTraderIndex =
  hitl.bundle.steps.findIndex(
    step =>
      step.nodeName ===
      "governed_trader"
  );

const governedTrader =
  governedTraderIndex >= 0
    ? hitl.bundle.steps[
        governedTraderIndex
      ]
    : null;

const governedTraderReferencesHitl =
  governedTrader
    ? governedTrader
        .parentStepIds
        .includes(
          hitlStep.stepId
        )
    : false;

console.log();
console.log(
  "=== HITL CAUSAL OBSERVATION ==="
);

console.log(
  "HITL stepId:",
  hitlStep.stepId
);

console.log(
  "governed_trader parentStepIds:",
  governedTrader?.parentStepIds ?? null
);

console.log(
  "governed_trader references HITL:",
  governedTraderReferencesHitl
);

/*
 * Do not classify this last observation as a standalone
 * protocol defect here. Record it for upstream review.
 */

/*
 * ==================================================
 * SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "09a-real-current-cage-adapter",

  generatedAt:
    new Date().toISOString(),

  upstream: {
    repository:
      "google/cybernetic-agent-governance-engine",

    commit:
      "8162958ac23d958871fd4016f349a7062627fd4d",

    adapter:
      "src/integrations/provider_02/adapter.py",

    topology:
      "src/cage_finance/graph_topology.py"
  },

  governedExecutionSdk:
    "0.4.0",

  productionWrites:
    0,

  fixtureHashes: {
    realAdapterCbf:
      cbfHash,

    realAdapterHitl:
      hitlHash
  },

  realAdapterCbf: {
    valid:
      true,

    terminalPath:
      cbf.bundle.terminalPath,

    stepCount:
      cbf.bundle.steps.length,

    nodeNames:
      cbf.bundle.steps.map(
        step => step.nodeName
      ),

    cerCount:
      sealed.records.length,

    uniqueCertificateHashes:
      new Set(
        cbfCertificates
      ).size,

    allCersVerified:
      true,

    certificateHashes:
      cbfCertificates,

    status:
      "PASS"
  },

  realAdapterHitlProbe: {
    rawBundleValid:
      false,

    terminalPath:
      hitl.bundle.terminalPath,

    stepCount:
      hitl.bundle.steps.length,

    nodeNames:
      hitlNodes,

    rawIssueCodes:
      rawHitlCodes,

    upstreamGaps: [
      {
        code:
          "HITL_STATE_HASH_OMITTED",

        evidence:
          "synthetic hitl_interrupt step carries empty stateHash",

        nexartResult:
          "INVALID_STATE_HASH"
      },

      {
        code:
          "HITL_SYNTHETIC_NODE_NOT_IN_TOPOLOGY",

        evidence:
          "hitl_interrupt is emitted by the adapter but absent from supplied topology.nodes",

        diagnosticResult:
          "UNKNOWN_NODE"
      }
    ],

    diagnosticOnlyStateHashRepair:
      true,

    diagnosticIssueCodes:
      diagnosticCodes,

    status:
      "EXPECTED_UPSTREAM_GAPS"
  },

  causalObservation: {
    hitlStepId:
      hitlStep.stepId,

    governedTraderStepId:
      governedTrader?.stepId ?? null,

    governedTraderParentStepIds:
      governedTrader?.parentStepIds ?? null,

    governedTraderReferencesHitlStep:
      governedTraderReferencesHitl,

    classification:
      "OBSERVED_ONLY_NOT_INDEPENDENTLY_CLASSIFIED_AS_DEFECT"
  },

  initialAttempt: {
    classification:
      "HARNESS_EXPECTATION_INCOMPLETE",

    explanation:
      "The original Stage 9A harness expected UNKNOWN_NODE directly, but the real CAGE HITL bundle fails earlier because the synthetic HITL step has an empty stateHash.",

    productionFailure:
      false
  },

  claimBoundary: {
    cbfFixture:
      "generated directly by the pinned Google CAGE provider_02 adapter",

    hitlFixture:
      "generated directly by the pinned Google CAGE provider_02 adapter and rejected unchanged by NexArt",

    diagnosticDerivative:
      "used only to isolate the second topology defect; not CAGE-authored evidence and not eligible for production submission",

    stateHash:
      "producer-supplied opaque commitment; NexArt validates shape and cryptographic binding but does not verify the private preimage",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed"
  },

  status:
    "PASS"
};

fs.writeFileSync(
  path.join(
    RES,
    "stage-09a-summary.json"
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
  "STAGE 9A SUMMARY"
);

console.log(
  "=========================================="
);

console.log(
  "Real CAGE adapter CBF bundle: PASS"
);

console.log(
  `Real CAGE adapter CBF CERs: ${sealed.records.length}/${sealed.records.length}`
);

console.log(
  "Raw CAGE HITL stateHash gap: CONFIRMED"
);

console.log(
  "Synthetic HITL topology gap: CONFIRMED"
);

console.log(
  "HITL production eligible: NO"
);

console.log(
  "CBF production candidate: YES"
);

console.log(
  "Production writes: 0"
);

console.log(
  "FINAL RESULT: PASS"
);
