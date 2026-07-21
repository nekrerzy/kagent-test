"""Pre-registration reachability probe for MCP servers.

Runs a real MCP handshake (initialize + tools/list) from inside the cluster —
the same network vantage kagent's controller has — so unreachable or
non-MCP URLs are rejected at registration time instead of sitting Not Ready.
"""

from __future__ import annotations

import asyncio
from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client

PROBE_TIMEOUT_SECONDS = 8.0


async def probe_mcp(
    url: str, protocol: str, headers: dict[str, str] | None = None
) -> dict[str, Any]:
    """Returns {"reachable": bool, "tools": [{name, description}], "error": str | None}."""
    try:
        async with asyncio.timeout(PROBE_TIMEOUT_SECONDS):
            if protocol == "SSE":
                client_ctx = sse_client(url, headers=headers)
            else:
                client_ctx = streamablehttp_client(url, headers=headers)
            async with client_ctx as streams:
                read_stream, write_stream = streams[0], streams[1]
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    listing = await session.list_tools()
                    tools = [
                        {"name": t.name, "description": t.description or ""} for t in listing.tools
                    ]
                    return {"reachable": True, "tools": tools, "error": None}
    except TimeoutError:
        return {
            "reachable": False,
            "tools": [],
            "error": f"no MCP response within {PROBE_TIMEOUT_SECONDS:.0f}s "
            f"(is the URL reachable from the cluster and the protocol {protocol} correct?)",
        }
    except Exception as exc:  # anyio wraps transport failures in exception groups
        leaf: BaseException = exc
        while isinstance(leaf, BaseExceptionGroup):
            leaf = leaf.exceptions[0]
        detail = str(leaf).strip() or type(leaf).__name__
        return {"reachable": False, "tools": [], "error": detail}
