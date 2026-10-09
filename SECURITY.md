# Security

Report suspected vulnerabilities privately through https://edworking.com. Do not include credentials, exploit details or private workspace data in public issues. Maintainers should enable GitHub private vulnerability reporting.

- Every grant is bound to one client, resource URL and scoped Edworking API token. Edworking validates owner/workspace access on every MCP request.
- Codes require PKCE S256 and exact redirects. Native HTTP IP-loopback registrations allow only the port to vary (RFC 8252); token exchange remains bound to the exact redirect used at authorization. Consent requires a short-lived HttpOnly SameSite cookie, exact Origin and CSRF token.
- OAuth credentials are opaque and hashed at rest. Refresh rotation detects reuse and revokes the grant family. Upstream credentials and cached write results use AES-256-GCM.
- HTTPS client-metadata retrieval rejects private IPs, pins DNS, disallows redirects and limits size/time. File downloading is delegated to Edworking's existing guarded downloader.
- Schema validation, Origin checks, request budgets, body limits, fixed upstream URLs and sanitized errors constrain exposure. No credentials or tool arguments/results are logged.

This initial release has regression tests, not an independent security audit. SQLite requires one replica. Rate limits are per-process/per-IP. Revocation cannot recall accepted operations or previously returned information. Upstream token scopes and expiration remain authoritative.

Before promoting a public launch, complete real-account tests with two isolated workspaces and multiple users, verify scope reduction and revocation against the deployed Edworking API, and exercise OAuth in supported clients. Run an independent review of the OAuth implementation and upstream authorization. Configure and test backups, availability alerts and abuse controls. Enable required CI checks and private vulnerability reporting in GitHub. These operational and external review steps are not implied by passing the automated test suite.

Encrypted credentials remain accessible to a compromised application process holding the key. Authorized tool results are shared with the chosen assistant provider, whose retention policies also apply. Model instructions and tool annotations cannot guarantee that an assistant will always interpret a user's intent correctly; begin with read permissions and explicitly review requested writes.

Keep the encryption key in Railway and an access-controlled recovery vault. Back up the database and key separately. After restoring old data, invalidate OAuth grant families so consumed refresh tokens are not revived. Never log Authorization headers or publish data files.
