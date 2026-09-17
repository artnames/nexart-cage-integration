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

const FIXTURE_DIR =
  process.env.FIXTURE_DIR;

const RUN_DIR =
  process.env.RUN_DIR;

if (!NODE_URL)
  throw new Error("NODE_URL missing");

if (!API_KEY)
  throw new Error("NEXART_API_KEY missing");

if (!FIXTURE_DIR)
  throw new Error("FIXTURE_DIR missing");

if (!RUN_DIR)
  throw new Error("RUN_DIR missing");

const ORIGINAL_FILE =
  "01_original.json";

const MUTATED_FILE =
  "02_same_identity_mutated_statehash.json";

function sha256(data) {
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
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

function canonicalDigest(value) {
  return sha256(
    Buffer.from(
      JSON.stringify(
        canonical(value)
      )
    )
  );
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

const manifest =
  JSON.parse(
    fs.readFileSync(
      path.join(
        FIXTURE_DIR,
        "fixture-manifest.json"
      ),
      "utf8"
    )
  );

const originalRaw =
  fs.readFileSync(
    path.join(
      FIXTURE_DIR,
      ORIGINAL_FILE
    )
  );

const mutatedRaw =
  fs.readFileSync(
    path.join(
      FIXTURE_DIR,
      MUTATED_FILE
    )
  );

if (
  sha256(originalRaw) !==
  manifest.fixtures.original.sha256
) {
  throw new Error(
    "Original Stage 7 fixture changed after pinning"
  );
}

if (
  sha256(mutatedRaw) !==
  manifest.fixtures.mutated.sha256
) {
  throw new Error(
    "Mutated Stage 7 fixture changed after pinning"
  );
}

const original =
  JSON.parse(
    originalRaw.toString("utf8")
  );

const mutated =
  JSON.parse(
    mutatedRaw.toString("utf8")
  );

/*
 * ==================================================
 * 1. ASSERT THE MUTATION SHAPE
 * ==================================================
 */

assert.equal(
  original.bundle.bundleId,
  mutated.bundle.bundleId,
  "Mutation must retain bundle identity"
);

assert.equal(
  original.schema,
  mutated.schema
);

const expectedMutation =
  structuredClone(original);

expectedMutation.bundle.steps.at(-1)
  .stateHash =
  mutated.bundle.steps.at(-1)
    .stateHash;

assert.deepEqual(
  mutated,
  expectedMutation,
  "Mutation fixture must differ only at the intended stateHash"
);

assert.notEqual(
  original.bundle.steps.at(-1)
    .stateHash,

  mutated.bundle.steps.at(-1)
    .stateHash,

  "Mutation must actually change stateHash"
);

/*
 * Both requests must remain semantically valid.
 *
 * We need the third POST to reach the identity/digest
 * mutation guard, not fail earlier in SDK validation.
 */

const originalReport =
  validateCageExecution(
    original.bundle,
    original.topology
  );

const mutatedReport =
  validateCageExecution(
    mutated.bundle,
    mutated.topology
  );

writeJson(
  "00-original-local-validation.json",
  originalReport
);

writeJson(
  "00-mutated-local-validation.json",
  mutatedReport
);

if (
  originalReport.valid !== true
) {
  throw new Error(
    "Original fixture failed local validation"
  );
}

if (
  mutatedReport.valid !== true
) {
  throw new Error(
    "Mutation fixture must remain structurally valid"
  );
}

console.log(
  "LOCAL VALIDATION: PASS — original and mutated requests are both structurally valid"
);

const bundleId =
  original.bundle.bundleId;

/*
 * ==================================================
 * CER READ-BACK VERIFIER
 * ==================================================
 */

async function readAndVerifySteps(
  phase
) {
  const result =
    await fetchJson(
      `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}/steps`,
      {
        headers:
          authHeaders()
      }
    );

  saveHttp(
    `${phase}-steps`,
    result
  );

  if (
    result.response.status !==
    200
  ) {
    throw new Error(
      `${phase}: expected steps HTTP 200, got ${result.response.status}`
    );
  }

  const rows =
    result.body?.steps;

  if (
    !Array.isArray(rows) ||
    rows.length !==
      original.bundle.steps.length
  ) {
    throw new Error(
      `${phase}: expected ${original.bundle.steps.length} persisted steps`
    );
  }

  const certificateHashes = [];
  const cerDigests = [];

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {
    const row =
      rows[i];

    const expected =
      original.bundle.steps[i];

    const cer =
      row?.proof?.proofJson;

    if (!cer) {
      throw new Error(
        `${phase}: missing proof.proofJson at ordinal ${i}`
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

      stateHashVerificationBoundary:
        verification.stateHashVerification ===
        "not-performed",

      stepId:
        cer.step?.stepId ===
        expected.stepId,

      nodeName:
        cer.step?.nodeName ===
        expected.nodeName,

      parents:
        sameArray(
          cer.step?.parentStepIds,
          expected.parentStepIds
        ),

      stateHash:
        cer.step?.stateHash ===
        expected.stateHash,

      signals:
        canonicalDigest(
          cer.step?.signals
        ) ===
        canonicalDigest(
          expected.signals
        ),

      metadata:
        canonicalDigest(
          cer.step?.metadata
        ) ===
        canonicalDigest(
          expected.metadata
        ),

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
        `${phase}: CER verification failed at ordinal ${i}\n` +
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

    cerDigests.push(
      canonicalDigest(cer)
    );

    console.log(
      `${phase} CER ${i + 1}/${rows.length}: PASS ${cer.certificateHash}`
    );
  }

  if (
    new Set(
      certificateHashes
    ).size !==
    certificateHashes.length
  ) {
    throw new Error(
      `${phase}: duplicate certificate hash inside persisted bundle`
    );
  }

  return {
    count:
      rows.length,

    certificateHashes,

    cerDigests
  };
}

/*
 * ==================================================
 * 2. CLEAN PRODUCTION PREFLIGHT
 * ==================================================
 */

console.log();
console.log(
  "=== STAGE 7 PRODUCTION PREFLIGHT ==="
);

const preflight =
  await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}`,
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
  `Bundle ${bundleId}: HTTP ${preflight.response.status}`
);

if (
  preflight.response.status !==
  404
) {
  throw new Error(
    "Stage 7 bundle identity already exists. STOP before production POSTs."
  );
}

console.log(
  "PREFLIGHT: PASS — fresh bundle identity"
);

/*
 * ==================================================
 * 3. REQUEST #1 — FRESH REGISTRATION
 * ==================================================
 */

console.log();
console.log(
  "=== REQUEST 1/3 — FRESH REGISTRATION ==="
);

const first =
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
            "cage-stage07-20260917-first"
        }),

      body:
        originalRaw
    }
  );

saveHttp(
  "02-first-submission",
  first
);

console.log(
  `HTTP STATUS: ${first.response.status}`
);

if (
  first.response.status !==
  201
) {
  throw new Error(
    `Fresh registration expected HTTP 201, got ${first.response.status}\n` +
    JSON.stringify(
      first.body,
      null,
      2
    )
  );
}

if (
  first.body?.ok !== true
) {
  throw new Error(
    "Fresh registration expected ok=true"
  );
}

if (
  first.body?.replayed !== false
) {
  throw new Error(
    `Fresh registration expected replayed=false, got ${first.body?.replayed}`
  );
}

if (
  !Array.isArray(
    first.body?.records
  ) ||
  first.body.records.length !== 4
) {
  throw new Error(
    "Fresh registration expected 4 records"
  );
}

console.log(
  "FRESH REGISTRATION: PASS — HTTP 201 replayed=false records=4"
);

const initial =
  await readAndVerifySteps(
    "03-after-first"
  );

if (
  initial.count !== 4
) {
  throw new Error(
    "Expected exactly four CERs after first registration"
  );
}

/*
 * ==================================================
 * 4. REQUEST #2 — EXACT REPLAY
 *
 * Exact same JSON bytes.
 * Deliberately DIFFERENT idempotency-key header.
 * ==================================================
 */

console.log();
console.log(
  "=== REQUEST 2/3 — EXACT BYTE-FOR-BYTE REPLAY ==="
);

const replay =
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
            "cage-stage07-20260917-replay-different-header"
        }),

      body:
        originalRaw
    }
  );

saveHttp(
  "04-exact-replay",
  replay
);

console.log(
  `HTTP STATUS: ${replay.response.status}`
);

if (
  replay.response.status !==
  200
) {
  throw new Error(
    `Exact replay expected HTTP 200, got ${replay.response.status}\n` +
    JSON.stringify(
      replay.body,
      null,
      2
    )
  );
}

if (
  replay.body?.ok !== true
) {
  throw new Error(
    "Exact replay expected ok=true"
  );
}

if (
  replay.body?.replayed !== true
) {
  throw new Error(
    `Exact replay expected replayed=true, got ${replay.body?.replayed}`
  );
}

if (
  !Array.isArray(
    replay.body?.records
  ) ||
  replay.body.records.length !== 4
) {
  throw new Error(
    "Exact replay must return the complete four-record manifest"
  );
}

console.log(
  "EXACT REPLAY: PASS — HTTP 200 replayed=true records=4"
);

const postReplay =
  await readAndVerifySteps(
    "05-after-replay"
  );

assert.deepEqual(
  postReplay.certificateHashes,
  initial.certificateHashes,
  "Replay changed certificate hashes"
);

assert.deepEqual(
  postReplay.cerDigests,
  initial.cerDigests,
  "Replay changed persisted CER bytes/content"
);

console.log(
  "REPLAY IMMUTABILITY: PASS — certificate hashes and CER content unchanged"
);

/*
 * ==================================================
 * 5. REQUEST #3 — SAME IDENTITY, MUTATED CONTENT
 *
 * Mutated stateHash remains structurally valid.
 * Same bundleId.
 * Must fail at identity/digest mutation guard.
 * ==================================================
 */

console.log();
console.log(
  "=== REQUEST 3/3 — SAME IDENTITY / MUTATED CONTENT ==="
);

const mutation =
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
            "cage-stage07-20260917-mutation-different-header"
        }),

      body:
        mutatedRaw
    }
  );

saveHttp(
  "06-mutation-attempt",
  mutation
);

console.log(
  `HTTP STATUS: ${mutation.response.status}`
);

if (
  mutation.response.status !==
  409
) {
  throw new Error(
    `Mutation expected HTTP 409, got ${mutation.response.status}\n` +
    JSON.stringify(
      mutation.body,
      null,
      2
    )
  );
}

if (
  mutation.body?.error !==
    "EXECUTION_MUTATION_DETECTED" ||
  mutation.body?.reasonCode !==
    "EXECUTION_MUTATION_DETECTED"
) {
  throw new Error(
    "Mutation did not return EXECUTION_MUTATION_DETECTED"
  );
}

if (
  mutation.body?.bundleId !==
  bundleId
) {
  throw new Error(
    "Mutation response bundleId mismatch"
  );
}

console.log(
  "MUTATION GUARD: PASS — HTTP 409 EXECUTION_MUTATION_DETECTED"
);

/*
 * ==================================================
 * 6. FINAL READ-BACK
 *
 * Confirm rejected mutation changed nothing.
 * ==================================================
 */

console.log();
console.log(
  "=== FINAL IMMUTABILITY READ-BACK ==="
);

const finalBundle =
  await fetchJson(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundleId)}`,
    {
      headers:
        authHeaders()
    }
  );

saveHttp(
  "07-final-bundle",
  finalBundle
);

if (
  finalBundle.response.status !==
  200
) {
  throw new Error(
    `Final bundle read expected HTTP 200, got ${finalBundle.response.status}`
  );
}

const persistedBundle =
  finalBundle.body?.bundle;

if (
  !persistedBundle ||
  persistedBundle.bundleId !==
    bundleId
) {
  throw new Error(
    "Final bundle identity mismatch"
  );
}

if (
  persistedBundle.terminalPath !==
  original.bundle.terminalPath
) {
  throw new Error(
    "Final terminalPath changed"
  );
}

const finalState =
  await readAndVerifySteps(
    "08-final"
  );

assert.deepEqual(
  finalState.certificateHashes,
  initial.certificateHashes,
  "Rejected mutation changed certificate hashes"
);

assert.deepEqual(
  finalState.cerDigests,
  initial.cerDigests,
  "Rejected mutation changed persisted CER content"
);

const originalLastStateHash =
  original.bundle.steps.at(-1)
    .stateHash;

const mutatedLastStateHash =
  mutated.bundle.steps.at(-1)
    .stateHash;

const finalStepsBody =
  JSON.parse(
    fs.readFileSync(
      path.join(
        RUN_DIR,
        "08-final-steps.json"
      ),
      "utf8"
    )
  );

const persistedLastStateHash =
  finalStepsBody.steps
    .at(-1)
    ?.proof
    ?.proofJson
    ?.step
    ?.stateHash;

if (
  persistedLastStateHash !==
  originalLastStateHash
) {
  throw new Error(
    "Rejected mutation altered persisted stateHash"
  );
}

if (
  persistedLastStateHash ===
  mutatedLastStateHash
) {
  throw new Error(
    "Mutated stateHash was persisted"
  );
}

console.log(
  "FINAL IMMUTABILITY: PASS — original stateHash and all certificate hashes preserved"
);

/*
 * ==================================================
 * 7. SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "07-production-replay-and-mutation-protection",

  generatedAt:
    new Date().toISOString(),

  baseline: {
    governedExecutionSdk:
      "0.4.0",

    canonicalNode:
      "0.29.0",

    schema:
      original.schema
  },

  productionWriteAuthorized:
    true,

  authorizedPostRequests:
    3,

  executedPostRequests:
    3,

  bundleId,

  fixtureHashes: {
    original:
      sha256(originalRaw),

    mutated:
      sha256(mutatedRaw)
  },

  firstRegistration: {
    httpStatus:
      first.response.status,

    replayed:
      first.body.replayed,

    recordCount:
      first.body.records.length,

    status:
      "PASS"
  },

  exactReplay: {
    httpStatus:
      replay.response.status,

    replayed:
      replay.body.replayed,

    recordCount:
      replay.body.records.length,

    certificateHashesUnchanged:
      true,

    cerContentUnchanged:
      true,

    differentIdempotencyHeader:
      true,

    status:
      "PASS"
  },

  mutationAttempt: {
    httpStatus:
      mutation.response.status,

    error:
      mutation.body.error,

    reasonCode:
      mutation.body.reasonCode,

    mutationField:
      "bundle.steps[3].stateHash",

    originalValue:
      originalLastStateHash,

    submittedMutatedValue:
      mutatedLastStateHash,

    mutatedValuePersisted:
      false,

    status:
      "PASS"
  },

  finalPersistence: {
    uniqueBundleIdentityCountExpected:
      1,

    persistedStepCount:
      finalState.count,

    verifiedCerCount:
      finalState.count,

    uniqueCertificateHashes:
      new Set(
        finalState.certificateHashes
      ).size,

    certificateHashesUnchanged:
      true,

    cerContentUnchanged:
      true,

    originalStateHashPreserved:
      true
  },

  conclusions: {
    exactReplay:
      "returned existing complete manifest without creating a new CER set",

    mutationProtection:
      "same CAGE identity with different canonical native content rejected",

    retryHeaderIdentity:
      "different X-Idempotency-Key values did not alter CAGE identity semantics"
  },

  claimBoundary: {
    stateHash:
      "treated as producer-supplied opaque commitment; private preimage not verified",

    mutationProtection:
      "protects canonical persisted execution evidence from conflicting re-registration",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed"
  },

  status:
    first.response.status === 201 &&
    first.body.replayed === false &&
    replay.response.status === 200 &&
    replay.body.replayed === true &&
    mutation.response.status === 409 &&
    mutation.body.error ===
      "EXECUTION_MUTATION_DETECTED" &&
    finalState.count === 4 &&
    new Set(
      finalState.certificateHashes
    ).size === 4
      ? "PASS"
      : "FAIL"
};

writeJson(
  "stage-07-summary.json",
  summary
);

console.log();
console.log(
  "=================================================="
);

console.log(
  "STAGE 7 SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  "Production POST requests: 3/3"
);

console.log(
  "Fresh registrations: 1/1"
);

console.log(
  "Exact replays: 1/1"
);

console.log(
  "Mutation rejections: 1/1"
);

console.log(
  `Persisted steps/CERs: ${finalState.count}/4`
);

console.log(
  `Unique certificate hashes: ${
    new Set(
      finalState.certificateHashes
    ).size
  }/4`
);

console.log(
  "Replay changed certificates: false"
);

console.log(
  "Mutation changed persisted evidence: false"
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
