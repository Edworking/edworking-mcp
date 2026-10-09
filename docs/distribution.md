# Publication checklist

Prepared 2026-10-09. A repository, deployment and directory approval are separate milestones. Never claim a listing without a verified listing URL.

## OpenAI

ZIP the contents of `plugin/` at the archive root and upload to https://platform.openai.com/plugins. It includes one remote MCP server in the initial package.

Before submission:

1. Verify Edworking's business publishing identity and the operator's `api.apps.write` permission. Use an OpenAI project with global data residency; current docs exclude EU-residency projects from MCP review.
2. Choose the final origin, preferably `mcp.edworking.com`, before public review. Changing origin after publication requires a new plugin. Configure DNS, update manifests and `PUBLIC_BASE_URL` together.
3. Set the portal's `OPENAI_DOMAIN_CHALLENGE`, verify ownership, connect through OAuth and scan tools.
4. Create a dedicated reviewer account and synthetic workspace with no external MFA/email/SMS approvals. Provide credentials privately in the portal, never in this repository or ZIP.
5. Run five positive and three negative cases below, record outcomes and supply an accessible demonstration video URL.
6. Add approved brand assets, review privacy/terms with the publisher, provide release notes and complete the portal's policy attestations.

Positive cases: list accessible projects; list Launch project tasks and deadlines; search onboarding task titles and fetch a result with a source link; create one Review proposal task with an explicit project/deadline; read Demo planning messages and send exactly the text requested by the user.

Negative cases: an unspecified message/destination requires clarification; deletion and another tenant's private data must not be accessed; importing a private metadata URL such as `http://169.254.169.254/` must fail without fetching it. Verify denied scopes never execute upstream writes and retries do not duplicate completed mutations.

Native Charizard sign-in and consent is the next onboarding improvement. The initial flow uses a dedicated API token entered on the browser consent page. Never request secrets through chat or tools.

Sources: [package format](https://developers.openai.com/plugins/build/plugins), [submission](https://developers.openai.com/plugins/deploy/submission), [review](https://developers.openai.com/plugins/deploy/app-review), [OAuth](https://developers.openai.com/plugins/build/auth).

## Community

| Destination | Prepared | Remaining action |
| --- | --- | --- |
| Official MCP Registry | `server.json`, source, remote URL | Authenticate ownership of `io.github.Edworking`, validate and publish using https://github.com/modelcontextprotocol/registry |
| Smithery | Remote URL and public server card | Submit at https://smithery.ai and complete ownership/connection checks; https://smithery.ai/docs/build/publish |
| Glama | `glama.json`, README and license | Add the repository at https://glama.ai/mcp/servers; https://glama.ai/mcp/faq |
| PulseMCP | Source, endpoint and description | Submit at https://www.pulsemcp.com/submit |
| Awesome Remote MCP Servers | OAuth endpoint and source | Follow https://github.com/punkpeye/awesome-remote-mcp-servers contribution rules after real-client testing |
| npm | Package and stdio entry point | Authenticate an authorized npm publisher, inspect `npm pack`, then publish |

Listing copy: **Bellsprout by Edworking connects AI assistants to workspace projects, tasks, conversations and files, with scoped OAuth access, source links and safe retries for writes.**

Recommended next work: native consent/workspace selection, real-client evaluation fixtures, uptime alerts, tested backups and independent OAuth review. Expand Venusaur's scoped search/document APIs before adding corresponding tools. Optional MCP Apps task cards can follow; core tools do not require UI widgets. Move to Postgres only when multiple replicas are needed.
