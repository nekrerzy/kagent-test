from __future__ import annotations

import copy
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from platform_api.config import Settings, get_settings
from platform_api.k8s import get_k8s_client
from platform_api.main import create_app


class FakeK8sClient:
    """In-memory stand-in for K8sClient, matching its method signatures."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.secrets: dict[tuple[str, str], dict[str, str]] = {}
        # Non-kagent objects (gateway backends, HTTPRoutes), keyed like
        # K8sClient's generic methods address them.
        self.objects: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        self.configmaps: dict[tuple[str, str], dict[str, Any]] = {}
        self._resource_version = 0

    def list_objects(
        self, group: str, version: str, plural: str, namespace: str
    ) -> list[dict[str, Any]]:
        return [
            copy.deepcopy(obj)
            for (g, p, ns, _n), obj in self.objects.items()
            if g == group and p == plural and ns == namespace
        ]

    def put_object(
        self, group: str, version: str, plural: str, namespace: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        key = (group, plural, namespace, body["metadata"]["name"])
        self.objects[key] = copy.deepcopy(body)
        return copy.deepcopy(body)

    def delete_object(
        self, group: str, version: str, plural: str, namespace: str, name: str
    ) -> None:
        self.objects.pop((group, plural, namespace, name), None)

    def get(self, plural: str, namespace: str, name: str) -> dict[str, Any]:
        key = (plural, namespace, name)
        if key not in self.store:
            raise HTTPException(status_code=404, detail="resource not found")
        return copy.deepcopy(self.store[key])

    def list(self, plural: str, namespace: str) -> list[dict[str, Any]]:
        return [
            copy.deepcopy(obj)
            for (p, ns, _name), obj in self.store.items()
            if p == plural and ns == namespace
        ]

    def create(self, plural: str, namespace: str, body: dict[str, Any]) -> dict[str, Any]:
        name = body["metadata"]["name"]
        key = (plural, namespace, name)
        if key in self.store:
            raise HTTPException(status_code=409, detail="resource conflict")
        self._resource_version += 1
        stored = copy.deepcopy(body)
        stored["metadata"]["resourceVersion"] = str(self._resource_version)
        stored.setdefault("status", {})
        self.store[key] = stored
        return copy.deepcopy(stored)

    def replace(
        self, plural: str, namespace: str, name: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        key = (plural, namespace, name)
        if key not in self.store:
            raise HTTPException(status_code=404, detail="resource not found")
        self._resource_version += 1
        stored = copy.deepcopy(body)
        stored["metadata"]["resourceVersion"] = str(self._resource_version)
        stored.setdefault("status", self.store[key].get("status", {}))
        self.store[key] = stored
        return copy.deepcopy(stored)

    def delete(self, plural: str, namespace: str, name: str) -> None:
        key = (plural, namespace, name)
        if key not in self.store:
            raise HTTPException(status_code=404, detail="resource not found")
        del self.store[key]

    def put_secret(self, namespace: str, name: str, string_data: dict[str, str]) -> None:
        self.secrets[(namespace, name)] = dict(string_data)

    def delete_secret(self, namespace: str, name: str) -> None:
        self.secrets.pop((namespace, name), None)

    def list_configmaps(self, namespace: str, label_selector: str) -> list[dict[str, Any]]:
        key, _, value = label_selector.partition("=")
        return [
            copy.deepcopy(obj)
            for (ns, _n), obj in self.configmaps.items()
            if ns == namespace and (obj["metadata"].get("labels") or {}).get(key) == value
        ]

    def get_configmap(self, namespace: str, name: str) -> dict[str, Any]:
        try:
            return copy.deepcopy(self.configmaps[(namespace, name)])
        except KeyError:
            raise HTTPException(status_code=404, detail="resource not found") from None

    def put_configmap(self, namespace: str, body: dict[str, Any]) -> dict[str, Any]:
        self.configmaps[(namespace, body["metadata"]["name"])] = copy.deepcopy(body)
        return copy.deepcopy(body)

    def delete_configmap(self, namespace: str, name: str) -> None:
        if (namespace, name) not in self.configmaps:
            raise HTTPException(status_code=404, detail="resource not found")
        del self.configmaps[(namespace, name)]


@pytest.fixture
def fake_k8s() -> FakeK8sClient:
    return FakeK8sClient()


@pytest.fixture(autouse=True)
def reachable_mcp_probe(monkeypatch: pytest.MonkeyPatch):
    """MCP registration probes succeed by default; tests override per-case."""

    async def fake_probe(url: str, protocol: str) -> dict:
        return {"reachable": True, "tools": [], "error": None}

    monkeypatch.setattr("platform_api.routers.mcp_servers.probe_mcp", fake_probe)


@pytest.fixture
def client(fake_k8s: FakeK8sClient) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_k8s_client] = lambda: fake_k8s
    app.dependency_overrides[get_settings] = lambda: Settings(default_namespace="kagent")
    return TestClient(app)
