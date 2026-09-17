import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  validateCageExecution
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
    name: "01_missing_parent",
    file: "01_missing_parent.json",
    expectedSha256:
      "31a7d2f54d7df75523c6fb49cabfb2b67ca0fc4816aa3c2fe0bc8b90e9d8ec08",
    expectedReasonCode:
      "MISSING_PARENT",
    requiredIssueCode:
      "MISSING_PARENT",
    expectedIssuePath:
      "bundle.steps[1].parentStepIds"
  },
  {
    name: "05_unknown_node",
    file: "05_unknown_node.json",
    expectedSha256:
      "bdcde410509610e493fa505387db53031d827497335fba98a97c3181906dff45",
    expectedReasonCode:
      "UNKNOWN_NODE",
    requiredIssueCode:
      "UNKNOWN_NODE",
    expectedIssuePath:
      "bundle.steps[1].nodeName"
  },
  {
    name: "06_invalid_step_uuid",
    file: "06_invalid_step_uuid.json",
    expectedSha256:
      "d1e63c900a2146b196fe1dcc8d6b0c3791f4f6476011fc606196ed4a5c889603",
    expectedReasonCode:
      "INVALID_UUID",
    requiredIssueCode:
      "INVALID_UUID",
    expectedIssuePath:
      "bundle.steps[3].stepId"
  },
  {
    name: "07_invalid_parent_uuid",
    file: "07_invalid_parent_uuid.json",
    expectedSha256:
      "e80f4be744e6d83b278adcc457904953e2651a06f0e32c2086a5fdfe9ec1ce06",
    expectedReasonCode:
      "INVALID_PARENT_IDS",
    requiredIssueCode:
      "INVALID_PARENT_IDS",
    expectedIssuePath:
      "bundle.steps[1].parentStepIds"
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

function allIssues(report) {
  return [
    ...(report.schemaErrors ?? []),
    ...(report.causalErrors ?? []),
    ...(report.topologyErrors ?? []),
    ...(report.resourceErrors ?? [])
  ];
}

/*
 * ==================================================
 * 1. FIXTURE HASH + LOCAL FAIL-CLOSED VALIDATION
 * ==================================================
 */

console.log(
  "=== STAGE 6B: FIXTURE HASH + LOCAL VALIDATION ==="
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
      `${item.file}: fixture hash mismatch\n` +
      `expected=${item.expectedSha256}\n` +
      `actual=${actualSha256}`
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

  writeJson(
    `${item.name}-local-validation.json`,
    report
  );

  if (
    report.valid !== false
  ) {
    throw new Error(
      `${item.file}: expected local rejection`
    );
  }

  const required =
    allIssues(report)
      .find(
        issue =>
          issue.code ===
          item.requiredIssueCode
      );

  if (!required) {
    throw new Error(
      `${item.file}: missing local issue ${item.requiredIssueCode}`
    );
  }

  if (
    !String(required.path)
      .includes(
        item.expectedIssuePath
      )
  ) {
    throw new Error(
      `${item.file}: local issue path mismatch\n` +
      `expected~=${item.expectedIssuePath}\n` +
      `actual=${required.path}`
    );
  }

  loaded.push({
    ...item,
    raw,
    request,
    actualSha256
  });

  console.log(
    `${item.file}: HASH PASS / LOCAL REJECT PASS`
  );
}

/*
 * ==================================================
 * 2. READ-ONLY PRODUCTION PREFLIGHT
 * ==================================================
 */

console.log();
console.log(
  "=== PRODUCTION EXISTENCE PREFLIGHT ==="
);

for (const item of loaded) {
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
      `${item.file}: bundle already exists; expected clean 404 preflight`
    );
  }
}

console.log(
  "PREFLIGHT RESULT: PASS — all four bundle IDs absent"
);

/*
 * ==================================================
 * 3. PRODUCTION REJECTION REQUESTS
 * ==================================================
 */

console.log();
console.log(
  "=== AUTHORIZED STAGE 6B PRODUCTION REQUESTS ==="
);

const results = [];

