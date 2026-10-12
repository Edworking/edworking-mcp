# Publication checklist

Updated 2026-10-12. A repository, deployment and directory approval are separate milestones. Never claim a listing without a verified listing URL.

## OpenAI

ZIP the contents of `plugin/` at the archive root and upload to https://platform.openai.com/plugins. It includes one remote MCP server in the initial package.

Current status: the 0.1.4 draft is authorized, the domain is verified, and the latest authenticated metadata scan discovers all 15 tools with no findings. It is **not submitted or published**. The five positive and three negative scenarios still need recorded execution with suitable demo permissions, an MCP-specific walkthrough URL, and final review attestations. A metadata scan is not an independent security audit.

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

| Destination | Verified status | Remaining action |
| --- | --- | --- |
| Official MCP Registry | **Active**, `io.github.Edworking/edworking-mcp` 0.1.4; [public registry response](https://registry.modelcontextprotocol.io/v0.1/servers?search=edworking) | Future versions use the manual `Publish MCP Registry` GitHub Actions workflow on `main`. It validates `server.json` and uses short-lived GitHub OIDC; no registry secret is stored. [Successful publication](https://github.com/Edworking/edworking-mcp/actions/runs/38263590399). |
| Smithery | [Published](https://smithery.ai/servers/david-cagigas/edworking-mcp), 15 tools, **98/100**; DNS ownership and README backlink confirmed | Optional verified badge additionally requires a paid Developer plan. OAuth remains required for workspace access. |
| Glama | Source repository and hosted endpoint forms both explicitly confirm **pending review** | Await approval at https://glama.ai/mcp/servers and https://glama.ai/mcp/connectors; avoid duplicate submissions. |
| PulseMCP | Submissions and listing changes paused; notice dated 2026-09-03 | Its [submission page](https://www.pulsemcp.com/submit) directs publishers to the Official MCP Registry for later discovery. Registry publication is complete; PulseMCP listing is not confirmed. |
| Awesome Remote MCP Servers | Not submitted | First obtain a Glama connector listing and badge. Then propose a README PR at https://github.com/punkpeye/awesome-remote-mcp-servers, following its contribution rules and live handshake checks. |
| Awesome MCP Servers | [PR #16055](https://github.com/punkpeye/awesome-mcp-servers/pull/16055) open and unmerged, labeled `missing-glama` | Add the approved Glama listing and passing introspection badge when available. |
| npm | [@edworking/mcp 0.1.4](https://www.npmjs.com/package/@edworking/mcp) is public | Publishing requires 2FA; bypass-2FA tokens are disallowed. Inspect the package and authenticate each future release. |

Listing copy: **Edworking MCP connects AI assistants to your projects, tasks, conversations and files. Read workspace context and take requested actions with scoped OAuth access and links back to Edworking.**

Repository: https://github.com/Edworking/edworking-mcp. Website: https://mcp.edworking.com. Endpoint: https://mcp.edworking.com/mcp. Public name: **Edworking MCP**. Infrastructure codename: **Bellsprout**. Only the destinations explicitly marked published above are live listings.

Recommended next work: native consent/workspace selection, real-client evaluation fixtures, uptime alerts, tested backups and independent OAuth review. Expand Venusaur's scoped search/document APIs before adding corresponding tools. Optional MCP Apps task cards can follow; core tools do not require UI widgets. Move to Postgres only when multiple replicas are needed.
