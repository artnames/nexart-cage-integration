import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL = process.env.NODE_URL;
const API_KEY = process.env.NEXART_API_KEY;
const FIXTURE_DIR = process.env.FIXTURE_DIR;
const RUN_DIR = process.env.RUN_DIR;

if (!NODE_URL) throw new Error("NODE_URL missing");
if (!API_KEY) throw new Error("NEXART_API_KEY missing");
if (!FIXTURE_DIR) throw new Error("FIXTURE_DIR missing");
if (!RUN_DIR) throw new Error("RUN_DIR missing");

const cases = [
  {
    name: "02_terminal_wins_over_cbf",
    file: "02_terminal_wins_over_cbf.json",
    expectedSha256:
      "0d3fb0712b43256dfcd2c3cdcb0c9c482762b6652d96b32fd9050223e3f0b575",
    mode: "RECOVER_EXISTING",
    expectedTerminalPath: "happy_path",
    expectedSteps: 4
  },
  {
    name: "06_cbf_wins_over_loop",
    file: "06_cbf_wins_over_loop.json",
    expectedSha256:
      "dab7d26e2f06213340090af14d49d884e37f8c7541cd357c213cd73216eb3f24",
    mode: "SUBMIT_ACCEPT",
    expectedTerminalPath: "cbf_block",
    expectedSteps: 3
  },
  {
    name: "07_loop_wins_over_nemo",
    file: "07_loop_wins_over_nemo.json",
    expectedSha256:
      "d3c7a22c3bd27ac1a7fe4681ff1d27164e696f3ba2367f79ce3aadd8373cb608",
    mode: "SUBMIT_ACCEPT",
    expectedTerminalPath: "loop_breaker",
    expectedSteps: 6
  },
  {
    name: "08_terminal_path_mismatch",
    file: "08_terminal_path_mismatch.json",
    expectedSha256:
      "cea2725e05917b2e29b3101677fb5c489dda57a6b6ff2f951d9621954b6d4387",
    mode: "SUBMIT_REJECT",
    expectedReasonCode:
      "TERMINAL_PATH_MISMATCH",
    requiredIssueCodes: [
      "TERMINAL_PATH_MISMATCH"
    ]
  }
];

function sha256(data) {
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
}

