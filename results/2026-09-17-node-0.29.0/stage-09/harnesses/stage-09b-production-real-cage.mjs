import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";

import {
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL =
  process.env.NODE_URL;

const API_KEY =
  process.env.NEXART_API_KEY;

const FIXTURE =
  process.env.FIXTURE;

const RUN_DIR =
  process.env.RUN_DIR;

const EXPECTED_SHA256 =
  "698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9";

const EXPECTED_BUNDLE_ID =
  "613702d8-fdc0-40bc-9723-c21111c216db";

const EXPECTED_THREAD_ID =
  "stage09-real-adapter-cbf";

const EXPECTED_TERMINAL_PATH =
  "cbf_block";

const EXPECTED_NODE_NAMES = [
  "nemo_guardrail",
  "evaluator",
  "safety_check",
  "explainer"
];

if (!NODE_URL)
  throw new Error("NODE_URL missing");

if (!API_KEY)
  throw new Error("NEXART_API_KEY missing");

if (!FIXTURE)
  throw new Error("FIXTURE missing");

if (!RUN_DIR)
  throw new Error("RUN_DIR missing");

function sha256(data) {
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
}

function writeJson(name, value) {
  fs.writeFileSync(
    path.join(
      RUN_DIR,
      name
    ),
    JSON.stringify(
      value,
      null,
      2
    ) + "\n"
  );
}

function authHeaders(extra = {}) {
  return {
    Authorization:
      `Bearer ${API_KEY}`,
    ...extra
  };
}

async function fetchJson(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      options
    );

  const raw =
    await response.text();

  let body;

  try {
    body =
      JSON.parse(raw);
  } catch {
    body = {
      __nonJsonBody:
        raw
    };
  }

  return {
    response,
    raw,
    body
  };
}

function saveHttp(
  prefix,
  result
) {
  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${prefix}.raw.json`
    ),
    result.raw
  );

  writeJson(
    `${prefix}.json`,
    result.body
  );

  writeJson(
    `${prefix}-headers.json`,
    Object.fromEntries(
      result.response.headers.entries()
    )
  );
}

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            canonical(value[key])
          ]
        )
    );
  }

  return value;
}

function sameJson(a, b) {
  return (
    JSON.stringify(
      canonical(a)
    ) ===
    JSON.stringify(
      canonical(b)
    )
  );
}

/*
 * ==================================================
 * 1. PIN EXACT AUTHORIZED FIXTURE
 * ==================================================
 */

console.log(
  "=== STAGE 9B: EXACT FIXTURE CHECK ==="
);

const raw =
  fs.readFileSync(
    FIXTURE
  );

const fixtureSha256 =
  sha256(raw);

console.log(
  `fixtureSha256=${fixtureSha256}`
);

if (
  fixtureSha256 !==
  EXPECTED_SHA256
) {
  throw new Error(
    `AUTHORIZED FIXTURE HASH MISMATCH\n` +
    `expected=${EXPECTED_SHA256}\n` +
    `actual=${fixtureSha256}`
  );
}

const request =
  JSON.parse(
    raw.toString("utf8")
  );

if (
  request.bundle?.bundleId !==
  EXPECTED_BUNDLE_ID
) {
  throw new Error(
    "Authorized bundleId mismatch"
  );
}

if (
  request.bundle?.threadId !==
  EXPECTED_THREAD_ID
) {
  throw new Error(
    "Authorized threadId mismatch"
  );
}

if (
  request.bundle?.terminalPath !==
  EXPECTED_TERMINAL_PATH
) {
  throw new Error(
    "Authorized terminalPath mismatch"
  );
}

if (
  request.bundle?.steps?.length !== 4
) {
  throw new Error(
    "Expected exactly four CAGE steps"
  );
}

assert.deepEqual(
  request.bundle.steps.map(
    step => step.nodeName
  ),
  EXPECTED_NODE_NAMES
);

console.log(
  "AUTHORIZED FIXTURE: PASS"
);

console.log(
  `bundleId=${request.bundle.bundleId}`
);

console.log(
  `threadId=${request.bundle.threadId}`
);

console.log(
  `terminalPath=${request.bundle.terminalPath}`
);

console.log(
  "steps=4"
);

/*
 * ==================================================
 * 2. LOCAL SDK VALIDATION
 * ==================================================
 */

console.log();
console.log(
  "=== LOCAL SDK VALIDATION ==="
);

const localReport =
  validateCageExecution(
    request.bundle,
    request.topology
  );

writeJson(
  "00-local-validation.json",
  localReport
);

if (
  localReport.valid !== true
) {
  throw new Error(
    "Frozen real-CAGE bundle no longer passes local SDK validation"
  );
}

console.log(
  "LOCAL VALIDATION: PASS"
);

/*
 * ==================================================
 * 3. AUTHENTICATED READ-ONLY PREFLIGHT
 *
 * MUST BE 404.
 *
 * This protects the single-POST authorization:
 * if this harness is accidentally rerun after a
 * successful registration, it stops BEFORE POST.
 * ==================================================
 */

console.log();
console.log(
  "=== PRODUCTION EXISTENCE PREFLIGHT ==="
);

const preflight =
  await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(EXPECTED_BUNDLE_ID)}`,
    {
      headers:
        authHeaders()
    }
  );

