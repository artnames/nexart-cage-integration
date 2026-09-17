import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  CAGE_BUNDLE_SCHEMA_URN,
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL = "https://node.nexart.io";
const API_KEY = process.env.NEXART_API_KEY;
const FIXTURE_DIR = process.env.FIXTURE_DIR;
const RUN_DIR = process.env.RUN_DIR;

if (!API_KEY) throw new Error("NEXART_API_KEY missing");
if (!FIXTURE_DIR) throw new Error("FIXTURE_DIR missing");
if (!RUN_DIR) throw new Error("RUN_DIR missing");

const fixtures = [
  {
    name: "01_single_path_happy.json",
    sha256: "9becff1257874754d73ae3585808bff63657e19e9232ec44d516677c779c2440"
  },
  {
    name: "02_cbf_block.json",
    sha256: "a1d0d064212d7ff4a8995be98823c6d8e41fc077c71872990e819e8c4b697797"
  },
  {
    name: "03_loop_breaker.json",
    sha256: "7c2717ec5a7d60d9d3de1c5ba1d2ee9349b7c4e72820dfb2ef7c884abeb5e6fa"
  },
  {
    name: "04_nemo_policy_block.json",
    sha256: "5b7306e816e73d381680ddb065f519ac0ae077453200d92bbed8e4e49b584bc9"
  },
  {
    name: "05_large_dag.json",
    sha256: "08d0b418c00e448970a0ab4ffee9ec70d5556fa3fa9b6b4266c3fcd0d3e850a3"
  }
];

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function writeJson(name, value) {
  fs.writeFileSync(
    path.join(RUN_DIR, name),
    JSON.stringify(value, null, 2) + "\n"
  );
}

async function readJsonResponse(response, rawName) {
  const text = await response.text();
  fs.writeFileSync(path.join(RUN_DIR, rawName), text);

  try {
    return JSON.parse(text);
  } catch {
    return { __nonJsonBody: text };
  }
}

