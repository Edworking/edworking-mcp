# Claude Connectors Directory listing

Copy for the Edworking listing in Claude's Connectors Directory, prepared 16 November 2026 for release 0.3.0. Enter it in the developer portal at https://claude.ai/directory/manage (**Submit new → MCP connector**, or **Edit listing** on an existing submission). Limits come from [Submit a connector to the directory](https://claude.com/docs/connectors/building/submission). Listing edits go to Anthropic review before they appear.

Status checked 16 November 2026: Edworking appears in Claude only as a custom connector. Signed out, its directory page reports that the connector does not exist, so there is no public listing yet. Its Claude entry has no description and no icon because custom connectors carry only a name and URL; the fields below fill them once the listing is published.

## 1. Connection

URL: `https://mcp.edworking.com/mcp`

Use the `/mcp` path from `server.json`, even if an existing custom connector was added as `https://mcp.edworking.com`. Users connect to one URL.

## 2. Tools

The public tools sync from the server. Every tool already declares a `title`, `readOnlyHint` and `destructiveHint` (`src/tools.ts`), so none should be flagged. Plugin-only tools are not exposed on `/mcp`.

## 3. Listing

**Server name** (100 max)

> Edworking

**One-liner** (200 max)

> Search your Edworking projects, tasks, Docs and conversations, then create tasks, update work and send messages from Claude.

**Description** (2,000 max)

> Edworking brings your team's projects, tasks, Docs, conversations and files into Claude. Ask in plain language what is due this week, who owns a task, or where a decision was discussed, and Claude answers from your live workspace with links back to Edworking.
>
> When you're ready to act, Claude can create projects, tasks and Docs; update a task's status, priority, assignees, start date and deadline; make targeted edits to task descriptions and Docs while keeping the rest intact; send the message you ask for to a specific conversation; and import a file from a public link. Design teams can add Figma designs to new tasks and Docs, link a frame to an existing task, and find the tasks linked to a Figma file.
>
> You stay in control. You sign in with your Edworking account and review the read and write permissions before approving, and each connection covers one workspace. Claude only sees what your account can already access. Deleting projects, tasks or Docs, inviting people and changing sharing are not available through the connector. Disconnect in Claude, or revoke access in Edworking, at any time.

**Categories** (1 to 5, from the directory's list)

- Tickets & tasks
- Files & documents
- Email & messages

**Documentation URL:** https://mcp.edworking.com

It lists all 24 tools, Claude setup and example requests. https://edworking.com/integrations/mcp was brought up to date on 16 November 2026 (Edworking/charmeleon#436) and is an equally valid choice.

**Privacy policy URL:** https://mcp.edworking.com/privacy

**Support contact:** https://github.com/Edworking/edworking-mcp/issues (the same contact as the OpenAI listing)

**Icon:** the square 512 × 512 Edworking mark, served at https://app.edworking.com/android-chrome-512x512.png (source: `charizard/public/android-chrome-512x512.png`). `plugin/assets/icon.svg` is 95 × 61 and not square.

**URL slug:** `edworking` (permanent once published)

## 4. Use cases

**Primary use cases**, each with a prompt that works today:

1. Get up to speed on a project: "What's overdue in the Launch project, and who owns each task?"
2. Find answers across the workspace: "Find where we discussed onboarding pricing and summarize it with links."
3. Turn notes into tasks: "Create tasks in Launch from these meeting notes, assign them and set Friday deadlines."
4. Keep work moving: "Mark Review the proposal as Done and move the QA deadline to next Wednesday."
5. Write and update Docs: "Create a launch checklist Doc in the Marketing project," or "Add a Risks section to the Launch plan Doc."
6. Follow up in conversations: "Summarize the latest messages in the planning conversation, then post: The review is complete."
7. Hand off designs: "Create a task in the Design project for this Figma frame," with the frame link.

**What users need before connecting:** an Edworking account with access to the workspace they want to connect. They sign in with Edworking during connection and approve the requested permissions. A dedicated API token, entered only on the Edworking consent page, remains available as a fallback.

**Data access:** reads and writes.

## 5. Company

- Company name: Edworking
- Website: https://edworking.com
- Primary contact: the submitter's choice; keep it out of this repository.

## 6. Authentication

- Authentication requirement: required
- Method: OAuth 2.0. Claude's published client identity (CIMD) works without a client secret, and dynamic client registration is also supported. PKCE S256 is required. Claude's callback, `https://claude.ai/api/mcp/auth_callback`, is covered by `test/security.test.ts`.

## 7. Data handling

- Underlying API: Edworking's own API
- Personal health data: no
- Sponsored content: no

## 8. Test & launch

Before confirming, call every tool from Claude through the custom connector or MCP Inspector, using a synthetic workspace. Do not put credentials in the portal. If the listing goes to Verified review, provide reviewer access privately by email, never in this repository.

## Character counts

| Field | Characters | Limit |
| --- | --- | --- |
| Server name | 9 | 100 |
| One-liner | 124 | 200 |
| Description | 1,108 | 2,000 |
