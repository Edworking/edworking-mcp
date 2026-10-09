# Publication checklist

Prepared 2026-10-09. A repository, deployment and directory approval are separate milestones. Never claim a listing without a verified listing URL.

## OpenAI

ZIP the contents of `plugin/` at the archive root and upload to https://platform.openai.com/plugins. It includes one remote MCP server in the initial package.

Before submission:

1. Verify Edworking's business publishing identity. The submitter must be an organization owner or have Apps Management Write.
2. Activate `mcp.edworking.com` and verify OAuth before review. OpenAI's current update flow does not support MCP URL changes; later changes require contacting support.
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
| Official MCP Registry | `server.json`, source, remote URL | Follow https://modelcontextprotocol.io/registry/quickstart; authenticate ownership of `io.github.Edworking`, then run `mcp-publisher publish`. Remote-only servers do not need an npm release. |
| Smithery | Remote URL and public server card | Submit `https://mcp.edworking.com/mcp` at https://smithery.ai/new and complete OAuth/ownership checks; https://smithery.ai/docs/build/publish |
| Glama | `glama.json`, README and license | Add the repository at https://glama.ai/mcp/servers and the hosted service at https://glama.ai/mcp/connectors; complete ownership checks |
| PulseMCP | Source, endpoint and description | Submit at https://www.pulsemcp.com/submit |
| Awesome Remote MCP Servers | OAuth endpoint and source | First obtain a Glama connector listing and badge. Then propose a README PR at https://github.com/punkpeye/awesome-remote-mcp-servers, following its contribution rules and live handshake checks |
| Awesome MCP Servers | Public source and setup guide | Propose a listing PR at https://github.com/punkpeye/awesome-mcp-servers following its contribution rules |
| npm | Package and stdio entry point | Authenticate an authorized npm publisher, inspect `npm pack`, then publish |

Listing copy: **Edworking MCP connects AI assistants to your projects, tasks, conversations and files. Read workspace context and take requested actions with scoped OAuth access and links back to Edworking.**

Repository: https://github.com/Edworking/edworking-mcp. Website: https://mcp.edworking.com. Endpoint: https://mcp.edworking.com/mcp. Public name: **Edworking MCP**. Infrastructure codename: **Bellsprout**. Metadata is prepared; directory publication has not been completed.

Recommended next work: native consent/workspace selection, real-client evaluation fixtures, uptime alerts, tested backups and independent OAuth review. Expand Venusaur's scoped search/document APIs before adding corresponding tools. Optional MCP Apps task cards can follow; core tools do not require UI widgets. Move to Postgres only when multiple replicas are needed.
