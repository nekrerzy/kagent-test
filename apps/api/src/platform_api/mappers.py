"""Pure functions mapping between platform Pydantic schemas and kagent.dev/v1alpha2
CRD dicts, in both directions. No I/O here — callers (routers) own the k8s calls.

CRD field names verified 2026-07-20:
  - Agent: helm-rendered kagent-crds chart (chart version 0.9.12, pinned in
    infra/kagent/values.yaml), byte-identical to the live cluster for the
    ModelConfig CRD (cross-checked), and matching examples/agents/hello-agent.yaml
    and upstream kagent-dev/kagent go/api/v1alpha2/agent_types.go. The live
    cluster's own `agents.kagent.dev` CRD failed to sync via ArgoCD
    (`metadata.annotations: Too long: may not be more than 262144 bytes` — an
    infra-level apply issue, not a schema question) so this is the best
    available ground truth; see the implementation report for detail.
  - ModelConfig, RemoteMCPServer: verified directly against `kubectl get crd
    <name> -o json` on the live cluster. CAUTION: these CRDs serve BOTH
    v1alpha1 and v1alpha2, and field names differ between them (v1alpha1
    `apiKeySecretRef` vs v1alpha2 `apiKeySecret`) — always read the schema of
    the version this module writes (v1alpha2), not `versions[0]`.
"""

from __future__ import annotations

from typing import Any

from platform_api.schemas import (
    AgentIn,
    AgentOut,
    DiscoveredTool,
    McpServerIn,
    McpServerOut,
    ModelConfigIn,
    ModelConfigOut,
    SkillGitRef,
    SkillIn,
    SkillOut,
    ToolRef,
)

GROUP = "kagent.dev"
API_VERSION = f"{GROUP}/v1alpha2"

TAGS_ANNOTATION = "platform.kagent.dev/tags"
API_KEY_SECRET_KEY = "apiKey"


def model_config_secret_name(name: str) -> str:
    return f"{name}-apikey"


def _tags_from_annotations(annotations: dict[str, str] | None) -> list[str]:
    if not annotations:
        return []
    raw = annotations.get(TAGS_ANNOTATION, "")
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def _annotations_with_tags(tags: list[str]) -> dict[str, str]:
    return {TAGS_ANNOTATION: ",".join(tags)} if tags else {}


def _condition_true(status: dict[str, Any], condition_type: str) -> bool | None:
    for condition in status.get("conditions") or []:
        if condition.get("type") == condition_type:
            return condition.get("status") == "True"
    return None


# --------------------------------------------------------------------------
# Agent
# --------------------------------------------------------------------------


def agent_to_crd(agent: AgentIn, namespace: str) -> dict[str, Any]:
    spec: dict[str, Any]
    if agent.type == "BYO":
        spec = {"type": "BYO", "byo": {"deployment": {"image": agent.image}}}
    else:
        tools: list[dict[str, Any]] = []
        for tool in agent.tools:
            mcp_server: dict[str, Any] = {
                "kind": "RemoteMCPServer",
                "apiGroup": GROUP,
                "name": tool.mcp_server,
            }
            if tool.tool_names:
                mcp_server["toolNames"] = tool.tool_names
            tools.append({"type": "McpServer", "mcpServer": mcp_server})

        declarative: dict[str, Any] = {"systemMessage": agent.system_message}
        # kagent's controller does not fall back to its default when modelConfig is
        # omitted — it fails with `ModelConfig "" not found` — so default it here.
        declarative["modelConfig"] = agent.model_config_ref or "default-model-config"
        if tools:
            declarative["tools"] = tools
        spec = {"type": "Declarative", "declarative": declarative}

    if agent.skills:
        spec["skills"] = {
            "gitRefs": [
                {
                    "url": s.url,
                    **({"name": s.name} if s.name else {}),
                    **({"path": s.path} if s.path else {}),
                    **({"ref": s.ref} if s.ref else {}),
                }
                for s in agent.skills
            ]
        }
    if agent.description:
        spec["description"] = agent.description

    metadata: dict[str, Any] = {"name": agent.name, "namespace": namespace}
    annotations = _annotations_with_tags(agent.tags)
    if annotations:
        metadata["annotations"] = annotations

    return {
        "apiVersion": API_VERSION,
        "kind": "Agent",
        "metadata": metadata,
        "spec": spec,
    }


