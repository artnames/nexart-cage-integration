import fs from "node:fs/promises";

import {
  validateCageExecution,
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const API_KEY =
  process.env.NEXART_API_KEY;

const REQUIRE_RECORDED =
  process.argv.includes(
    "--require-recorded"
  );

const RECORDED_BUNDLE_ID =
  "744ba34a-89e1-4d50-b1ab-4283a61ea5d0";

const FIXTURE =
  new URL(
    "../fixtures/minimal-cage-input.json",
    import.meta.url
  );

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

const fixture =
  JSON.parse(
    await fs.readFile(
      FIXTURE,
      "utf8"
    )
  );

assert(
  fixture.schema ===
    "urn:cage:governance:v1:attestation-bundle",
  "Minimal fixture has an unexpected schema"
);

const localValidation =
  validateCageExecution(
    fixture.bundle,
    fixture.topology
  );

assert(
  localValidation.valid,
  `Minimal fixture failed local validation: ${JSON.stringify(localValidation)}`
);

assert(
  fixture.bundle.steps.length === 3,
  "Minimal fixture must contain exactly 3 executed steps"
);

console.log(
  "Local minimal fixture validation: PASS"
);

if (!API_KEY) {
  if (REQUIRE_RECORDED) {
    throw new Error(
      "NEXART_API_KEY is required for recorded private execution validation."
    );
  }

  console.log(
    "Recorded private execution validation: SKIPPED (NEXART_API_KEY not set)"
  );
} else {
  const response =
    await fetch(
      `${NODE_URL}/v1/cage/bundles/${RECORDED_BUNDLE_ID}/steps`,
      {
        headers: {
          Authorization:
            `Bearer ${API_KEY}`
        }
      }
    );

  let body = null;

  try {
    body =
      await response.json();
  } catch {
    // The assertion below reports the HTTP failure.
  }

  assert(
    response.ok,
    `Recorded minimal execution returned HTTP ${response.status}: ${JSON.stringify(body)}`
  );

  assert(
    Array.isArray(body?.steps),
    "Recorded minimal execution response has no steps array"
  );

  assert(
    body.steps.length === 3,
    `Recorded minimal execution expected 3 steps, got ${body.steps.length}`
  );

  const byName =
    new Map();

  const certificateHashes =
    new Set();

  for (const row of body.steps) {
    const cer =
      row?.proof?.proofJson;

    assert(
      cer,
      `Missing CER for recorded step ${row?.stepId}`
    );

    const verification =
      verifyCageStepCer(cer);

    assert(
      verification.ok,
      `Recorded CER failed verification for ${row?.stepId}`
    );

    assert(
      verification.certificateIntegrity ===
        "valid",
      `Recorded CER has invalid certificate integrity for ${row?.stepId}`
    );

    byName.set(
      cer.step.nodeName,
      cer
    );

    certificateHashes.add(
      cer.certificateHash
    );
  }

  assert(
    certificateHashes.size === 3,
    "Recorded minimal execution certificate hashes are not unique"
  );

  const intake =
    byName.get("intake");

  const decision =
    byName.get("decision");

  const complete =
    byName.get("complete");

  assert(
    intake && decision && complete,
    "Recorded minimal execution has unexpected node names"
  );

  assert(
    intake.step.parentStepIds.length === 0,
    "Recorded intake step should have no parent"
  );

  assert(
    decision.step.parentStepIds.includes(
      intake.step.stepId
    ),
    "Recorded decision step does not reference intake"
  );

  assert(
    complete.step.parentStepIds.includes(
      decision.step.stepId
    ),
    "Recorded complete step does not reference decision"
  );

  console.log(
    "Recorded private minimal execution validation: PASS"
  );

  console.log(
    "Minimal integration validation: PASS"
  );
}
