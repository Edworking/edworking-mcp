# Figma integration

How the Edworking Figma plugin and Figma AI connectors use Edworking MCP: the plugin transport, native consent, design-aware creation, retries and deployment order.

## Figma plugin and native Edworking consent

Deploy the matching Venusaur and Charizard changes before enabling this integration, and set `EDWORKING_CONNECT_URL=https://app.edworking.com/settings/integrations?connection=mcp`. Native consent issues a scoped 30-day credential directly to this server using the existing ApiToken model and issuance service, with no new table, column or migration. Users manage it in Profile → API tokens, using the existing revocation and rotation operations and their step-up checks. Rotating the token invalidates the previous connection and requires reconnecting. Manual personal-token creation keeps its existing step-up checks.

The fixed Figma client goes directly to Charizard’s `/connect` page for sign-in, workspace selection and explicit authorization. Its existing browser/nonce-bound handoff then finishes consent and returns through `/connect/result`, without another MCP approval screen. General MCP clients retain their consent flow and configured integration destination. Existing connections must reconnect to grant the seven plugin scopes (projects:read, tasks:read/write, docs:read/write, files:read/write); grants are not expanded silently.

The Edworking Figma plugin, maintained in the `figma/` package of Charizard, uses `/plugin/start`, `/plugin/poll`, `/plugin/refresh`, `/plugin/revoke`, and `/plugin/tool`. This isolated transport permits opaque plugin origins without cookies. It accepts only its fixed OAuth client and a closed subset of the same tools. PKCE binds the browser callback and polling; client credentials never enter a Figma design. General OAuth and MCP origin restrictions are unchanged.

`list_figma_tasks` queries accessible tasks linked to a file or frame. `link_figma_frame` attaches the canonical frame URL to a permitted task. The latter can retry an uncertain response because the upstream serializable transaction is idempotent; task creation retains strict uncertain-write protection. Adding the reciprocal Dev Resource is done in Figma with `addDevResourceAsync`, without Figma REST OAuth.

Plugin-only helpers read account/workspace context, task lists and document folders, append native Figma blocks through the existing collaborative content service, and upload bounded attachment bytes through the existing File storage path. They are excluded from public MCP discovery; its catalog remains 24 tools. `/plugin` accepts up to 12 MB of JSON for an 8 MiB file; the public MCP request limit remains 256 KB. All calls retain upstream identity, workspace and permission checks. Task creation accepts optional Markdown content, priority, assignees, start date and list; document creation accepts an existing authorized folder. Legacy task `description` input remains supported but cannot be combined with `content`.

## Creating from a Figma AI connector

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
