# Changelog

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