function selectedHeaders(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

const results = [];
const allCertificateHashes = new Set();

let totalExpectedSteps = 0;
let totalVerifiedCers = 0;
let failed = false;

for (let index = 0; index < fixtures.length; index++) {
  const fixture = fixtures[index];
  const fixturePath = path.join(FIXTURE_DIR, fixture.name);
  const raw = fs.readFileSync(fixturePath);
  const actualHash = sha256(raw);

  console.log("--------------------------------------------------");
  console.log(`${fixture.name}`);
  console.log("--------------------------------------------------");

  if (actualHash !== fixture.sha256) {
    console.log(`FIXTURE HASH: FAIL`);
    console.log(`Expected: ${fixture.sha256}`);
    console.log(`Actual:   ${actualHash}`);
    failed = true;
    break;
  }

  console.log(`FIXTURE HASH: PASS`);

  const bundle = JSON.parse(raw.toString("utf8"));

  const localValidation = validateCageExecution(bundle);

  writeJson(
    `${fixture.name.replace(".json", "")}-local-validation.json`,
    localValidation
  );

  if (!localValidation.valid) {
    console.log("SDK 0.4.0 VALIDATION: FAIL");
    console.log(JSON.stringify(localValidation, null, 2));
    failed = true;
    break;
  }

  console.log("SDK 0.4.0 VALIDATION: PASS");

  const requestObject = {
    schema: CAGE_BUNDLE_SCHEMA_URN,
    bundle
  };

  const requestText = JSON.stringify(requestObject);
  const requestHash = sha256(Buffer.from(requestText));

  const base = fixture.name.replace(".json", "");

  fs.writeFileSync(
    path.join(RUN_DIR, `${base}-request.json`),
    requestText
  );

  const idempotencyKey =
    `cage-conformance-20260917-${base}`;

  console.log(`BUNDLE: ${bundle.bundleId}`);
  console.log(`TERMINAL PATH: ${bundle.terminalPath}`);
  console.log(`STEPS: ${bundle.steps.length}`);
  console.log(`REQUEST SHA256: ${requestHash}`);
  console.log("POSTING TO PRODUCTION...");

  totalExpectedSteps += bundle.steps.length;

  const response = await fetch(
    `${NODE_URL}/v1/cage/bundles`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey
      },
      body: requestText
    }
  );

  const responseHeaders = selectedHeaders(response.headers);

  writeJson(
    `${base}-response-headers.json`,
    responseHeaders
  );

  const body = await readJsonResponse(
    response,
    `${base}-response.raw.json`
  );

  writeJson(
    `${base}-response.json`,
    body
  );

  console.log(`HTTP STATUS: ${response.status}`);

  let verified = 0;
  let recordCount = 0;
  let certificateHashes = [];
  let responseChecksPass = true;

  if (response.status !== 201) {
    responseChecksPass = false;
    console.log("PRODUCTION INGEST: FAIL");
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.log("PRODUCTION INGEST: PASS");

    if (!body || body.ok !== true) {
      responseChecksPass = false;
      console.log("RESPONSE ok=true: FAIL");
    } else {
      console.log("RESPONSE ok=true: PASS");
    }

    if (!Array.isArray(body.records)) {
      responseChecksPass = false;
      console.log("RECORDS ARRAY: FAIL");
    } else {
      recordCount = body.records.length;

      if (recordCount !== bundle.steps.length) {
        responseChecksPass = false;
        console.log(
          `RECORD COUNT: FAIL (${recordCount}/${bundle.steps.length})`
        );
      } else {
        console.log(
          `RECORD COUNT: PASS (${recordCount}/${bundle.steps.length})`
        );
      }

      for (let i = 0; i < body.records.length; i++) {
        const record = body.records[i];
        const cer = record?.cer;

        if (!cer) {
          responseChecksPass = false;
          console.log(`CER ${i + 1}: FAIL — missing CER`);
          continue;
        }

        const verification = verifyCageStepCer(cer);

        if (
          !verification.ok ||
          verification.certificateIntegrity !== "valid"
        ) {
          responseChecksPass = false;
          console.log(
            `CER ${i + 1}: FAIL — SDK verification`
          );
          continue;
        }

        if (
          verification.stateHashVerification !== "not-performed"
        ) {
          responseChecksPass = false;
          console.log(
            `CER ${i + 1}: FAIL — unexpected stateHash verification claim`
          );
          continue;
        }

        if (
          record.certificateHash !== cer.certificateHash
        ) {
          responseChecksPass = false;
          console.log(
            `CER ${i + 1}: FAIL — certificate hash mismatch`
          );
          continue;
        }

        if (
          record.receipt?.certificateHash !==
          record.certificateHash
        ) {
          responseChecksPass = false;
          console.log(
            `CER ${i + 1}: FAIL — receipt hash mismatch`
          );
          continue;
        }

        const expectedStep = bundle.steps[i];

        if (
          cer.step?.stepId !== expectedStep?.stepId
        ) {
          responseChecksPass = false;
          console.log(
            `CER ${i + 1}: FAIL — step identity mismatch`
          );
          continue;
        }

        if (
          allCertificateHashes.has(
            record.certificateHash
          )
        ) {
          responseChecksPass = false;
          console.log(
            `CER ${i + 1}: FAIL — duplicate certificate hash`
          );
          continue;
        }

        allCertificateHashes.add(
          record.certificateHash
        );

        certificateHashes.push(
          record.certificateHash
        );

        verified++;
        totalVerifiedCers++;

        console.log(
          `CER ${i + 1}/${bundle.steps.length}: PASS ` +
          `${expectedStep.stepId} ${record.certificateHash}`
        );
      }
    }
  }

  console.log("CHECKING PERSISTED BUNDLE...");

  const bundleGet = await fetch(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundle.bundleId)}`,
    {
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      }
    }
  );

  const bundleGetBody = await readJsonResponse(
    bundleGet,
    `${base}-persisted-bundle.raw.json`
  );

  writeJson(
    `${base}-persisted-bundle.json`,
    bundleGetBody
  );

  console.log(
    `PERSISTED BUNDLE HTTP: ${bundleGet.status}`
  );

  const stepsGet = await fetch(
    `${NODE_URL}/v1/cage/bundles/${encodeURIComponent(bundle.bundleId)}/steps`,
    {
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      }
    }
  );

  const stepsGetBody = await readJsonResponse(
    stepsGet,
    `${base}-persisted-steps.raw.json`
  );

  writeJson(
    `${base}-persisted-steps.json`,
    stepsGetBody
  );

  const persistedStepCount =
    Array.isArray(stepsGetBody?.steps)
      ? stepsGetBody.steps.length
      : null;

  console.log(
    `PERSISTED STEPS HTTP: ${stepsGet.status}`
  );

  console.log(
    `PERSISTED STEP COUNT: ${persistedStepCount}`
  );

  const persistencePass =
    bundleGet.status === 200 &&
    stepsGet.status === 200 &&
    persistedStepCount === bundle.steps.length;

  console.log(
    `PERSISTENCE CHECK: ${persistencePass ? "PASS" : "FAIL"}`
  );

  const fixturePass =
    response.status === 201 &&
    responseChecksPass &&
    verified === bundle.steps.length &&
    persistencePass;

  console.log(
    `FIXTURE RESULT: ${fixturePass ? "PASS" : "FAIL"}`
  );

  if (!fixturePass) {
    failed = true;
  }

  results.push({
    fixture: fixture.name,
    sourceSha256: actualHash,
    requestSha256: requestHash,
    schema: CAGE_BUNDLE_SCHEMA_URN,
    bundleId: bundle.bundleId,
    threadId: bundle.threadId,
    terminalPath: bundle.terminalPath,
    expectedSteps: bundle.steps.length,
    httpStatus: response.status,
    responseOk: body?.ok === true,
    responseRecordCount: recordCount,
    sdkVerifiedCers: verified,
    persistedBundleHttpStatus: bundleGet.status,
    persistedStepsHttpStatus: stepsGet.status,
    persistedStepCount,
    idempotencyKey,
    certificateHashes,
    status: fixturePass ? "PASS" : "FAIL"
  });
}

const summary = {
  stage: "02b-production-canonical-cage-fixtures",
  generatedAt: new Date().toISOString(),
  nodeUrl: NODE_URL,
  cageCommit:
    "8162958ac23d958871fd4016f349a7062627fd4d",
  governedExecutionSdk: "0.4.0",
  expectedNodeVersion: "0.29.0",
  schema: CAGE_BUNDLE_SCHEMA_URN,
  productionWriteAuthorized: true,
  fixtureCount: fixtures.length,
  attemptedFixtureCount: results.length,
  expectedCerCount: 38,
  expectedStepsEncountered: totalExpectedSteps,
  verifiedCerCount: totalVerifiedCers,
  uniqueCertificateHashes:
    allCertificateHashes.size,
  fixtures: results,
  claimBoundary: {
    certificateIntegrity: "SDK independently verified",
    nodePersistence: "queried after ingestion",
    stateHashPreimage: "not independently verified",
    cageProducerAuthentication: "not claimed",
    executionTruth: "not claimed",
    policyCorrectness: "not claimed"
  },
  status:
    !failed &&
    results.length === fixtures.length &&
    totalVerifiedCers === 38 &&
    allCertificateHashes.size === 38
      ? "PASS"
      : "FAIL"
};

writeJson("stage-02b-summary.json", summary);

console.log();
console.log("==================================================");
console.log("STAGE 2B SUMMARY");
console.log("==================================================");
console.log(`Fixtures attempted: ${results.length}/5`);
console.log(`Expected CERs: 38`);
console.log(`SDK verified CERs: ${totalVerifiedCers}`);
console.log(
  `Unique certificate hashes: ${allCertificateHashes.size}`
);
console.log(`FINAL RESULT: ${summary.status}`);
console.log();
console.log(
  `Evidence directory: ${RUN_DIR}`
);

if (summary.status !== "PASS") {
  process.exitCode = 1;
}
