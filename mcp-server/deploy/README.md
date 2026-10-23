# Deploy — mcp.openvan.camp

Public Streamable HTTP endpoint for the OpenVan MCP Server.

Layout on production:

```
DNS: mcp.openvan.camp  →  95.111.242.243 (Contabo)
                            ↓
                          nginx :443 (TLS, Let's Encrypt)
                            ↓
                          127.0.0.1:4800  (node dist/sse.js, systemd)
                            ↓
                          https://openvan.camp/api/*  (REST, ?source=mcp-server-sse)
```

## Files

- `openvan-mcp-sse.service` — systemd unit, runs the Node service as `vanlife` user on 127.0.0.1:4800
- `nginx-mcp.openvan.camp.conf` — nginx vhost with TLS, CORS, and SSE-friendly proxy settings

## One-time install (requires root)

```bash
# 1. Install systemd unit
sudo cp mcp-server/deploy/openvan-mcp-sse.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openvan-mcp-sse.service

# 2. Verify the Node service is up
systemctl status openvan-mcp-sse --no-pager
curl -s http://127.0.0.1:4800/healthz

# 3. Replace nginx vhost (back up the placeholder first)
sudo mv /etc/nginx/sites-enabled/mcp.openvan.camp{,.bak.$(date +%Y%m%d)}
sudo cp mcp-server/deploy/nginx-mcp.openvan.camp.conf /etc/nginx/sites-enabled/mcp.openvan.camp
sudo nginx -t && sudo systemctl reload nginx

# 4. Smoke test through the public URL
curl -s https://mcp.openvan.camp/healthz
curl -s https://mcp.openvan.camp/ | head -5
curl -s -X POST https://mcp.openvan.camp/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

## Updating the server

The service runs straight from the private site repo (`/home/vanlife/VanLife-Aggregator-laravel/mcp-server`)
and reads the roadbook engine from the site's `resources/js`. The `vanlife` user cannot `systemctl restart`;
the unit has `Restart=on-failure`, so killing the process restarts it.

```bash
cd /home/vanlife/VanLife-Aggregator-laravel/mcp-server
npm ci            # package-lock.json must equal the public repo's copy
npm run build
kill -9 $(systemctl show openvan-mcp-sse.service -p MainPID --value)   # systemd starts it again
curl -s http://127.0.0.1:4800/healthz                                  # new version
journalctl -u openvan-mcp-sse -n 20 --no-pager
```

Releasing to npm, the MCP Registry and the site is a separate procedure: see `docs/PUBLIC_API.md`
in the site repo (section «Выпуск MCP»).

## Logs

- nginx: `/var/log/nginx/mcp.openvan.camp-{access,error}.log`
- node:  `journalctl -u openvan-mcp-sse -f`

## Env vars

Overridable in the systemd unit (`Environment=`):

| Var | Default | Purpose |
|---|---|---|
| `OPENVAN_MCP_HOST` | `127.0.0.1` | Bind address (leave local — nginx fronts it) |
| `OPENVAN_MCP_PORT` | `4800`      | TCP port |
| `OPENVAN_API_URL`  | `https://openvan.camp` | Upstream REST API base |
| `OPENVAN_SOURCE`   | `mcp-server-sse` | `?source=` tag written to `api_request_logs` |

## Troubleshooting

**`502 Bad Gateway` on `/mcp`**
Node service is down. `sudo systemctl status openvan-mcp-sse` and check journal.

**SSE stream closes after ~60s**
Client is hitting a proxy/nginx timeout. We set `proxy_read_timeout 3600s` in the vhost — confirm the public config is current.

**Certbot renewal breaks config**
Certbot edits the `listen 443 ssl;` block in-place. If it corrupts our custom directives, restore from `mcp.openvan.camp.bak.*` and re-run certbot with `--nginx`.
