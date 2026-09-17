# Security

This repository contains production validation tooling and examples for the native CAGE integration.

Review this document before running authenticated examples or tests against the NexArt production Node.

## API keys

Never commit a real NexArt API key.

Use a local environment variable or secret manager:

```bash
export NEXART_API_KEY="..."
```

Optionally set the Node URL:

```bash
export NODE_URL="https://node.nexart.io"
```

The repository should contain only a placeholder in:

```text
.env.example
```

Local `.env` files must remain excluded by `.gitignore`.

## Never print credentials

Scripts should not print:

```text
NEXART_API_KEY
Authorization headers containing live credentials
private signing material
secret HMAC keys
```

If debugging authentication, log only non-sensitive status information.

Do not copy live credentials into:

```text
README files
test fixtures
result files
GitHub issues
screenshots
terminal transcripts intended for publication
```

## Production-writing tests

Some files create fresh production evidence when supplied with a valid API key.

These include:

```text
examples/minimal-integration.mjs
tests/idempotency-mutation.mjs
```

Expected fresh CER creation is:

```text
idempotency-mutation
3 CERs

minimal developer example
3 CERs
```

Because NexArt produces one CER per executed CAGE step, these operations consume certification units.

Do not run them casually against production.

The following validation harnesses are read-only:

```text
tests/privacy-commitments.mjs
tests/minimal-integration-validation.mjs
tests/production-integrity.mjs
tests/dag-queries.mjs
tests/tamper-artifact.mjs
tests/independent-crypto.mjs
```

`tests/minimal-integration-validation.mjs`, `tests/production-integrity.mjs` and `tests/dag-queries.mjs` require a tenant API key because they retrieve private recorded evidence. They do not submit new evidence.

The privacy and independent-crypto harnesses use public evidence and require no credential.

## Baseline reference tests

The production acceptance baseline contains five previously created native CAGE executions:

```text
4-step happy path
3-step CBF block
6-step loop-breaker execution
3-step NeMo block
22-step branching/merging DAG
```

These produced 38 baseline CERs.

The associated bundle identities are tenant-scoped.

Authenticated read-only tests such as:

```text
tests/production-integrity.mjs
tests/dag-queries.mjs
```

operate against the NexArt-owned validation baseline.

A credential belonging to another tenant cannot use those private bundle identifiers to retrieve the records.

The recorded machine-readable results are retained so the original acceptance evidence remains reviewable without recreating the executions.

## Tenant isolation

Native CAGE bundle identity is scoped to the authenticated tenant.

A private bundle belonging to one tenant must not become queryable merely because another tenant knows its:

```text
bundleId
stepId
certificateHash
```

Authentication and tenant ownership remain part of the access-control boundary.

Public CER resolution is a separate visibility mechanism and only applies after explicit publication.

## Hidden-by-default evidence

New native CAGE CERs are hidden by default.

A CER must be explicitly published before it becomes available through public resolution.

Selective publication must not expose sibling CERs unintentionally.

Visibility is therefore distinct from evidence integrity.

A cryptographically valid CER may still be private.

## Fail-closed validation

Malformed CAGE evidence must be rejected rather than normalized into valid evidence.

The validation suite covers conditions including:

```text
invalid step UUID
invalid bundle UUID
invalid stateHash
duplicate step ID
missing parent reference
self-parent reference
executed cycle
invalid terminalPath
invalid topology reference
executed node absent from topology
```

Local SDK validation rejects these inputs.

The Node also rejects invalid native CAGE submissions and does not persist them.

## Schema dispatch

The Node uses explicit fail-closed schema dispatch.

Examples of rejected schema conditions include:

```text
missing schema
unknown schema namespace
near-match invalid CAGE schema
unsupported future CAGE schema version
```

Unknown schemas must not silently fall back to another evidence family.

Unsupported future versions must be rejected until explicitly implemented and reviewed.

## Replay protection

Exact replay of an already registered execution is treated as idempotent.

The expected behavior is:

```text
HTTP 200
replayed: true
```

An exact replay returns the original execution evidence rather than creating replacement CER identities.

Replay must not result in duplicate proof issuance or duplicate proof-linked usage events.

## Mutation protection

A request using an existing execution identity but different valid evidence is not treated as a replay.

It is rejected with:

```text
HTTP 409
EXECUTION_MUTATION_DETECTED
```

The execution identity includes:

```text
authenticated tenant
schema namespace/version
bundleId
```

