# Privacy and Disclosure

Native CAGE execution evidence and privacy transformation are separate concerns.

NexArt protects the integrity and attestation of the evidence it receives. It does not automatically decide which producer-supplied fields are safe to disclose publicly.

## Native CAGE does not automatically redact metadata

Values supplied in native CAGE fields such as:

```text
signals
metadata
```

are part of the evidence being certified.

If a CER is later made public, those values may become publicly visible.

Do not place secrets, credentials or sensitive plaintext into evidence fields that may later be published unless disclosure is intentional.

## Default visibility

The validated production behavior keeps native CAGE CERs hidden by default.

A CER must be explicitly published before it becomes available through the public resolver.

The validation included selective publication:

```text
2-step execution
        |
        +-- step 1 explicitly published
        |
        +-- step 2 remained hidden
```

The published step became publicly resolvable.

The sibling step remained unavailable through the public resolver.

This is an important disclosure boundary, but hidden-by-default behavior does not replace correct producer-side handling of sensitive information.

## Producer-side transformation

If sensitive values need to participate in verifiable evidence without being disclosed as plaintext, they should be transformed before they enter the certified CAGE evidence.

The privacy validation demonstrated one such pattern using producer-side HMAC commitments.

The sequence was:

```text
sensitive producer value
        |
        v
producer-side HMAC transformation
        |
        v
commitment metadata
        |
        v
native CAGE bundle
        |
        v
NexArt certification
```

The transformation happened before CAGE evidence was submitted to NexArt.

It is therefore important not to describe this as native CAGE redaction or a NexArt automatic privacy feature.

## Recorded privacy validation

The privacy test used synthetic sensitive values.

Examples included:

```text
synthetic.user@example.invalid
SYNTHETIC-CUSTOMER-48291
synthetic private note
```

These values were transformed producer-side before ingestion.

The resulting native CAGE evidence contained commitments rather than the original synthetic plaintext values.

The published CER contained the commitment-related evidence but not the original sensitive values.

## HMAC commitment structure

The demonstrated producer-side commitment pattern used HMAC-SHA-256.

Conceptually:

```text
HMAC-SHA256(
  secret key,
  domain || salt || value
)
```

The evidence can contain values such as:

```text
commitment scheme
domain
salt
HMAC digest
```

The secret HMAC key must remain outside the public evidence.

## What the commitment demonstrates

A keyed commitment can allow a party that holds the secret key and candidate plaintext to recompute the HMAC and compare it with the certified commitment.

If the recomputed value matches the protected commitment, that party can establish that the candidate value corresponds to the value represented by the certified evidence.

NexArt then provides integrity protection over the resulting commitment evidence.

## What a commitment does not do

An HMAC commitment is not encryption.

The plaintext is not recoverable from the commitment itself.

However, a party holding both the secret key and a candidate plaintext can test that candidate by recomputing the commitment.

Security therefore still depends on:

- protecting the HMAC key;
- selecting an appropriate commitment construction;
- avoiding unintended disclosure through surrounding metadata;
- ensuring the original value does not appear elsewhere in the CER.

## Why keyed commitments were used

For low-entropy sensitive values, a plain SHA-256 hash may allow offline guessing.

For example, hashing a predictable identifier without a secret key may allow an attacker to try likely values until one produces the same digest.

A keyed HMAC construction raises the bar because recomputation requires possession of the secret key.

This does not eliminate the need for proper secret management.

## Evidence integrity versus confidentiality

These are separate properties.

NexArt can establish:

```text
this protected commitment evidence has not changed
```

That does not itself establish:

```text
the original plaintext is confidential everywhere
```

Confidentiality depends on the producer ensuring that sensitive data was not also placed elsewhere in the evidence or exposed through another system.

## Public CER design

Before making a CER public, each field should be considered as one of:

```text
safe public metadata
sensitive but suitable for a commitment
sensitive and should remain private
credential or secret that must never enter evidence
```

This classification should happen at the producer or integration boundary before certification.

## Recommended producer pattern

For evidence that may later be public:

1. identify sensitive values before creating the CAGE bundle;
2. remove values that do not need to be certified;
3. transform suitable sensitive values into commitments;
4. keep commitment secrets outside the execution evidence;
5. inspect `signals` and `metadata` for accidental plaintext disclosure;
6. certify the transformed evidence;
7. publish only the CERs that are intended to become public.

## Selective publication does not redact a CER

Publishing one CER selectively controls which CER becomes publicly resolvable.

It does not remove or redact fields inside that CER.

The CER should therefore already contain only information appropriate for its intended visibility before publication.

## Claim boundary

The privacy validation supports the following statement:

> Sensitive synthetic values were transformed producer-side into keyed commitments before native CAGE ingestion, and NexArt certified the resulting commitment evidence.

It does not support claims that:

- native CAGE automatically redacts arbitrary metadata;
- NexArt automatically detects sensitive information;
- NexArt automatically encrypts CAGE evidence;
- HMAC commitments provide encryption;
- public CERs are automatically safe to disclose regardless of producer input.

Privacy remains an integration responsibility at the point where execution evidence is constructed.