saveHttp(
  "01-preflight",
  preflight
);

console.log(
  `HTTP STATUS: ${preflight.response.status}`
);

if (
  preflight.response.status !== 404
) {
  throw new Error(
    `STOP: Stage 9B bundle already exists or preflight is not clean. ` +
    `Expected 404, got ${preflight.response.status}. NO POST PERFORMED.`
  );
}

console.log(
  "PREFLIGHT: PASS — authorized bundle identity absent"
);

/*
 * ==================================================
 * 4. THE SINGLE AUTHORIZED PRODUCTION POST
 *
 * There is exactly ONE POST call in this harness.
 * Exact frozen bytes are sent unchanged.
 * ==================================================
 */

console.log();
console.log(
  "=== SINGLE AUTHORIZED STAGE 9B PRODUCTION POST ==="
);

const submission =
  await fetchJson(
    `${NODE_URL}/v1/cage/bundles`,
    {
      method:
        "POST",

      headers:
        authHeaders({
          "Content-Type":
            "application/json",

          "X-Idempotency-Key":
            "cage-stage09b-real-adapter-cbf-20260917"
        }),

      body:
        raw
    }
  );

saveHttp(
  "02-submission",
  submission
);

console.log(
  `HTTP STATUS: ${submission.response.status}`
);

/*
 * IMPORTANT:
 *
 * From this point onward the authorized POST has been
 * consumed, regardless of whether a later harness
 * assertion fails.
 */

if (
  submission.response.status !==
  201
) {
  throw new Error(
    `Expected HTTP 201, got ${submission.response.status}\n` +
    JSON.stringify(
      submission.body,
      null,
      2
    )
  );
}

if (
  submission.body?.ok !== true
) {
  throw new Error(
    "Expected production response ok=true"
  );
}

if (
  submission.body?.replayed !== false
) {
  throw new Error(
    `Expected replayed=false, got ${submission.body?.replayed}`
  );
}

if (
  submission.body?.bundleId !==
  EXPECTED_BUNDLE_ID
) {
  throw new Error(
    "Production response bundleId mismatch"
  );
}

if (
  submission.body?.threadId !==
  EXPECTED_THREAD_ID
) {
  throw new Error(
    "Production response threadId mismatch"
  );
}

if (
  submission.body?.terminalPath !==
  EXPECTED_TERMINAL_PATH
) {
  throw new Error(
    `Production terminalPath mismatch\n` +
    `expected=${EXPECTED_TERMINAL_PATH}\n` +
    `actual=${submission.body?.terminalPath}`
  );
}

if (
  !Array.isArray(
    submission.body?.records
  ) ||
  submission.body.records.length !== 4
) {
  throw new Error(
    "Expected four production issuance records"
  );
}

console.log(
  "SUBMISSION: PASS"
);

console.log(
  "replayed=false"
);

console.log(
  `terminalPath=${submission.body.terminalPath}`
);

console.log(
  `records=${submission.body.records.length}`
);

/*
 * ==================================================
 * 5. AUTHENTICATED BUNDLE READ-BACK
 * ==================================================
 */

console.log();
console.log(
  "=== AUTHENTICATED BUNDLE READ-BACK ==="
);

