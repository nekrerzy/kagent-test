"""Platform API settings, read from PLATFORM_* environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PLATFORM_")

    # Kubeconfig context to use. If unset, try in-cluster config first (this is
    # how the API runs in production, as a Deployment with a ServiceAccount),
    # falling back to the default kubeconfig for local development.
    kube_context: str | None = None

    # Namespace used when a request does not specify one.
    default_namespace: str = "kagent"

    # Base URL of the kagent controller's REST/A2A API. Verified against the
    # live homelab cluster: Service `kagent-controller.kagent.svc.cluster.local`
    # on port 8083 (see `kubectl -n kagent get svc`).
    kagent_api_base: str = "http://kagent-controller.kagent.svc.cluster.local:8083"

    # agentgateway integration: namespace + Gateway name the platform writes
    # AgentgatewayBackend/HTTPRoute objects into, and the externally reachable
    # base (the platform-gw MetalLB address) used to build published URLs.
    gateway_namespace: str = "agentgateway-system"
    gateway_name: str = "platform-gw"
    gateway_external_base: str = "http://10.20.0.101"

    # Plain-HTTP registry that uploaded skill zips are pushed to as OCI images.
    skills_registry: str = "10.20.0.1:5050"


@lru_cache
def get_settings() -> Settings:
    return Settings()
