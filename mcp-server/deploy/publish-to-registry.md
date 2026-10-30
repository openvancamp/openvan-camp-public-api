# Publishing to the MCP Registry

The server is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as
**`io.github.openvancamp/openvan-travel`** (`mcpName` in `package.json`, `name` in `server.json`).
Until v0.9.3 it was `io.github.Kopaev/openvan-travel`; that name is deprecated, and the repository moved
from `github.com/Kopaev/openvan-camp-public-api` to `github.com/openvancamp/openvan-camp-public-api`.

Publishing is automatic: pushing a `mcp-server-vX.Y.Z` tag runs
[`.github/workflows/release.yml`](../../.github/workflows/release.yml), which publishes the npm package,
the registry entry (GitHub OIDC for the `openvancamp` organization) and a GitHub Release. Do not run
`mcp-publisher` by hand.

Directories that ingest the registry (PulseMCP, Glama, Smithery and others) pick up new versions on
their own schedule.
