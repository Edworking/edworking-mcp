# Publication checklist

Updated 2026-10-13. A repository, deployment and directory approval are separate milestones. Never claim a listing without a verified listing URL.

## OpenAI

ZIP the contents of `plugin/` at the archive root and upload to https://platform.openai.com/plugins. It includes one remote MCP server in the initial package.

Current status: **submitted on 13 October 2026; In review / Pending review, not published**. The portal labels the review version 1.0.0; the uploaded plugin manifest is 0.1.4. Domain verification and the authenticated metadata scan are complete, with all 15 tools discovered and no scan findings. Five positive and three revised negative scenarios were checked in ChatGPT using the dedicated sample workspace. Private reviewer instructions and an [83-second MCP walkthrough](https://github.com/Edworking/edworking-mcp/raw/632f8a959ebc6470fce3a6a37627b8f0e05899c5/docs/edworking-mcp-chatgpt-walkthrough-2026-10-13.mp4) were supplied, and the publisher confirmed all six final attestations. Await the review decision and keep the reviewer credentials and sample workspace available. These bounded tests and the metadata scan are not an independent security audit.

Release checklist (completed for this submission; repeat as applicable for future releases):

1. Verify Edworking's business publishing identity. The submitter must be an organization owner or have Apps Management Write.
2. Activate `mcp.edworking.com` and verify OAuth before review. OpenAI's current update flow does not support MCP URL changes; later changes require contacting support.
3. Set the portal's `OPENAI_DOMAIN_CHALLENGE`, verify ownership, connect through OAuth and scan tools.
4. Create a dedicated reviewer account and synthetic workspace with no external MFA/email/SMS approvals. Provide credentials privately in the portal, never in this repository or ZIP.
5. Run five positive and three negative cases below, record outcomes and supply an accessible demonstration video URL.
6. Add approved brand assets, review privacy/terms with the publisher, provide release notes and complete the portal's policy attestations.

Positive cases: list accessible projects; list Launch project tasks and deadlines; search onboarding task titles and fetch the named sample result with a source link; create one Review the proposal task with an explicit project/deadline; read the owner-only Launch project conversation and send exactly the text requested by the user.

The OpenAI package declares CIMD OAuth with explicit read/write base scopes. The hosted discovery endpoint continues to default to read access for other clients. Reauthorize the demo connection and verify its granted scopes with `get_connection` before running write cases. The private reviewer instructions contain a ready-to-use dedicated token; do not require reviewers to create credentials themselves.

On 13 October the submission portal metadata connection requested five read scopes. A separate personal ChatGPT demo connection requested and received all nine scopes. Its task creation and message sending scenarios succeeded, and read-back confirmed one task and one message. Metadata scanning and user-facing ChatGPT execution are separate grants; verify the grant used by each client. An initially ambiguous message prompt reused prior chat context; its proposed send was denied before execution, and the revised missing-context case was tested in a fresh chat.

Negative cases: an unspecified message/destination requires clarification; deletion and another tenant's private data must not be accessed; importing a private metadata URL such as `http://169.254.169.254/` must fail without fetching it. Verify denied scopes never execute upstream writes and retries do not duplicate completed mutations.

Native Charizard sign-in and consent is the next onboarding improvement. The initial flow uses a dedicated API token entered on the browser consent page. Never request secrets through chat or tools.

Sources: [package format](https://developers.openai.com/plugins/build/plugins), [submission](https://developers.openai.com/plugins/deploy/submission), [review](https://developers.openai.com/plugins/deploy/app-review), [OAuth](https://developers.openai.com/plugins/build/auth).

## Community

| Destination | Verified status | Remaining action |
| --- | --- | --- |
| Official MCP Registry | **Active**, `io.github.Edworking/edworking-mcp` 0.1.4; [public registry response](https://registry.modelcontextprotocol.io/v0.1/servers?search=edworking) | Future versions use the manual `Publish MCP Registry` GitHub Actions workflow on `main`. It validates `server.json` and uses short-lived GitHub OIDC; no registry secret is stored. [Successful publication](https://github.com/Edworking/edworking-mcp/actions/runs/38263590399). |
| Smithery | [Published](https://smithery.ai/servers/david-cagigas/edworking-mcp), 15 tools, **98/100**; DNS ownership and README backlink confirmed | Optional verified badge additionally requires a paid Developer plan. OAuth remains required for workspace access. |
| Glama | [Hosted connector](https://glama.ai/mcp/connectors/io.github.Edworking/edworking-mcp) is **public and healthy**, ownership verified, OAuth authenticated and 15 tools discovered on 13 October | DNS claim completed; logo, categories, support contact and publisher profile added. Tool-quality scoring is queued. The source repository submission is separately **pending review**, confirmed by the submission form on 13 October. After approval, provide the Dockerfile through Glama and pass its introspection checks. |
| PulseMCP | Submissions and listing changes paused; notice dated 2026-09-03 | Its [submission page](https://www.pulsemcp.com/submit) directs publishers to the Official MCP Registry for later discovery. Registry publication is complete; PulseMCP listing is not confirmed. |
| Awesome Remote MCP Servers | [PR #1735](https://github.com/punkpeye/awesome-remote-mcp-servers/pull/1735) submitted on 13 October | Includes the hosted OAuth endpoint, Glama connector badge and alphabetical Project Management entry. Automated submission check passed with `endpoint-ok` and `has-connector`; awaiting maintainer review. Submission is not listing approval. |
| Awesome MCP Servers | [PR #16055](https://github.com/punkpeye/awesome-mcp-servers/pull/16055) open and unmerged, labeled `missing-glama` | Add the approved Glama listing and passing introspection badge when available. |
| npm | [@edworking/mcp 0.1.4](https://www.npmjs.com/package/@edworking/mcp) is public | Publishing requires 2FA; bypass-2FA tokens are disallowed. Inspect the package and authenticate each future release. |

Listing copy: **Edworking MCP connects AI assistants to your projects, tasks, conversations and files. Read workspace context and take requested actions with scoped OAuth access and links back to Edworking.**

Repository: https://github.com/Edworking/edworking-mcp. Website: https://mcp.edworking.com. Endpoint: https://mcp.edworking.com/mcp. Public name: **Edworking MCP**. Infrastructure codename: **Bellsprout**. Only the destinations explicitly marked published above are live listings.

Recommended next work: native consent/workspace selection, real-client evaluation fixtures, uptime alerts, tested backups and independent OAuth review. Expand Venusaur's scoped search/document APIs before adding corresponding tools. Optional MCP Apps task cards can follow; core tools do not require UI widgets. Move to Postgres only when multiple replicas are needed.
