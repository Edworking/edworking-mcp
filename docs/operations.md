# Operations

Public product: **Edworking MCP**. Repository: **Edworking/edworking-mcp**. Railway project and service: **bellsprout**. Production runs one Node 24 container with a persistent SQLite volume at `/data`. Keep one replica, one region, sleeping off and deployment overlap zero.

Before release, run `npm ci` and `npm run check`, review dependency audits and check for secrets in tracked files. Deploy the tested commit. Verify `/readyz`, OAuth metadata, the unauthenticated MCP challenge and browser consent. Mocked tests do not replace a real connection test against a dedicated Edworking workspace.

Configure Railway volume backups or consistent SQLite backups, and test restoration. Do not copy an active SQLite file without accounting for its WAL. Backup scheduling is an operator step, not enabled by this repository. Keep `TOKEN_ENCRYPTION_KEY` in a separate recovery vault. After restoring an older snapshot, invalidate grants/access/refresh/code records to prevent refresh-token replay. Lost mutation reservations require checking uncertain writes before re-enabling retries.

Rollback application code while preserving the database and key. Schema migrations must preserve rollback compatibility. Changing or losing the key requires ciphertext migration or forced reconnection; never regenerate it during an ordinary deployment.

Monitor readiness, error rates, OAuth failures, memory and disk capacity. Logs contain event/tool names, outcomes and durations only. Do not enable external payload/header capture. For multiple replicas, first migrate atomic grants and mutation reservations to Postgres and use a distributed rate limiter.

The native Edworking handoff endpoints require a short-lived capability and fixed Edworking Origin, followed by consent in the initiating browser. Leave `EDWORKING_CONNECT_URL` unset until a corresponding Charizard page is deployed and tested.

## Public domain migration

Attach `mcp.edworking.com` to the Railway service on port 3000. Add Railway’s dedicated CNAME and ownership TXT record; the existing Vercel wildcard can remain unchanged. Once DNS and TLS are verified, set `PUBLIC_BASE_URL=https://mcp.edworking.com` and redeploy. Verify issuer, resource metadata, unauthenticated MCP challenge and a real OAuth connection. Existing connections must reconnect because their resource audience changes. Keep the encryption key and `/data/bellsprout.sqlite` unchanged; internal cookie names and AES-GCM associated data intentionally retain the infrastructure codename.
