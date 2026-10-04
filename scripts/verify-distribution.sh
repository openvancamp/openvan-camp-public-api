#!/usr/bin/env bash
# Checks from the outside, the way a stranger would, that everything this repository
# promises is actually published and working. Every line is PASS or FAIL; the exit code
# is the number of failures. Run from the repository root:
#
#   bash scripts/verify-distribution.sh
#
# Needs: bash, curl, jq, node/npx (18+), python3 (3.9+).

set -u
cd "$(dirname "$0")/.."

FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1: $2"; else fail "$1: expected $3, got ${2:-nothing}"; fi; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

MCP_VERSION=$(jq -r .version mcp-server/package.json)
SDK_VERSION=$(jq -r .version sdk/package.json)
PY_VERSION=$(sed -n 's/^__version__ = "\(.*\)"/\1/p' python-sdk/src/openvan/client.py)
REGISTRY_NAME=$(jq -r .name mcp-server/server.json)
TOOLS=$(grep -c 'registerTool(' mcp-server/src/server.ts)
SPEC_VERSION=$(sed -n 's/^  version: *//p' openapi.yaml | head -1 | tr -d "'\"")

echo "== Versions in this repository: mcp-server $MCP_VERSION, sdk $SDK_VERSION, python $PY_VERSION, $TOOLS tools, openapi $SPEC_VERSION"

echo "== Registries"
check "npm @openvancamp/mcp-server latest" "$(npm view @openvancamp/mcp-server dist-tags.latest 2>/dev/null)" "$MCP_VERSION"
check "npm @openvancamp/sdk latest" "$(npm view @openvancamp/sdk dist-tags.latest 2>/dev/null)" "$SDK_VERSION"
check "PyPI openvan" "$(curl -sf https://pypi.org/pypi/openvan/json | jq -r .info.version)" "$PY_VERSION"
check "MCP Registry $REGISTRY_NAME latest" "$(curl -sf "https://registry.modelcontextprotocol.io/v0.1/servers?search=${REGISTRY_NAME#*/}" \
  | jq -r --arg n "$REGISTRY_NAME" '.servers[] | select(.server.name == $n and ._meta."io.modelcontextprotocol.registry/official".isLatest) | .server.version')" "$MCP_VERSION"
for tag in "mcp-server-v$MCP_VERSION" "sdk-v$SDK_VERSION" "python-v$PY_VERSION"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://api.github.com/repos/openvancamp/openvan-camp-public-api/releases/tags/$tag")
  check "GitHub Release $tag" "$code" "200"
done
check "live /docs.openapi version" "$(curl -sf "https://openvan.camp/docs.openapi?nc=$RANDOM" | sed -n 's/^  version: *//p' | head -1 | tr -d "'\"")" "$SPEC_VERSION"

echo "== Install from scratch, exactly as the README says"
MCP_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}'
MCP_READY='{"jsonrpc":"2.0","method":"notifications/initialized"}'
MCP_LIST='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
MCP_CALL='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_power_plugs","arguments":{"country_code":"GB"}}}'
out=$(cd "$WORK" && { printf '%s\n' "$MCP_INIT" "$MCP_READY" "$MCP_LIST" "$MCP_CALL"; sleep 25; } \
  | timeout 180 npx -y @openvancamp/mcp-server 2>/dev/null)
check "npx -y @openvancamp/mcp-server version" "$(echo "$out" | jq -r 'select(.id==1) | .result.serverInfo.version' 2>/dev/null)" "$MCP_VERSION"
check "npx -y @openvancamp/mcp-server tools" "$(echo "$out" | jq -r 'select(.id==2) | .result.tools | length' 2>/dev/null)" "$TOOLS"
check "npx MCP tool call get_power_plugs GB" "$(echo "$out" | jq -r 'select(.id==3) | .result.content[0].text' 2>/dev/null | grep -q 'mains electricity in GB' && echo answered)" "answered"

hosted=$(curl -s -X POST https://mcp.openvan.camp/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -d "$MCP_LIST" | sed -n 's/^data: //p;/^{/p' | head -1)
check "hosted https://mcp.openvan.camp/mcp tools" "$(echo "$hosted" | jq -r '.result.tools | length' 2>/dev/null)" "$TOOLS"
# The hosted server runs from a separate checkout on the production host and is restarted by hand,
# so it can lag behind npm — compare its version too.
hosted_version=$(curl -s -X POST https://mcp.openvan.camp/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -d "$MCP_INIT" | sed -n 's/^data: //p;/^{/p' | head -1 | jq -r '.result.serverInfo.version' 2>/dev/null)
check "hosted https://mcp.openvan.camp/mcp version" "$hosted_version" "$MCP_VERSION"

(cd "$WORK" && npm init -y >/dev/null 2>&1 && npm install --silent "@openvancamp/sdk@$SDK_VERSION" >/dev/null 2>&1)
sdk=$(cd "$WORK" && node -e '
import("@openvancamp/sdk").then(async ({ OpenVan }) => {
  const ov = new OpenVan({ source: "verify-distribution" });
  const fr = await ov.weather.score("FR");
  const top = await ov.weather.top({ limit: 3 });
  const de = await ov.fuel.country("DE");
  console.log([fr.code, top.length, de.country_code].join(","));
}).catch(e => console.log("error: " + e.message));' 2>&1)
check "npm SDK weather.score / weather.top / fuel.country" "$sdk" "FR,3,DE"

python3 -m venv "$WORK/venv" >/dev/null 2>&1 && "$WORK/venv/bin/pip" install -q --no-cache-dir "openvan==$PY_VERSION" >/dev/null 2>&1
py=$("$WORK/venv/bin/python" -c '
from openvan import OpenVan
ov = OpenVan(source="verify-distribution")
print(",".join([ov.weather.score("FR")["code"], str(len(ov.weather.top(3))), ov.fuel.country("DE")["country_code"]]))' 2>&1 | tail -1)
check "pip install openvan, same calls" "$py" "FR,3,DE"

echo "== Daily data repository"
updated=$(curl -sf "https://raw.githubusercontent.com/openvancamp/openvan-travel-data/main/data/updated.txt" | tr -d '\n')
age=$(( ( $(date -u +%s) - $(date -u -d "${updated:-1970-01-01}" +%s) ) / 86400 ))
if [ "$age" -le 2 ]; then pass "openvan-travel-data updated $updated ($age d ago)"; else fail "openvan-travel-data last updated ${updated:-never} ($age d ago)"; fi
rows=$(curl -sf "https://raw.githubusercontent.com/openvancamp/openvan-travel-data/main/data/fuel-prices.csv" | wc -l)
if [ "$rows" -gt 500 ]; then pass "fuel-prices.csv rows: $rows"; else fail "fuel-prices.csv rows: $rows"; fi

echo "== $FAILS failure(s)"
exit "$FAILS"
