import hashlib
import io
import posixpath
import zipfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from platform_api import mappers, oci
from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, get_k8s_client
from platform_api.schemas import SkillIn, SkillOut

router = APIRouter(prefix="/v1/skills", tags=["skills"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

_SELECTOR = f"{mappers.SKILL_LABEL}=true"

MAX_ZIP_BYTES = 30 * 1024 * 1024
MAX_UNPACKED_BYTES = 100 * 1024 * 1024


def _extract_skill_zip(payload: bytes) -> dict[str, bytes]:
    """Validated {relative_path: content} for the skill tree.

    Accepts SKILL.md at the zip root or inside a single top-level directory
    (the folder-drag-zip case); the wrapper directory is stripped so SKILL.md
    ends up at the image root, per the skills-init layout contract.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=422, detail="not a valid zip file") from exc

    files: dict[str, bytes] = {}
    total = 0
    for info in archive.infolist():
        if info.is_dir():
            continue
        name = info.filename
        norm = posixpath.normpath(name)
        if norm.startswith(("/", "..")) or "\\" in name:
            raise HTTPException(status_code=422, detail=f"unsafe path in zip: {name}")
        total += info.file_size
        if total > MAX_UNPACKED_BYTES:
            raise HTTPException(status_code=422, detail="zip contents too large")
        files[norm] = archive.read(info)

    if not files:
        raise HTTPException(status_code=422, detail="zip is empty")

    if "SKILL.md" not in files:
        top_dirs = {path.split("/", 1)[0] for path in files}
        candidate = next(iter(top_dirs)) if len(top_dirs) == 1 else None
        if candidate and f"{candidate}/SKILL.md" in files:
            files = {path.split("/", 1)[1]: content for path, content in files.items()}
        else:
            raise HTTPException(
                status_code=422,
                detail="zip must contain a SKILL.md at its root "
                "(or inside a single top-level folder)",
            )
    return files


@router.post("/upload", response_model=SkillOut, status_code=201)
async def upload_skill(
    k8s: K8sDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
    name: Annotated[str, Form()],
    description: Annotated[str | None, Form()] = None,
    tags: Annotated[str | None, Form()] = None,
    namespace: Annotated[str | None, Form()] = None,
) -> SkillOut:
    payload = await file.read()
    if len(payload) > MAX_ZIP_BYTES:
        raise HTTPException(status_code=422, detail="zip larger than 30MB")

    files = _extract_skill_zip(payload)
    skill = SkillIn(
        name=name,
        namespace=namespace,
        image="pending",  # replaced below; constructed first so name validation runs
        description=description,
        tags=[t.strip() for t in (tags or "").split(",") if t.strip()],
    )

    tag = hashlib.sha256(payload).hexdigest()[:12]
    try:
        image = oci.push_image(settings.skills_registry, f"skills/{skill.name}", tag, files)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"failed to push skill image: {exc}") from exc

    skill.image = image
    ns = skill.namespace or settings.default_namespace
    created = k8s.put_configmap(ns, mappers.skill_to_configmap(skill, ns))
    return mappers.skill_from_configmap(created)


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
