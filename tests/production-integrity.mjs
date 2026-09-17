import {
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const API_KEY =
  process.env.NEXART_API_KEY;

if (!API_KEY) {
  throw new Error(
    "NEXART_API_KEY is required for the private production baseline."
  );
}

const BASELINE = [
  {
    name: "happy-path",
    bundleId:
      "109b33b3-a485-47e9-a78d-9549ea52cead",
    expectedSteps: 4
  },
  {
    name: "cbf-block",
    bundleId:
      "c55850e6-6a33-4d50-9b0b-c5ed6a7d2566",
    expectedSteps: 3
  },
  {
    name: "loop-breaker",
    bundleId:
      "87492823-96df-4545-8312-f5eb5f491891",
    expectedSteps: 6
  },
  {
    name: "nemo-block",
    bundleId:
      "5c188771-8929-4dcc-9f05-eb7118b1ae81",
    expectedSteps: 3
  },
  {
    name: "branching-merging-dag",
    bundleId:
      "fec228f8-5259-47e9-9339-c9d137576898",
    expectedSteps: 22
  }
];

const PUBLIC_REFERENCE =
  "sha256:06ecaef10f7da96162f9290b3a863acede905cfe80a15bf35b8f9025c1dca6b8";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function authenticatedJson(path) {
  const response =
    await fetch(
      `${NODE_URL}${path}`,
      {
        headers: {
          Authorization:
            `Bearer ${API_KEY}`
        }
      }
    );

  const body =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `${path} returned HTTP ${response.status}: ` +
      JSON.stringify(body)
    );
  }

  return body;
}

async function fetchPublicCer(
  certificateHash
) {
  const response =
    await fetch(
      `${NODE_URL}/v1/resolve/cer/${encodeURIComponent(
        certificateHash
      )}`
    );

  const body =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Public resolver returned HTTP ${response.status}: ` +
      JSON.stringify(body)
    );
  }

  return body;
}

const allHashes =
  new Set();

let totalSteps =
  0;

for (const scenario of BASELINE) {
  const listing =
    await authenticatedJson(
      `/v1/cage/bundles/${scenario.bundleId}/steps`
    );

  assert(
    Array.isArray(listing.steps),
    `${scenario.name}: steps array missing`
  );

  assert(
    listing.steps.length ===
      scenario.expectedSteps,
    `${scenario.name}: expected ${scenario.expectedSteps} steps, got ${listing.steps.length}`
  );

  for (const row of listing.steps) {
    const cer =
      row.proof?.proofJson;

    assert(
      cer,
      `${scenario.name}: missing CER for step ${row.stepId}`
    );

    const verification =
      verifyCageStepCer(cer);

    assert(
      verification.ok,
      `${scenario.name}: SDK verification failed for ${row.stepId}`
    );

    assert(
      verification.certificateIntegrity ===
        "valid",
      `${scenario.name}: invalid certificate integrity for ${row.stepId}`
    );

    assert(
      cer.step.stepId === row.stepId,
      `${scenario.name}: step identity mismatch`
    );

    assert(
      Array.isArray(
        cer.step.parentStepIds
      ),
      `${scenario.name}: parentStepIds missing`
    );

    assert(
      !allHashes.has(
        cer.certificateHash
      ),
      `${scenario.name}: duplicate certificate hash ${cer.certificateHash}`
    );

    allHashes.add(
      cer.certificateHash
    );

    totalSteps += 1;
  }

  console.log(
    `${scenario.name}: ${listing.steps.length}/${scenario.expectedSteps} CERs PASS`
  );
}

assert(
  totalSteps === 38,
  `Expected 38 baseline CERs, got ${totalSteps}`
);

assert(
  allHashes.size === 38,
  `Expected 38 unique certificate hashes, got ${allHashes.size}`
);

const publicRecord =
  await fetchPublicCer(
    PUBLIC_REFERENCE
  );

const publicCer =
  publicRecord.cer ||
  publicRecord.record ||
  publicRecord.proof?.proofJson ||
  publicRecord.bundle ||
  publicRecord;

const publicVerification =
  verifyCageStepCer(
    publicCer
  );

assert(
  publicVerification.ok,
  "Public reference CER failed SDK verification"
);

assert(
  publicCer.certificateHash ===
    PUBLIC_REFERENCE,
  "Public resolver returned an unexpected certificate hash"
);

console.log();
console.log(
  `Baseline CERs verified: ${totalSteps}`
);

console.log(
  `Unique certificate hashes: ${allHashes.size}`
);

console.log(
  `Public reference: ${PUBLIC_REFERENCE}`
);

console.log(
  "Production integrity: PASS"
);
