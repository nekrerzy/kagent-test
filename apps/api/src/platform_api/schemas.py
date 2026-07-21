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

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

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
    # Tools requiring human approval before execution ("ask" scope).
    # Every entry must also be in tool_names; enforced by kagent's CRD.
    require_approval: list[str] | None = None


class SkillGitRef(BaseModel):
    """A skill attached to an agent: either a git folder (kagent skills.gitRefs)
    or an OCI image built from an uploaded zip (kagent skills.refs)."""

    url: str | None = None
    image: str | None = None
    name: str | None = None
    path: str | None = None
    ref: str | None = None

    @model_validator(mode="after")
    def _one_source(self) -> "SkillGitRef":
        if bool(self.url) == bool(self.image):
            raise ValueError("exactly one of url (git) or image (OCI) is required")
        return self


class AgentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: K8sName
    namespace: str | None = None
    type: Literal["Declarative", "BYO"] = "Declarative"
    description: str | None = None
    # Declarative agents only.
    system_message: str | None = None
    model_config_ref: str | None = Field(default=None, alias="model_config")
    tools: list[ToolRef] = Field(default_factory=list)
    # BYO agents only: container image serving A2A on port 8080.
    image: str | None = None
    skills: list[SkillGitRef] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _type_requirements(self) -> "AgentIn":
        if self.type == "Declarative" and not self.system_message:
            raise ValueError("system_message is required for Declarative agents")
        if self.type == "BYO" and not self.image:
            raise ValueError("image is required for BYO agents")
        return self


class AgentOut(AgentIn):
    ready: bool | None = None
    a2a_url: str | None = None
    # metadata.generation — bumps on every spec change; honest lightweight versioning
    version: int | None = None
    # Session count from kagent (best-effort; None when unavailable)
    runs: int | None = None


class McpServerIn(BaseModel):
    name: K8sName
    namespace: str | None = None
    description: str | None = None
    url: str
    protocol: Protocol = "STREAMABLE_HTTP"
    # Optional auth header sent to the MCP server (e.g. Authorization).
    # auth_value is write-only: stored in a Secret, never returned.
    auth_header: str | None = None
    auth_value: str | None = None
    tags: list[str] = Field(default_factory=list)


class DiscoveredTool(BaseModel):
    name: str
    description: str


class SkillIn(BaseModel):
    """Catalog entry for a reusable skill: a folder (SKILL.md + resources)
    either in a git repo (url/path/ref) or packaged as an OCI image from an
    uploaded zip (image)."""

    name: K8sName
    namespace: str | None = None
    url: str | None = None
    image: str | None = None
    path: str | None = None
    ref: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _one_source(self) -> "SkillIn":
        if bool(self.url) == bool(self.image):
            raise ValueError("exactly one of url (git) or image (OCI) is required")
        return self


class SkillOut(SkillIn):
    pass


class SkillAuthorIn(BaseModel):
    """Author a skill directly in the portal: SKILL.md content, packaged and
    pushed exactly like an uploaded zip."""

    name: K8sName
    namespace: str | None = None
    skill_md: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)


class SkillContentOut(BaseModel):
    skill_md: str
    files: list[str]
    versions: list[str] = Field(default_factory=list)


class EnvironmentOut(BaseModel):
    name: str
    default: bool = False


class McpProbeIn(BaseModel):
    url: str
    protocol: Protocol = "STREAMABLE_HTTP"
    auth_header: str | None = None
    auth_value: str | None = None


class McpProbeOut(BaseModel):
    reachable: bool
    tools: list[DiscoveredTool] = Field(default_factory=list)
    error: str | None = None


class McpServerOut(McpServerIn):
    ready: bool | None = None
    discovered_tools: list[DiscoveredTool] = Field(default_factory=list)

    @model_validator(mode="after")
    def _never_echo_auth_value(self) -> "McpServerOut":
        self.auth_value = None
        return self


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
    skills: list[SkillOut] = Field(default_factory=list)
    # Single federated MCP URL (agentgateway multiplex) serving every
    # registered server's tools, namespaced per server.
    mcp_endpoint: str | None = None
