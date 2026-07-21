#!/usr/bin/env bash
# Phase 0 smoke test: invoke hello-agent over A2A and assert it used an MCP tool.
set -euo pipefail

CTX="${CTX:-admin@homelab}"
PORT="${PORT:-18083}"

kubectl --context "$CTX" port-forward svc/kagent-controller "$PORT:8083" -n kagent >/dev/null 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null || true' EXIT
until curl -s --max-time 2 "http://localhost:$PORT/api/version" >/dev/null; do sleep 0.5; done

resp=$(curl -s --max-time 170 -X POST "http://localhost:$PORT/api/a2a/kagent/hello-agent" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"smoke","method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"'"$(uuidgen)"'","parts":[{"kind":"text","text":"Add 17 and 25 using one of your MCP tools and report the tool name and result."}]}}}')

answer=$(python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
r = d.get("result") or {}
parts = []
for a in r.get("artifacts") or []:
    parts += [p.get("text", "") for p in a.get("parts", []) if p.get("kind") == "text"]
print(" ".join(parts))
' <<<"$resp")

echo "agent answered: $answer"
grep -q "42" <<<"$answer" || { echo "SMOKE FAILED: expected 42 in answer"; exit 1; }
echo "SMOKE OK"
