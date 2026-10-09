# Edworking MCP

The official, open-source [Edworking](https://edworking.com) MCP server. Connect your assistant to projects, tasks, conversations and files your account can access.

**Hosted endpoint:** `https://mcp.edworking.com/mcp`

**Public identity:** Edworking MCP. The Railway infrastructure retains the codename **Bellsprout**. Use the custom domain above for all new connections. Connections created against the earlier Railway URL must reconnect because their OAuth resource audience has changed.

**Status:** initial release. Deployment does not imply OpenAI or directory approval. See [publication checklist](docs/distribution.md).

## Connect

Add the endpoint to an MCP client supporting Streamable HTTP and OAuth. Follow the browser authorization window. Create a dedicated scoped token in **Edworking → Profile → API tokens**, enter it on the Edworking MCP consent page and approve the client and permissions. Never paste a token into an assistant conversation.

Connections request read permissions by default. Writes require the matching OAuth scope and upstream token permission. Reconnect with explicit scopes if your client cannot request additional permissions. Revoke the dedicated token in Edworking to disconnect every grant using it. Grants expire within 30 days or when the Edworking token expires, whichever is sooner. Access tokens last up to ten minutes and refresh tokens rotate.

```sh
codex mcp add edworking-mcp --url https://mcp.edworking.com/mcp
codex mcp login edworking-mcp
```

For ChatGPT testing, use **Plugins → Add custom MCP server**, select OAuth and enter the endpoint. Availability depends on your plan and workspace policy. A portable OpenAI plugin package is in [`plugin/`](plugin).

Other clients should configure a remote HTTP server named `edworking-mcp` and use their built-in OAuth flow. Public clients with PKCE, dynamic registration and HTTPS Client ID Metadata Documents are supported. `/mcp` accepts only Edworking MCP access tokens.

Client setup instructions: [Edworking MCP guide](https://edworking.com/integrations/mcp). See the [competitor review and delivery roadmap](docs/competitive-roadmap.md) for remaining capabilities and launch gates.

## Tools

| Tool | Scope | Purpose |
| --- | --- | --- |
| `get_connection` | Any connection | Connection name, permissions and expiry |
| `list_projects`, `list_project_statuses` | `projects:read` | Projects and creation status IDs |
| `list_tasks`, `get_task` | `tasks:read` | Task metadata, deadlines, assignees and links |
| `search`, `fetch` | `tasks:read` | Bounded task-title search and retrieval |
| `list_conversations` | `chats:read` | Existing private conversations |
| `read_messages` | `messages:read` | Accessible conversation messages |
| `list_files` | `files:read` | File metadata |
| `create_task`, `update_task` | `tasks:write` | Create tasks; edit names and deadlines |
| `send_message` | `messages:write` | Send the user's specified message |
| `create_project` | `projects:write` | Create a project |
| `upload_file` | `files:write` | Import a public HTTPS file |

Attaching files to tasks also requires `files:write`. Lists use cursors and at most 100 items per page; keep ordering and filters unchanged while paging. Search scans at most 500 recently updated tasks and returns at most 50 matches, with explicit coverage information. Task document bodies, full-text workspace search, status changes, reassignment, deletion and invitations are not supported by the scoped API.

Writes require a UUID `requestId`; reuse it with unchanged arguments on retries. Completed results are encrypted and cached for 24 hours. An uncertain result is never repeated automatically: inspect Edworking before deciding what to do. This is not an upstream exactly-once transaction. Deduplication expires after 24 hours.

## Development

Use Node 24 LTS (minimum 22.19). No OpenAI API key is needed.

```sh
npm ci
cp .env.example .env
# Generate a key and save it as TOKEN_ENCRYPTION_KEY in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run build
node --env-file=.env dist/index.js
```

Run `npm run check` for type checking, security/integration tests and build. `npm run dev` starts a watcher when variables are already loaded by your shell.

For local stdio, build and configure your client to run `node /absolute/path/to/edworking-mcp/dist/stdio.js` with `EDWORKING_API_TOKEN` supplied securely in its process environment. Stdio uses that token directly with Edworking and has in-memory deduplication that resets on restart. The npm package name in this manifest is not a claim that the package has been published.

## Railway deployment

Use the included Dockerfile, attach a volume at `/data`, and set:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `PUBLIC_BASE_URL` | Stable public HTTPS origin, without `/mcp` |
| `DATABASE_PATH` | `/data/bellsprout.sqlite` |
| `TOKEN_ENCRYPTION_KEY` | Random 32-byte key encoded as 64 hex characters |
| `EDWORKING_API_URL` | `https://venusaur.edworking.com/` |
| `EDWORKING_APP_URL` | `https://app.edworking.com` |

Keep one replica, sleeping off and deployment overlap zero. `/healthz` checks the process and `/readyz` checks SQLite. Preserve the key across deployments. Optional `ALLOWED_ORIGINS` adds exact browser origins, `OPENAI_DOMAIN_CHALLENGE` serves the OpenAI verification value, and `EDWORKING_CONNECT_URL` enables a native Edworking connection page only after that page has shipped.

See [operations](docs/operations.md), [security](SECURITY.md) and [publication](docs/distribution.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
