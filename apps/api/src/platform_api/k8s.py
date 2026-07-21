"""Thin CRD client over kubernetes.client.CustomObjectsApi for kagent.dev/v1alpha2
resources, plus Secret handling (for ModelConfig API keys) via CoreV1Api.

Kept intentionally dumb: no caching, no retries beyond what the official client
does. Exposed as a FastAPI dependency (get_k8s_client) so routers can depend on
it and tests can override it with an in-memory fake.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from kubernetes import client, config
from kubernetes.client.exceptions import ApiException

from platform_api.config import Settings, get_settings

GROUP = "kagent.dev"
VERSION = "v1alpha2"

PLURAL_AGENTS = "agents"
PLURAL_MODEL_CONFIGS = "modelconfigs"
PLURAL_REMOTE_MCP_SERVERS = "remotemcpservers"


def _load_kube_config(settings: Settings) -> None:
    if settings.kube_context:
        config.load_kube_config(context=settings.kube_context)
        return
    try:
        config.load_incluster_config()
    except config.ConfigException:
        config.load_kube_config()


def _map_api_exception(exc: ApiException) -> HTTPException:
    if exc.status == 404:
        return HTTPException(status_code=404, detail="resource not found")
    if exc.status == 409:
        return HTTPException(status_code=409, detail="resource conflict")
    # Surface the Kubernetes message (e.g. CRD schema rejections, RBAC denials)
    # instead of just the bare reason — clients can't act on "Forbidden".
    detail = exc.reason or "kubernetes API error"
    try:
        message = json.loads(exc.body or "{}").get("message")
        if message:
            detail = f"{detail}: {message}"
    except (ValueError, AttributeError):
        pass
    return HTTPException(status_code=exc.status or 500, detail=detail)


class K8sClient:
    """Namespaced CRUD over kagent.dev/v1alpha2 custom objects, plus Secrets."""

    def __init__(self, settings: Settings) -> None:
        # Deferred rather than raised here: a missing/invalid kubeconfig (e.g.
        # no cluster reachable at all, as in a local `docker run` with no
        # mounted kubeconfig) would otherwise blow up FastAPI's dependency
        # resolution before any route — including /healthz's own
        # reachability check — gets a chance to turn it into a clean error.
        self._config_error: Exception | None = None
        try:
            _load_kube_config(settings)
        except Exception as exc:  # noqa: BLE001 - deliberately broad, see above
            self._config_error = exc
            return
        self._custom = client.CustomObjectsApi()
        self._core = client.CoreV1Api()

    def _require_config(self) -> None:
        if self._config_error is not None:
            raise HTTPException(
                status_code=503, detail=f"kubernetes API unreachable: {self._config_error}"
            )

    def get(self, plural: str, namespace: str, name: str) -> dict[str, Any]:
        self._require_config()
        try:
            return self._custom.get_namespaced_custom_object(
                GROUP, VERSION, namespace, plural, name
            )
        except ApiException as exc:
            raise _map_api_exception(exc) from exc

    def list(self, plural: str, namespace: str) -> list[dict[str, Any]]:
        self._require_config()
        try:
            result = self._custom.list_namespaced_custom_object(GROUP, VERSION, namespace, plural)
        except ApiException as exc:
            raise _map_api_exception(exc) from exc
        return result.get("items", [])

    def create(self, plural: str, namespace: str, body: dict[str, Any]) -> dict[str, Any]:
        self._require_config()
        try:
            return self._custom.create_namespaced_custom_object(
                GROUP, VERSION, namespace, plural, body
            )
        except ApiException as exc:
            raise _map_api_exception(exc) from exc

    def replace(
        self, plural: str, namespace: str, name: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        self._require_config()
        try:
            return self._custom.replace_namespaced_custom_object(
                GROUP, VERSION, namespace, plural, name, body
            )
        except ApiException as exc:
            raise _map_api_exception(exc) from exc

    def delete(self, plural: str, namespace: str, name: str) -> None:
        self._require_config()
        try:
            self._custom.delete_namespaced_custom_object(GROUP, VERSION, namespace, plural, name)
        except ApiException as exc:
            raise _map_api_exception(exc) from exc

    def put_secret(self, namespace: str, name: str, string_data: dict[str, str]) -> None:
        """Create the Secret, or replace it in place if it already exists."""
        self._require_config()
        body = client.V1Secret(
            metadata=client.V1ObjectMeta(name=name, namespace=namespace),
            string_data=string_data,
        )
        try:
            self._core.create_namespaced_secret(namespace, body)
        except ApiException as exc:
            if exc.status != 409:
                raise _map_api_exception(exc) from exc
            try:
                self._core.replace_namespaced_secret(name, namespace, body)
            except ApiException as exc2:
                raise _map_api_exception(exc2) from exc2

    def delete_secret(self, namespace: str, name: str) -> None:
        """Delete the Secret, ignoring "already gone" (idempotent cleanup)."""
        self._require_config()
        try:
            self._core.delete_namespaced_secret(name, namespace)
        except ApiException as exc:
            if exc.status != 404:
                raise _map_api_exception(exc) from exc


_client: K8sClient | None = None


def get_k8s_client() -> K8sClient:
    global _client
    if _client is None:
        _client = K8sClient(get_settings())
    return _client
