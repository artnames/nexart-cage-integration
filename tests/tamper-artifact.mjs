import fs from "node:fs/promises";

import {
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const ORIGINAL_FIXTURE =
  new URL(
    "../fixtures/original-public-cer.json",
    import.meta.url
  );

const TAMPERED_FIXTURE =
  new URL(
    "../fixtures/tampered-public-cer.json",
    import.meta.url
  );

const EXPECTED_ORIGINAL_HASH =
  "sha256:06ecaef10f7da96162f9290b3a863acede905cfe80a15bf35b8f9025c1dca6b8";

const EXPECTED_TAMPERED_RECOMPUTED_HASH =
  "sha256:ae5969913c4a707376af2d552ebac428d210da87f40cdeeb875432633d394687";

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(
  url
) {
  return JSON.parse(
    await fs.readFile(
      url,
      "utf8"
    )
  );
}

function errorCodeOf(
  result
) {
  return (
    result?.code ||
    result?.errorCode ||
    result?.error?.code ||
    result?.reasonCode ||
    null
  );
}

function expectedHashOf(
  result
) {
  return (
    result?.expectedCertificateHash ||
    result?.expectedHash ||
    result?.computedCertificateHash ||
    result?.computedHash ||
    null
  );
}

/*
 * Load the recorded original and intentionally modified CER.
 */
const original =
  await readJson(
    ORIGINAL_FIXTURE
  );

const tampered =
  await readJson(
    TAMPERED_FIXTURE
  );

/*
 * 1. Basic fixture identity.
 */
assert(
  original.certificateHash ===
    EXPECTED_ORIGINAL_HASH,
  "Original fixture has an unexpected certificate hash"
);

assert(
  tampered.certificateHash ===
    EXPECTED_ORIGINAL_HASH,
  "Tampered fixture must deliberately retain the original certificate hash"
);

assert(
  original.bundleType ===
    "cer.governed.execution.step.v1",
  "Original fixture has unexpected CER family"
);

assert(
  tampered.bundleType ===
    original.bundleType,
  "Tampered fixture changed CER family unexpectedly"
);

/*
 * The only intentional semantic alteration should be
 * inside protected step metadata.
 */
assert(
  original.step.metadata.tamperProbe ===
    undefined,
  "Original fixture unexpectedly contains tamperProbe"
);

assert(
  tampered.step.metadata.tamperProbe ===
    "ALTERED_AFTER_CERTIFICATION",
  "Tampered fixture is missing the intended tamper probe"
);

console.log(
  "Fixture identity checks: PASS"
);

/*
 * 2. Verify the original CER locally.
 */
const originalVerification =
  verifyCageStepCer(
    original
  );

assert(
  originalVerification.ok,
  `Original CER verification failed: ${JSON.stringify(originalVerification)}`
);

assert(
  originalVerification
    .certificateIntegrity ===
    "valid",
  `Original certificate integrity was not valid: ${JSON.stringify(originalVerification)}`
);

console.log(
  "Original CER verification: PASS"
);

/*
 * 3. Verify the post-certification modification.
 *
 * The protected evidence changed while certificateHash
 * deliberately remained the original value.
 */
const tamperedVerification =
  verifyCageStepCer(
    tampered
  );

assert(
  !tamperedVerification.ok,
  "Tampered CER unexpectedly passed verification"
);

assert(
  errorCodeOf(
    tamperedVerification
  ) ===
    "CERTIFICATE_HASH_MISMATCH",
  `Expected CERTIFICATE_HASH_MISMATCH, got ${errorCodeOf(tamperedVerification)}`
);

/*
 * SDK response shapes may expose the recomputed hash under
 * different descriptive field names. If present, verify
 * it against the recorded Phase 5 result.
 */
const recomputed =
  expectedHashOf(
    tamperedVerification
  );

if (recomputed !== null) {
  assert(
    recomputed ===
      EXPECTED_TAMPERED_RECOMPUTED_HASH,
    `Unexpected recomputed tampered hash: ${recomputed}`
  );
}

console.log(
  "Tampered CER rejected: CERTIFICATE_HASH_MISMATCH PASS"
);

/*
 * 4. Resolve the original CER again from the production
 * public resolver.
 *
 * This proves the local tampering operation did not alter
 * the persisted public evidence.
 */
const resolverResponse =
  await fetch(
    `${NODE_URL}/v1/resolve/cer/${encodeURIComponent(
      EXPECTED_ORIGINAL_HASH
    )}`
  );

let resolverBody;

try {
  resolverBody =
    await resolverResponse.json();
} catch {
  resolverBody = null;
}

assert(
  resolverResponse.status === 200,
  `Public resolver expected HTTP 200, got ${resolverResponse.status}: ${JSON.stringify(resolverBody)}`
);

const resolved =
  resolverBody?.cer ||
  resolverBody?.record ||
  resolverBody?.proof?.proofJson ||
  resolverBody?.bundle ||
  resolverBody;

assert(
  resolved,
  "Public resolver returned no CER"
);

assert(
  resolved.certificateHash ===
    EXPECTED_ORIGINAL_HASH,
  "Public resolver returned an unexpected certificate hash"
);

assert(
  resolved.step?.metadata?.tamperProbe ===
    undefined,
  "Persisted public CER unexpectedly contains the local tamper probe"
);

const resolvedVerification =
  verifyCageStepCer(
    resolved
  );

assert(
  resolvedVerification.ok,
  `Refetched original CER failed verification: ${JSON.stringify(resolvedVerification)}`
);

assert(
  resolvedVerification
    .certificateIntegrity ===
    "valid",
  "Refetched original CER has invalid certificate integrity"
);

console.log(
  "Persisted original remained unchanged and valid: PASS"
);

console.log();
console.log(
  `Original certificate: ${EXPECTED_ORIGINAL_HASH}`
);

console.log(
  `Recorded recomputed tampered hash: ${EXPECTED_TAMPERED_RECOMPUTED_HASH}`
);

console.log(
  "Tamper-artifact validation: PASS"
);
