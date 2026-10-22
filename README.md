# Edworking MCP

[![Edworking MCP on Smithery](https://smithery.ai/badge/david-cagigas/edworking-mcp)](https://smithery.ai/servers/david-cagigas/edworking-mcp)
[![Edworking MCP on Glama](https://glama.ai/mcp/connectors/io.github.Edworking/edworking-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.Edworking/edworking-mcp)

The official, open-source [Edworking](https://edworking.com) MCP server. Connect your assistant to projects, tasks, Docs, conversations and files your account can access.

**Hosted endpoint:** `https://mcp.edworking.com/mcp`

**Public identity:** Edworking MCP. The Railway infrastructure retains the codename **Bellsprout**. Use the custom domain above for all new connections. Connections created against the earlier Railway URL must reconnect because their OAuth resource audience has changed.

**Release:** This branch adds a Figma plugin transport and two frame-link tools to the existing 0.2.0 catalog (24 tools total). Deploy the matching scoped API backend before the MCP server. Docs require new `docs:read` / `docs:write` token permissions and OAuth consent. Existing grants are not expanded automatically.

**Published baseline:** 0.1.4 is available through npm, the Official MCP Registry, Smithery and the Glama hosted connector. OpenAI review was submitted on 13 October 2026 and is pending; it is not yet published in OpenAI. See the [publication checklist](docs/distribution.md) for individual directory statuses.

## Connect

Add the endpoint to an MCP client supporting Streamable HTTP and OAuth. Follow the browser authorization window. Create a dedicated scoped token in **Edworking → Profile → API tokens**, enter it on the Edworking MCP consent page and approve the client and permissions. Never paste a token into an assistant conversation.

Connections request read permissions by default. Writes require the matching OAuth scope and upstream token permission. Reconnect with explicit scopes if your client cannot request additional permissions. Revoke the dedicated token in Edworking to disconnect every grant using it. Grants expire within 30 days or when the Edworking token expires, whichever is sooner. Access tokens last up to ten minutes and refresh tokens rotate.

```sh
codex mcp add edworking-mcp --url https://mcp.edworking.com/mcp
codex mcp login edworking-mcp
```

For ChatGPT testing, use **Plugins → Add custom MCP server**, select OAuth and enter the endpoint. Availability depends on your plan and workspace policy. A portable OpenAI plugin package is in [`plugin/`](plugin). The 0.2.0 package declares six read and five write OAuth scopes, including Docs. The already-submitted OpenAI review package remains a separate 0.1.4 artifact until a new version is submitted. Verify the actual consent screen and `get_connection` result. On 13 October, the submission portal metadata grant used five read scopes, while a separate ChatGPT demo connection received all nine scopes and successfully created a task and sent a message. Existing read-only grants remain read-only until reauthorized; a token with write permissions does not automatically upgrade an OAuth grant.

Other clients should configure a remote HTTP server named `edworking-mcp` and use their built-in OAuth flow. Public clients with PKCE, dynamic registration and HTTPS Client ID Metadata Documents are supported. `/mcp` accepts only Edworking MCP access tokens.

Client setup instructions: [Edworking MCP guide](https://edworking.com/integrations/mcp). See the [competitor review and delivery roadmap](docs/competitive-roadmap.md) for remaining capabilities and launch gates.

After **Allow access** or **Cancel**, the browser returns to your assistant automatically. If it remains on **Returning to your assistant**, use the return button. Each consent request can be used once and expires after ten minutes. If you see `invalid_grant` or an expired/used request, start a new connection from your assistant instead of reopening the old consent link. Do not refresh or resubmit the approval form.

## Tools

| Tool | Scope | Purpose |
| --- | --- | --- |
| `get_connection` | Any connection | Connection name, permissions and expiry |
| `list_projects`, `list_project_statuses`, `list_project_members` | `projects:read` | Projects, valid statuses and existing assignee IDs |
| `list_tasks`, `get_task` | `tasks:read` | Filter tasks by project, status, assignee, priority, title and due dates; read task content |
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

For local stdio, configure your client to run `npx -y @edworking/mcp@0.1.4` with `EDWORKING_API_TOKEN` supplied securely in its process environment, or build from source and run `node /absolute/path/to/edworking-mcp/dist/stdio.js`. The [npm package](https://www.npmjs.com/package/@edworking/mcp) is public. Stdio uses that token directly with Edworking and has in-memory deduplication that resets on restart.

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

See [operations](docs/operations.md), [security](SECURITY.md) and [publication](docs/distribution.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).

## Figma plugin and native Edworking consent

Deploy the matching Venusaur and Charizard changes before enabling this integration, and set `EDWORKING_CONNECT_URL=https://app.edworking.com/settings/integrations?connection=mcp`. Native consent issues a scoped 30-day credential directly to this server using the existing ApiToken model and issuance service, with no new table, column or migration. Users manage it in Profile → API tokens, using the existing revocation and rotation operations and their step-up checks. Rotating the token invalidates the previous connection and requires reconnecting. Manual personal-token creation keeps its existing step-up checks.

The fixed Figma client goes directly to Charizard’s `/connect` page for sign-in, workspace selection and explicit authorization. Its existing browser/nonce-bound handoff then finishes consent and returns through `/connect/result`, without another MCP approval screen. General MCP clients retain their consent flow and configured integration destination. Existing connections must reconnect to grant the seven plugin scopes (projects:read, tasks:read/write, docs:read/write, files:read/write); grants are not expanded silently.

The Edworking Figma plugin, maintained in the `figma/` package of Charizard, uses `/plugin/start`, `/plugin/poll`, `/plugin/refresh`, `/plugin/revoke`, and `/plugin/tool`. This isolated transport permits opaque plugin origins without cookies. It accepts only its fixed OAuth client and a closed subset of the same tools. PKCE binds the browser callback and polling; client credentials never enter a Figma design. General OAuth and MCP origin restrictions are unchanged.

`list_figma_tasks` queries accessible tasks linked to a file or frame. `link_figma_frame` attaches the canonical frame URL to a permitted task. The latter can retry an uncertain response because the upstream serializable transaction is idempotent; task creation retains strict uncertain-write protection. Adding the reciprocal Dev Resource is done in Figma with `addDevResourceAsync`, without Figma REST OAuth.

Plugin-only helpers read account/workspace context, task lists and document folders, append native Figma blocks through the existing collaborative content service, and upload bounded attachment bytes through the existing File storage path. They are excluded from public MCP discovery; its catalog remains 24 tools. `/plugin` accepts up to 12 MB of JSON for an 8 MiB file; the public MCP request limit remains 256 KB. All calls retain upstream identity, workspace and permission checks. Task creation accepts optional Markdown content, priority, assignees, start date and list; document creation accepts an existing authorized folder. Legacy task `description` input remains supported but cannot be combined with `content`.

### Creating from a Figma AI connector

The landing page includes a **Figma / Figma Make** setup guide alongside the other clients. Connect it to `https://mcp.edworking.com/mcp` after deploying the matching API and MCP changes.

The AI connector and the UI plugin are independent clients of this server. The AI uses the existing `create_task` and `create_doc` tools; it does not need the plugin running. Enable writing in the client and authorize the matching Edworking scopes: `tasks:write` for tasks, `docs:write` for Docs. Destination discovery uses `projects:read`. Existing read-only grants are not upgraded automatically.

Both creation tools accept optional `figmaDesigns`: 1–20 objects with an actual HTTPS Figma design/file `url` (including `node-id`) and optional `name`. Resolve the destination project first. If the client cannot supply the design context, ask the user for its link; the server cannot discover the canvas selection. Make app URLs (`/make/...`) are not supported design links.

Example arguments for `create_task` (IDs and URL below are illustrative):

```json
{
  "requestId": "2670c661-04af-45df-b6e2-fb1b4199b2e4",
  "projectId": "project-A",
  "name": "Implement the selected design",
  "content": "Acceptance criteria supplied by the user.",
  "figmaDesigns": [
    { "url": "https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2", "name": "Checkout" }
  ]
}
```

For `create_doc`, use `title` instead of `name`, with an optional existing `folderId`. With `figmaDesigns`, use Markdown `content`, not the legacy task `description`. The combined body and embeds must fit within 20,000 characters. Close Markdown code fences before adding designs; an unclosed fence is rejected before creation (`UNCLOSED_CODE_FENCE`) so it cannot swallow the embeds, and an oversized body returns `CONTENT_TOO_LONG`. File keys must match the existing viewer (22–128 alphanumeric characters). Equivalent design URLs are canonicalized and deduplicated. Both tools append the native `[figma: Name](url)` content format; the plugin sends its selection as `figmaDesigns`, so this server is the only place that builds it. Tasks also link the designs in Resources through the existing scoped API. Docs have no attachment/Resource operation. Task `fileIds` remain real file attachments and require `files:write`; they are never embedded.

As in any task creation, omitted assignees default to the connected user; `[]` leaves the task unassigned. Dates, priority, list and assignees are only supplied when requested; the existing API selects the initial project status when none is specified. Explicit task fields and a Doc folder are preserved. Calls without `figmaDesigns` retain their previous behavior and result shape. Folder/list discovery remains plugin-only; a public MCP client must already have the requested folder/list ID or ask for it.

Figma creation responses add a `figma` result describing the designs and Resource status. If linking fails after task creation, `resources: "pending"` returns the created task and `pendingResources`. Retry the exact original arguments and `requestId` on the same connection within the original 24-hour window to finish linking. The encrypted checkpoint survives hosted-server restarts using the existing SQLite volume and key. Confirmed links are skipped; an uncertain link may be retried because the existing backend upserts it. An uncertain **creation** is still never repeated. If access is revoked while linking, the error names the created task and its unlinked designs; after reconnecting, add them with `link_figma_frame` instead of creating the task again. After expiry, a different connection or a stdio restart, inspect Edworking instead of replaying creation. There is no background retry service.

These calls do not write Dev Resources inside Figma (`backlinkCreated: false`) or register Docs in the plugin's page-local list (`docPageListingUpdated: false`). Those actions still require the plugin runtime. Task Resources can be found with the existing `list_figma_tasks` tool. This MCP-only change adds no tools, OAuth permissions, tables or services; the catalog remains 24 tools and requires the already matching Figma-capable Edworking API. Real Figma connector acceptance testing remains necessary before certifying compatibility.

**Deployment order:** deploy the matching Venusaur API first, then Charizard, then this MCP server, and finally the plugin when its publication requirements are met. Shared project/task/Doc queries now request additional display fields, and create mutations pass new optional arguments. The older API rejects those GraphQL operations even for existing MCP clients. Roll back this MCP version before rolling back that API. The 22 existing public tool names and required inputs are preserved; the two Figma tools are additive. No database migration or additional MCP service is required. Keep the existing server origin, SQLite volume and encryption key.

Figma Make compatibility is not yet certified; no custom connector has been published.