def agent_from_crd(obj: dict[str, Any], a2a_base: str) -> AgentOut:
    metadata = obj.get("metadata") or {}
    spec = obj.get("spec") or {}
    status = obj.get("status") or {}
    declarative = spec.get("declarative") or {}

    namespace = metadata.get("namespace", "")
    name = metadata.get("name", "")

    tools = [
        ToolRef(
            mcp_server=(tool.get("mcpServer") or {}).get("name", ""),
            tool_names=(tool.get("mcpServer") or {}).get("toolNames") or None,
        )
        for tool in declarative.get("tools") or []
        if tool.get("type") == "McpServer" and tool.get("mcpServer")
    ]

    skills = [
        SkillGitRef(
            url=ref.get("url", ""),
            name=ref.get("name"),
            path=ref.get("path"),
            ref=ref.get("ref"),
        )
        for ref in (spec.get("skills") or {}).get("gitRefs") or []
    ]

    agent_type = spec.get("type", "Declarative")
    return AgentOut(
        name=name,
        namespace=namespace,
        type="BYO" if agent_type == "BYO" else "Declarative",
        description=spec.get("description"),
        system_message=declarative.get("systemMessage") or None,
        model_config=declarative.get("modelConfig"),
        tools=tools,
        image=((spec.get("byo") or {}).get("deployment") or {}).get("image"),
        skills=skills,
        tags=_tags_from_annotations(metadata.get("annotations")),
        ready=_condition_true(status, "Ready"),
        a2a_url=f"{a2a_base}/a2a/{namespace}/{name}",
    )


# --------------------------------------------------------------------------
# RemoteMCPServer
# --------------------------------------------------------------------------


def mcp_server_to_crd(mcp: McpServerIn, namespace: str) -> dict[str, Any]:
    metadata: dict[str, Any] = {"name": mcp.name, "namespace": namespace}
    annotations = _annotations_with_tags(mcp.tags)
    if annotations:
        metadata["annotations"] = annotations

    return {
        "apiVersion": API_VERSION,
        "kind": "RemoteMCPServer",
        "metadata": metadata,
        "spec": {
            "description": mcp.description or "",
            "protocol": mcp.protocol,
            "url": mcp.url,
        },
    }


def mcp_server_from_crd(obj: dict[str, Any]) -> McpServerOut:
    metadata = obj.get("metadata") or {}
    spec = obj.get("spec") or {}
    status = obj.get("status") or {}

    discovered_tools = [
        DiscoveredTool(name=tool.get("name", ""), description=tool.get("description", ""))
        for tool in status.get("discoveredTools") or []
    ]

    return McpServerOut(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        url=spec.get("url", ""),
        protocol=spec.get("protocol", "STREAMABLE_HTTP"),
        tags=_tags_from_annotations(metadata.get("annotations")),
        ready=_condition_true(status, "Accepted"),
        discovered_tools=discovered_tools,
    )


# --------------------------------------------------------------------------
# ModelConfig
# --------------------------------------------------------------------------


def model_config_to_crd(mc: ModelConfigIn, namespace: str) -> dict[str, Any]:
    spec: dict[str, Any] = {"model": mc.model, "provider": mc.provider}

    if mc.api_key is not None:
        spec["apiKeySecret"] = model_config_secret_name(mc.name)
        spec["apiKeySecretKey"] = API_KEY_SECRET_KEY

    # Only OpenAI's provider-specific config is wired through baseUrl for now —
    # the homelab's only real use case (llama-swap). Other providers' nested
    # configs (azureOpenAI, bedrock, ...) have different required shapes and
    # are out of scope until a concrete need shows up.
    if mc.provider == "OpenAI" and mc.base_url:
        spec["openAI"] = {"baseUrl": mc.base_url}

    return {
        "apiVersion": API_VERSION,
        "kind": "ModelConfig",
        "metadata": {"name": mc.name, "namespace": namespace},
        "spec": spec,
    }


def model_config_from_crd(obj: dict[str, Any]) -> ModelConfigOut:
    metadata = obj.get("metadata") or {}
    spec = obj.get("spec") or {}
    status = obj.get("status") or {}

    openai_cfg = spec.get("openAI") or {}

    return ModelConfigOut(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        provider=spec.get("provider", "OpenAI"),
        model=spec.get("model", ""),
        base_url=openai_cfg.get("baseUrl"),
        ready=_condition_true(status, "Accepted"),
    )


# --------------------------------------------------------------------------
# Skill (stored as a labeled ConfigMap — no dedicated CRD exists for a skill
# catalog entry; the git ref itself is what agents consume)
# --------------------------------------------------------------------------

SKILL_LABEL = "platform.kagent.dev/skill"


def skill_to_configmap(skill: SkillIn, namespace: str) -> dict[str, Any]:
    data = {"url": skill.url}
    if skill.path:
        data["path"] = skill.path
    if skill.ref:
        data["ref"] = skill.ref
    if skill.description:
        data["description"] = skill.description
    if skill.tags:
        data["tags"] = ",".join(skill.tags)
    return {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": f"skill-{skill.name}",
            "namespace": namespace,
            "labels": {SKILL_LABEL: "true"},
            "annotations": {"platform.kagent.dev/skill-name": skill.name},
        },
        "data": data,
    }


def skill_from_configmap(obj: dict[str, Any]) -> SkillOut:
    metadata = obj.get("metadata") or {}
    data = obj.get("data") or {}
    name = (metadata.get("annotations") or {}).get(
        "platform.kagent.dev/skill-name",
        metadata.get("name", "").removeprefix("skill-"),
    )
    return SkillOut(
        name=name,
        namespace=metadata.get("namespace", ""),
        url=data.get("url", ""),
        path=data.get("path"),
        ref=data.get("ref"),
        description=data.get("description"),
        tags=[t for t in data.get("tags", "").split(",") if t],
    )
