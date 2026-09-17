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
    name: "01_static_self_edge_allowed",
    file: "01_static_self_edge_allowed.json",
    expectedSha256:
      "b7a302039759ae3218afde134d336068db553497ace73394859078dcf537f1a6",
    expectedOutcome: "ACCEPT",
    expectedSteps: 4
  },
  {
    name: "02_static_mutual_cycle_allowed",
    file: "02_static_mutual_cycle_allowed.json",
    expectedSha256:
      "81554b1584ff1f93b21b309cda87171cf663e1747c50c9d83ae44b675b08c921",
    expectedOutcome: "ACCEPT",
    expectedSteps: 4
  },
  {
    name: "03_concrete_cycle_rejected",
    file: "03_concrete_cycle_rejected.json",
    expectedSha256:
      "0b3ba77c055af23687e5a940274eca5babdabcf67d67b06f4fc050fd7fda1422",
    expectedOutcome: "REJECT",
    expectedReasonCode: "FUTURE_PARENT",
    requiredIssueCodes: [
      "FUTURE_PARENT",
      "CAUSAL_CYCLE"
    ]
  },
  {
    name: "04_unresolvable_contraction_cycle_rejected",
    file: "04_unresolvable_contraction_cycle_rejected.json",
    expectedSha256:
      "b0cabd09e95f01d93c436aae4accd7061476704908fc3e418d0034098e56ce6b",
    expectedOutcome: "REJECT",
    expectedReasonCode:
      "UNRESOLVABLE_CONTRACTION_CYCLE",
    requiredIssueCodes: [
      "UNRESOLVABLE_CONTRACTION_CYCLE"
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

function allIssueCodes(report) {
  return [
    ...(report.schemaErrors ?? []),
    ...(report.causalErrors ?? []),
    ...(report.topologyErrors ?? []),
    ...(report.resourceErrors ?? [])
  ].map(issue => issue.code);
}

console.log(
  "=== STAGE 4B: LOAD / HASH / LOCAL VALIDATION ==="
);

const loaded = [];

for (const item of cases) {
  const fixturePath =
    path.join(FIXTURE_DIR, item.file);

  const raw =
    fs.readFileSync(fixturePath);

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
    JSON.parse(raw.toString("utf8"));

  const report =
    validateCageExecution(
      request.bundle,
      request.topology
    );

  const issueCodes =
    allIssueCodes(report);

  writeJson(
    `${item.name}-local-validation.json`,
    report
  );

  if (
    item.expectedOutcome === "ACCEPT" &&
    report.valid !== true
  ) {
    throw new Error(
      `${item.file}: local SDK unexpectedly rejected fixture\n` +
      JSON.stringify(report, null, 2)
    );
  }

  if (
    item.expectedOutcome === "REJECT"
  ) {
    if (report.valid !== false) {
      throw new Error(
        `${item.file}: local SDK unexpectedly accepted negative fixture`
      );
    }

    for (
      const required of
      item.requiredIssueCodes
    ) {
      if (
        !issueCodes.includes(required)
      ) {
        throw new Error(
          `${item.file}: missing expected local issue ${required}`
        );
      }
    }
  }

  loaded.push({
    ...item,
    raw,
    request,
    actualSha256,
    localIssueCodes:
      issueCodes
  });

  console.log(
    `${item.file}: HASH PASS / LOCAL ${item.expectedOutcome} PASS`
  );
}

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
      headers: authHeaders()
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
      `${item.file}: preflight not clean; expected 404 before Stage 4B writes`
    );
  }
}

console.log(
  "PREFLIGHT RESULT: PASS — all four bundle IDs absent"
);

console.log();
console.log(
  "=== PRODUCTION REQUESTS ==="
);

const positiveResults = [];
const negativeResults = [];
const certificateHashes = new Set();

let verifiedCers = 0;

for (const item of loaded) {
  const bundleId =
    item.request.bundle.bundleId;

  const idempotencyKey =
    `cage-stage04-20260917-${item.name}`;

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
   * -----------------------------------------
   * POSITIVE CASES
   * -----------------------------------------
   */

  if (
    item.expectedOutcome === "ACCEPT"
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
      !Array.isArray(body.records) ||
      body.records.length !==
        item.expectedSteps
    ) {
      throw new Error(
        `${item.file}: issuance record count mismatch`
      );
    }

    console.log(
      `INGEST: PASS (${body.records.length}/${item.expectedSteps})`
    );

    /*
     * Read persisted steps.
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
        item.request.bundle.steps[i];

      const cer =
        row?.proof?.proofJson;

      if (!cer) {
        throw new Error(
          `${item.file}: missing proof.proofJson for persisted step ${i}`
        );
      }

      const verification =
        verifyCageStepCer(cer);

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
          JSON.stringify(
            cer.step?.parentStepIds
          ) ===
          JSON.stringify(
            expectedStep.parentStepIds
          ),

        stateHashPreserved:
          cer.step?.stateHash ===
          expectedStep.stateHash,

        indexedHashMatches:
          row.certificateHash ===
          cer.certificateHash,

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
          `${item.file}: CER verification failed\n` +
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
   * -----------------------------------------
   * NEGATIVE CASES
   * -----------------------------------------
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
    Array.isArray(body.issues)
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
        `${item.file}: production response missing required issue ${required}`
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
   * Prove no bundle persisted after rejection.
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

  /*
   * Also prove no step collection is reachable.
   */

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
      `${item.file}: rejected bundle step collection unexpectedly exists`
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

const summary = {
  stage:
    "04b-production-static-vs-concrete-cycle-boundary",

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
    2,

  verifiedCerCount:
    verifiedCers,

  expectedVerifiedCerCount:
    8,

  uniqueCertificateHashes:
    certificateHashes.size,

  expectedUniqueCertificateHashes:
    8,

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
    staticSelfEdge:
      "accepted and certified",

    staticMutualCycle:
      "accepted and certified",

    concreteCausalCycle:
      "rejected before persistence",

    unresolvableContractionCycle:
      "rejected before persistence"
  },

  claimBoundary: {
    staticTopologyCycles:
      "may be valid topology declarations",

    concreteExecutionCycles:
      "fail closed",

    stateHash:
      "preserved and certificate-bound for accepted cases; private preimage not verified",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed"
  },

  status:
    positiveResults.length === 2 &&
    negativeResults.length === 2 &&
    verifiedCers === 8 &&
    certificateHashes.size === 8 &&
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
  "stage-04b-summary.json",
  summary
);

console.log();
console.log(
  "=================================================="
);

console.log(
  "STAGE 4B SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  `Production requests: ${summary.requestCount}/4`
);

console.log(
  `Accepted bundles persisted: ${summary.persistedProductionBundles}/2`
);

console.log(
  `Rejected cases: ${summary.negativeCaseCount}/2`
);

console.log(
  `Verified CERs: ${summary.verifiedCerCount}/8`
);

console.log(
  `Unique certificate hashes: ${summary.uniqueCertificateHashes}/8`
);

console.log(
  "Rejected bundles persisted: 0/2"
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
