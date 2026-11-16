# Edworking MCP

[![Edworking MCP on Glama](https://glama.ai/mcp/connectors/io.github.Edworking/edworking-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.Edworking/edworking-mcp)

The official, open-source [Edworking](https://edworking.com) MCP server. Connect Claude, ChatGPT, Cursor and other AI assistants to the projects, tasks, Docs, conversations and files your Edworking account can access. Your assistant answers from your live workspace, with links back to Edworking, and takes the next step when you ask.

- **Server URL:** `https://mcp.edworking.com/mcp`, hosted by Edworking (Streamable HTTP with OAuth)
- **Setup guide:** [edworking.com/integrations/mcp](https://edworking.com/integrations/mcp)
- **Privacy:** [mcp.edworking.com/privacy](https://mcp.edworking.com/privacy) · **Terms:** [mcp.edworking.com/terms](https://mcp.edworking.com/terms)

## What you can do

- **Find the work:** browse projects, statuses, members and filtered tasks. Search indexed tasks, Docs, files and project messages, and open a result with its link.
- **Move tasks forward:** create projects and tasks, update a task's name, status, priority, assignees, start date and deadline, and make targeted edits to task descriptions.
- **Write Docs:** create, read and rename Docs, and make targeted Markdown edits.
- **Follow up in conversations:** read accessible conversations and send the message you ask for to a specific one.
- **Files and designs:** list file details, import a public HTTPS file, add Figma designs to new tasks and Docs, link a frame to a task, and find the tasks linked to a Figma file.

Try asking:

- "What's overdue in the Launch project, and who owns each task?"
- "Find where we discussed onboarding pricing and summarize it with links."
- "Create tasks in Launch from these meeting notes and set Friday deadlines."
- "Read the latest messages in the planning conversation and summarize the decisions."

Deleting projects, tasks or Docs, inviting people and changing sharing are not available.

## Connect

Add `https://mcp.edworking.com/mcp` to your assistant as a remote MCP server and start its OAuth connection. On the authorization page, choose **Continue in Edworking** and sign in. Pick your workspace, review the assistant, its destination and the permissions, then choose **Allow access**. Edworking creates a scoped token for the connection, named after your assistant, that expires within 30 days.

If you can't use Edworking sign-in, create a dedicated token in **Edworking → Profile → API tokens** and enter it only on the authorization page. Never paste a token into an assistant conversation or client configuration.

| Assistant | Setup |
| --- | --- |
| Claude | **Settings → Connectors**, add a custom connector with the server URL. Choose **Sign in now** and **Use Claude's published identity**, and leave request headers empty. No client secret is needed. |
| Claude Code | `claude mcp add --transport http edworking https://mcp.edworking.com/mcp`, then run `/mcp` to authorize. |
| ChatGPT | **Plugins → Add custom MCP server**, with OAuth and the server URL. Availability depends on your plan and workspace policy. |
| Codex | `codex mcp add edworking --url https://mcp.edworking.com/mcp`, then `codex mcp login edworking`. |
| Cursor, VS Code, Windsurf and others | Add a remote HTTP server named `edworking` with the server URL. The [setup guide](https://edworking.com/integrations/mcp) has each client's configuration. |

Clients authenticate as public OAuth clients with PKCE S256, using dynamic registration or an HTTPS Client ID Metadata Document. For Claude's published identity, Edworking negotiates only the authorization-code and refresh-token grants. `/mcp` accepts only Edworking MCP access tokens.

### Permissions

New connections request all 11 supported read and write permissions by default, enabling the full 24-tool catalog after approval. The authorization screen lists each permission before you connect. Writes still require the matching OAuth scope and upstream token permission. Clients can request a smaller scope set, including read-only access; explicit requests are never expanded. Existing read-only connections must disconnect and reconnect to approve writes. If a client retains an explicit read-only scope list, update that list to include the required write scopes before reconnecting. Refreshing a token does not add permissions. Revoke the connection's token in Edworking to disconnect every grant using it. Grants expire within 30 days or when the Edworking token expires, whichever is sooner. Access tokens last up to ten minutes and refresh tokens rotate.

### Troubleshooting

After **Allow access** or **Cancel**, the browser returns to your assistant automatically. If it remains on **Returning to your assistant**, use the return button. Each consent request can be used once and expires after ten minutes. If you see `invalid_grant` or an expired/used request, start a new connection from your assistant instead of reopening the old consent link. Do not refresh or resubmit the approval form.

## Tools

| Tool | Scope | Purpose |
| --- | --- | --- |
| `get_connection` | Any connection | Connection name, permissions and expiry |
| `list_projects`, `list_project_statuses`, `list_project_members` | `projects:read` | Projects, valid statuses and existing assignee IDs |
| `list_tasks`, `get_task` | `tasks:read` | Filter tasks by project, status, assignee, priority, title and due dates; read task content |
| `list_figma_tasks` | `tasks:read` | Find accessible tasks linked to a Figma file or frame |
| `link_figma_frame` | `tasks:write` | Link a Figma frame to an accessible task |
| `search`, `fetch` | Per-source read scope | Indexed tasks, Docs, files and project messages; typed result retrieval |
| `list_docs`, `get_doc` | `docs:read` | Find Docs and read their Markdown content |
| `create_doc`, `update_doc`, `edit_doc_content` | `docs:write`; body edits also need `docs:read` | Create, rename and edit Docs |
| `list_conversations` | `chats:read` | Existing private conversations |
| `read_messages` | `messages:read` | Accessible conversation messages |
| `list_files` | `files:read` | File metadata |
| `create_task`, `update_task`, `edit_task_content` | `tasks:write`; body edits also need `tasks:read` | Create tasks; edit name, status, priority, assignees, dates and description |
| `send_message` | `messages:write` | Send the user's specified message |
| `create_project` | `projects:write` | Create a project |
| `upload_file` | `files:write` | Import a public HTTPS file |

Attaching files to tasks also requires `files:write`. Lists use cursors and at most 100 items per page; keep ordering and filters unchanged while paging. Search uses the workspace index and returns up to 20 ranked results per permitted source. It rechecks live access, deletion state and message-history limits before exposing snippets. Indexing may lag; unavailable sources are reported, and private chats and projectless items are excluded. Use filtered lists for exhaustive task discovery. File fetches return metadata, not file contents.

Read a task or Doc before editing its body. Content reads are capped at 20,000 characters and expose block handles; targeted edits reuse the collaboration service and version history. Large removals require explicit `allowRemoval`. A task assignee list replaces the current list: omit it to preserve, or use `[]` to unassign. Assignees must already belong to the project and workspace. Deletion, invitations, task moves and sharing changes are not exposed.

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

For local stdio, configure your client to run `npx -y @edworking/mcp` with `EDWORKING_API_TOKEN` supplied securely in its process environment, or build from source and run `node /absolute/path/to/edworking-mcp/dist/stdio.js`. The [npm package](https://www.npmjs.com/package/@edworking/mcp) is public. Stdio uses that token directly with Edworking and has in-memory deduplication that resets on restart.

## Railway deployment

Use the included Dockerfile, attach a volume at `/data`, and set:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `PUBLIC_BASE_URL` | Stable public HTTPS origin, without `/mcp` |
| `DATABASE_PATH` | `/data/bellsprout.sqlite` |
| `TOKEN_ENCRYPTION_KEY` | Random 32-byte key encoded as 64 hex characters |
| `EDWORKING_API_URL` | `https://gateway.edworking.com/` |
| `EDWORKING_APP_URL` | `https://app.edworking.com` |

Keep one replica, sleeping off and deployment overlap zero. `/healthz` checks the process and `/readyz` checks SQLite. Preserve the key across deployments. Optional `ALLOWED_ORIGINS` adds exact browser origins, `OPENAI_DOMAIN_CHALLENGE` serves the OpenAI verification value, and `EDWORKING_CONNECT_URL` enables a native Edworking connection page only after that page has shipped.

## Figma

The Edworking Figma plugin and Figma's AI connectors also use this server. The plugin transport, native consent, the `figmaDesigns` input, retry behavior and deployment order are in [docs/figma.md](docs/figma.md). The [server page](https://mcp.edworking.com/#clients) has Figma / Figma Make connector steps.

## More

- [Operations](docs/operations.md), [security](SECURITY.md), [publication status](docs/distribution.md), [roadmap](docs/competitive-roadmap.md) and [changelog](CHANGELOG.md)
- Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
