# Result provenance

This directory contains nine curated JSON summaries of the CAGE integration validation, plus `artifact-manifest.json`.

The JSON files are not raw terminal logs or automatically generated CI reports. A top-level `status` of `PASS` records the outcome of the original acceptance work summarized by that file. It must not be read as proof that every authenticated test was rerun at the time the repository was cloned or published.

## Publication audit

The public-release audit on 2026-09-16 performed the following checks in a clean installation:

- all JSON parsed successfully;
- all JavaScript passed syntax checking;
- the artifact manifest matched every included repository file;
- the public tamper-detection harness passed;
- the public privacy and selective-publication harness passed;
- the independent JCS, SHA-256 and Ed25519 harness passed, including negative controls;
- the local minimal CAGE fixture passed SDK validation;
- no repository file contained a live-format credential or private key.

Authenticated historical checks were not rerun during that audit because no API key was supplied. Tests that submit new evidence were also not rerun merely to prepare a public repository.

## Evidence status

| Result | What the JSON represents | Publication-audit status |
| --- | --- | --- |
| `production-integrity.json` | Curated summary of the five-scenario, 38-CER production acceptance run | Historical transcript and identifiers cross-checked; private retrieval not rerun |
| `dag-queries.json` | Curated summary of authenticated relationship queries over recorded bundles | Historical topology cross-checked; private endpoints not rerun |
| `fail-closed.json` | Curated summary of malformed-input and persistence-boundary checks | Harness inspected; production requests not rerun |
| `schema-registry.json` | Curated summary of schema-dispatch rejection checks | Harness inspected; production requests not rerun |
| `idempotency-mutation.json` | Curated summary of first registration, exact replay and mutation rejection | Historical acceptance behavior cross-checked; evidence-creating harness not rerun |
| `tamper-artifact.json` | Recorded tamper result over the included public CER fixtures | Reproduced successfully with `npm run test:tamper` |
| `privacy-commitments.json` | Recorded producer-side privacy and selective-publication result | Current public CER, commitments and hidden sibling reproduced successfully; pre-ingestion secret handling and the initial hidden state are historical process claims |
| `independent-crypto.json` | Independent public certificate and Node-signature verification result | Reproduced successfully with `npm run test:crypto` |
| `minimal-integration.json` | Curated summary of the recorded three-step integration | Local fixture reproduced; authenticated recorded bundle was not retrieved during the publication audit |

## Reproduction boundary

Run the credential-free checks with:

```bash
npm ci
npm run test:public
npm run manifest:check
```

Authenticated retrieval tests require `NEXART_API_KEY`. The fail-closed and schema tests send deliberately invalid requests. The idempotency test and minimal example create new evidence and may consume certification units. Review `SECURITY.md` before running any authenticated command.

For future releases, retain redacted machine-generated output from CI or a test runner. Do not publish raw shell history or transcripts containing exported credentials.
