import crypto from "node:crypto";

const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const CERTIFICATE_HASH =
  "sha256:d3cd87f868f4c4e018d420bef6e9330e4a233b84610474cf716327e0fa495528";

const EXPECTED_KID =
  "k1";

const EXPECTED_ALTERED_HASH =
  "sha256:6ba1eb4b28e5ce311c3c5ea7490eaf30c7b7393ace29936894f92c0204e4a535";

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

/*
 * Minimal RFC 8785 / JCS-compatible canonicalization
 * for JSON-compatible values.
 *
 * JSON number serialization in JavaScript follows the
 * ECMAScript representation required by JCS.
 */
function canonicalize(
  value
) {
  if (value === null) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (
    typeof value === "number"
  ) {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "JCS does not permit non-finite numbers"
      );
    }

    return JSON.stringify(value);
  }

  if (
    Array.isArray(value)
  ) {
    return (
      "[" +
      value
        .map(
          item =>
            canonicalize(item)
        )
        .join(",") +
      "]"
    );
  }

  if (
    typeof value === "object"
  ) {
    const keys =
      Object
        .keys(value)
        .sort();

    const members = [];

    for (const key of keys) {
      const member =
        value[key];

      if (
        member === undefined ||
        typeof member === "function" ||
        typeof member === "symbol"
      ) {
        throw new TypeError(
          `Unsupported JCS value at key ${key}`
        );
      }

      members.push(
        JSON.stringify(key) +
        ":" +
        canonicalize(member)
      );
    }

    return (
      "{" +
      members.join(",") +
      "}"
    );
  }

  throw new TypeError(
    `Unsupported JCS type: ${typeof value}`
  );
}

function sha256Prefixed(
  canonical
) {
  return (
    "sha256:" +
    crypto
      .createHash("sha256")
      .update(
        canonical,
        "utf8"
      )
      .digest("hex")
  );
}

function decodeSignature(
  value
) {
  assert(
    typeof value === "string",
    "Signature must be a string"
  );

  /*
   * Node accepts base64url directly on supported runtimes.
   * Normalize manually for portability.
   */
  const normalized =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const padding =
    "=".repeat(
      (4 - (
        normalized.length % 4
      )) % 4
    );

  return Buffer.from(
    normalized + padding,
    "base64"
  );
}

async function fetchJson(
  url
) {
  const response =
    await fetch(url);

  let body;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  return {
    response,
    body
  };
}

function walk(
  value,
  visitor
) {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return;
  }

  visitor(value);

  if (
    Array.isArray(value)
  ) {
    for (const item of value) {
      walk(
        item,
        visitor
      );
    }

    return;
  }

  for (
    const child
    of Object.values(value)
  ) {
    walk(
      child,
      visitor
    );
  }
}

function findCer(
  root
) {
  let found = null;

  walk(
    root,
    value => {
      if (found) {
        return;
      }

      if (
        value?.bundleType ===
          "cer.governed.execution.step.v1" &&
        value?.version === "1" &&
        value?.certificateHash ===
          CERTIFICATE_HASH &&
        value?.step &&
        value?.protectedSet
      ) {
        found = value;
      }
    }
  );

  return found;
}

function findEnvelope(
  roots
) {
  let found = null;

  for (const root of roots) {
    walk(
      root,
      value => {
        if (found) {
          return;
        }

        if (
          value?.verificationEnvelope
            ?.attestation &&
          typeof value
            ?.verificationEnvelopeSignature ===
              "string"
        ) {
          found = {
            ...value.verificationEnvelope,
            signature:
              value.verificationEnvelopeSignature
          };

          return;
        }

        if (
          value?.attestation &&
          (
            typeof value?.signature ===
              "string" ||
            typeof value?.signatureValue ===
              "string" ||
            typeof value?.signatureBase64Url ===
              "string"
          )
        ) {
          found = value;
        }
      }
    );

    if (found) {
      break;
    }
  }

  return found;
}

function signatureOf(
  envelope
) {
  return (
    envelope.signature ||
    envelope.signatureValue ||
    envelope.signatureBase64Url
  );
}

function findPublishedCanonicalPayload(
  roots
) {
  let found = null;

  const acceptedKeys =
    new Set([
      "canonicalPayload",
      "signedPayloadCanonical",
      "canonicalSignedPayload",
      "payloadJcs",
      "jcsPayload"
    ]);

  for (const root of roots) {
    walk(
      root,
      value => {
        if (found) {
          return;
        }

        for (
          const [
            key,
            candidate
          ]
          of Object.entries(value)
        ) {
          if (
            acceptedKeys.has(key) &&
            typeof candidate ===
              "string"
          ) {
            found = candidate;
            return;
          }
        }

        if (
          typeof value?.payload ===
            "string" &&
          typeof value?.signature ===
            "string" &&
          typeof value?.kid ===
            "string"
        ) {
          found = value.payload;
        }
      }
    );

    if (found) {
      break;
    }
  }

  return found;
}

