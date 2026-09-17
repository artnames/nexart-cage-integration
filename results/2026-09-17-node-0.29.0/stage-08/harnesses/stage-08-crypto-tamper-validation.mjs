import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";

import {
  verifyCageStepCer
} from "@nexart/governed-execution/cage";

const STAGE7 =
  path.resolve(
    "results/2026-09-17-node-0.29.0/" +
    "stage-07/production/08-final-steps.json"
  );

const RESULT_DIR =
  path.resolve(
    "results/2026-09-17-node-0.29.0/stage-08"
  );

const DISCOVERY_URL =
  "https://node.nexart.io/.well-known/nexart-node.json";

const EXPECTED_PROTECTED_FIELDS = [
  "bundleType",
  "version",
  "schema",
  "bundleId",
  "threadId",
  "step"
];

const EXPECTED_ENVELOPE_BUNDLE_FIELDS = [
  "bundleType",
  "version",
  "schema",
  "bundleId",
  "threadId",
  "step",
  "protectedSet"
];

const EXPECTED_ENVELOPE_ATTESTATION_FIELDS = [
  "attestationId",
  "attestedAt",
  "kid",
  "nodeRuntimeHash",
  "protocolVersion"
];

function writeJson(name, value) {
  fs.writeFileSync(
    path.join(
      RESULT_DIR,
      name
    ),
    JSON.stringify(
      value,
      null,
      2
    ) + "\n"
  );
}

/*
 * Independent JCS-style canonicalizer.
 *
 * This does NOT use the SDK canonical/hash implementation.
 * For the JSON value types present in CAGE CERs it follows
 * the same RFC 8785 / ECMAScript serialization semantics:
 *
 * - object keys sorted lexicographically
 * - arrays retain order
 * - finite numbers use JSON number serialization
 * - strings use JSON escaping
 */

function canonical(value) {
  if (value === null)
    return "null";

  if (typeof value === "boolean")
    return value ? "true" : "false";

  if (typeof value === "string")
    return JSON.stringify(value);

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "Non-finite number cannot be canonicalized"
      );
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return (
      "[" +
      value.map(
        item =>
          canonical(item)
      ).join(",") +
      "]"
    );
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          key =>
            JSON.stringify(key) +
            ":" +
            canonical(value[key])
        )
        .join(",") +
      "}"
    );
  }

  throw new Error(
    `Unsupported canonical value: ${typeof value}`
  );
}

function sha256Canonical(value) {
  return (
    "sha256:" +
    crypto
      .createHash("sha256")
      .update(
        Buffer.from(
          canonical(value),
          "utf8"
        )
      )
      .digest("hex")
  );
}

function cageCertificateProjection(cer) {
  return {
    bundleType:
      cer.bundleType,

    version:
      cer.version,

    schema:
      cer.schema,

    bundleId:
      cer.bundleId,

    threadId:
      cer.threadId,

    step:
      cer.step,

    protectedSet:
      cer.protectedSet
  };
}

function cageEnvelopeBundleProjection(cer) {
  return {
    bundleType:
      cer.bundleType,

    version:
      cer.version,

    schema:
      cer.schema,

    bundleId:
      cer.bundleId,

    threadId:
      cer.threadId,

    step:
      cer.step,

    protectedSet:
      cer.protectedSet
  };
}

function envelopeAttestationProjection(attestation) {
  return {
    attestationId:
      attestation.attestationId,

    attestedAt:
      attestation.attestedAt,

    kid:
      attestation.kid,

    nodeRuntimeHash:
      attestation.nodeRuntimeHash,

    protocolVersion:
      attestation.protocolVersion
  };
}

function envelopeSignablePayload(
  cer,
  attestation
) {
  return {
    attestation:
      envelopeAttestationProjection(
        attestation
      ),

    bundle:
      cageEnvelopeBundleProjection(
        cer
      )
  };
}