const bundleRead =
  await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(EXPECTED_BUNDLE_ID)}`,
    {
      headers:
        authHeaders()
    }
  );

saveHttp(
  "03-bundle-readback",
  bundleRead
);

if (
  bundleRead.response.status !==
  200
) {
  throw new Error(
    `Expected bundle read HTTP 200, got ${bundleRead.response.status}`
  );
}

/*
 * GET /v1/cage/bundles/:bundleId returns:
 *
 * {
 *   ok: true,
 *   bundle: {...}
 * }
 */

const persistedBundle =
  bundleRead.body?.bundle;

if (!persistedBundle) {
  throw new Error(
    "Persisted bundle response missing nested bundle object"
  );
}

if (
  persistedBundle.bundleId !==
  EXPECTED_BUNDLE_ID
) {
  throw new Error(
    "Persisted bundleId mismatch"
  );
}

if (
  persistedBundle.threadId !==
  EXPECTED_THREAD_ID
) {
  throw new Error(
    "Persisted threadId mismatch"
  );
}

if (
  persistedBundle.terminalPath !==
  EXPECTED_TERMINAL_PATH
) {
  throw new Error(
    "Persisted terminalPath mismatch"
  );
}

console.log(
  "BUNDLE READ-BACK: PASS"
);

console.log(
  `terminalPath=${persistedBundle.terminalPath}`
);

/*
 * ==================================================
 * 6. AUTHENTICATED STEP / CER READ-BACK
 * ==================================================
 */

console.log();
console.log(
  "=== STEP + CER READ-BACK ==="
);

const stepsRead =
  await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(EXPECTED_BUNDLE_ID)}/steps`,
    {
      headers:
        authHeaders()
    }
  );

saveHttp(
  "04-steps-readback",
  stepsRead
);

if (
  stepsRead.response.status !==
  200
) {
  throw new Error(
    `Expected steps HTTP 200, got ${stepsRead.response.status}`
  );
}

const rows =
  stepsRead.body?.steps;

if (
  !Array.isArray(rows) ||
  rows.length !== 4
) {
  throw new Error(
    "Expected exactly four persisted CAGE steps"
  );
}

const certificateHashes =
  [];

const stepResults =
  [];

for (
  let i = 0;
  i < rows.length;
  i++
) {
  const row =
    rows[i];

  const expectedStep =
    request.bundle.steps[i];

  const cer =
    row?.proof?.proofJson;

  if (!cer) {
    throw new Error(
      `Step ${i}: missing proof.proofJson`
    );
  }

  const verification =
    verifyCageStepCer(
      cer
    );

  const checks = {
    sdkVerification:
      verification.ok === true,

    certificateIntegrity:
      verification.certificateIntegrity ===
      "valid",

    stateHashBoundary:
      verification.stateHashVerification ===
      "not-performed",

    bundleId:
      cer.bundleId ===
      EXPECTED_BUNDLE_ID,

    threadId:
      cer.threadId ===
      EXPECTED_THREAD_ID,

    stepExact:
      sameJson(
        cer.step,
        expectedStep
      ),

    stepId:
      cer.step?.stepId ===
      expectedStep.stepId,

    nodeName:
      cer.step?.nodeName ===
      expectedStep.nodeName,

    parentStepIds:
      sameJson(
        cer.step?.parentStepIds,
        expectedStep.parentStepIds
      ),

    signals:
      sameJson(
        cer.step?.signals,
        expectedStep.signals
      ),

    metadata:
      sameJson(
        cer.step?.metadata,
        expectedStep.metadata
      ),

    stateHash:
      cer.step?.stateHash ===
      expectedStep.stateHash,

    indexedCertificateHash:
      row.certificateHash ===
      cer.certificateHash,

    certificateHashShape:
      /^sha256:[a-f0-9]{64}$/.test(
        cer.certificateHash ?? ""
      )
  };

  if (
    !Object.values(checks)
      .every(Boolean)
  ) {
    throw new Error(
      `Step ${i}: persisted CER mismatch\n` +
      JSON.stringify(
        checks,
        null,
        2
      )
    );
  }

  certificateHashes.push(
    cer.certificateHash
  );

  stepResults.push({
    ordinal:
      i,

    stepId:
      expectedStep.stepId,

    nodeName:
      expectedStep.nodeName,

    certificateHash:
      cer.certificateHash,

    stateHash:
      expectedStep.stateHash,

    stateHashVerification:
      verification.stateHashVerification,

    status:
      "PASS"
  });

  console.log(
    `CER ${i + 1}/4: PASS ` +
    `${expectedStep.nodeName} ` +
    `${cer.certificateHash}`
  );
}

