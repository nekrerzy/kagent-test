from typing import Annotated

from fastapi import APIRouter, Depends, Query

from platform_api import mappers
from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, PLURAL_MODEL_CONFIGS, get_k8s_client
from platform_api.schemas import ModelConfigIn, ModelConfigOut

router = APIRouter(prefix="/v1/model-configs", tags=["model-configs"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("", response_model=list[ModelConfigOut])
def list_model_configs(
    k8s: K8sDep, settings: SettingsDep, namespace: str | None = Query(default=None)
) -> list[ModelConfigOut]:
    ns = namespace or settings.default_namespace
    return [mappers.model_config_from_crd(obj) for obj in k8s.list(PLURAL_MODEL_CONFIGS, ns)]


@router.post("", response_model=ModelConfigOut, status_code=201)
def create_model_config(mc: ModelConfigIn, k8s: K8sDep, settings: SettingsDep) -> ModelConfigOut:
    ns = mc.namespace or settings.default_namespace
    if mc.api_key is not None:
        k8s.put_secret(
            ns, mappers.model_config_secret_name(mc.name), {mappers.API_KEY_SECRET_KEY: mc.api_key}
        )
    created = k8s.create(PLURAL_MODEL_CONFIGS, ns, mappers.model_config_to_crd(mc, ns))
    return mappers.model_config_from_crd(created)


@router.get("/{namespace}/{name}", response_model=ModelConfigOut)
def get_model_config(namespace: str, name: str, k8s: K8sDep) -> ModelConfigOut:
    obj = k8s.get(PLURAL_MODEL_CONFIGS, namespace, name)
    return mappers.model_config_from_crd(obj)


@router.put("/{namespace}/{name}", response_model=ModelConfigOut)
def update_model_config(
    namespace: str, name: str, mc: ModelConfigIn, k8s: K8sDep
) -> ModelConfigOut:
    existing = k8s.get(PLURAL_MODEL_CONFIGS, namespace, name)
    body = mappers.model_config_to_crd(mc, namespace)

    if mc.api_key is not None:
        # Rotate the key.
        k8s.put_secret(
            namespace,
            mappers.model_config_secret_name(name),
            {mappers.API_KEY_SECRET_KEY: mc.api_key},
        )
    else:
        # Not rotating: keep whatever secret ref the CRD already had.
        existing_spec = existing.get("spec", {})
        if "apiKeySecret" in existing_spec:
            body["spec"]["apiKeySecret"] = existing_spec["apiKeySecret"]
            body["spec"]["apiKeySecretKey"] = existing_spec.get(
                "apiKeySecretKey", mappers.API_KEY_SECRET_KEY
            )

    body["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
    updated = k8s.replace(PLURAL_MODEL_CONFIGS, namespace, name, body)
    return mappers.model_config_from_crd(updated)


@router.delete("/{namespace}/{name}", status_code=204)
def delete_model_config(namespace: str, name: str, k8s: K8sDep) -> None:
    k8s.delete(PLURAL_MODEL_CONFIGS, namespace, name)
    k8s.delete_secret(namespace, mappers.model_config_secret_name(name))
