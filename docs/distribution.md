# Publication checklist

Release preparation updated 2026-11-05. Directory statuses below retain their original verification dates unless explicitly updated. A repository, deployment and directory approval are separate milestones. Never claim a listing without a verified listing URL.

## OpenAI

ZIP the contents of `plugin/` at the archive root and upload to https://platform.openai.com/plugins. It includes one remote MCP server in the initial package.

Verified 5 November 2026: metadata version **0.3.0 is In review / Not published**. The publisher explicitly affirmed all six portal legal and policy attestations, the submission completed, and the version's detail page confirms **In review**. The earlier portal upload error is resolved; the uploaded metadata had **no findings**. The authenticated scan discovers all **24 tools** with no scan findings, and domain verification remains complete. The submitted ZIP uses display name **Edworking**, keeps stable package name `edworking-mcp`, updates the capability description and includes release notes. The private review context distinguishes the fresh signed-in native OAuth/read smoke test from the historical October scenarios and uncertified Figma compatibility. Approval and publication remain pending OpenAI's review.

Historical validation on 13 October used five positive and three negative scenarios in a dedicated sample workspace, private reviewer instructions and an [83-second walkthrough](https://github.com/Edworking/edworking-mcp/raw/632f8a959ebc6470fce3a6a37627b8f0e05899c5/docs/edworking-mcp-chatgpt-walkthrough-2026-10-13.mp4). This is not a fresh acceptance test of the Figma features. Repeat relevant real-client cases before submitting, preserve reviewer access, and complete the current attestations. Metadata scanning and unit tests are not an independent security audit.

Release checklist (repeat for the new submission):

1. Verify Edworking's business publishing identity. The submitter must be an organization owner or have Apps Management Write.
2. Activate `mcp.edworking.com` and verify OAuth before review. OpenAI's current update flow does not support MCP URL changes; later changes require contacting support.
3. Set the portal's `OPENAI_DOMAIN_CHALLENGE`, verify ownership, connect through OAuth and scan tools.
4. Create a dedicated reviewer account and synthetic workspace with no external MFA/email/SMS approvals. Provide credentials privately in the portal, never in this repository or ZIP.
5. Run five positive and three negative cases below, record outcomes and supply an accessible demonstration video URL.
6. Add approved brand assets, review privacy/terms with the publisher, provide release notes and complete the portal's policy attestations.

Positive cases: list accessible projects; list Launch project tasks and deadlines; search onboarding task titles and fetch the named sample result with a source link; create one Review the proposal task with an explicit project/deadline; read the owner-only Launch project conversation and send exactly the text requested by the user.

The OpenAI package declares CIMD OAuth with explicit read/write base scopes. The next hosted deployment also advertises all 11 supported read/write scopes in discovery and authentication challenges for other clients. Explicit narrower requests and existing grants retain their permissions; reconnect to approve writes. Reauthorize the demo connection and verify its granted scopes with `get_connection` before running write cases. The private reviewer instructions contain a ready-to-use dedicated token; do not require reviewers to create credentials themselves.

On 13 October the submission portal metadata connection requested five read scopes. A separate personal ChatGPT demo connection requested and received all nine scopes. Its task creation and message sending scenarios succeeded, and read-back confirmed one task and one message. Metadata scanning and user-facing ChatGPT execution are separate grants; verify the grant used by each client. An initially ambiguous message prompt reused prior chat context; its proposed send was denied before execution, and the revised missing-context case was tested in a fresh chat.

Negative cases: an unspecified message/destination requires clarification; deletion and another tenant's private data must not be accessed; importing a private metadata URL such as `http://169.254.169.254/` must fail without fetching it. Verify denied scopes never execute upstream writes and retries do not duplicate completed mutations.

Native Charizard sign-in and consent is included in 0.3.0 and requires the matching backend/frontend deployment and `EDWORKING_CONNECT_URL`. The fallback flow uses a dedicated API token entered on the browser consent page. Never request secrets through chat or tools.

Sources: [package format](https://developers.openai.com/plugins/build/plugins), [submission](https://developers.openai.com/plugins/deploy/submission), [review](https://developers.openai.com/plugins/deploy/app-review), [OAuth](https://developers.openai.com/plugins/build/auth).

## Claude

Checked 16 November 2026: **not listed** in the Connectors Directory. Edworking works in Claude as a custom connector, and its signed-out directory page reports that the connector does not exist. Submit or edit the listing in the developer portal at https://claude.ai/directory/manage using the prepared copy in [claude-directory-listing.md](claude-directory-listing.md). Submission is not publication; record the public listing URL once it resolves signed out.

## Community

| Destination | Verified status | Remaining action |
| --- | --- | --- |
| Official MCP Registry | **0.3.0 published 4 November 2026**, `io.github.Edworking/edworking-mcp` | [Successful publication workflow](https://github.com/Edworking/edworking-mcp/actions/runs/41888167723), from the deployed main commit `259930b`. Future releases use the manual workflow on `main` with short-lived GitHub OIDC. Release 0.3.1 adds `websiteUrl`, a 512×512 `icons` entry and a fuller description; run the workflow after it merges. |
| Smithery | The old listing no longer resolves to an Edworking page, verified 4 November 2026 | [Smithery announced](https://smithery.ai/future) its proxy, connection management, accounts, API, CLI and SDK shutdown on 31 October 2026. Use the direct endpoint `https://mcp.edworking.com/mcp`; do not advertise the historical listing or score as current. |
| Glama | [Hosted connector](https://glama.ai/mcp/connectors/io.github.Edworking/edworking-mcp) is public and ownership verified, but **Unhealthy** on 16 November 2026: 0% uptime over 24 hours, because its health checks fail with missing or expired test credentials. Its publisher details showed no privacy policy and pre-0.3.0 restrictions text scraped from the guide pages. | Replace the credential under **Admin → Test Profile** and confirm the next health check passes. Refresh the profile after each deployment. The tool-quality score (A, 3.9/5, 24 tools) dates from 4 November. |
| PulseMCP | Submissions and listing changes paused; notice dated 2026-09-03 | Its [submission page](https://www.pulsemcp.com/submit) directs publishers to the Official MCP Registry for later discovery. Registry publication is complete. Still paused on 16 November 2026, and a search for Edworking returns no servers. |
| Awesome Remote MCP Servers | **Listed**: [PR #1735](https://github.com/punkpeye/awesome-remote-mcp-servers/pull/1735) merged on 15 October 2026 | Keep the endpoint healthy; the list checks it. |
| Awesome MCP Servers | [PR #16055](https://github.com/punkpeye/awesome-mcp-servers/pull/16055) open and unmerged, labeled `missing-glama` | On 23 October the maintainer asked for a Glama quality score on the [server listing](https://glama.ai/mcp/servers/Edworking/edworking-mcp). Trigger a re-evaluation there, then add the score badge after the emojis. |
| GitHub MCP Registry (VS Code, Copilot) | Not listed, checked 16 November 2026 | GitHub onboards Official Registry entries by hand. Ask in [discussion #1257](https://github.com/github/github-mcp-server/discussions/1257) or email partnerships@github.com. |
| Docker MCP Catalog | [PR #7208](https://github.com/docker/mcp-registry/pull/7208) submitted on 16 November 2026 | Remote OAuth entry following the `linear` and `notion-remote` layout. Docker reviews every PR; share test credentials only through its form. Submission is not listing approval. |
| npm | [@edworking/mcp 0.3.0](https://www.npmjs.com/package/@edworking/mcp/v/0.3.0) is public, published and verified 4 November 2026 | Published with npm browser authentication and 2FA. The tarball matches the GitHub release asset. Inspect the package and authenticate each future release; bypass-2FA tokens are disallowed. |

Listing copy: **Edworking MCP connects AI assistants to your projects, tasks, conversations and files. Read workspace context and take requested actions with scoped OAuth access and links back to Edworking.**

Repository: https://github.com/Edworking/edworking-mcp. Website: https://mcp.edworking.com. Endpoint: https://mcp.edworking.com/mcp. Public name: **Edworking MCP**. Infrastructure codename: **Bellsprout**. Only the destinations explicitly marked published above are live listings.

Recommended next work: signed-out and Figma consent regression tests, real-client evaluation fixtures, uptime alerts, tested backups and independent OAuth review. Optional MCP Apps task cards can follow; core tools do not require UI widgets. Move to Postgres only when multiple replicas are needed.

## 0.3.0 deployment verification

PR #19 merged as `259930b`. CI passed on Node 22 and 24; local type checking, all 39 tests and build passed, and the runtime audit reported zero vulnerabilities. Bellsprout deployed successfully with the existing domain, volume and encryption key. Browser checks confirmed `/healthz` reports `ok`, `/readyz` reports `ready`, and the server card reports version 0.3.0 with 24 tools.

Native `EDWORKING_CONNECT_URL` was enabled on 5 November 2026 and Railway successfully deployed main commit `85625e3`. Readiness passes. A real OAuth request from the official local MCP Inspector reached the signed-in Edworking integrations page and displayed the requesting client, callback destination, selected workspace, six read permissions and 30-day expiry. After explicit tester consent, the OAuth callback succeeded, all 24 tools loaded, `get_connection` confirmed exactly the six requested read scopes, and `list_projects` with a one-item limit returned successfully from the upstream API. An expired request was rejected and a fresh request completed successfully. This verifies the signed-in general MCP flow; signed-out and Figma-specific acceptance remain separate checks.

Real Figma plugin acceptance and marketplace publication remain separate from the hosted MCP release. Charizard's [Figma release instructions](https://github.com/Edworking/charizard/tree/master/figma) identify public access to Figma's private `fileKey` capability as unresolved; otherwise explicit file-link confirmation remains required. The documented Figma task/Doc, attachment, retry, revocation and UI acceptance checks must be completed before certifying that plugin. npm 0.3.0 publication succeeded and its public version page was verified.
