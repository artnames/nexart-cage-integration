const NODE_URL =
  process.env.NODE_URL ||
  "https://node.nexart.io";

const PUBLISHED_CERTIFICATE_HASH =
  "sha256:d3cd87f868f4c4e018d420bef6e9330e4a233b84610474cf716327e0fa495528";

const HIDDEN_SIBLING_HASH =
  "sha256:f6e2ad0a3b4b4a3c18e3bd830388bbebf218dfe18ad63bf366245a453820231e";

const EXPECTED_BUNDLE_ID =
  "4afbd5e7-0d75-4ea0-9399-53cd574e4867";

const EXPECTED_STEP_ID =
  "081cb67c-f120-46ee-9ab8-5aa6916e9a19";

const SYNTHETIC_PLAINTEXT = [
  "synthetic.user@example.invalid",
  "SYNTHETIC-CUSTOMER-48291",
  "synthetic private note"
];

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(
  url
) {
  const response =
    await fetch(url);

  let body = null;

  try {
    body =
      await response.json();
  } catch {
    // Some negative public lookups may have an empty body.
  }

  return {
    response,
    body
  };
}

function findCer(
  value
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  if (
    value.bundleType ===
      "cer.governed.execution.step.v1" &&
    value.certificateHash ===
      PUBLISHED_CERTIFICATE_HASH
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found =
      findCer(child);

    if (found) {
      return found;
    }
  }

  return null;
}

function containsSensitiveKeyName(
  value
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      /^(secret|hmacKey|privateKey|apiKey)$/i
        .test(key)
    ) {
      return true;
    }

    if (
      containsSensitiveKeyName(child)
    ) {
      return true;
    }
  }

  return false;
}

const published =
  await fetchJson(
    `${NODE_URL}/v1/resolve/cer/${encodeURIComponent(
      PUBLISHED_CERTIFICATE_HASH
    )}`
  );

assert(
  published.response.status === 200,
  `Published privacy CER expected HTTP 200, got ${published.response.status}`
);

const cer =
  findCer(
    published.body
  );

assert(
  cer,
  "Could not locate the published privacy CER"
);

assert(
  cer.bundleId ===
    EXPECTED_BUNDLE_ID,
  "Published privacy CER has an unexpected bundleId"
);

assert(
  cer.step?.stepId ===
    EXPECTED_STEP_ID,
  "Published privacy CER has an unexpected stepId"
);

assert(
  cer.step?.signals?.privacyMode ===
    "producer-side-commitment",
  "Published privacy CER does not identify producer-side commitments"
);

const serializedCer =
  JSON.stringify(cer);

for (const plaintext of SYNTHETIC_PLAINTEXT) {
  assert(
    !serializedCer.includes(plaintext),
    `Published privacy CER contains synthetic plaintext: ${plaintext}`
  );
}

assert(
  !containsSensitiveKeyName(cer),
  "Published privacy CER contains a secret-key field"
);

const metadata =
  cer.step?.metadata || {};

const commitments =
  Object.entries(metadata)
    .filter(
      ([key]) =>
        key.endsWith("Commitment")
    );

assert(
  commitments.length === 3,
  `Expected 3 public commitments, got ${commitments.length}`
);

for (const [name, commitment] of commitments) {
  assert(
    commitment?.scheme ===
      "producer-hmac-sha256-demo-v1",
    `${name} has an unexpected commitment scheme`
  );

  assert(
    /^[0-9a-f]{32}$/.test(
      commitment?.salt || ""
    ),
    `${name} has an invalid public salt`
  );

  assert(
    /^[0-9a-f]{64}$/.test(
      commitment?.digest || ""
    ),
    `${name} has an invalid HMAC digest`
  );

  assert(
    typeof commitment?.domain ===
      "string" &&
    commitment.domain.length > 0,
    `${name} has no commitment domain`
  );
}

const hiddenSibling =
  await fetchJson(
    `${NODE_URL}/v1/resolve/cer/${encodeURIComponent(
      HIDDEN_SIBLING_HASH
    )}`
  );

assert(
  hiddenSibling.response.status === 404,
  `Hidden sibling expected HTTP 404, got ${hiddenSibling.response.status}`
);

console.log(
  "Published producer-side commitments: PASS"
);

console.log(
  "Synthetic plaintext absence: PASS"
);

console.log(
  "Hidden sibling isolation: PASS"
);

console.log(
  "Privacy commitment evidence validation: PASS"
);