This prevents evidence from being silently replaced after the identity has already been used.

## Certificate tamper resistance

Protected CER content participates in the certificate hash.

For native CAGE step evidence, the protected projection contains:

```text
bundleType
version
schema
bundleId
threadId
step
protectedSet
```

Modifying protected content while retaining the original certificate hash results in:

```text
CERTIFICATE_HASH_MISMATCH
```

The original persisted evidence remains unchanged.

## Canonicalization

Certificate integrity depends on deterministic canonicalization.

The integration uses:

```text
RFC 8785 / JCS
```

A verifier must reconstruct the correct protected projection before hashing.

Changing:

```text
field inclusion
field types
serialization rules
canonicalization rules
```

can produce different cryptographic bytes.

Do not substitute ordinary `JSON.stringify()` behavior for the normative canonicalization model unless the implementation is proven equivalent for the relevant data.

## Node attestation

The NexArt Node signs attestation envelopes using Ed25519.

The public signing key is resolved by `kid` through:

```text
https://node.nexart.io/.well-known/nexart-node.json
```

A verifier should independently verify the signature rather than trust a returned boolean such as:

```text
signatureValid: true
```

The key manifest should also be checked for:

```text
expected algorithm
expected key type
matching kid
active/revoked status
```

## Signing-key security

Private Node signing keys must never appear in this repository.

Only public verification material belongs in public fixtures or documentation.

The repository may contain:

```text
public JWK
public key identifier
public certificate hash
public signature
public canonical payload
```

It must not contain:

```text
private Ed25519 key
seed material
secret signing configuration
```

## Commitment-key security

The privacy validation uses producer-side HMAC commitments.

The HMAC key is a secret and must remain outside:

```text
CER content
public fixtures
recorded result files
repository source
logs
```

A commitment can be public.

The key used to create it must not be.

## Public fixtures

Fixtures included for independent verification should contain only material that is already safe for disclosure or deliberately synthetic.

Synthetic identifiers should be clearly recognizable as synthetic.

For example:

```text
synthetic.user@example.invalid
SYNTHETIC-CUSTOMER-48291
```

Do not replace these with real customer data.

## Dependency pinning

The integration currently pins:

```text
@nexart/governed-execution@0.3.0
```

Do not automatically widen this to an unbounded range.

Changes to the SDK version or native CAGE schema contract should trigger a compatibility and security review.

Important review areas include:

```text
protected certificate projection
canonicalization
validation behavior
schema registry
Node request contract
verification behavior
trust-boundary outputs
```

## Upstream compatibility

The integration was built against the CAGE native-schema handoff design associated with upstream commit:

```text
eb828d9deeb39d774959fdc5560798e463a50518
```

Future upstream changes should not be assumed compatible automatically.

If native schema semantics change, validate the differences explicitly before updating the integration.

## Supply-chain considerations

Before adding dependencies:

- prefer standard platform cryptography where practical;
- avoid unnecessary canonicalization or crypto packages;
- review package ownership and maintenance;
- pin security-sensitive dependencies;
- review transitive dependencies;
- avoid packages that require access to credentials or network resources without clear need.

Independent verification should remain possible with ordinary cryptographic primitives.

## Result files

Recorded result files must not contain:

```text
live API keys
Authorization headers
private keys
secret HMAC keys
environment files
real customer secrets
```

Before this repository becomes public, perform a repository-wide credential scan.

Do not rely only on `.gitignore`.

A secret committed once remains recoverable from Git history even if deleted later.

## Git history

Before making the repository public, verify that no credential was ever committed.

If a real secret has entered Git history:

1. revoke or rotate the secret;
2. remove it from history;
3. verify the rewritten history;
4. scan again before publication.

Deleting the current version of the file is not sufficient.

## Trust boundary

NexArt protects the integrity and authenticity of captured execution evidence.

It does not independently establish that producer-supplied factual claims are true.

Cryptographic integrity should not be presented as proof of:

```text
execution truth
policy correctness
model correctness
safety
legal compliance
regulatory compliance
```

Those claims require additional evidence appropriate to the specific question.

## Publication checklist

Before changing this repository from private to public, confirm:

```text
no live API keys
no .env file
no private signing material
no HMAC secret
no customer-sensitive data
all fixtures intentionally public or synthetic
all result files reviewed
Git history scanned
dependency versions reviewed
claim boundaries preserved
Google/upstream non-endorsement language present
```

Only publish after all checks pass.