function publicKeyFromDiscovery(
  discovery,
  kid
) {
  const entry =
    discovery.keys?.find(
      item =>
        item.kid === kid
    );

  if (!entry) {
    throw new Error(
      `Signing kid ${kid} not found in discovery manifest`
    );
  }

  if (entry.revoked === true) {
    throw new Error(
      `Signing kid ${kid} is marked revoked`
    );
  }

  const jwk =
    entry.publicKeyJwk ??
    entry.jwk;

  if (!jwk) {
    throw new Error(
      `Signing kid ${kid} has no JWK`
    );
  }

  if (
    jwk.kty !== "OKP" ||
    jwk.crv !== "Ed25519" ||
    typeof jwk.x !== "string"
  ) {
    throw new Error(
      `Signing kid ${kid} is not a valid Ed25519 JWK`
    );
  }

  return {
    entry,
    jwk,
    keyObject:
      crypto.createPublicKey({
        key: jwk,
        format: "jwk"
      })
  };
}

function verifyEd25519(
  payload,
  signatureB64Url,
  publicKey
) {
  return crypto.verify(
    null,

    Buffer.from(
      canonical(payload),
      "utf8"
    ),

    publicKey,

    Buffer.from(
      signatureB64Url,
      "base64url"
    )
  );
}

function clone(value) {
  return structuredClone(value);
}

function flipHex(hash) {
  if (
    typeof hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(hash)
  ) {
    throw new Error(
      "Expected lowercase 64-character hex stateHash"
    );
  }

  return (
    (hash[0] === "a" ? "b" : "a") +
    hash.slice(1)
  );
}

function tamperCer(
  original,
  type
) {
  const cer =
    clone(original);

  if (type === "signals") {
    cer.step.signals = {
      ...cer.step.signals,
      stage08Tamper:
        true
    };

    return cer;
  }

  if (type === "metadata") {
    cer.step.metadata = {
      ...cer.step.metadata,
      stage08Tamper:
        true
    };

    return cer;
  }

  if (type === "stateHash") {
    cer.step.stateHash =
      flipHex(
        cer.step.stateHash
      );

    return cer;
  }

  if (
    type ===
    "parentStepIds"
  ) {
    /*
     * Keep the field schema-valid while changing
     * the protected value.
     */

    if (
      cer.step.parentStepIds.length === 0
    ) {
      cer.step.parentStepIds = [
        cer.step.stepId
      ];
    } else {
      cer.step.parentStepIds = [
        cer.step.stepId,
        ...cer.step.parentStepIds.slice(1)
      ];
    }

    return cer;
  }

  throw new Error(
    `Unknown tamper type ${type}`
  );
}

/*
 * ==================================================
 * LOAD FROZEN STAGE 7 EVIDENCE
 * ==================================================
 */

if (
  !fs.existsSync(STAGE7)
) {
  throw new Error(
    `Frozen Stage 7 evidence not found: ${STAGE7}`
  );
}

const stage7 =
  JSON.parse(
    fs.readFileSync(
      STAGE7,
      "utf8"
    )
  );

const rows =
  stage7.steps;

if (
  !Array.isArray(rows) ||
  rows.length !== 4
) {
  throw new Error(
    "Expected exactly four frozen Stage 7 steps"
  );
}

console.log(
  "=== STAGE 8: FROZEN EVIDENCE ==="
);

console.log(
  `Frozen CERs: ${rows.length}/4`
);

/*
 * ==================================================
 * PUBLIC DISCOVERY — READ ONLY
 * ==================================================
 */

console.log();
console.log(
  "=== PUBLIC NODE KEY DISCOVERY ==="
);

const discoveryResponse =
  await fetch(
    DISCOVERY_URL
  );

if (
  discoveryResponse.status !== 200
) {
  throw new Error(
    `Discovery HTTP ${discoveryResponse.status}`
  );
}

const discovery =
  await discoveryResponse.json();

writeJson(
  "node-discovery.json",
  discovery
);

console.log(
  `nodeId=${discovery.nodeId}`
);

console.log(
  `activeKid=${discovery.activeKid}`
);

