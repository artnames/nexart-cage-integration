import json
import os
import sys
from pathlib import Path

root = Path(os.environ["CAGE_ROOT"])
out = Path(os.environ["OUT"])

sys.path.insert(0, str(root))

from src.cage_finance.graph_topology import FINANCIAL_ADVISOR_TOPOLOGY
from src.integrations.provider_02.adapter import Provider02AttestationCallback

SCHEMA = "urn:cage:governance:v1:attestation-bundle"


def base_state(**overrides):
    state = {
        "messages": [],
        "next_step": "evaluator",
        "risk_status": "UNKNOWN",
        "risk_feedback": None,
        "loop_count": 0,
        "safety_status": "APPROVED",
        "governance_signature": None,
        "risk_attitude": "moderate",
        "investment_period": "long",
        "reasoning_output": None,
        "execution_plan_output": None,
        "data_analyst_ticker": None,
        "evaluation_result": None,
        "opa_results": None,
        "execution_result": None,
        "governance_summary": None,
        "user_id": "stage09-cage-adapter",
        "latency_stats": None,
        "completed_transactions": [],
        "approval_required": False,
        "approval_decision": None,
        "guardrail_blocked": False,
        "guardrail_reason": "",
        "output_rail_applied": False,
    }

    state.update(overrides)

    return state


def approved_state(**overrides):
    return base_state(
        governance_signature="stage09-approved",
        evaluation_result={
            "verdict": "APPROVED",
            "reasoning": "Stage 09 adapter compatibility fixture",
            "policy_check": "PASSED",
        },
        safety_status="APPROVED",
        risk_status="APPROVED",
        opa_results={
            "allow": True,
            "violations": [],
        },
        **overrides,
    )


def blocked_state():
    return base_state(
        governance_signature="stage09-cbf-block",
        evaluation_result={
            "verdict": "BLOCKED",
            "reasoning": "Stage 09 CBF rejection fixture",
            "policy_check": "BLOCKED",
        },
        safety_status="BLOCKED",
        risk_status="BLOCKED",
        opa_results={
            "allow": False,
            "violations": [
                "stage09-test-constraint"
            ],
        },
    )


def hitl_state():
    return approved_state(
        approval_required=True,
        approval_decision={
            "approved": True,
            "reviewer": "stage09-reviewer",
            "rationale": "Stage 09 HITL probe",
            "timestamp": "2026-09-17T12:00:00Z",
        },
    )


def emit(callback, node, state):
    callback.on_chain_start(node, state)
    callback.on_chain_end(node, state)


def topology_dict():
    topology = FINANCIAL_ADVISOR_TOPOLOGY

    return {
        "nodes": sorted(topology.nodes),

        "parentEdges": {
            key: list(value)
            for key, value
            in topology.parent_edges.items()
        },

        "terminalNode":
            topology.terminal_node,

        "interruptNode":
            topology.interrupt_node,

        "attestationNodes":
            sorted(topology.attestation_nodes),
    }


# ==================================================
# CASE 1
# Real provider_02 CBF-block execution
# ==================================================

cbf = Provider02AttestationCallback(
    topology=FINANCIAL_ADVISOR_TOPOLOGY,
    thread_id="stage09-real-adapter-cbf",
)

for node in [
    "nemo_guardrail",
    "thinker_node",
    "doer_node",
    "execution_analyst",
]:
    emit(
        cbf,
        node,
        base_state(),
    )

emit(
    cbf,
    "evaluator",
    approved_state(),
)

emit(
    cbf,
    "safety_check",
    blocked_state(),
)

emit(
    cbf,
    "explainer",
    blocked_state(),
)

cbf_bundle = cbf.get_bundle()

cbf_request = {
    "schema": SCHEMA,
    "bundle": cbf_bundle.to_dict(),
    "topology": topology_dict(),
}

(
    out /
    "01_real_adapter_cbf_block.json"
).write_text(
    json.dumps(
        cbf_request,
        indent=2,
    ) + "\n"
)


# ==================================================
# CASE 2
# Real provider_02 happy-path/HITL probe
# ==================================================

happy = Provider02AttestationCallback(
    topology=FINANCIAL_ADVISOR_TOPOLOGY,
    thread_id="stage09-real-adapter-hitl",
)

for node in [
    "nemo_guardrail",
    "thinker_node",
    "doer_node",
    "execution_analyst",
]:
    emit(
        happy,
        node,
        base_state(),
    )

emit(
    happy,
    "evaluator",
    approved_state(),
)

emit(
    happy,
    "safety_check",
    approved_state(),
)

happy.handle_hitl_interrupt(
    hitl_state()
)

emit(
    happy,
    "governed_trader",
    hitl_state(),
)

emit(
    happy,
    "explainer",
    approved_state(),
)

happy_bundle = happy.get_bundle()

happy_request = {
    "schema": SCHEMA,
    "bundle": happy_bundle.to_dict(),
    "topology": topology_dict(),
}

(
    out /
    "02_real_adapter_hitl_probe.json"
).write_text(
    json.dumps(
        happy_request,
        indent=2,
    ) + "\n"
)


print(
    "CBF terminalPath:",
    cbf_bundle.terminal_path
)

print(
    "CBF recorded nodes:",
    [
        step.node_name
        for step in cbf_bundle.steps
    ]
)

print(
    "CBF step count:",
    len(cbf_bundle.steps)
)

print()

print(
    "HITL terminalPath:",
    happy_bundle.terminal_path
)

print(
    "HITL recorded nodes:",
    [
        step.node_name
        for step in happy_bundle.steps
    ]
)

print(
    "HITL step count:",
    len(happy_bundle.steps)
)
