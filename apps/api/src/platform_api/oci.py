"""Minimal OCI image push for skill bundles.

Packages a directory tree as a single-layer OCI image and pushes it to the
plain-HTTP homelab registry via the registry v2 API. Layout contract
(verified live against kagent 0.9.12's skills-init): the image FILESYSTEM
becomes /skills/<image-basename>/ in the agent pod, so SKILL.md must sit at
the image root — no wrapper directory.

Deliberately dependency-free (httpx is already present): a full OCI client
(oras/docker) is overkill for one gzipped tar layer.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import tarfile

import httpx

MANIFEST_TYPE = "application/vnd.oci.image.manifest.v1+json"
CONFIG_TYPE = "application/vnd.oci.image.config.v1+json"
LAYER_TYPE = "application/vnd.oci.image.layer.v1.tar+gzip"


def _digest(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def build_layer(files: dict[str, bytes]) -> tuple[bytes, str]:
    """Deterministic gzipped tar of {relative_path: content}. Returns (layer, diff_id)."""
    tar_buf = io.BytesIO()
    with tarfile.open(fileobj=tar_buf, mode="w") as tar:
        for path in sorted(files):
            info = tarfile.TarInfo(name=path)
            info.size = len(files[path])
            info.mode = 0o644
            info.mtime = 0
            tar.addfile(info, io.BytesIO(files[path]))
    tar_bytes = tar_buf.getvalue()
    gz_buf = io.BytesIO()
    with gzip.GzipFile(fileobj=gz_buf, mode="wb", mtime=0) as gz:
        gz.write(tar_bytes)
    return gz_buf.getvalue(), _digest(tar_bytes)


def push_image(registry: str, repository: str, tag: str, files: dict[str, bytes]) -> str:
    """Push files as a single-layer image; returns the full image reference."""
    layer, diff_id = build_layer(files)
    config = json.dumps(
        {
            "architecture": "amd64",
            "os": "linux",
            "config": {},
            "rootfs": {"type": "layers", "diff_ids": [diff_id]},
        }
    ).encode()
    manifest = json.dumps(
        {
            "schemaVersion": 2,
            "mediaType": MANIFEST_TYPE,
            "config": {
                "mediaType": CONFIG_TYPE,
                "digest": _digest(config),
                "size": len(config),
            },
            "layers": [
                {
                    "mediaType": LAYER_TYPE,
                    "digest": _digest(layer),
                    "size": len(layer),
                }
            ],
        }
    ).encode()

    base = f"http://{registry}/v2/{repository}"
    with httpx.Client(timeout=60.0) as client:
        for blob in (layer, config):
            digest = _digest(blob)
            head = client.head(f"{base}/blobs/{digest}")
            if head.status_code == 200:
                continue
            start = client.post(f"{base}/blobs/uploads/")
            start.raise_for_status()
            location = start.headers["Location"]
            sep = "&" if "?" in location else "?"
            upload_url = location if location.startswith("http") else f"http://{registry}{location}"
            client.put(
                f"{upload_url}{sep}digest={digest}",
                content=blob,
                headers={"Content-Type": "application/octet-stream"},
            ).raise_for_status()
        client.put(
            f"{base}/manifests/{tag}",
            content=manifest,
            headers={"Content-Type": MANIFEST_TYPE},
        ).raise_for_status()

    return f"{registry}/{repository}:{tag}"


def list_tags(registry: str, repository: str) -> list[str]:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(f"http://{registry}/v2/{repository}/tags/list")
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        return resp.json().get("tags") or []


def fetch_files(registry: str, repository: str, tag: str) -> dict[str, bytes]:
    """Pull the single-layer image back and return {path: content}."""
    base = f"http://{registry}/v2/{repository}"
    with httpx.Client(timeout=60.0) as client:
        manifest = client.get(f"{base}/manifests/{tag}", headers={"Accept": MANIFEST_TYPE})
        manifest.raise_for_status()
        layers = manifest.json().get("layers") or []
        if not layers:
            return {}
        blob = client.get(f"{base}/blobs/{layers[0]['digest']}")
        blob.raise_for_status()
    tar = tarfile.open(fileobj=io.BytesIO(gzip.decompress(blob.content)))
    return {
        member.name: tar.extractfile(member).read()
        for member in tar.getmembers()
        if member.isfile()
    }
