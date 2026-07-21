from typing import Annotated

from fastapi import APIRouter, Depends

from platform_api.config import Settings, get_settings
from platform_api.k8s import PLURAL_MODEL_CONFIGS, K8sClient, get_k8s_client
from platform_api.schemas import EnvironmentOut, K8sName
from pydantic import BaseModel

router = APIRouter(prefix="/v1/environments", tags=["environments"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

ENV_LABEL = "platform.kagent.dev/environment"


class EnvironmentIn(BaseModel):
    name: K8sName


@router.get("", response_model=list[EnvironmentOut])
def list_environments(k8s: K8sDep, settings: SettingsDep) -> list[EnvironmentOut]:
    extra = sorted(k8s.list_namespaces(f"{ENV_LABEL}=true"))
    return [EnvironmentOut(name=settings.default_namespace, default=True)] + [
        EnvironmentOut(name=ns) for ns in extra if ns != settings.default_namespace
    ]


@router.post("", response_model=EnvironmentOut, status_code=201)
def create_environment(env: EnvironmentIn, k8s: K8sDep, settings: SettingsDep) -> EnvironmentOut:
    """Provision an environment: a labeled namespace seeded with the default
    model config (and its API-key Secret) copied from the default namespace,
    so agents created there can run immediately."""
    k8s.create_namespace(env.name, {ENV_LABEL: "true"})

    source = k8s.get(PLURAL_MODEL_CONFIGS, settings.default_namespace, "default-model-config")
    spec = source.get("spec") or {}
    k8s.put_object(
        "kagent.dev",
        "v1alpha2",
        PLURAL_MODEL_CONFIGS,
        env.name,
        {
            "apiVersion": "kagent.dev/v1alpha2",
            "kind": "ModelConfig",
            "metadata": {"name": "default-model-config", "namespace": env.name},
            "spec": spec,
        },
    )
    secret_name = spec.get("apiKeySecret")
    if secret_name:
        secret = k8s.get_secret(settings.default_namespace, secret_name)
        k8s.put_secret_raw(env.name, secret)
    return EnvironmentOut(name=env.name)
