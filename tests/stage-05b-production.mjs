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
    expectedOutcome: "ACCEPT",
    expectedTerminalPath: "happy_path",
    expectedSteps: 4
  },
  {
    name: "06_cbf_wins_over_loop",
    file: "06_cbf_wins_over_loop.json",
    expectedSha256:
      "dab7d26e2f06213340090af14d49d884e37f8c7541cd357c213cd73216eb3f24",
    expectedOutcome: "ACCEPT",
    expectedTerminalPath: "cbf_block",
    expectedSteps: 3
  },
  {
    name: "07_loop_wins_over_nemo",
    file: "07_loop_wins_over_nemo.json",
    expectedSha256:
      "d3c7a22c3bd27ac1a7fe4681ff1d27164e696f3ba2367f79ce3aadd8373cb608",
    expectedOutcome: "ACCEPT",
    expectedTerminalPath: "loop_breaker",
    expectedSteps: 6
  },
  {
    name: "08_terminal_path_mismatch",
    file: "08_terminal_path_mismatch.json",
    expectedSha256:
      "cea2725e05917b2e29b3101677fb5c489dda57a6b6ff2f951d9621954b6d4387",
    expectedOutcome: "REJECT",
    expectedReasonCode: "TERMINAL_PATH_MISMATCH",
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
 * 1. LOAD + HASH + LOCAL VALIDATION
 * ==================================================
 */

console.log(
  "=== STAGE 5B: LOAD / HASH / LOCAL VALIDATION ==="
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

  const codes =
    issueCodes(report);

  writeJson(
    `${item.name}-local-validation.json`,
    report
  );

  if (
    item.expectedOutcome === "ACCEPT"
  ) {
    if (
      report.valid !== true
    ) {
      throw new Error(
        `${item.file}: local SDK unexpectedly rejected positive case\n` +
        JSON.stringify(report, null, 2)
      );
    }

    if (
      request.bundle.terminalPath !==
      item.expectedTerminalPath
    ) {
      throw new Error(
        `${item.file}: unexpected declared terminalPath`
      );
    }
  } else {
    if (
      report.valid !== false
    ) {
      throw new Error(
        `${item.file}: local SDK unexpectedly accepted negative case`
      );
    }

    for (
      const required of
      item.requiredIssueCodes
    ) {
      if (
        !codes.includes(required)
      ) {
        throw new Error(
          `${item.file}: missing local issue ${required}`
        );
      }
    }
  }

  loaded.push({
    ...item,
    raw,
    request,
    actualSha256,
    localIssueCodes: codes
  });

  console.log(
    `${item.file}: HASH PASS / LOCAL ${item.expectedOutcome} PASS`
  );
}

/*
 * ==================================================
 * 2. READ-ONLY PRODUCTION PREFLIGHT
 * ==================================================
 */

console.log();
console.log(
  "=== READ-ONLY PRODUCTION EXISTENCE PREFLIGHT ==="
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
      `${item.file}: preflight not clean; expected 404`
    );
  }
}

console.log(
  "PREFLIGHT RESULT: PASS — all four bundle IDs absent"
);

/*
 * ==================================================
 * 3. PRODUCTION REQUESTS
 * ==================================================
 */

console.log();
console.log(
  "=== PRODUCTION TERMINAL-PATH REQUESTS ==="
);

const positiveResults = [];
const negativeResults = [];

const certificateHashes =
  new Set();

let verifiedCers = 0;

