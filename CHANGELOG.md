# Changelog

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
