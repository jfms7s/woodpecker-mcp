# woodpecker-mcp

An MCP server for [Woodpecker CI](https://woodpecker-ci.org) (built against v3.19). It lets an LLM client read pipelines, steps, logs and pipeline config, and start, restart, cancel, approve, decline and release pipelines.

**Important:** every connected client can start, cancel and release pipelines. Releases are gated: `woodpecker_start_release`, and a restart of a pipeline that carried `RELEASE_TAG`, only preview unless called with `confirm=true`. Give the server a token from a **dedicated, non-admin Woodpecker user** (see [Identity](#identity)), never an admin's token.

## Tools

| Tool | What it does |
|---|---|
| `woodpecker_list_repos` | Repos the token's user can see, with default branch and last pipeline. |
| `woodpecker_list_pipelines` | A repo's pipelines, newest first; filter by branch, event or status. |
| `woodpecker_get_pipeline` | One pipeline (or `"latest"`) with workflows and steps; failures first. |
| `woodpecker_get_step_logs` | A step's log: last 200 lines by default, `grep`, `from_line`/`to_line`; capped at 1000 lines / 50,000 characters. |
| `woodpecker_get_pipeline_config` | The YAML a pipeline ran with. |
| `woodpecker_start_pipeline` | Manual run on a branch head, no variables. |
| `woodpecker_restart_pipeline` | Re-run a pipeline; release pipelines need `confirm=true`. |
| `woodpecker_cancel_pipeline` | Cancel a pending or running pipeline. |
| `woodpecker_approve_pipeline` / `woodpecker_decline_pipeline` | Act on a pipeline waiting for approval. |
| `woodpecker_start_release` | Manual run on the default branch with `RELEASE_TAG=vX.Y.Z`; previews unless `confirm=true`. |

`repo` is always `owner/name` or a numeric Woodpecker repo id.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `WOODPECKER_URL` | yes | Base URL of the Woodpecker server, e.g. `http://woodpecker-server.woodpecker.svc.cluster.local`. |
| `WOODPECKER_TOKEN` | yes | Personal access token of the Woodpecker user the server acts as. |
| `WOODPECKER_MCP_TRANSPORT` | no | `stdio` (default), `http` or `both`. The image sets `http`. |
| `WOODPECKER_MCP_PORT` | no | HTTP port, default `3000`. |
| `WOODPECKER_MCP_TOKEN` | for `http`/`both` | Bearer token MCP clients must send. |

The HTTP transport serves MCP at `/mcp` (bearer auth) and an unauthenticated `/healthz` for probes.

## Identity

Woodpecker personal tokens have no scopes: a token can do whatever its user can. Use a separate forge account with **Write** access on the repos (Woodpecker then grants it push, which every tool here needs) and no admin rights. With `WOODPECKER_OPEN=false`, an admin adds that user in Woodpecker first. Then log in as it once and create its token under user settings.

## Run

```bash
docker run --rm -p 3000:3000 \
  -e WOODPECKER_URL=https://ci.example.com \
  -e WOODPECKER_TOKEN=bot-user-token \
  -e WOODPECKER_MCP_TOKEN=a-long-random-secret \
  ghcr.io/jfms7s/woodpecker-mcp:v0.1.0
```

Claude Code (`~/.claude.json`, `mcpServers`):

```json
"woodpecker": {
  "type": "http",
  "url": "https://woodpecker-mcp.example.com/mcp",
  "headers": { "Authorization": "Bearer a-long-random-secret" }
}
```

## Development

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Tests mock all HTTP with msw; no Woodpecker server is needed.