if (
  new Set(
    certificateHashes
  ).size !== 4
) {
  throw new Error(
    "Expected four unique certificate hashes"
  );
}

/*
 * ==================================================
 * 7. FINAL SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "09b-production-real-google-cage-adapter",

  generatedAt:
    new Date().toISOString(),

  baseline: {
    upstreamRepository:
      "google/cybernetic-agent-governance-engine",

    upstreamCommit:
      "8162958ac23d958871fd4016f349a7062627fd4d",

    upstreamAdapter:
      "src/integrations/provider_02/adapter.py",

    governedExecutionSdk:
      "0.4.0",

    canonicalNode:
      "0.29.0"
  },

  authorization: {
    authorizedPostCount:
      1,

    executedPostCount:
      1,

    bundleId:
      EXPECTED_BUNDLE_ID,

    fixtureSha256:
      EXPECTED_SHA256
  },

  sourceEvidence: {
    generatedBy:
      "pinned Google CAGE provider_02 adapter",

    handAuthoredByNexArt:
      false,

    fixtureSha256,

    threadId:
      EXPECTED_THREAD_ID,

    terminalPath:
      EXPECTED_TERMINAL_PATH,

    stepCount:
      request.bundle.steps.length,

    nodeNames:
      request.bundle.steps.map(
        step => step.nodeName
      )
  },

  production: {
    preflightHttpStatus:
      preflight.response.status,

    submissionHttpStatus:
      submission.response.status,

    replayed:
      submission.body.replayed,

    persistedBundleReadHttpStatus:
      bundleRead.response.status,

    persistedStepsReadHttpStatus:
      stepsRead.response.status,

    persistedStepCount:
      rows.length,

    verifiedCerCount:
      stepResults.length,

    uniqueCertificateHashes:
      new Set(
        certificateHashes
      ).size,

    certificateHashes
  },

  steps:
    stepResults,

  semanticResults: {
    exactFrozenFixtureSubmitted:
      "PASS",

    realCageBundleAccepted:
      "PASS",

    cbfTerminalPathPreserved:
      "PASS",

    stepIdentityPreserved:
      "PASS",

    parentStepIdsPreserved:
      "PASS",

    signalsPreserved:
      "PASS",

    metadataPreserved:
      "PASS",

    stateHashPreserved:
      "PASS",

    cerVerification:
      "PASS"
  },

  excludedFromProduction: {
    hitlFixture:
      true,

    reason:
      "Stage 09A confirmed upstream HITL evidence incompatibilities"
  },

  claimBoundary: {
    integrationEvidence:
      "demonstrates interoperability of unchanged CAGE provider_02 CBF output with NexArt production ingestion",

    stateHash:
      "producer-generated opaque commitment preserved and certificate-bound; private preimage not independently verified",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed",

    policyCorrectness:
      "not claimed"
  },

  status:
    submission.response.status === 201 &&
    submission.body.replayed === false &&
    rows.length === 4 &&
    stepResults.length === 4 &&
    new Set(
      certificateHashes
    ).size === 4
      ? "PASS"
      : "FAIL"
};

writeJson(
  "stage-09b-summary.json",
  summary
);

console.log();
console.log(
  "=================================================="
);

console.log(
  "STAGE 9B SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  "Authorized production POSTs: 1/1"
);

console.log(
  "Executed production POSTs: 1/1"
);

console.log(
  "Real CAGE bundles persisted: 1/1"
);

console.log(
  `Persisted CERs: ${rows.length}/4`
);

console.log(
  `Verified CERs: ${stepResults.length}/4`
);

console.log(
  `Unique certificate hashes: ${
    new Set(
      certificateHashes
    ).size
  }/4`
);

console.log(
  "terminalPath: cbf_block"
);

console.log(
  "HITL fixture submitted: NO"
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