for (const item of loaded) {
  const bundle =
    item.request.bundle;

  const bundleId =
    bundle.bundleId;

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
   * =================================================
   * POSITIVE CASE
   * =================================================
   */

  if (
    item.expectedOutcome ===
    "ACCEPT"
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

    /*
     * The CAGE issuance response carries the accepted
     * terminalPath. Assert the production Node persisted
     * the same semantic classification we validated
     * locally.
     */

    if (
      body?.terminalPath !==
      item.expectedTerminalPath
    ) {
      throw new Error(
        `${item.file}: production terminalPath mismatch\n` +
        `expected=${item.expectedTerminalPath}\n` +
        `actual=${body?.terminalPath}`
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
      `TERMINAL PATH: PASS (${body.terminalPath})`
    );

    console.log(
      `INGEST: PASS (${body.records.length}/${item.expectedSteps})`
    );

    /*
     * -----------------------------------------------
     * Authenticated bundle read-back
     * -----------------------------------------------
     */

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
        `${item.name}-bundle.raw.json`
      ),
      bundleRaw
    );

    writeJson(
      `${item.name}-bundle.json`,
      bundleBody
    );

    if (
      bundleResponse.status !== 200
    ) {
      throw new Error(
        `${item.file}: persisted bundle HTTP ${bundleResponse.status}`
      );
    }

    if (
      bundleBody?.terminalPath !==
      item.expectedTerminalPath
    ) {
      throw new Error(
        `${item.file}: persisted terminalPath mismatch\n` +
        `expected=${item.expectedTerminalPath}\n` +
        `actual=${bundleBody?.terminalPath}`
      );
    }

    console.log(
      `PERSISTED TERMINAL PATH: PASS (${bundleBody.terminalPath})`
    );

    /*
     * -----------------------------------------------
     * Step/CER read-back
     * -----------------------------------------------
     */

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
        `${item.name}-steps.raw.json`
      ),
      stepsRaw
    );

    writeJson(
      `${item.name}-steps.json`,
      stepsBody
    );

    if (
      stepsResponse.status !== 200
    ) {
      throw new Error(
        `${item.file}: persisted steps HTTP ${stepsResponse.status}`
      );
    }

    if (
      !Array.isArray(
        stepsBody.steps
      ) ||
      stepsBody.steps.length !==
        item.expectedSteps
    ) {
      throw new Error(
        `${item.file}: persisted step count mismatch`
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

        parentIdsPreserved:
          sameArray(
            cer.step?.parentStepIds,
            expectedStep.parentStepIds
          ),

        signalsPreserved:
          JSON.stringify(
            cer.step?.signals
          ) ===
          JSON.stringify(
            expectedStep.signals
          ),

        metadataPreserved:
          JSON.stringify(
            cer.step?.metadata
          ) ===
          JSON.stringify(
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
          `${item.file}: CER verification failed for ${expectedStep.stepId}\n` +
          JSON.stringify(checks, null, 2)
        );
      }

      certificateHashes.add(
        cer.certificateHash
      );

      fixtureVerified++;
      verifiedCers++;

      console.log(
        `CER ${i + 1}/${stepsBody.steps.length}: PASS ` +
        `${expectedStep.stepId} ${cer.certificateHash}`
      );
    }

    positiveResults.push({
      fixture:
        item.file,

      bundleId,

      expectedTerminalPath:
        item.expectedTerminalPath,

      submissionTerminalPath:
        body.terminalPath,

      persistedTerminalPath:
        bundleBody.terminalPath,

      httpStatus:
        response.status,

      issuanceRecordCount:
        body.records.length,

      persistedStepCount:
        stepsBody.steps.length,

      verifiedCers:
        fixtureVerified,

      status:
        "PASS"
    });

    continue;
  }

  /*
   * =================================================
   * NEGATIVE TERMINAL-PATH MISMATCH
   * =================================================
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
      `${item.file}: unexpected reasonCode\n` +
      `expected=${item.expectedReasonCode}\n` +
      `actual=${body?.reasonCode}`
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
        `${item.file}: production response missing issue ${required}`
      );
    }
  }

  console.log(
    `REJECTION: PASS reasonCode=${body.reasonCode}`
  );

  console.log(
    `ISSUES: ${JSON.stringify(productionIssueCodes)}`
  );

  /*
   * Prove rejected semantic claim was not persisted.
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

  if (
    bundleCheckResponse.status !==
    404
  ) {
    throw new Error(
      `${item.file}: rejected bundle unexpectedly persisted`
    );
  }

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
    stepsCheckResponse.status !==
    404
  ) {
    throw new Error(
      `${item.file}: rejected step collection unexpectedly exists`
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

    error:
      body.error,

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
 * 4. SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "05b-production-terminal-path-precedence",

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

  requestCount:
    4,

  positiveCaseCount:
    positiveResults.length,

  negativeCaseCount:
    negativeResults.length,

  persistedProductionBundles:
    positiveResults.length,

  expectedPersistedProductionBundles:
    3,

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
  "STAGE 5B SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  `Production requests: ${summary.requestCount}/4`
);

console.log(
  `Accepted bundles persisted: ${summary.persistedProductionBundles}/3`
);

console.log(
  `Rejected cases: ${summary.negativeCaseCount}/1`
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