function findJwk(
  root,
  kid
) {
  let found = null;

  walk(
    root,
    value => {
      if (found) {
        return;
      }

      if (
        value?.kid === kid &&
        value?.kty === "OKP" &&
        value?.crv === "Ed25519" &&
        typeof value?.x === "string"
      ) {
        found = value;

        return;
      }

      if (
        value?.kid === kid &&
        value?.publicKeyJwk?.kty ===
          "OKP" &&
        value?.publicKeyJwk?.crv ===
          "Ed25519" &&
        typeof value?.publicKeyJwk?.x ===
          "string"
      ) {
        found = {
          ...value.publicKeyJwk,
          kid:
            value.kid
        };
      }
    }
  );

  return found;
}

function keyStatusOf(
  root,
  kid
) {
  let result = null;

  walk(
    root,
    value => {
      if (
        result ||
        value?.kid !== kid
      ) {
        return;
      }

      result = {
        active:
          value.active ??
          (
            value.status ===
            "active"
              ? true
              : undefined
          ),

        revoked:
          value.revoked ??
          (
            value.status ===
            "revoked"
              ? true
              : undefined
          )
      };
    }
  );

  return (
    result || {}
  );
}

/*
 * 1. Retrieve the public CER.
 */
const resolver =
  await fetchJson(
    `${NODE_URL}/v1/resolve/cer/${encodeURIComponent(
      CERTIFICATE_HASH
    )}`
  );

assert(
  resolver.response.status === 200,
  `Public resolver expected HTTP 200, got ${resolver.response.status}: ${JSON.stringify(resolver.body)}`
);

const cer =
  findCer(
    resolver.body
  );

assert(
  cer,
  "Could not locate native CAGE CER in public resolver response"
);

console.log(
  "Public CER retrieval: PASS"
);

/*
 * 2. Reconstruct the exact seven-field protected
 * certificate projection.
 */
