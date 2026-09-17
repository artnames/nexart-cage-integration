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
    name: "01_ancestor_contraction_linear",
    file: "01_ancestor_contraction_linear.json",
    expectedSha256:
      "c6b7cf67372d56e981341c1e8f47fd3dba30a26cc2175cc64d4ef6c5fa9cb20a",
    expectedSteps: 2,
    semanticCheck: "linear-contraction"
  },
  {
    name: "02_convergent_contraction",
    file: "02_convergent_contraction.json",
    expectedSha256:
      "0a1a948136bafaacc2917b5cde6f7d132f35cdc384cc66d338a0f5a682297310",
    expectedSteps: 3,
    semanticCheck: "convergent-contraction"
  },
  {
    name: "03_repeated_node_occurrences",
    file: "03_repeated_node_occurrences.json",
    expectedSha256:
      "8e3e24a5861b45de7452aa262f5e1b5803158c385c9739fcd9f4cc7c3c395e16",
    expectedSteps: 3,
    semanticCheck: "repeated-node-occurrences"
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { __nonJsonBody: raw };
  }

  return {
    response,
    raw,
    body
  };
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${API_KEY}`,
    ...extra
  };
}

function sameArray(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, index) => value === b[index])
  );
}

const loaded = [];

/*
 * ------------------------------------------------
 * 1. LOAD + HASH + LOCAL VALIDATION
 * ------------------------------------------------
 */

console.log("=== FIXTURE HASH + LOCAL SDK VALIDATION ===");

for (const item of cases) {
  const fullPath = path.join(
    FIXTURE_DIR,
    item.file
  );

  const raw = fs.readFileSync(fullPath);
  const actualSha256 = sha256(raw);

  if (actualSha256 !== item.expectedSha256) {
    throw new Error(
      `${item.file}: fixture SHA-256 mismatch\n` +
      `expected=${item.expectedSha256}\n` +
      `actual=${actualSha256}`
    );
  }

  const request = JSON.parse(
    raw.toString("utf8")
  );

  const validation =
    validateCageExecution(
      request.bundle,
      request.topology
    );

  writeJson(
    `${item.name}-local-validation.json`,
    validation
  );

  if (!validation.valid) {
    throw new Error(
      `${item.file}: SDK validation failed\n` +
      JSON.stringify(validation, null, 2)
    );
  }

  loaded.push({
    ...item,
    raw,
    request,
    actualSha256
  });

  console.log(
    `${item.file}: HASH PASS / SDK PASS`
  );
}

/*
 * ------------------------------------------------
 * 2. READ-ONLY EXISTENCE PREFLIGHT
 * ------------------------------------------------
 */

console.log();
console.log("=== PRODUCTION EXISTENCE PREFLIGHT ===");

let preflightClean = true;

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

  if (response.status !== 404) {
    preflightClean = false;
  }
}

if (!preflightClean) {
  throw new Error(
    "Preflight was not clean. At least one Stage 3 bundle already exists or the read failed. No production POSTs were performed."
  );
}

console.log(
  "PREFLIGHT RESULT: PASS — all three bundle IDs absent"
);

/*
 * ------------------------------------------------
 * 3. PRODUCTION WRITES
 * ------------------------------------------------
 */

console.log();
console.log("=== PRODUCTION SUBMISSIONS ===");

const submissionResults = [];

for (const item of loaded) {
  const bundle =
    item.request.bundle;

  const idempotencyKey =
    `cage-stage03-20260917-${item.name}`;

  /*
   * Send the fixture bytes exactly as stored.
   * The JSON already contains:
   *   schema
   *   bundle
   *   topology
   */

  const {
    response,
    raw,
    body
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles`,
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
        "X-Idempotency-Key":
          idempotencyKey
      }),
      body: item.raw
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

  console.log(
    `${item.file}: HTTP ${response.status}`
  );

  if (response.status !== 201) {
    throw new Error(
      `${item.file}: production submission failed\n` +
      JSON.stringify(body, null, 2)
    );
  }

  if (body?.ok !== true) {
    throw new Error(
      `${item.file}: production response did not contain ok=true`
    );
  }

  if (
    !Array.isArray(body.records) ||
    body.records.length !==
      item.expectedSteps
  ) {
    throw new Error(
      `${item.file}: unexpected issuance record count`
    );
  }

  submissionResults.push({
    fixture: item.file,
    bundleId: bundle.bundleId,
    idempotencyKey,
    httpStatus: response.status,
    responseOk: body.ok,
    issuanceRecordCount:
      body.records.length
  });

  console.log(
    `${item.file}: INGEST PASS ` +
    `(${body.records.length}/${item.expectedSteps})`
  );
}

