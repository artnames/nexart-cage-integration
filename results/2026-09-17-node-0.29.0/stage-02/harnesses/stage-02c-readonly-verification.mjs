import fs from "node:fs";
import path from "node:path";

import {
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL = "https://node.nexart.io";
const API_KEY = process.env.NEXART_API_KEY;
const FIXTURE_DIR = process.env.FIXTURE_DIR;
const RUN_DIR = process.env.RUN_DIR;

const fixtureNames = [
  "01_single_path_happy.json",
  "02_cbf_block.json",
  "03_loop_breaker.json",
  "04_nemo_policy_block.json",
  "05_large_dag.json"
];

if (!API_KEY) throw new Error("NEXART_API_KEY missing");

function writeJson(name, value) {
  fs.writeFileSync(
    path.join(RUN_DIR, name),
    JSON.stringify(value, null, 2) + "\n"
  );
}

function sameArray(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i])
  );
}

const results = [];
const hashes = new Set();

let totalExpected = 0;
let totalVerified = 0;
let failed = false;

for (const fixtureName of fixtureNames) {
  const base = fixtureName.replace(".json", "");

  const bundle = JSON.parse(
    fs.readFileSync(
      path.join(FIXTURE_DIR, fixtureName),
      "utf8"
    )
  );

  totalExpected += bundle.steps.length;

  console.log();
  console.log("--------------------------------------------------");
  console.log(fixtureName);
  console.log("--------------------------------------------------");

  const response = await fetch(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundle.bundleId)}/steps`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    }
  );

  const raw = await response.text();

  fs.writeFileSync(
    path.join(RUN_DIR, `${base}-steps.raw.json`),
    raw
  );

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    body = { __nonJsonBody: raw };
  }

  writeJson(`${base}-steps.json`, body);

  console.log(`HTTP STATUS: ${response.status}`);

  const rows =
    Array.isArray(body?.steps)
      ? body.steps
      : [];

  console.log(
    `STEP COUNT: ${rows.length}/${bundle.steps.length}`
  );

  if (
    response.status !== 200 ||
    rows.length !== bundle.steps.length
  ) {
    console.log("BUNDLE VERIFICATION: FAIL");
    failed = true;

    results.push({
      fixture: fixtureName,
      bundleId: bundle.bundleId,
      expectedSteps: bundle.steps.length,
      actualSteps: rows.length,
      httpStatus: response.status,
      verifiedCers: 0,
      status: "FAIL"
    });

    continue;
  }

  const firstRow = rows[0] ?? {};

  console.log(
    "ROW KEYS:",
    Object.keys(firstRow).sort().join(", ")
  );

  console.log(
    "PROOF KEYS:",
    Object.keys(firstRow?.proof ?? {}).sort().join(", ")
  );

  let verified = 0;
  const cerResults = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const expectedStep = bundle.steps[i];

    const cer = row?.proof?.proofJson;

    if (!cer) {
      console.log(
        `CER ${i + 1}: FAIL — proof.proofJson missing`
      );

      cerResults.push({
        stepId: row?.stepId ?? null,
        status: "FAIL",
        reason: "proof.proofJson missing"
      });

      failed = true;
      continue;
    }

    const verification =
      verifyCageStepCer(cer);

    const certificateHash =
      cer.certificateHash;

    const checks = {
      sdkOk:
        verification.ok === true,

      certificateIntegrity:
        verification.certificateIntegrity === "valid",

      stateHashNotPerformed:
        verification.stateHashVerification ===
        "not-performed",

      stepIdPreserved:
        cer.step?.stepId === expectedStep.stepId,

      nodeNamePreserved:
        cer.step?.nodeName === expectedStep.nodeName,

      parentStepIdsPreserved:
        sameArray(
          cer.step?.parentStepIds,
          expectedStep.parentStepIds
        ),

      stateHashPreserved:
        cer.step?.stateHash === expectedStep.stateHash,

      certificateHashShape:
        /^sha256:[a-f0-9]{64}$/.test(
          certificateHash ?? ""
        ),

      uniqueCertificateHash:
        !hashes.has(certificateHash)
    };

    const pass =
      Object.values(checks).every(Boolean);

    if (pass) {
      hashes.add(certificateHash);
      verified++;
      totalVerified++;

      console.log(
        `CER ${i + 1}/${rows.length}: PASS ` +
        `${expectedStep.stepId} ${certificateHash}`
      );
    } else {
      failed = true;

      console.log(
        `CER ${i + 1}/${rows.length}: FAIL`
      );

      console.log(
        JSON.stringify(checks, null, 2)
      );
    }

    cerResults.push({
      ordinal: i,
      stepId: expectedStep.stepId,
      nodeName: expectedStep.nodeName,
      certificateHash,
      checks,
      status: pass ? "PASS" : "FAIL"
    });
  }

  const bundlePass =
    verified === bundle.steps.length;

  console.log(
    `BUNDLE RESULT: ${bundlePass ? "PASS" : "FAIL"}`
  );

  if (!bundlePass) {
    failed = true;
  }

  results.push({
    fixture: fixtureName,
    bundleId: bundle.bundleId,
    terminalPath: bundle.terminalPath,
    expectedSteps: bundle.steps.length,
    actualSteps: rows.length,
    httpStatus: response.status,
    verifiedCers: verified,
    rowShape: {
      rowKeys: Object.keys(firstRow).sort(),
      proofKeys:
        Object.keys(firstRow?.proof ?? {}).sort()
    },
    cers: cerResults,
    status: bundlePass ? "PASS" : "FAIL"
  });
}

const summary = {
  stage: "02c-read-only-persisted-cer-verification",
  generatedAt: new Date().toISOString(),

  baseline: {
    cageCommit:
      "8162958ac23d958871fd4016f349a7062627fd4d",
    governedExecutionSdk: "0.4.0",
    canonicalNode: "0.29.0"
  },

  productionWritesPerformedInThisStage: false,

  fixtureCount: fixtureNames.length,
  expectedCerCount: 38,
  expectedSteps: totalExpected,
  verifiedCerCount: totalVerified,
  uniqueCertificateHashes: hashes.size,

  fixtures: results,

  claimBoundary: {
    certificateIntegrity:
      totalVerified === 38
        ? "independently verified with SDK 0.4.0"
        : "not fully verified",

    nodePersistence:
      "validated through authenticated read-back",

    stateHash:
      "preserved and certificate-bound; preimage not verified",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed",

    policyCorrectness:
      "not claimed"
  },

  status:
    !failed &&
    results.length === 5 &&
    totalVerified === 38 &&
    hashes.size === 38
      ? "PASS"
      : "FAIL"
};

writeJson("stage-02c-summary.json", summary);

console.log();
console.log("==================================================");
console.log("STAGE 2C SUMMARY");
console.log("==================================================");
console.log(`Fixtures: ${results.length}/5`);
console.log(`Expected CERs: 38`);
console.log(`Verified CERs: ${totalVerified}`);
console.log(`Unique certificate hashes: ${hashes.size}`);
console.log(`FINAL RESULT: ${summary.status}`);

if (summary.status !== "PASS") {
  process.exitCode = 1;
}