/*
 * ==================================================
 * UNMODIFIED CRYPTOGRAPHIC VALIDATION
 * ==================================================
 */

console.log();
console.log(
  "=== CER HASH + SIGNATURE VALIDATION ==="
);

const originalResults = [];

const originalCertificateHashes =
  [];

for (
  let i = 0;
  i < rows.length;
  i++
) {
  const row =
    rows[i];

  const proof =
    row?.proof;

  const cer =
    proof?.proofJson;

  const meta =
    proof?.meta;

  if (
    !cer ||
    !meta
  ) {
    throw new Error(
      `Step ${i}: missing proof/proofJson/meta`
    );
  }

  const receipt =
    meta.receipt;

  const receiptSignature =
    meta.receiptSignature;

  const verificationEnvelope =
    meta.verificationEnvelope;

  const envelopeSignature =
    meta.verificationEnvelopeSignature;

  if (
    !receipt ||
    typeof receiptSignature !== "string" ||
    !verificationEnvelope ||
    typeof envelopeSignature !== "string"
  ) {
    throw new Error(
      `Step ${i}: incomplete Node attestation material`
    );
  }

  /*
   * -----------------------------------------------
   * Protected-set contract
   * -----------------------------------------------
   */

  assert.equal(
    cer.protectedSet?.stabilitySchemeId,
    "jcs-v1"
  );

  assert.deepEqual(
    cer.protectedSet?.protectedFields,
    EXPECTED_PROTECTED_FIELDS
  );

  /*
   * -----------------------------------------------
   * Independent certificateHash
   * -----------------------------------------------
   */

  const projection =
    cageCertificateProjection(
      cer
    );

  const independentlyComputedHash =
    sha256Canonical(
      projection
    );

  const independentHashPass =
    independentlyComputedHash ===
    cer.certificateHash;

  if (!independentHashPass) {
    throw new Error(
      `Step ${i}: independent certificateHash mismatch\n` +
      `stored=${cer.certificateHash}\n` +
      `computed=${independentlyComputedHash}`
    );
  }

  /*
   * -----------------------------------------------
   * SDK CER verifier
   * -----------------------------------------------
   */

  const sdkVerification =
    verifyCageStepCer(
      cer
    );

  if (
    sdkVerification.ok !== true ||
    sdkVerification.certificateIntegrity !==
      "valid" ||
    sdkVerification.stateHashVerification !==
      "not-performed"
  ) {
    throw new Error(
      `Step ${i}: SDK CER verification failed\n` +
      JSON.stringify(
        sdkVerification,
        null,
        2
      )
    );
  }

  /*
   * -----------------------------------------------
   * Receipt binding + Ed25519 signature
   * -----------------------------------------------
   */

  if (
    receipt.certificateHash !==
    cer.certificateHash
  ) {
    throw new Error(
      `Step ${i}: receipt does not bind CER certificateHash`
    );
  }

  const receiptKid =
    receipt.attestorKeyId;

  const receiptKey =
    publicKeyFromDiscovery(
      discovery,
      receiptKid
    );

  const receiptSignatureValid =
    verifyEd25519(
      receipt,
      receiptSignature,
      receiptKey.keyObject
    );

  if (
    !receiptSignatureValid
  ) {
    throw new Error(
      `Step ${i}: receipt Ed25519 signature invalid`
    );
  }

  /*
   * -----------------------------------------------
   * Verification-envelope metadata contract
   * -----------------------------------------------
   */

  if (
    verificationEnvelope.algorithm !==
    "Ed25519"
  ) {
    throw new Error(
      `Step ${i}: unexpected envelope algorithm`
    );
  }

  if (
    verificationEnvelope.scope !==
    "whitelist"
  ) {
    throw new Error(
      `Step ${i}: unexpected envelope scope`
    );
  }

  if (
    verificationEnvelope.canonicalization !==
    "jcs"
  ) {
    throw new Error(
      `Step ${i}: unexpected envelope canonicalization`
    );
  }

  assert.deepEqual(
    verificationEnvelope
      .signedFields
      ?.attestation,

    EXPECTED_ENVELOPE_ATTESTATION_FIELDS
  );

  assert.deepEqual(
    verificationEnvelope
      .signedFields
      ?.bundle,

    EXPECTED_ENVELOPE_BUNDLE_FIELDS
  );

  const envelopeKid =
    verificationEnvelope
      .attestation
      ?.kid;

  if (
    envelopeKid !==
    receiptKid
  ) {
    throw new Error(
      `Step ${i}: receipt/envelope kid mismatch`
    );
  }

  if (
    verificationEnvelope.kid !==
    envelopeKid
  ) {
    throw new Error(
      `Step ${i}: envelope top-level kid mismatch`
    );
  }

  const envelopeKey =
    publicKeyFromDiscovery(
      discovery,
      envelopeKid
    );

  /*
   * Independently reconstruct the exact signed
   * {attestation,bundle} payload.
   */

  const signablePayload =
    envelopeSignablePayload(
      cer,
      verificationEnvelope.attestation
    );

  const envelopeSignatureValid =
    verifyEd25519(
      signablePayload,
      envelopeSignature,
      envelopeKey.keyObject
    );

  if (
    !envelopeSignatureValid
  ) {
    throw new Error(
      `Step ${i}: verification-envelope Ed25519 signature invalid`
    );
  }

  originalCertificateHashes.push(
    cer.certificateHash
  );

  const result = {
    ordinal:
      i,

    stepId:
      cer.step.stepId,

    nodeName:
      cer.step.nodeName,

    certificateHash:
      cer.certificateHash,

    independentlyComputedHash,

    independentCertificateHash:
      "PASS",

    sdkVerification:
      "PASS",

    stateHashVerification:
      sdkVerification.stateHashVerification,

    receiptCertificateBinding:
      "PASS",

    receiptKid,

    receiptSignature:
      "PASS",

    envelopeKid,

    envelopeSignature:
      "PASS"
  };

  originalResults.push(
    result
  );

  console.log(
    `CER ${i + 1}/4: ` +
    `HASH PASS / SDK PASS / ` +
    `RECEIPT SIG PASS / ENVELOPE SIG PASS`
  );

  console.log(
    `  ${cer.certificateHash}`
  );
}