for (const item of loaded) {
  const bundleId =
    item.request.bundle.bundleId;

  const idempotencyKey =
    `cage-stage06-20260917-${item.name}`;

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
   * IMPORTANT:
   *
   * Any status other than 422 is unexpected.
   *
   * If this throws after an unexpected 201,
   * DO NOT rerun the harness. The response
   * evidence remains in RUN_DIR for recovery.
   */

  if (
    response.status !== 422
  ) {
    throw new Error(
      `${item.file}: expected HTTP 422, got ${response.status}\n` +
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
      `${item.file}: reasonCode mismatch\n` +
      `expected=${item.expectedReasonCode}\n` +
      `actual=${body?.reasonCode}`
    );
  }

  const issues =
    Array.isArray(body.issues)
      ? body.issues
      : [];

  const required =
    issues.find(
      issue =>
        issue.code ===
        item.requiredIssueCode
    );

  if (!required) {
    throw new Error(
      `${item.file}: production response missing ${item.requiredIssueCode}`
    );
  }

  if (
    !String(required.path)
      .includes(
        item.expectedIssuePath
      )
  ) {
    throw new Error(
      `${item.file}: production issue path mismatch\n` +
      `expected~=${item.expectedIssuePath}\n` +
      `actual=${required.path}`
    );
  }

  console.log(
    `REJECTION: PASS reasonCode=${body.reasonCode}`
  );

  console.log(
    `ISSUE PATH: PASS (${required.path})`
  );

  /*
   * =================================================
   * 4. PROVE NOTHING PERSISTED
   * =================================================
   */

  const {
    response:
      bundleCheckResponse,

    raw:
      bundleCheckRaw,

    body:
      bundleCheckBody
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
    response:
      stepsCheckResponse,

    raw:
      stepsCheckRaw,

    body:
      stepsCheckBody
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
    bundleCheckResponse.status !== 404
  ) {
    throw new Error(
      `${item.file}: rejected bundle unexpectedly persisted`
    );
  }

  if (
    stepsCheckResponse.status !== 404
  ) {
    throw new Error(
      `${item.file}: rejected bundle exposes persisted steps`
    );
  }

  console.log(
    "PERSISTENCE: PASS — bundle=404 steps=404"
  );

  results.push({
    fixture:
      item.file,

    bundleId,

    httpStatus:
      response.status,

    error:
      body.error,

    reasonCode:
      body.reasonCode,

    requiredIssueCode:
      item.requiredIssueCode,

    issuePath:
      required.path,

    issueCodes:
      issues.map(
        issue =>
          issue.code
      ),

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
 * 5. FINAL SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "06b-production-structural-fail-closed",

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

  requestCount:
    results.length,

  rejectedRequestCount:
    results.length,

  persistedBundleCount:
    results.filter(
      result =>
        result.persisted
    ).length,

  expectedPersistedBundleCount:
    0,

  expectedCerCount:
    0,

  cases:
    results,

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
    missingParent:
      "rejected before persistence",

    unknownNode:
      "rejected before persistence",

    invalidStepUuid:
      "rejected before persistence",

    invalidParentUuid:
      "rejected before persistence"
  },

  claimBoundary: {
    structuralValidation:
      "validated fail-closed at the production Node boundary",

    rejectedEvidencePersistence:
      "no rejected bundle or step collection was persisted",

    executionTruth:
      "not claimed",

    cageProducerAuthentication:
      "not claimed"
  },

  status:
    results.length === 4 &&
    results.every(
      result =>
        result.httpStatus === 422 &&
        result.persisted === false &&
        result.bundleReadAfterRejection === 404 &&
        result.stepsReadAfterRejection === 404
    )
      ? "PASS"
      : "FAIL"
};

writeJson(
  "stage-06b-summary.json",
  summary
);

console.log();
console.log(
  "=================================================="
);

console.log(
  "STAGE 6B SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  `Production requests: ${summary.requestCount}/4`
);

console.log(
  `Rejected requests: ${summary.rejectedRequestCount}/4`
);

console.log(
  `Persisted bundles: ${summary.persistedBundleCount}/0`
);

console.log(
  "Persisted CERs: 0"
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
