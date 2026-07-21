import io
import zipfile

import pytest
from fastapi import HTTPException

from platform_api import oci
from platform_api.routers.skills import _extract_skill_zip


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, content in entries.items():
            z.writestr(name, content)
    return buf.getvalue()


def test_extract_root_skill_md():
    files = _extract_skill_zip(_zip({"SKILL.md": b"# s", "scripts/run.sh": b"echo"}))
    assert set(files) == {"SKILL.md", "scripts/run.sh"}


def test_extract_strips_single_top_dir():
    files = _extract_skill_zip(_zip({"my-skill/SKILL.md": b"# s", "my-skill/data/a.txt": b"x"}))
    assert set(files) == {"SKILL.md", "data/a.txt"}


def test_extract_rejects_missing_skill_md():
    with pytest.raises(HTTPException) as exc:
        _extract_skill_zip(_zip({"readme.txt": b"x"}))
    assert "SKILL.md" in exc.value.detail


def test_extract_rejects_zip_slip():
    with pytest.raises(HTTPException):
        _extract_skill_zip(_zip({"../evil": b"x", "SKILL.md": b"# s"}))


def test_build_layer_deterministic_and_valid():
    layer1, diff1 = oci.build_layer({"SKILL.md": b"# s", "a/b.txt": b"x"})
    layer2, diff2 = oci.build_layer({"a/b.txt": b"x", "SKILL.md": b"# s"})
    assert layer1 == layer2 and diff1 == diff2

    import gzip
    import tarfile

    tar = tarfile.open(fileobj=io.BytesIO(gzip.decompress(layer1)))
    assert sorted(tar.getnames()) == ["SKILL.md", "a/b.txt"]


def test_upload_endpoint_pushes_and_registers(client, fake_k8s, monkeypatch):
    pushed = {}

    def fake_push(registry, repository, tag, files):
        pushed.update(registry=registry, repository=repository, tag=tag, files=files)
        return f"{registry}/{repository}:{tag}"

    monkeypatch.setattr("platform_api.routers.skills.oci.push_image", fake_push)

    payload = _zip({"word-count/SKILL.md": b"# skill", "word-count/x/y.txt": b"data"})
    resp = client.post(
        "/v1/skills/upload",
        files={"file": ("skill.zip", payload, "application/zip")},
        data={"name": "uploaded-skill", "description": "d", "tags": "a, b"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["image"] == f"10.20.0.1:5050/skills/uploaded-skill:{pushed['tag']}"
    assert body["url"] is None
    assert body["tags"] == ["a", "b"]
    assert set(pushed["files"]) == {"SKILL.md", "x/y.txt"}
    assert pushed["repository"] == "skills/uploaded-skill"

    # attached to an agent, an image skill maps to refs + insecureSkipVerify
    resp = client.post(
        "/v1/agents",
        json={
            "name": "img-skill-agent",
            "system_message": "hi",
            "skills": [{"image": body["image"]}],
        },
    )
    assert resp.status_code == 201
    crd = fake_k8s.store[("agents", "kagent", "img-skill-agent")]
    assert crd["spec"]["skills"]["refs"] == [body["image"]]
    assert crd["spec"]["skills"]["insecureSkipVerify"] is True
    assert "gitRefs" not in crd["spec"]["skills"]