const certificateProjection = {
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

const certificateCanonical =
  canonicalize(
    certificateProjection
  );

const computedCertificateHash =
  sha256Prefixed(
    certificateCanonical
  );

assert(
  computedCertificateHash ===
    CERTIFICATE_HASH,
  `Independent SHA-256 mismatch. Expected ${CERTIFICATE_HASH}, got ${computedCertificateHash}`
);

assert(
  computedCertificateHash ===
    cer.certificateHash,
  "Independent hash does not match CER certificateHash"
);

console.log(
  "Independent JCS + SHA-256 certificate verification: PASS"
);

/*
 * 3. Fetch the other public surfaces.
 *
 * The resolver response may already contain the signed
 * envelope. The additional public endpoints are queried
 * so the test remains tolerant to presentation changes.
 */
const publicProof =
  await fetchJson(
    `${NODE_URL}/api/public-cer-proof?certificateHash=${encodeURIComponent(
      CERTIFICATE_HASH
    )}`
  );

const publicCer =
  await fetchJson(
    `${NODE_URL}/v1/cer/public?certificateHash=${encodeURIComponent(
      CERTIFICATE_HASH
    )}`
  );

const publicRoots = [
  resolver.body
];

if (
  publicProof.response.ok &&
  publicProof.body
) {
  publicRoots.push(
    publicProof.body
  );
}

if (
  publicCer.response.ok &&
  publicCer.body
) {
  publicRoots.push(
    publicCer.body
  );
}

/*
 * 4. Locate the signed Node attestation envelope.
 */
const envelope =
  findEnvelope(
    publicRoots
  );

assert(
  envelope,
  "Could not locate signed attestation envelope in public evidence"
);

const signatureText =
  signatureOf(
    envelope
  );

assert(
  signatureText,
  "Attestation envelope contains no signature"
);

assert(
  envelope.attestation,
  "Attestation envelope contains no attestation claims"
);

/*
 * Do not trust the envelope's copy of the bundle.
 *
 * Reconstruct the protected bundle independently from
 * the CER we already hashed.
 */
const signedPayload = {
  attestation:
    envelope.attestation,

  bundle:
    certificateProjection
};

const envelopeCanonical =
  canonicalize(
    signedPayload
  );

/*
 * If the public response exposes the canonical signed
 * payload, compare bytes before verifying the signature.
 */
const publishedCanonical =
  findPublishedCanonicalPayload(
    publicRoots
  );

if (
  publishedCanonical !== null
) {
  assert(
    publishedCanonical ===
      envelopeCanonical,
    "Locally reconstructed signed-envelope canonical payload differs from published canonical payload"
  );

  console.log(
    "Published envelope canonical payload comparison: PASS"
  );
}

/*
 * 5. Resolve signing key by kid from public discovery.
 */
const kid =
  envelope.attestation.kid ||
  envelope.kid;

assert(
  kid === EXPECTED_KID,
  `Expected signing kid ${EXPECTED_KID}, got ${kid}`
);

const discovery =
  await fetchJson(
    `${NODE_URL}/.well-known/nexart-node.json`
  );

assert(
  discovery.response.ok,
  `Node discovery failed with HTTP ${discovery.response.status}`
);

const jwk =
  findJwk(
    discovery.body,
    kid
  );

assert(
  jwk,
  `Could not resolve Ed25519 JWK for kid ${kid}`
);

assert(
  jwk.kty === "OKP",
  `Unexpected JWK kty: ${jwk.kty}`
);

assert(
  jwk.crv === "Ed25519",
  `Unexpected JWK curve: ${jwk.crv}`
);

const keyStatus =
  keyStatusOf(
    discovery.body,
    kid
  );

if (
  keyStatus.active !==
    undefined
) {
  assert(
    keyStatus.active === true,
    `Signing key ${kid} is not active`
  );
}

if (
  keyStatus.revoked !==
    undefined
) {
  assert(
    keyStatus.revoked === false,
    `Signing key ${kid} is revoked`
  );
}

const publicKey =
  crypto.createPublicKey({
    key:
      jwk,

    format:
      "jwk"
  });

console.log(
  `Signing key discovery (${kid}): PASS`
);

/*
 * 6. Independently verify Ed25519.
 *
 * No NexArt SDK verifier and no Node-provided
 * signatureValid boolean are used here.
 */
const signature =
  decodeSignature(
    signatureText
  );

const signatureValid =
  crypto.verify(
    null,
    Buffer.from(
      envelopeCanonical,
      "utf8"
    ),
    publicKey,
    signature
  );

assert(
  signatureValid,
  "Independent Ed25519 verification failed"
);

console.log(
  "Independent Ed25519 attestation verification: PASS"
);

/*
 * 7. Negative control: change protected certificate
 * content and prove SHA-256 changes.
 */
const alteredCertificate =
  structuredClone(
    certificateProjection
  );

alteredCertificate.step =
  structuredClone(
    alteredCertificate.step
  );

alteredCertificate.step.metadata = {
  ...alteredCertificate
    .step
    .metadata,

  independentCryptoProbe:
    "ALTERED"
};

const alteredHash =
  sha256Prefixed(
    canonicalize(
      alteredCertificate
    )
  );

assert(
  alteredHash !==
    CERTIFICATE_HASH,
  "Altered protected certificate unexpectedly retained original hash"
);

assert(
  alteredHash ===
    EXPECTED_ALTERED_HASH,
  `Altered certificate hash differed from recorded Phase 7 negative control. Expected ${EXPECTED_ALTERED_HASH}, got ${alteredHash}`
);

console.log(
  "Negative control — altered protected content: PASS"
);

/*
 * 8. Negative control: alter signed payload.
 */
const alteredSignedPayload =
  structuredClone(
    signedPayload
  );

alteredSignedPayload.attestation =
  structuredClone(
    alteredSignedPayload.attestation
  );

alteredSignedPayload.attestation =
  {
    ...alteredSignedPayload
      .attestation,

    independentCryptoProbe:
      "ALTERED"
  };

const alteredSignedCanonical =
  canonicalize(
    alteredSignedPayload
  );

const alteredPayloadAccepted =
  crypto.verify(
    null,
    Buffer.from(
      alteredSignedCanonical,
      "utf8"
    ),
    publicKey,
    signature
  );

assert(
  alteredPayloadAccepted ===
    false,
  "Original signature unexpectedly verified altered signed payload"
);

console.log(
  "Negative control — altered signed payload: PASS"
);

/*
 * 9. Negative control: flip one signature bit.
 */
const modifiedSignature =
  Buffer.from(
    signature
  );

assert(
  modifiedSignature.length > 0,
  "Decoded signature is empty"
);

modifiedSignature[0] ^=
  0x01;

const modifiedSignatureAccepted =
  crypto.verify(
    null,
    Buffer.from(
      envelopeCanonical,
      "utf8"
    ),
    publicKey,
    modifiedSignature
  );

assert(
  modifiedSignatureAccepted ===
    false,
  "Bit-flipped signature unexpectedly verified"
);

console.log(
  "Negative control — modified signature: PASS"
);

/*
 * 10. Negative control: unrelated Ed25519 key.
 */
const unrelated =
  crypto.generateKeyPairSync(
    "ed25519"
  );

const unrelatedKeyAccepted =
  crypto.verify(
    null,
    Buffer.from(
      envelopeCanonical,
      "utf8"
    ),
    unrelated.publicKey,
    signature
  );

assert(
  unrelatedKeyAccepted ===
    false,
  "Unrelated Ed25519 key unexpectedly verified Node signature"
);

console.log(
  "Negative control — unrelated key: PASS"
);

console.log();
console.log(
  `Certificate: ${CERTIFICATE_HASH}`
);

console.log(
  `Signing kid: ${kid}`
);

console.log(
  "Independent cryptographic verification: PASS"
);
