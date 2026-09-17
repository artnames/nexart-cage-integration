# Independent Verification

NexArt execution evidence is designed so that cryptographic verification does not require trusting the NexArt SDK verifier or Node-provided verification booleans.

This document describes the verification model used by the native CAGE integration.

## Verification layers

A native CAGE CER has two distinct cryptographic verification layers:

```text
1. CER certificate integrity
   JCS + SHA-256

2. NexArt Node attestation authenticity
   JCS + Ed25519
```

These answer different questions.

Certificate integrity establishes that the protected CER content matches its certificate hash.

Node attestation verification establishes that the NexArt Node signed the associated attestation envelope with the expected Ed25519 key.

Neither layer independently establishes that producer-supplied execution facts are true.

## CER certificate projection

For:

```text
cer.governed.execution.step.v1
version: "1"
```

the protected certificate projection is exactly:

```json
{
  "bundleType": "...",
  "version": "...",
  "schema": {},
  "bundleId": "...",
  "threadId": "...",
  "step": {},
  "protectedSet": {}
}
```

The following are not added to this certificate projection:

```text
certificateHash
startedAt
completedAt
terminalPath
stepIndex
createdAt
parentCertificateHashes
```

Executed parent relationships are already preserved within:

```text
step.parentStepIds
```

## Certificate hash verification

Verification proceeds as:

```text
protected seven-field projection
        |
        v
RFC 8785 / JCS canonicalization
        |
        v
SHA-256
        |
        v
sha256:<lowercase hex>
```

The computed value must exactly equal:

```text
cer.certificateHash
```

Changing any protected field changes the canonical bytes and therefore changes the resulting certificate hash.

## Example verification flow

Conceptually:

```javascript
const projection = {
  bundleType: cer.bundleType,
  version: cer.version,
  schema: cer.schema,
  bundleId: cer.bundleId,
  threadId: cer.threadId,
  step: cer.step,
  protectedSet: cer.protectedSet
};

const canonical =
  jcsCanonicalize(projection);

const computed =
  "sha256:" +
  sha256(canonical);

if (computed !== cer.certificateHash) {
  throw new Error(
    "CERTIFICATE_HASH_MISMATCH"
  );
}
```

A verifier should reconstruct this projection from the CER rather than trust a server-provided precomputed digest.

## Tamper detection

The recorded tamper test used a valid public CAGE CER and modified protected content after certification while retaining the original certificate hash.

The modification added a value under:

```text
step.metadata
```

Verification then failed with:

```text
CERTIFICATE_HASH_MISMATCH
```

The original persisted CER remained unchanged and continued to verify successfully.

This demonstrates detection of post-certification modification of protected evidence.

## Node attestation envelope

The NexArt Node separately signs an attestation envelope using Ed25519.

The signed object contains:

```text
attestation
bundle
```

The `bundle` member for native CAGE evidence is the same protected seven-field projection used for certificate hashing.

The attestation contains Node-issued claims including:

```text
attestation ID
timestamp
kid
Node runtime hash
protocol version
```

The signature binds those attestation claims to the protected CER content.

## Public signing-key discovery

The Node publishes its public signing keys at:

```text
https://node.nexart.io/.well-known/nexart-node.json
```

A verifier resolves the key identified by:

```text
attestation.kid
```

The production validation used:

```text
kid: k1
algorithm: Ed25519
key type: OKP
curve: Ed25519
```

Verification should also consider the key's status and revocation information exposed by the discovery document.

## Independent Ed25519 verification

A verifier should not rely on a returned field such as:

```text
signatureValid: true
```

as proof that the signature is valid.

Instead:

1. retrieve the public key associated with the envelope `kid`;
2. reconstruct the signed payload;
3. canonicalize it using the expected JCS rules;
4. decode the signature;
5. verify it using a standard Ed25519 implementation.

Conceptually:

```javascript
const signedPayload = {
  attestation,
  bundle: protectedProjection
};

const canonical =
  jcsCanonicalize(
    signedPayload
  );

const valid =
  crypto.verify(
    null,
    Buffer.from(canonical),
    publicKey,
    signature
  );

if (!valid) {
  throw new Error(
    "Invalid Node attestation signature"
  );
}
```

## Independent cryptographic validation

The repository includes:

```text
tests/independent-crypto.mjs
```

This test deliberately does not import the NexArt governed-execution SDK.

It independently:

1. retrieves a public native CAGE CER;
2. rebuilds the seven-field certificate projection;
3. canonicalizes it locally;
4. computes SHA-256 locally;
5. compares the result with the published certificate hash;
6. retrieves the Node signing key from public discovery;
7. reconstructs the signed envelope payload;
8. verifies Ed25519 using standard Node cryptography.

The test also includes negative controls.

## Negative controls

The independent cryptographic test confirmed that:

### Modified protected content

Changing protected CER content produced a different SHA-256 certificate hash.

### Modified signed payload

Changing signed envelope content caused verification using the original signature to fail.

### Modified signature

Changing the Ed25519 signature caused verification to fail.

### Unrelated key

An independently generated Ed25519 public key could not verify the Node signature.

These negative controls matter because a successful positive verification alone does not prove that the verifier is actually sensitive to tampering.

## Recorded public certificate

The privacy validation produced a selectively published native CAGE CER with certificate hash:

```text
sha256:d3cd87f868f4c4e018d420bef6e9330e4a233b84610474cf716327e0fa495528
```

This record was used for the independent cryptographic verification test.

The associated hidden sibling CER remained unavailable through the public resolver.

## Browser verification

The same public native CAGE CER was also checked through:

```text
https://verify.nexart.io
```

The browser verification flow independently recomputed:

```text
SHA-256 certificate integrity
Ed25519 Node attestation signature
```

using raw canonical payloads and the public key retrieved from Node discovery.

The verification did not rely on Node-provided precomputed verification flags.

## Public resolver

Public native CAGE CERs can be resolved through the public resolver once explicitly published.

The production validation confirmed that the public record could be retrieved and that its certificate integrity and signed envelope remained verifiable.

Hidden records remained unavailable through the public resolver.

## Stateless CER verification

The Node also exposes a stateless CER verification operation:

```text
POST /v1/cer/verify
```

This can verify structural and certificate-hash integrity for a supplied CER.

During the recorded native CAGE validation, the endpoint explicitly reported the signature check as:

```text
skipped
```

That is expected for this operation.

Do not confuse stateless CER certificate verification with verification of the separate Node attestation-envelope signature.

## Verification result boundaries

A successful certificate-hash verification establishes:

```text
the protected CER content matches the certificate hash
```

A successful Ed25519 verification additionally establishes:

```text
the attestation envelope was signed by the holder of the corresponding NexArt Node signing key
```

Together, these provide independently verifiable evidence integrity and Node attestation authenticity.

They do not independently establish:

- execution truth
- completeness of the producer-supplied execution
- correctness of the `stateHash` preimage
- correctness of CAGE policy decisions
- correctness of model output
- safety
- legal or regulatory compliance

## State hash boundary

Native CAGE step evidence contains:

```text
stateHash
```

NexArt preserves and cryptographically binds that value as supplied.

NexArt does not independently reconstruct or verify the underlying state preimage.

The SDK therefore reports the state-hash verification boundary as:

```text
not-performed
```

This is intentional.

## Producer truth boundary

Cryptographic evidence can establish that a particular value was included in the protected execution evidence and later remained unchanged.

It cannot by itself establish that the producer's original factual assertion was true.

This distinction should remain explicit in any downstream product, audit workflow or governance process that consumes NexArt CERs.
