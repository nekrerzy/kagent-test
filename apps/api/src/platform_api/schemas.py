"""Platform-shaped Pydantic request/response models.

These are deliberately NOT raw CRD dumps — see mappers.py for the translation
to/from kagent.dev/v1alpha2 CRD dicts.

Note on `model_config`: the spec calls for an AgentIn field literally named
`model_config` (the name of the kagent ModelConfig CR to use). Pydantic v2
reserves `model_config` as a BaseModel class attribute (the ConfigDict), so a
field cannot use that Python attribute name. Resolved by naming the Python
attribute `model_config_ref` and giving it the wire/JSON alias "model_config"
(via `populate_by_name=True` so both the alias and the attribute name work for
construction; FastAPI serializes responses by alias by default, so the wire
shape still matches the spec exactly).
"""

import re
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

_K8S_NAME_RE = re.compile(r"^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$")


def _validate_k8s_name(value: str) -> str:
    if not _K8S_NAME_RE.match(value):
        raise ValueError(
            "must be a valid Kubernetes resource name: lowercase letters, digits and '-', "
            "starting and ending with a letter or digit (e.g. 'microsoft-mcp')"
        )
    return value


# Resource names become Kubernetes object names (and often Service/DNS names),
# so they must satisfy RFC 1123 — reject early with a readable message instead
# of letting the apiserver's regex error surface to users.
K8sName = Annotated[str, AfterValidator(_validate_k8s_name)]

Protocol = Literal["SSE", "STREAMABLE_HTTP"]

# Provider enum verified against the LIVE cluster's modelconfigs.kagent.dev CRD
# (v0.9.12, pinned) — narrower than kagent's upstream `main` branch, which adds
# Bedrock/SAPAICore later.
ModelProvider = Literal[
    "Anthropic",
    "OpenAI",
    "AzureOpenAI",
    "Ollama",
    "Gemini",
    "GeminiVertexAI",
    "AnthropicVertexAI",
]


class ToolRef(BaseModel):
    mcp_server: str
    tool_names: list[str] | None = None


class AgentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: K8sName
    namespace: str | None = None
    description: str | None = None
    system_message: str
    model_config_ref: str | None = Field(default=None, alias="model_config")
    tools: list[ToolRef] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class AgentOut(AgentIn):
    ready: bool | None = None
    a2a_url: str | None = None


class McpServerIn(BaseModel):
    name: K8sName
    namespace: str | None = None
    description: str | None = None
    url: str
    protocol: Protocol = "STREAMABLE_HTTP"
    tags: list[str] = Field(default_factory=list)


class DiscoveredTool(BaseModel):
    name: str
    description: str


class McpProbeIn(BaseModel):
    url: str
    protocol: Protocol = "STREAMABLE_HTTP"


class McpProbeOut(BaseModel):
    reachable: bool
    tools: list[DiscoveredTool] = Field(default_factory=list)
    error: str | None = None


class McpServerOut(McpServerIn):
    ready: bool | None = None
    discovered_tools: list[DiscoveredTool] = Field(default_factory=list)


class ModelConfigIn(BaseModel):
    name: K8sName
    namespace: str | None = None
    provider: ModelProvider = "OpenAI"
    model: str
    base_url: str | None = None
    api_key: str | None = None


class ModelConfigOut(BaseModel):
    # Deliberately NOT built on ModelConfigIn: api_key must never round-trip
    # back out to a client.
    name: str
    namespace: str
    provider: ModelProvider
    model: str
    base_url: str | None = None
    ready: bool | None = None


class InvokeIn(BaseModel):
    text: str
    session_id: str | None = None


class InvokeOut(BaseModel):
    text: str
    task_id: str | None = None
    context_id: str | None = None
    raw: dict[str, Any]


class CatalogOut(BaseModel):
    agents: list[AgentOut]
    mcp_servers: list[McpServerOut]
    model_configs: list[ModelConfigOut]