if (
  new Set(
    originalCertificateHashes
  ).size !== 4
) {
  throw new Error(
    "Expected four unique Stage 7 certificate hashes"
  );
}

/*
 * ==================================================
 * NEGATIVE TAMPER CONTROLS
 * ==================================================
 */

console.log();
console.log(
  "=== NEGATIVE TAMPER CONTROLS ==="
);

const tamperTypes = [
  "signals",
  "metadata",
  "stateHash",
  "parentStepIds"
];

const tamperResults = [];

for (
  let i = 0;
  i < rows.length;
  i++
) {
  const row =
    rows[i];

  const originalCer =
    row.proof.proofJson;

  const meta =
    row.proof.meta;

  const receipt =
    meta.receipt;

  const receiptSignature =
    meta.receiptSignature;

  const env =
    meta.verificationEnvelope;

  const envSignature =
    meta.verificationEnvelopeSignature;

  const receiptKey =
    publicKeyFromDiscovery(
      discovery,
      receipt.attestorKeyId
    );

  const envelopeKey =
    publicKeyFromDiscovery(
      discovery,
      env.attestation.kid
    );

  for (
    const tamperType of
    tamperTypes
  ) {
    const tampered =
      tamperCer(
        originalCer,
        tamperType
      );

    /*
     * Stored certificateHash deliberately remains
     * unchanged. Recomputing the protected projection
     * must produce a different hash.
     */

    const recomputedTamperedHash =
      sha256Canonical(
        cageCertificateProjection(
          tampered
        )
      );

    const hashMismatch =
      recomputedTamperedHash !==
      originalCer.certificateHash;

    if (
      !hashMismatch
    ) {
      throw new Error(
        `CER ${i + 1} ${tamperType}: hash did not change`
      );
    }

    /*
     * SDK must reject the modified CER because its
     * stored certificateHash now disagrees with the
     * protected projection.
     */

    const sdk =
      verifyCageStepCer(
        tampered
      );

    const sdkRejected =
      sdk.ok === false &&
      sdk.certificateIntegrity ===
        "invalid";

    if (
      !sdkRejected
    ) {
      throw new Error(
        `CER ${i + 1} ${tamperType}: SDK failed to detect tampering`
      );
    }

    /*
     * The Node receipt itself is unchanged, so its
     * detached signature should STILL be cryptographically
     * valid over that original receipt.
     *
     * But its certificateHash no longer matches the
     * recomputed tampered evidence. That is the binding
     * failure we want to demonstrate.
     */

    const receiptStillCryptographicallyValid =
      verifyEd25519(
        receipt,
        receiptSignature,
        receiptKey.keyObject
      );

    const receiptBindingBroken =
      receipt.certificateHash !==
      recomputedTamperedHash;

    if (
      !receiptStillCryptographicallyValid ||
      !receiptBindingBroken
    ) {
      throw new Error(
        `CER ${i + 1} ${tamperType}: receipt binding control failed`
      );
    }

    /*
     * The verification envelope signs the protected
     * CAGE bundle projection directly.
     *
     * Reconstructing the payload from the tampered CER
     * must therefore make the original envelope signature
     * fail.
     */

    const tamperedSignablePayload =
      envelopeSignablePayload(
        tampered,
        env.attestation
      );

    const tamperedEnvelopeSignatureValid =
      verifyEd25519(
        tamperedSignablePayload,
        envSignature,
        envelopeKey.keyObject
      );

    if (
      tamperedEnvelopeSignatureValid
    ) {
      throw new Error(
        `CER ${i + 1} ${tamperType}: envelope signature unexpectedly survived tampering`
      );
    }

    tamperResults.push({
      ordinal:
        i,

      stepId:
        originalCer.step.stepId,

      tamperType,

      storedCertificateHash:
        originalCer.certificateHash,

      recomputedTamperedHash,

      independentHashMismatch:
        true,

      sdkRejected:
        true,

      sdkCode:
        sdk.code,

      receiptSignatureStillValid:
        true,

      receiptBindingBroken:
        true,

      envelopeSignatureRejected:
        true,

      status:
        "PASS"
    });

    console.log(
      `CER ${i + 1}/4 ${tamperType}: PASS`
    );
  }
}