/*
 * ------------------------------------------------
 * 4. READ BACK + CER VERIFICATION
 * ------------------------------------------------
 */

console.log();
console.log("=== AUTHENTICATED READ-BACK + CER VERIFICATION ===");

const certificateHashes =
  new Set();

const verificationResults = [];

let totalVerified = 0;

for (const item of loaded) {
  const bundle =
    item.request.bundle;

  const {
    response,
    raw,
    body
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundle.bundleId)}/steps`,
    {
      headers: authHeaders()
    }
  );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${item.name}-steps.raw.json`
    ),
    raw
  );

  writeJson(
    `${item.name}-steps.json`,
    body
  );

  if (response.status !== 200) {
    throw new Error(
      `${item.file}: step read-back HTTP ${response.status}`
    );
  }

  if (
    !Array.isArray(body.steps) ||
    body.steps.length !==
      item.expectedSteps
  ) {
    throw new Error(
      `${item.file}: persisted step count mismatch`
    );
  }

  let fixtureVerified = 0;

  for (
    let ordinal = 0;
    ordinal < body.steps.length;
    ordinal++
  ) {
    const row =
      body.steps[ordinal];

    const expectedStep =
      bundle.steps[ordinal];

    const cer =
      row?.proof?.proofJson;

    if (!cer) {
      throw new Error(
        `${item.file}: missing proof.proofJson for ${row?.stepId}`
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

      parentsPreserved:
        sameArray(
          cer.step?.parentStepIds,
          expectedStep.parentStepIds
        ),

      stateHashPreserved:
        cer.step?.stateHash ===
        expectedStep.stateHash,

      indexCertificateHashMatches:
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

    const pass =
      Object.values(checks)
        .every(Boolean);

    if (!pass) {
      throw new Error(
        `${item.file}: CER verification failed for ${expectedStep.stepId}\n` +
        JSON.stringify(checks, null, 2)
      );
    }

    certificateHashes.add(
      cer.certificateHash
    );

    fixtureVerified++;
    totalVerified++;

    console.log(
      `${item.file} CER ${ordinal + 1}/${body.steps.length}: PASS ` +
      `${expectedStep.stepId} ${cer.certificateHash}`
    );
  }

  verificationResults.push({
    fixture: item.file,
    bundleId: bundle.bundleId,
    expectedSteps: item.expectedSteps,
    persistedSteps:
      body.steps.length,
    verifiedCers:
      fixtureVerified
  });
}

/*
 * ------------------------------------------------
 * 5. ACTUAL DAG EDGE QUERY CHECKS
 * ------------------------------------------------
 */

console.log();
console.log("=== DAG PARENT QUERY SEMANTICS ===");

const semanticResults = [];

async function queryParents(
  bundleId,
  stepId,
  expectedIds,
  label
) {
  const {
    response,
    raw,
    body
  } = await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}/steps/${encodeURIComponent(stepId)}/parents`,
    {
      headers: authHeaders()
    }
  );

  const safeLabel =
    label.replace(
      /[^A-Za-z0-9._-]+/g,
      "-"
    );

  fs.writeFileSync(
    path.join(
      RUN_DIR,
      `${safeLabel}-parents.raw.json`
    ),
    raw
  );

  writeJson(
    `${safeLabel}-parents.json`,
    body
  );

  if (response.status !== 200) {
    throw new Error(
      `${label}: parents query HTTP ${response.status}`
    );
  }

  const actualIds =
    Array.isArray(body.steps)
      ? body.steps.map(
          step => step.stepId
        )
      : [];

  const sameSet =
    actualIds.length ===
      expectedIds.length &&
    [...actualIds].sort().join("|") ===
      [...expectedIds].sort().join("|");

  if (!sameSet) {
    throw new Error(
      `${label}: parent relationship mismatch\n` +
      `expected=${JSON.stringify(expectedIds)}\n` +
      `actual=${JSON.stringify(actualIds)}`
    );
  }

  console.log(
    `${label}: PASS -> ${JSON.stringify(actualIds)}`
  );

  return {
    label,
    stepId,
    expectedParentStepIds:
      expectedIds,
    actualParentStepIds:
      actualIds,
    status: "PASS"
  };
}

/*
 * Linear ancestor contraction:
 * leaf's concrete parent must remain root,
 * despite omitted_a / omitted_b in static topology.
 */

{
  const item =
    loaded.find(
      value =>
        value.semanticCheck ===
        "linear-contraction"
    );

  const steps =
    item.request.bundle.steps;

  semanticResults.push(
    await queryParents(
      item.request.bundle.bundleId,
      steps[1].stepId,
      [steps[0].stepId],
      "linear-contraction-leaf"
    )
  );
}

/*
 * Convergent contraction:
 * join must persist both concrete root parents.
 */

{
  const item =
    loaded.find(
      value =>
        value.semanticCheck ===
        "convergent-contraction"
    );

  const steps =
    item.request.bundle.steps;

  semanticResults.push(
    await queryParents(
      item.request.bundle.bundleId,
      steps[2].stepId,
      [
        steps[0].stepId,
        steps[1].stepId
      ],
      "convergent-contraction-join"
    )
  );
}

/*
 * Repeated node occurrences:
 * three distinct step IDs sharing nodeName=repeat
 * must retain concrete chain identity.
 */

{
  const item =
    loaded.find(
      value =>
        value.semanticCheck ===
        "repeated-node-occurrences"
    );

  const steps =
    item.request.bundle.steps;

  if (
    new Set(
      steps.map(
        step => step.stepId
      )
    ).size !== 3
  ) {
    throw new Error(
      "Repeated-node fixture does not contain three distinct step IDs"
    );
  }

  if (
    !steps.every(
      step =>
        step.nodeName === "repeat"
    )
  ) {
    throw new Error(
      "Repeated-node fixture node names unexpectedly differ"
    );
  }

  semanticResults.push(
    await queryParents(
      item.request.bundle.bundleId,
      steps[1].stepId,
      [steps[0].stepId],
      "repeated-node-step-2"
    )
  );

  semanticResults.push(
    await queryParents(
      item.request.bundle.bundleId,
      steps[2].stepId,
      [steps[1].stepId],
      "repeated-node-step-3"
    )
  );
}

/*
 * ------------------------------------------------
 * 6. SUMMARY
 * ------------------------------------------------
 */

const summary = {
  stage:
    "03b-production-contraction-repetition-convergence",

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

  productionBundleCount:
    submissionResults.length,

  expectedCerCount:
    8,

  verifiedCerCount:
    totalVerified,

  uniqueCertificateHashes:
    certificateHashes.size,

  fixtureHashes:
    Object.fromEntries(
      loaded.map(
        item => [
          item.file,
          item.actualSha256
        ]
      )
    ),

  submissions:
    submissionResults,

  verification:
    verificationResults,

  semanticChecks:
    semanticResults,

  claims: {
    ancestorContraction:
      "validated in production",

    convergentMultiParentDag:
      "validated in production",

    repeatedNodeOccurrences:
      "validated in production using distinct concrete step IDs",

    stateHash:
      "preserved and certificate-bound; private preimage not verified",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed"
  },

  status:
    submissionResults.length === 3 &&
    totalVerified === 8 &&
    certificateHashes.size === 8 &&
    semanticResults.length === 4 &&
    semanticResults.every(
      result =>
        result.status === "PASS"
    )
      ? "PASS"
      : "FAIL"
};

writeJson(
  "stage-03b-summary.json",
  summary
);

console.log();
console.log("==================================================");
console.log("STAGE 3B SUMMARY");
console.log("==================================================");
console.log(
  `Production bundles: ${submissionResults.length}/3`
);
console.log(
  `Verified CERs: ${totalVerified}/8`
);
console.log(
  `Unique certificate hashes: ${certificateHashes.size}/8`
);
console.log(
  `Semantic DAG checks: ${semanticResults.length}/4`
);
console.log(
  `FINAL RESULT: ${summary.status}`
);

if (summary.status !== "PASS") {
  process.exitCode = 1;
}