function writeJson(name, value) {
  fs.writeFileSync(
    path.join(RUN_DIR, name),
    JSON.stringify(value, null, 2) + "\n"
  );
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${API_KEY}`,
    ...extra
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    body = {
      __nonJsonBody: raw
    };
  }

  return {
    response,
    raw,
    body
  };
}

function issueCodes(report) {
  return [
    ...(report.schemaErrors ?? []),
    ...(report.causalErrors ?? []),
    ...(report.topologyErrors ?? []),
    ...(report.resourceErrors ?? [])
  ].map(issue => issue.code);
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
        .map(key => [
          key,
          canonical(value[key])
        ])
    );
  }

  return value;
}

function sameJson(a, b) {
  return JSON.stringify(canonical(a)) ===
    JSON.stringify(canonical(b));
}

function sameArray(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every(
      (value, index) =>
        value === b[index]
    )
  );
}

/*
 * ==================================================
 * LOAD + HASH + LOCAL VALIDATION
 * ==================================================
 */

console.log(
  "=== STAGE 5B RECOVERY: FIXTURE VALIDATION ==="
);

const loaded = [];

for (const item of cases) {
  const fixturePath =
    path.join(
      FIXTURE_DIR,
      item.file
    );

  const raw =
    fs.readFileSync(
      fixturePath
    );

  const actualSha256 =
    sha256(raw);

  if (
    actualSha256 !==
    item.expectedSha256
  ) {
    throw new Error(
      `${item.file}: fixture hash mismatch`
    );
  }

  const request =
    JSON.parse(
      raw.toString("utf8")
    );

  const report =
    validateCageExecution(
      request.bundle,
      request.topology
    );

  const codes =
    issueCodes(report);

  if (
    item.mode ===
    "SUBMIT_REJECT"
  ) {
    if (
      report.valid !== false ||
      !item.requiredIssueCodes.every(
        code => codes.includes(code)
      )
    ) {
      throw new Error(
        `${item.file}: negative local validation mismatch`
      );
    }
  } else {
    if (
      report.valid !== true
    ) {
      throw new Error(
        `${item.file}: positive local validation failed`
      );
    }
  }

  loaded.push({
    ...item,
    raw,
    request,
    actualSha256
  });

  writeJson(
    `${item.name}-local-validation.json`,
    report
  );

  console.log(
    `${item.file}: HASH PASS / LOCAL PASS`
  );
}

const certificateHashes =
  new Set();

let verifiedCers = 0;

const positiveResults = [];
const negativeResults = [];

/*
 * ==================================================
 * SHARED POSITIVE READ-BACK VERIFIER
 * ==================================================
 */

async function verifyPersistedPositive(
  item,
  origin
) {
  const bundle =
    item.request.bundle;

  const bundleId =
    bundle.bundleId;

  const {
    response: bundleResponse,
    raw: bundleRaw,
    body: bundleBody
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}`,
    {
      headers:
        authHeaders()
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-${origin}-bundle.raw.json`
    ),
    bundleRaw
  );

  writeJson(
    `${item.name}-${origin}-bundle.json`,
    bundleBody
  );

  if (
    bundleResponse.status !== 200
  ) {
    throw new Error(
      `${item.file}: expected persisted bundle HTTP 200, got ${bundleResponse.status}`
    );
  }

  /*
   * IMPORTANT:
   * GET /v1/cage/bundles/:bundleId returns
   *
   * { ok: true, bundle: {...} }
   */

  const persistedBundle =
    bundleBody?.bundle;

  if (!persistedBundle) {
    throw new Error(
      `${item.file}: GET bundle response missing nested bundle object`
    );
  }

  if (
    persistedBundle.bundleId !==
    bundleId
  ) {
    throw new Error(
      `${item.file}: persisted bundleId mismatch`
    );
  }

  if (
    persistedBundle.terminalPath !==
    item.expectedTerminalPath
  ) {
    throw new Error(
      `${item.file}: persisted terminalPath mismatch\n` +
      `expected=${item.expectedTerminalPath}\n` +
      `actual=${persistedBundle.terminalPath}`
    );
  }

  console.log(
    `${item.file}: PERSISTED TERMINAL PATH PASS (${persistedBundle.terminalPath})`
  );

  const {
    response: stepsResponse,
    raw: stepsRaw,
    body: stepsBody
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}/steps`,
    {
      headers:
        authHeaders()
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-${origin}-steps.raw.json`
    ),
    stepsRaw
  );

  writeJson(
    `${item.name}-${origin}-steps.json`,
    stepsBody
  );

  if (
    stepsResponse.status !== 200 ||
    !Array.isArray(
      stepsBody.steps
    ) ||
    stepsBody.steps.length !==
      item.expectedSteps
  ) {
    throw new Error(
      `${item.file}: persisted step collection mismatch`
    );
  }

  let fixtureVerified = 0;

  for (
    let i = 0;
    i < stepsBody.steps.length;
    i++
  ) {
    const row =
      stepsBody.steps[i];

    const expectedStep =
      bundle.steps[i];

    const cer =
      row?.proof?.proofJson;

    if (!cer) {
      throw new Error(
        `${item.file}: missing proof.proofJson at step ${i}`
      );
    }

    const verification =
      verifyCageStepCer(
        cer
      );

    const checks = {
      sdkOk:
        verification.ok === true,

      certificateIntegrity:
        verification.certificateIntegrity ===
        "valid",

      stateHashNotPerformed:
        verification.stateHashVerification ===
        "not-performed",

      stepIdPreserved:
        cer.step?.stepId ===
        expectedStep.stepId,

      nodeNamePreserved:
        cer.step?.nodeName ===
        expectedStep.nodeName,

      parentsPreserved:
        sameArray(
          cer.step?.parentStepIds,
          expectedStep.parentStepIds
        ),

      signalsPreserved:
        sameJson(
          cer.step?.signals,
          expectedStep.signals
        ),

      metadataPreserved:
        sameJson(
          cer.step?.metadata,
          expectedStep.metadata
        ),

      stateHashPreserved:
        cer.step?.stateHash ===
        expectedStep.stateHash,

      indexedHashMatches:
        row.certificateHash ===
        cer.certificateHash,

      certificateHashShape:
        /^sha256:[a-f0-9]{64}$/.test(
          cer.certificateHash ?? ""
        ),

      uniqueCertificateHash:
        !certificateHashes.has(
          cer.certificateHash
        )
    };

    if (
      !Object.values(checks)
        .every(Boolean)
    ) {
      throw new Error(
        `${item.file}: persisted CER verification failed\n` +
        JSON.stringify(checks, null, 2)
      );
    }

    certificateHashes.add(
      cer.certificateHash
    );

    fixtureVerified++;
    verifiedCers++;

    console.log(
      `${item.file} CER ${i + 1}/${stepsBody.steps.length}: PASS ` +
      `${cer.certificateHash}`
    );
  }

  positiveResults.push({
    fixture:
      item.file,

    bundleId,

    origin,

    terminalPath:
      persistedBundle.terminalPath,

    persistedStepCount:
      stepsBody.steps.length,

    verifiedCers:
      fixtureVerified,

    status:
      "PASS"
  });
}

/*
 * ==================================================
 * 1. RECOVER FIRST SUCCESSFUL REQUEST
 *
 * NO POST HERE.
 * ==================================================
 */

console.log();
console.log(
  "=== RECOVER ALREADY-PERSISTED FIRST REQUEST ==="
);

const recovered =
  loaded.find(
    item =>
      item.mode ===
      "RECOVER_EXISTING"
  );

await verifyPersistedPositive(
  recovered,
  "recovered"
);

console.log(
  "RECOVERY RESULT: PASS — existing first Stage 5B bundle verified without replay"
);

/*
 * ==================================================
 * 2. PREFLIGHT ONLY THE THREE REMAINING REQUESTS
 * ==================================================
 */

console.log();
console.log(
  "=== REMAINING REQUESTS PREFLIGHT ==="
);

const pending =
  loaded.filter(
    item =>
      item.mode !==
      "RECOVER_EXISTING"
  );

for (const item of pending) {
  const bundleId =
    item.request.bundle.bundleId;

  const {
    response,
    raw,
    body
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}`,
    {
      headers:
        authHeaders()
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-preflight.raw.json`
    ),
    raw
  );

  writeJson(
    `${item.name}-preflight.json`,
    body
  );

  console.log(
    `${item.file}: HTTP ${response.status}`
  );

  if (
    response.status !== 404
  ) {
    throw new Error(
      `${item.file}: expected 404 before remaining Stage 5B request`
    );
  }
}

console.log(
  "REMAINING PREFLIGHT: PASS — all three pending bundle IDs absent"
);

/*
 * ==================================================
 * 3. SUBMIT ONLY THE REMAINING THREE
 * ==================================================
 */

console.log();
console.log(
  "=== REMAINING AUTHORIZED STAGE 5B REQUESTS ==="
);

for (const item of pending) {
  const bundleId =
    item.request.bundle.bundleId;

  const idempotencyKey =
    `cage-stage05-20260917-${item.name}`;

  const {
    response,
    raw,
    body
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles`,
    {
      method: "POST",

      headers: authHeaders({
        "Content-Type":
          "application/json",

        "X-Idempotency-Key":
          idempotencyKey
      }),

      body:
        item.raw
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-submission.raw.json`
    ),
    raw
  );

  writeJson(
    `${item.name}-submission.json`,
    body
  );

  writeJson(
    `${item.name}-submission-headers.json`,
    Object.fromEntries(
      response.headers.entries()
    )
  );

  console.log();
  console.log(item.file);
  console.log(
    `HTTP STATUS: ${response.status}`
  );

  /*
   * Positive pending cases.
   */

  if (
    item.mode ===
    "SUBMIT_ACCEPT"
  ) {
    if (
      response.status !== 201
    ) {
      throw new Error(
        `${item.file}: expected HTTP 201\n` +
        JSON.stringify(body, null, 2)
      );
    }

    if (
      body?.ok !== true
    ) {
      throw new Error(
        `${item.file}: expected ok=true`
      );
    }

    if (
      body?.terminalPath !==
      item.expectedTerminalPath
    ) {
      throw new Error(
        `${item.file}: submission terminalPath mismatch`
      );
    }

    if (
      !Array.isArray(
        body.records
      ) ||
      body.records.length !==
        item.expectedSteps
    ) {
      throw new Error(
        `${item.file}: issuance record count mismatch`
      );
    }

    console.log(
      `SUBMISSION TERMINAL PATH: PASS (${body.terminalPath})`
    );

    console.log(
      `INGEST: PASS (${body.records.length}/${item.expectedSteps})`
    );

    await verifyPersistedPositive(
      item,
      "submitted"
    );

    continue;
  }

  /*
   * Negative mismatch case.
   */

  if (
    response.status !== 422
  ) {
    throw new Error(
      `${item.file}: expected HTTP 422\n` +
      JSON.stringify(body, null, 2)
    );
  }

  if (
    body?.error !==
    "CAGE_VALIDATION_FAILED"
  ) {
    throw new Error(
      `${item.file}: expected CAGE_VALIDATION_FAILED`
    );
  }

  if (
    body?.reasonCode !==
    item.expectedReasonCode
  ) {
    throw new Error(
      `${item.file}: expected reasonCode ${item.expectedReasonCode}, got ${body?.reasonCode}`
    );
  }

  const productionIssueCodes =
    Array.isArray(
      body.issues
    )
      ? body.issues.map(
          issue => issue.code
        )
      : [];

  for (
    const required of
    item.requiredIssueCodes
  ) {
    if (
      !productionIssueCodes.includes(
        required
      )
    ) {
      throw new Error(
        `${item.file}: missing production issue ${required}`
      );
    }
  }

  console.log(
    `REJECTION: PASS reasonCode=${body.reasonCode}`
  );

  /*
   * Prove rejected mismatch did not persist.
   */

  const {
    response: bundleCheckResponse,
    raw: bundleCheckRaw,
    body: bundleCheckBody
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}`,
    {
      headers:
        authHeaders()
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-post-rejection-bundle-check.raw.json`
    ),
    bundleCheckRaw
  );

  writeJson(
    `${item.name}-post-rejection-bundle-check.json`,
    bundleCheckBody
  );

  const {
    response: stepsCheckResponse,
    raw: stepsCheckRaw,
    body: stepsCheckBody
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}/steps`,
    {
      headers:
        authHeaders()
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-post-rejection-steps-check.raw.json`
    ),
    stepsCheckRaw
  );

  writeJson(
    `${item.name}-post-rejection-steps-check.json`,
    stepsCheckBody
  );

  if (
    bundleCheckResponse.status !== 404 ||
    stepsCheckResponse.status !== 404
  ) {
    throw new Error(
      `${item.file}: rejected terminal mismatch unexpectedly persisted`
    );
  }

  console.log(
    "PERSISTENCE AFTER REJECTION: PASS — bundle=404 steps=404"
  );

  negativeResults.push({
    fixture:
      item.file,

    bundleId,

    httpStatus:
      response.status,

    reasonCode:
      body.reasonCode,

    issueCodes:
      productionIssueCodes,

    bundleReadAfterRejection:
      bundleCheckResponse.status,

    stepsReadAfterRejection:
      stepsCheckResponse.status,

    persisted:
      false,

    status:
      "PASS"
  });
}

/*
 * ==================================================
 * 4. FINAL RECOVERED STAGE 5B SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "05b-production-terminal-path-precedence",

  recovery:
    {
      required:
        true,

      cause:
        "initial harness read persisted terminalPath from the response wrapper instead of response.bundle",

      classification:
        "HARNESS_DEFECT",

      productionFailure:
        false,

      originalSuccessfulRequestCount:
        1,

      resumedRequestCount:
        3
    },

  generatedAt:
    new Date().toISOString(),

  baseline: {
    governedExecutionSdk:
      "0.4.0",

    canonicalNode:
      "0.29.0",

    schema:
      "urn:cage:governance:v1:attestation-bundle"
  },

  productionWriteAuthorized:
    true,

  authorizedRequestCount:
    4,

  persistedProductionBundles:
    positiveResults.length,

  expectedPersistedProductionBundles:
    3,

  rejectedRequests:
    negativeResults.length,

  expectedRejectedRequests:
    1,

  verifiedCerCount:
    verifiedCers,

  expectedVerifiedCerCount:
    13,

  uniqueCertificateHashes:
    certificateHashes.size,

  expectedUniqueCertificateHashes:
    13,

  positiveCases:
    positiveResults,

  negativeCases:
    negativeResults,

  fixtureHashes:
    Object.fromEntries(
      loaded.map(
        item => [
          item.file,
          item.actualSha256
        ]
      )
    ),

  conclusions: {
    terminalNodePrecedence:
      "validated in production",

    cbfOverLoopPrecedence:
      "validated in production",

    loopOverNemoPrecedence:
      "validated in production",

    terminalPathMismatch:
      "rejected before persistence"
  },

  claimBoundary: {
    terminalPathSemantics:
      "validated against supplied topology and captured execution evidence",

    stateHash:
      "preserved and certificate-bound; private preimage not verified",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed",

    policyCorrectness:
      "not claimed"
  },

  status:
    positiveResults.length === 3 &&
    negativeResults.length === 1 &&
    verifiedCers === 13 &&
    certificateHashes.size === 13 &&
    negativeResults.every(
      result =>
        result.persisted === false &&
        result.bundleReadAfterRejection === 404 &&
        result.stepsReadAfterRejection === 404
    )
      ? "PASS"
      : "FAIL"
};

writeJson(
  "stage-05b-summary.json",
  summary
);

console.log();
console.log(
  "=================================================="
);

console.log(
  "STAGE 5B RECOVERED SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  "Original successful requests recovered: 1/1"
);

console.log(
  "Remaining production requests executed: 3/3"
);

console.log(
  `Accepted bundles persisted: ${summary.persistedProductionBundles}/3`
);

console.log(
  `Rejected cases: ${summary.rejectedRequests}/1`
);

console.log(
  `Verified CERs: ${summary.verifiedCerCount}/13`
);

console.log(
  `Unique certificate hashes: ${summary.uniqueCertificateHashes}/13`
);

console.log(
  "Rejected bundles persisted: 0/1"
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