/*
 * ==================================================
 * FINAL UNMODIFIED RE-VERIFICATION
 * ==================================================
 */

console.log();
console.log(
  "=== FINAL UNMODIFIED RE-VERIFICATION ==="
);

const finalReverification = [];

for (
  let i = 0;
  i < rows.length;
  i++
) {
  const cer =
    rows[i]
      .proof
      .proofJson;

  const computed =
    sha256Canonical(
      cageCertificateProjection(
        cer
      )
    );

  const sdk =
    verifyCageStepCer(
      cer
    );

  const pass =
    computed ===
      cer.certificateHash &&
    sdk.ok === true &&
    sdk.certificateIntegrity ===
      "valid";

  if (!pass) {
    throw new Error(
      `Final unmodified CER ${i + 1} failed`
    );
  }

  finalReverification.push({
    ordinal:
      i,

    certificateHash:
      cer.certificateHash,

    status:
      "PASS"
  });

  console.log(
    `CER ${i + 1}/4: PASS`
  );
}

/*
 * ==================================================
 * SUMMARY
 * ==================================================
 */

const summary = {
  stage:
    "08-cer-hash-signature-and-tamper-validation",

  generatedAt:
    new Date().toISOString(),

  baseline: {
    governedExecutionSdk:
      "0.4.0",

    canonicalNode:
      "0.29.0",

    stage7Source:
      "stage-07/production/08-final-steps.json"
  },

  productionWrites:
    0,

  authenticatedProductionReads:
    0,

  publicReadOnlyDiscoveryRequests:
    1,

  evidence: {
    cerCount:
      rows.length,

    uniqueCertificateHashes:
      new Set(
        originalCertificateHashes
      ).size,

    independentHashPass:
      originalResults.filter(
        x =>
          x.independentCertificateHash ===
          "PASS"
      ).length,

    sdkVerificationPass:
      originalResults.filter(
        x =>
          x.sdkVerification ===
          "PASS"
      ).length,

    receiptSignaturePass:
      originalResults.filter(
        x =>
          x.receiptSignature ===
          "PASS"
      ).length,

    envelopeSignaturePass:
      originalResults.filter(
        x =>
          x.envelopeSignature ===
          "PASS"
      ).length
  },

  discovery: {
    nodeId:
      discovery.nodeId ?? null,

    activeKid:
      discovery.activeKid ?? null,

    receiptKids:
      [
        ...new Set(
          originalResults.map(
            x =>
              x.receiptKid
          )
        )
      ]
  },

  originals:
    originalResults,

  tamperControls: {
    types:
      tamperTypes,

    expected:
      rows.length *
      tamperTypes.length,

    passed:
      tamperResults.filter(
        x =>
          x.status ===
          "PASS"
      ).length,

    results:
      tamperResults
  },

  finalReverification,

  semanticResults: {
    independentCertificateHash:
      "PASS",

    sdkCertificateVerification:
      "PASS",

    nodeReceiptEd25519:
      "PASS",

    nodeEnvelopeEd25519:
      "PASS",

    signalsTamperDetected:
      "PASS",

    metadataTamperDetected:
      "PASS",

    stateHashTamperDetected:
      "PASS",

    parentStepIdsTamperDetected:
      "PASS",

    originalEvidenceStillVerifies:
      "PASS"
  },

  claimBoundary: {
    certificateIntegrity:
      "independently recomputed and verified",

    nodeAttestationAuthenticity:
      "Ed25519 signatures verified against the public key advertised for each signing kid",

    stateHash:
      "hash value is certificate-bound; private producer preimage not verified",

    parentGraphCompleteness:
      "not independently re-derived in this stage",

    cageProducerAuthentication:
      "not claimed",

    executionTruth:
      "not claimed",

    policyCorrectness:
      "not claimed"
  },

  status:
    rows.length === 4 &&
    originalResults.length === 4 &&
    originalResults.every(
      x =>
        x.independentCertificateHash === "PASS" &&
        x.sdkVerification === "PASS" &&
        x.receiptSignature === "PASS" &&
        x.envelopeSignature === "PASS"
    ) &&
    tamperResults.length === 16 &&
    tamperResults.every(
      x =>
        x.status === "PASS"
    ) &&
    finalReverification.length === 4
      ? "PASS"
      : "FAIL"
};

writeJson(
  "stage-08-summary.json",
  summary
);

writeJson(
  "stage-08-tamper-results.json",
  tamperResults
);

console.log();
console.log(
  "=================================================="
);

console.log(
  "STAGE 8 SUMMARY"
);

console.log(
  "=================================================="
);

console.log(
  `CERs independently hashed: ${summary.evidence.independentHashPass}/4`
);

console.log(
  `SDK CER verification: ${summary.evidence.sdkVerificationPass}/4`
);

console.log(
  `Receipt Ed25519 signatures: ${summary.evidence.receiptSignaturePass}/4`
);

console.log(
  `Envelope Ed25519 signatures: ${summary.evidence.envelopeSignaturePass}/4`
);

console.log(
  `Tamper controls: ${summary.tamperControls.passed}/16`
);

console.log(
  `Final unmodified CER verification: ${summary.finalReverification.length}/4`
);

console.log(
  "Production writes: 0"
);

console.log(
  `FINAL RESULT: ${summary.status}`
);

if (
  summary.status !== "PASS"
) {
  process.exitCode = 1;
}
