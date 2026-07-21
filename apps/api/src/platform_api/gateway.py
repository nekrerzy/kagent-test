"""Reconciles platform state into agentgateway objects.

Two dynamic concerns live here (static routes/backends are GitOps-managed in
examples/gateway/):
  - the federated MCP catalog: one AgentgatewayBackend whose targets mirror
    every registered RemoteMCPServer (route: /mcp, in git)
  - per-agent A2A exposure: an AgentgatewayBackend + HTTPRoute pair per agent
    (external URL: {gateway_external_base}/a2a/{ns}/{name})

Schema ground truth: the live agentgateway.dev/v1alpha1 CRDs (see docs/phase-3.md).
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlsplit

from platform_api.config import Settings
from platform_api.k8s import K8sClient

logger = logging.getLogger(__name__)

GATEWAY_GROUP = "agentgateway.dev"
GATEWAY_VERSION = "v1alpha1"
PLURAL_BACKENDS = "agentgatewaybackends"

ROUTE_GROUP = "gateway.networking.k8s.io"
ROUTE_VERSION = "v1"
PLURAL_HTTPROUTES = "httproutes"

MANAGED_LABELS = {"platform.kagent.dev/managed": "true"}

MCP_CATALOG_NAME = "mcp-catalog"


def mcp_target(name: str, url: str, protocol: str) -> dict[str, Any]:
    parts = urlsplit(url)
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return {
        "name": name,
        "static": {
            "host": parts.hostname or "",
            "port": port,
            "path": parts.path or "/",
            "protocol": "SSE" if protocol == "SSE" else "StreamableHTTP",
        },
    }


def mcp_catalog_backend(targets: list[dict[str, Any]], namespace: str) -> dict[str, Any]:
    return {
        "apiVersion": f"{GATEWAY_GROUP}/{GATEWAY_VERSION}",
        "kind": "AgentgatewayBackend",
        "metadata": {
            "name": MCP_CATALOG_NAME,
            "namespace": namespace,
            "labels": dict(MANAGED_LABELS),
        },
        "spec": {"mcp": {"targets": targets}},
    }


def a2a_resource_name(agent_namespace: str, agent_name: str) -> str:
    return f"a2a-{agent_namespace}-{agent_name}"


def a2a_backend(agent_namespace: str, agent_name: str, gateway_namespace: str) -> dict[str, Any]:
    return {
        "apiVersion": f"{GATEWAY_GROUP}/{GATEWAY_VERSION}",
        "kind": "AgentgatewayBackend",
        "metadata": {
            "name": a2a_resource_name(agent_namespace, agent_name),
            "namespace": gateway_namespace,
            "labels": dict(MANAGED_LABELS),
        },
        "spec": {
            "a2a": {
                "host": f"{agent_name}.{agent_namespace}.svc.cluster.local",
                "port": 8080,
            }
        },
    }


def a2a_route(
    agent_namespace: str, agent_name: str, gateway_namespace: str, gateway_name: str
) -> dict[str, Any]:
    resource = a2a_resource_name(agent_namespace, agent_name)
    return {
        "apiVersion": f"{ROUTE_GROUP}/{ROUTE_VERSION}",
        "kind": "HTTPRoute",
        "metadata": {
            "name": resource,
            "namespace": gateway_namespace,
            "labels": dict(MANAGED_LABELS),
        },
        "spec": {
            "parentRefs": [{"name": gateway_name}],
            "rules": [
                {
                    "matches": [
                        {
                            "path": {
                                "type": "PathPrefix",
                                "value": f"/a2a/{agent_namespace}/{agent_name}",
                            }
                        }
                    ],
                    "filters": [
                        {
                            "type": "URLRewrite",
                            "urlRewrite": {
                                "path": {"type": "ReplacePrefixMatch", "replacePrefixMatch": "/"}
                            },
                        }
                    ],
                    "backendRefs": [
                        {"group": GATEWAY_GROUP, "kind": "AgentgatewayBackend", "name": resource}
                    ],
                    "timeouts": {"request": "900s", "backendRequest": "900s"},
                }
            ],
        },
    }


def external_a2a_url(settings: Settings, agent_namespace: str, agent_name: str) -> str:
    return f"{settings.gateway_external_base}/a2a/{agent_namespace}/{agent_name}"


def reconcile_mcp_catalog(
    k8s: K8sClient, settings: Settings, servers: list[dict[str, Any]]
) -> None:
    """Mirror the given RemoteMCPServer CRDs into the catalog backend's targets."""
    targets = []
    for obj in servers:
        spec_obj = obj.get("spec") or {}
        if not spec_obj.get("url"):
            continue
        meta = obj["metadata"]
        ns_prefix = (
            ""
            if meta.get("namespace") == settings.default_namespace
            else f"{meta.get('namespace')}-"
        )
        targets.append(
            mcp_target(
                f"{ns_prefix}{meta['name']}",
                spec_obj.get("url", ""),
                spec_obj.get("protocol", "STREAMABLE_HTTP"),
            )
        )
    ns = settings.gateway_namespace
    if targets:
        k8s.put_object(
            GATEWAY_GROUP, GATEWAY_VERSION, PLURAL_BACKENDS, ns, mcp_catalog_backend(targets, ns)
        )
    else:
        k8s.delete_object(GATEWAY_GROUP, GATEWAY_VERSION, PLURAL_BACKENDS, ns, MCP_CATALOG_NAME)


def ensure_agent_exposure(
    k8s: K8sClient, settings: Settings, agent_namespace: str, agent_name: str
) -> None:
    ns = settings.gateway_namespace
    k8s.put_object(
        GATEWAY_GROUP,
        GATEWAY_VERSION,
        PLURAL_BACKENDS,
        ns,
        a2a_backend(agent_namespace, agent_name, ns),
    )
    k8s.put_object(
        ROUTE_GROUP,
        ROUTE_VERSION,
        PLURAL_HTTPROUTES,
        ns,
        a2a_route(agent_namespace, agent_name, ns, settings.gateway_name),
    )


def remove_agent_exposure(
    k8s: K8sClient, settings: Settings, agent_namespace: str, agent_name: str
) -> None:
    ns = settings.gateway_namespace
    resource = a2a_resource_name(agent_namespace, agent_name)
    k8s.delete_object(ROUTE_GROUP, ROUTE_VERSION, PLURAL_HTTPROUTES, ns, resource)
    k8s.delete_object(GATEWAY_GROUP, GATEWAY_VERSION, PLURAL_BACKENDS, ns, resource)
