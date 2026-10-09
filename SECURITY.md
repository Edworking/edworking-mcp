# Security

Report suspected vulnerabilities privately through https://edworking.com. Do not include credentials, exploit details or private workspace data in public issues. Maintainers should enable GitHub private vulnerability reporting.

- Every grant is bound to one client, resource URL and scoped Edworking API token. Edworking validates owner/workspace access on every MCP request.
- Codes require PKCE S256 and exact redirects. Consent requires a short-lived HttpOnly SameSite cookie, exact Origin and CSRF token.
- OAuth credentials are opaque and hashed at rest. Refresh rotation detects reuse and revokes the grant family. Upstream credentials and cached write results use AES-256-GCM.
- HTTPS client-metadata retrieval rejects private IPs, pins DNS, disallows redirects and limits size/time. File downloading is delegated to Edworking's existing guarded downloader.
- Schema validation, Origin checks, request budgets, body limits, fixed upstream URLs and sanitized errors constrain exposure. No credentials or tool arguments/results are logged.

This initial release has regression tests, not an independent security audit. SQLite requires one replica. Rate limits are per-process/per-IP. Revocation cannot recall accepted operations or previously returned information. Upstream token scopes and expiration remain authoritative.

Keep the encryption key in Railway and an access-controlled recovery vault. Back up the database and key separately. After restoring old data, invalidate OAuth grant families so consumed refresh tokens are not revived. Never log Authorization headers or publish data files.
