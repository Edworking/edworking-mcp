# Edworking MCP: competitor review and delivery roadmap

Reviewed 9 October 2026. This is a delivery plan, not a claim of feature parity or client certification. Product capabilities and client requirements can change.

## What MCP does

An assistant application acts as an MCP client. It discovers tool schemas and sends authenticated tool calls to our hosted server. The server enforces permissions, calls Edworking's API and returns results. Instructions can guide the assistant; they cannot perform those API operations by themselves. MCP also supports prompts and resources, but our current implementation exposes tools.

`Person → ChatGPT / Claude / Codex → Edworking MCP → Edworking API → workspace`

One hosted service serves many separately authorized connections. Customers do not deploy a server. We could implement the MCP endpoint within Venusaur instead of a separate Railway service; the server functionality would still exist. No model inference or OpenAI API key is required by this MCP server. See the [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture).

## Comparison

| Product | Useful reference | Implication for Edworking |
| --- | --- | --- |
| ClickUp | Broad task editing, bulk operations, docs, time tracking, relationships and workspace search; browser OAuth and many documented clients. | Main functional benchmark. Our 15 tools cover projects, basic tasks, messages and files, but do not provide parity. |
| Linear | Remote OAuth with PKCE and a dedicated read-only endpoint. | Make a connection's permissions and available tool set easy to understand; consider a separate read-only catalog. |
| Notion | Search and content creation/editing, connection administration and complementary skills. | Prioritize readable/editable Edworking Docs and richer discovery; add useful workflows as a separate skill layer. |
| Asana | Rich work-management tools and interactive confirmation interfaces in supported clients. | Improve task operations, administrative control and confirmations for consequential writes. |

Sources: [ClickUp setup](https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server-1), [ClickUp tools](https://developer.clickup.com/docs/mcp-tools), [Linear](https://linear.app/docs/mcp), [Notion](https://developers.notion.com/guides/mcp/overview), [Asana tools](https://developers.asana.com/docs/mcp-tools-reference).

ClickUp's overview says deletion is unavailable while its tool reference lists deletion operations. Treat that part as unresolved documentation, not a capability to promise or copy. Feature equivalence should follow Edworking's own data model; ClickUp-only concepts are not automatically requirements.

## Current Edworking boundaries

- Hosted Streamable HTTP; OAuth authorization code flow, PKCE S256, dynamic registration and HTTPS client metadata; local stdio is also available.
- Fifteen tools. Task edits currently change only name and deadline. Creation supports an initial status, but there is no status-change tool, reassignment or editing existing descriptions.
- Search scans up to 500 recently updated task titles and returns at most 50 matches. It is not full-text search across the workspace, documents or messages.
- File operations list metadata and import public HTTPS URLs; they do not read arbitrary file contents.
- Browser authorization currently asks for a dedicated scoped Edworking API token. Native Edworking sign-in without manual token entry has not shipped.
- Setup guides cover ClickUp's documented client families plus Codex. Protocol tests are automated; account-level OAuth and tool operations still need validation in each client, including Copilot Studio's registration requirements.

## Ordered delivery plan

### 1. Finish real-world connection validation

Test ChatGPT, Codex, Claude and Cursor first, then every remaining documented client. Record client/version, plan, registration method, requested scopes, successful reads, confirmed writes, denial and reconnection. Verify two users in two isolated workspaces cannot cross access boundaries. Test upstream token expiry/revocation, scope reduction, refresh reuse and server restart. Resolve client-specific incompatibilities before claiming support.

### 2. Native Edworking authorization

Implement the authenticated Edworking connection screen and scoped authorization handoff. Show the client, destination, workspace, exact permissions and expiry. Add a connected-apps view with per-connection revocation. Keep credentials out of assistant chat and URLs. Enable the existing native handoff only after deployed end-to-end tests pass.

### 3. Most valuable functional parity

Extend the scoped Edworking API first, with authorization tests for each operation. Then expose MCP tools for task status, assignees, description, priority and supported custom fields; Docs read/create/edit; workspace search with pagination, filters and citations. Preserve explicit scopes, tool annotations, input validation and retry protections. Publish a tool-by-tool capability table and examples tied to actual API behavior.

### 4. Advanced work management

Add supported task relationships, dependencies, subtasks, tags, richer comments and bulk operations. Add timers/time entries only if the Edworking product and scoped API support them. Give bulk writes bounded sizes, per-item results and clear retry semantics. Treat deletion and invitations as separate, explicitly reviewed capabilities.

### 5. Public launch and operations

Complete independent security review, backups plus a restore drill, uptime/error alerts and abuse controls. Enable required CI and private vulnerability reporting. Validate the OpenAI submission with real-account examples before submitting; publish registry and community listings against the same stable endpoint. Keep a public changelog, supported-client matrix, known limitations, privacy/support links and incident contact.

### 6. Helpful additions

Add reusable skills for stand-ups, project summaries and task planning. Skills explain workflows while MCP executes authorized operations. Consider interactive previews for batch edits, tenant-aware quotas, a dedicated read-only catalog, and a searchable public tool reference. Public directories improve discovery; they do not certify security or guarantee client compatibility.

## Security conclusion

No service can be described as completely secure. Current controls reduce specific risks but are not an independent audit. Manual onboarding, real-client validation and the operational steps above remain launch gates. See [SECURITY.md](../SECURITY.md) and [distribution steps](distribution.md).
