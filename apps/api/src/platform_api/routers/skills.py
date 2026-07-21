from typing import Annotated

from fastapi import APIRouter, Depends, Query

from platform_api import mappers
from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, get_k8s_client
from platform_api.schemas import SkillIn, SkillOut

router = APIRouter(prefix="/v1/skills", tags=["skills"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

_SELECTOR = f"{mappers.SKILL_LABEL}=true"


@router.get("", response_model=list[SkillOut])
def list_skills(
    k8s: K8sDep, settings: SettingsDep, namespace: str | None = Query(default=None)
) -> list[SkillOut]:
    ns = namespace or settings.default_namespace
    return [mappers.skill_from_configmap(cm) for cm in k8s.list_configmaps(ns, _SELECTOR)]


@router.post("", response_model=SkillOut, status_code=201)
def create_skill(skill: SkillIn, k8s: K8sDep, settings: SettingsDep) -> SkillOut:
    ns = skill.namespace or settings.default_namespace
    created = k8s.put_configmap(ns, mappers.skill_to_configmap(skill, ns))
    return mappers.skill_from_configmap(created)


@router.get("/{namespace}/{name}", response_model=SkillOut)
def get_skill(namespace: str, name: str, k8s: K8sDep) -> SkillOut:
    return mappers.skill_from_configmap(k8s.get_configmap(namespace, f"skill-{name}"))


@router.put("/{namespace}/{name}", response_model=SkillOut)
def update_skill(namespace: str, name: str, skill: SkillIn, k8s: K8sDep) -> SkillOut:
    updated = k8s.put_configmap(namespace, mappers.skill_to_configmap(skill, namespace))
    return mappers.skill_from_configmap(updated)


@router.delete("/{namespace}/{name}", status_code=204)
def delete_skill(namespace: str, name: str, k8s: K8sDep) -> None:
    k8s.delete_configmap(namespace, f"skill-{name}")
