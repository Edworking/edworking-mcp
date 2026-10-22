# Changelog

## Unreleased

- Reuse native Edworking consent and revocation for the Figma plugin and MCP clients.
- Route the fixed Figma client through dedicated Edworking workspace selection, authorization and return, without a duplicate MCP consent screen. Keep browser binding, nonce, PKCE and one-use handoff checks.
- Add isolated PKCE plugin return/polling and a restricted tool transport; keep general OAuth/MCP origin checks unchanged.
- Add task/frame linking and lookup tools; reciprocal Figma Dev Resources require no Figma OAuth.
- Support compact task and document creation (with an optional list or folder), existing-content design insertion and bounded attachment upload through plugin-only helpers; keep the public tool catalog at 24.
- Reuse scoped content/storage services and ApiToken credentials without schema migrations or Figma REST OAuth.
- Add an explicit local runner and document testing against local Venusaur/Charizard before deployment.

## 0.2.0 — richer workspace tools

- Expand the catalog from 15 to 22 tools: project members, Docs list/read/create/rename, and targeted task/Doc content edits.
- Edit task status, priority, assignees, start date and deadline; filter tasks by these fields and title.
- Search indexed tasks, Docs, files and project messages with per-source permissions, live ACL checks and explicit coverage. Typed result IDs support fetch; bare task IDs remain accepted.
- Add separate Docs read/write OAuth scopes. Existing connections need new token permissions and consent for Docs.
- Deploy the corresponding Venusaur scoped API changes first. Registry/npm publication and the OpenAI review update are separate release steps.

## Unreleased

- Declare OpenAI package OAuth scopes and use the prepared Launch project in reviewer scenarios. Portal scope negotiation, live ChatGPT tests and the review video remain pending.
- Add the verified healthy Glama connector badge and update publication status after DNS ownership verification and authenticated discovery of all 15 tools.
- Browser consent now completes with an automatic return page and a fallback link. This avoids carrying the consent form's Content Security Policy into an assistant's callback redirect chain.
- Consent forms keep `form-action 'self'`. Registered callback validation, CSRF, PKCE, state/issuer responses and single-use authorization codes remain enforced.
- The used-request error now distinguishes an expired or already consumed request; restart the connection from the assistant to recover.

## 0.1.4 — 2026-10-10

- Fix pinned HTTPS client-metadata retrieval with Node's automatic address-family selection.
- Accept CIMD clients that explicitly support public PKCE authentication, including ChatGPT's multiple-method metadata. Continue rejecting unsupported methods and mismatched client identities.
- Add regression coverage for both Node lookup modes and CIMD method negotiation. Exact redirects, PKCE, public-address validation and dynamic-registration restrictions remain enforced.

## 0.1.3 — 2026-10-09

- Use `https://gateway.edworking.com/` as the default and production Edworking API endpoint.
- Revalidate local stdio token access before every tool call, including cached writes and connection metadata.
- Expand regression coverage to all 15 tools, scope denial, input validation, write deduplication, bounded search and transport request protections.
- Live public-endpoint checks passed; authenticated workspace testing and directory submissions remain pending.

## 0.1.2 — 2026-10-09

- Match Edworking’s website branding and add setup guidance for eleven client options.
- Support native OAuth clients using ephemeral IP loopback callback ports, while retaining exact paths, queries and token-exchange redirect binding.
- Publish a competitor capability review and prioritized delivery roadmap.
- The custom domain is active; the new Charmeleon integration guide is available in six languages.

## 0.1.1 — 2026-10-09

- Public branding, landing page, repository and plugin identity changed to Edworking MCP. Railway retains the Bellsprout infrastructure name.
- Prepared canonical domain `mcp.edworking.com`; activation requires DNS/TLS verification and a matching OAuth issuer configuration. Existing grants require reconnection after origin migration.
- Consent CSP permits redirects only to the registered client origin.
- Same-origin referrer policy preserves the Origin header on consent form submissions without sending referrers to other origins.
- Refresh checks now verify current token identity, user, workspace and scopes.
- Native handoff routes are disabled until the native connection page is configured.
- SQLite permissions are set before WAL creation.


## 0.1.0 — 2026-10-09

- Initial Bellsprout server with 15 scoped Edworking tools.
- Streamable HTTP, OAuth authorization codes, PKCE S256, resource binding, dynamic registration and HTTPS client metadata.
- Encrypted upstream credentials, refresh rotation, consent protection and revocation checks.
- Pagination, source links, bounded title search and persistent write deduplication.
- Local stdio, Docker/Railway deployment and portable plugin/community metadata.

Initial onboarding uses a dedicated scoped token in browser consent. Native connection UI and directory approval are separate milestones.
