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


@lru_cache
def get_settings() -> Settings:
    return Settings()
