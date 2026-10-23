# Публикация в Official MCP Registry

> ⚠️ **Historical.** Publishing is automated: pushing a `mcp-server-vX.Y.Z` tag runs
> `.github/workflows/release.yml`, which publishes npm, the MCP Registry entry `io.github.openvancamp/openvan-travel`
> and a GitHub Release. The commands below are kept for reference only.

Один раз публикуемся в `registry.modelcontextprotocol.io` — и **PulseMCP** (544 клиента индексируют), **Smithery**, **Glama**, **mcp.so** и прочие каталоги подтягивают нас автоматически в течение ~недели.

## Зачем именно официальный Registry

- PulseMCP **не принимает прямых submission'ов** — только auto-index из Official Registry
- То же касается большинства других крупных каталогов 2026-го года
- Реестр даёт канонический namespace: `io.github.Kopaev/openvan-travel` — так нас однозначно находят все хосты (ChatGPT, Claude, Cursor, Gemini CLI)
- Не требует `npm publish` — мы регистрируемся как **remote server** (есть HTTPS endpoint)

## Что уже готово в репо

- ✅ [`mcp-server/server.json`](../server.json) — registry metadata (валидирована против [официальной схемы](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json))
- ✅ `mcpName` в `package.json` = `io.github.Kopaev/openvan-travel`
- ✅ Публичный HTTPS endpoint `https://mcp.openvan.camp/mcp`
- ✅ Публичный GitHub репо `openvancamp/openvan-camp-public-api` (до 2026-09-28 — `Kopaev/…`, старый адрес редиректит; namespace реестра остаётся `io.github.Kopaev`)

## Что сделать (на твоей Mac, ~10 минут)

### 1. Установить `mcp-publisher` CLI

**macOS (Apple Silicon):**
```bash
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_darwin_arm64.tar.gz" | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/
mcp-publisher --help
```

**macOS (Intel):**
```bash
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_darwin_amd64.tar.gz" | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/
```

### 2. Склонировать публичный репо и перейти в `mcp-server/`

```bash
cd ~
git clone git@github.com:openvancamp/openvan-camp-public-api.git
cd openvan-camp-public-api/mcp-server
cat server.json    # убедись что файл есть
```

### 3. Авторизоваться в реестре через GitHub

```bash
mcp-publisher login github
```

Откроется браузер с device code flow. Войди как **Kopaev** (важно — namespace `io.github.Kopaev` требует авторизации именно под этим юзером GitHub).

### 4. Опубликовать

```bash
mcp-publisher publish
```

Ответ: `Successfully published io.github.Kopaev/openvan-travel v0.2.1`.

### 5. Проверить публикацию

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=openvan-travel" | jq
```

Должен вернуться JSON с нашей записью.

## Что будет после публикации

**Сразу (минуты-часы):**
- Запись доступна через Official Registry API
- Клиенты типа ChatGPT, Claude Desktop, Gemini CLI могут найти нас по имени `io.github.Kopaev/openvan-travel`

**В течение недели:**
- **PulseMCP** (наибольший каталог, 544 клиента) ингестит нашу запись, получим листинг на `pulsemcp.com/servers/io.github.Kopaev/openvan-travel`
- **Smithery** auto-sync
- **Glama**, **mcp.so**, **mcpservers.com** и прочие downstream

**Далее (месяцы):**
- При каждом bump'е `version` в `server.json` → `mcp-publisher publish` — обновление распространяется по всем каталогам автоматически

## Обновление (при релизе новой версии)

```bash
cd ~/openvan-camp-public-api/mcp-server
git pull    # получить свежий server.json из репо
# Убедись что server.json.version обновлён (сейчас 0.2.1 → следующая будет 0.3.0)
mcp-publisher publish
```

## Troubleshooting

| Ошибка | Решение |
|---|---|
| `Registry validation failed for package` | Проверь что `mcpName` в package.json совпадает с `name` в server.json |
| `Invalid or expired Registry JWT token` | Перезапусти `mcp-publisher login github` |
| `Permission denied (namespace)` | Авторизован не под `Kopaev` — выйди через `mcp-publisher logout` и залогинься повторно |
| `Schema validation: name does not match pattern` | Имя должно быть `io.github.<github-user>/<anything>`, без пробелов и подчёркиваний в начале |

## Альтернативный путь (если будешь делать npm publish)

Когда опубликуешь `@openvancamp/mcp-server` в npm, можно дополнить `server.json` блоком `packages`:

```json
"packages": [
  {
    "registryType": "npm",
    "identifier": "@openvancamp/mcp-server",
    "version": "0.2.1",
    "transport": { "type": "stdio" }
  }
]
```

И вызвать `mcp-publisher publish` повторно. Тогда пользователи смогут как подключаться к нашему hosted endpoint (remotes), так и ставить локально через `npx -y @openvancamp/mcp-server` (packages). Оба варианта — одна запись в реестре.

## Полезные ссылки

- Official Registry: https://registry.modelcontextprotocol.io
- Quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- Schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
- PulseMCP ingest policy: https://www.pulsemcp.com/submit
- Releases страница mcp-publisher: https://github.com/modelcontextprotocol/registry/releases
