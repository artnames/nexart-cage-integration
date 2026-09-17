from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

BASE = Path("results/2026-09-17-node-0.29.0")
S10 = BASE / "stage-10"
S10.mkdir(parents=True, exist_ok=True)

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def load(path):
    return json.loads(Path(path).read_text())

def summary_path(n):
    d = BASE / f"stage-{n:02d}"
    preferred = d / f"stage-{n:02d}-final-summary.json"
    if preferred.is_file():
        return preferred
    original = d / f"stage-{n:02d}-summary.json"
    if original.is_file():
        return original
    matches = sorted(d.glob("*summary.json"))
    if not matches:
        raise RuntimeError(f"No summary for stage {n:02d}")
    return matches[0]

audit = load(S10 / "stage-10a-audit.json")
assert audit["status"] == "PASS"
assert audit["readyForFinalConformanceGeneration"] is True
assert len(audit["hardFailures"]) == 0

stages = []
for n in range(1, 10):
    p = summary_path(n)
    data = load(p)
    assert str(data.get("status", "")).upper() == "PASS"
    stages.append({
        "stage": n,
        "status": "PASS",
        "summary": str(p),
        "summarySha256": sha(p)
    })

s1 = summary_path(1)
assert sha(s1) == "863a1e50017ef76a6688876086d3dd3d175c52fa1cca454a346d2f26c677920f"

s9 = load(BASE / "stage-09/stage-09-final-summary.json")
assert s9["status"] == "PASS"
assert s9["stage09B"]["submissionHttpStatus"] == 201
assert s9["stage09B"]["replayed"] is False
assert s9["stage09B"]["verifiedCerCount"] == 4
assert s9["stage09B"]["uniqueCertificateHashes"] == 4
assert s9["stage09B"]["bundleId"] == "613702d8-fdc0-40bc-9723-c21111c216db"
assert s9["stage09B"]["fixtureSha256"] == "698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9"

fixture = BASE / "stage-09/fixtures/01_real_adapter_cbf_block.json"
assert sha(fixture) == "698bcaf82901c9b33676d88433cc72dbbdb0f2578efa8fa9ef802a25a6904bd9"

docs = [
    "CONFORMANCE.md",
    "EVIDENCE_MATRIX.md",
    "CLAIM_BOUNDARIES.md",
    "UPSTREAM_CAGE_GAPS.md",
    "REPRODUCIBILITY.md"
]
for name in docs:
    p = Path(name)
    assert p.is_file() and p.stat().st_size > 0

matrix_path = Path("EVIDENCE_MATRIX.md")
matrix = matrix_path.read_text()
matrix = matrix.replace(
    "| 10 | Consolidation and conformance documentation | IN PROGRESS |",
    "| 10 | Consolidation and conformance documentation | PASS |"
)
matrix_path.write_text(matrix)

readme = [
    "# Stage 10 — Consolidation and Conformance Documentation",
    "",
    "Status: **PASS**",
    "",
    "Stage 10 performs no production calls.",
    "",
    "It consolidates the frozen evidence from Stages 01 through 09 into the final NexArt ↔ Google CAGE conformance package.",
    "",
    "Generated repository documents:",
    "",
    "- `CONFORMANCE.md`",
    "- `EVIDENCE_MATRIX.md`",
    "- `CLAIM_BOUNDARIES.md`",
    "- `UPSTREAM_CAGE_GAPS.md`",
    "- `REPRODUCIBILITY.md`",
    "",
    "The package separates validated guarantees from explicit non-claims and upstream CAGE compatibility findings.",
    ""
]
(S10 / "README.md").write_text("\n".join(readme))

final = {
    "stage": "10-consolidation-and-conformance",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "status": "PASS",
    "networkCalls": 0,
    "productionCalls": 0,
    "baseline": {
        "canonicalNode": "0.29.0",
        "governedExecutionSdk": "0.4.0",
        "cageRepository": "google/cybernetic-agent-governance-engine",
        "cageCommit": "8162958ac23d958871fd4016f349a7062627fd4d",
        "cageIntegrationBoundary": "provider_02"
    },
    "validatedStages": stages,
    "stage09ProductionProof": {
        "fixtureSha256": s9["stage09B"]["fixtureSha256"],
        "bundleId": s9["stage09B"]["bundleId"],
        "threadId": "stage09-real-adapter-cbf",
        "terminalPath": "cbf_block",
        "productionHttpStatus": s9["stage09B"]["submissionHttpStatus"],
        "replayed": s9["stage09B"]["replayed"],
        "verifiedCerCount": s9["stage09B"]["verifiedCerCount"],
        "uniqueCertificateHashes": s9["stage09B"]["uniqueCertificateHashes"],
        "certificateHashes": s9["stage09B"]["certificateHashes"]
    },
    "stage08CryptographicEvidence": {
        "independentCerVerification": "PASS",
        "receiptSignatureVerification": "PASS",
        "verificationEnvelopeSignatureVerification": "PASS",
        "protectedFieldTamperControls": "16/16 PASS",
        "productionWrites": 0
    },
    "upstreamCageFindings": {
        "hitlStateHashOmitted": True,
        "hitlSyntheticNodeMissingFromTopology": True,
        "hitlCausalLinkageObservation": True,
        "hitlProductionEligible": False
    },
    "claimBoundary": {
        "executionEvidenceIntegrity": "validated",
        "nexartAttestationAuthenticity": "validated",
        "realCageCbfProductionInteroperability": "validated",
        "stateHashPrivatePreimage": "not verified",
        "cageProducerAuthentication": "not claimed",
        "executionTruth": "not claimed",
        "policyCorrectness": "not claimed",
        "safety": "not claimed",
        "legalCompliance": "not claimed"
    },
    "generatedDocuments": docs
}

(S10 / "stage-10-final-summary.json").write_text(json.dumps(final, indent=2) + "\n")

stage10_manifest = S10 / "artifact-manifest.json"
items = []
for p in sorted(S10.rglob("*")):
    if not p.is_file() or p == stage10_manifest:
        continue
    items.append({
        "path": str(p.relative_to(S10)),
        "sha256": sha(p),
        "bytes": p.stat().st_size
    })
stage10_manifest.write_text(json.dumps({
    "algorithm": "sha256",
    "artifactCount": len(items),
    "artifacts": items
}, indent=2) + "\n")

repo_manifest = BASE / "conformance-evidence-manifest.json"
items = []
for p in sorted(BASE.rglob("*")):
    if not p.is_file() or p == repo_manifest:
        continue
    items.append({
        "path": str(p.relative_to(BASE)),
        "sha256": sha(p),
        "bytes": p.stat().st_size
    })
repo_manifest.write_text(json.dumps({
    "manifestVersion": "1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "algorithm": "sha256",
    "baseline": "2026-09-17-node-0.29.0",
    "artifactCount": len(items),
    "artifacts": items
}, indent=2) + "\n")

print("STAGE 10 SUMMARY: WRITTEN")
print("STAGE 10 MANIFEST ARTIFACTS:", len(load(stage10_manifest)["artifacts"]))
print("REPOSITORY EVIDENCE ARTIFACTS:", len(load(repo_manifest)["artifacts"]))
