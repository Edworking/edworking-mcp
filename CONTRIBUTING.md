# Contributing

Use Node 24 and `npm ci`. Run `npm run check` before a pull request. Add focused regression tests for authentication, isolation, upstream behavior and mutation changes. Use synthetic data; never production credentials.

Preserve existing tool names and input contracts. Declare permissions and annotations accurately. Keep private content out of logs. Use only scoped Edworking operations; do not add session-token passthrough or an unrestricted GraphQL proxy.

Describe the problem, behavior and validation in each PR. Update docs and release notes for user-visible changes. Report security vulnerabilities privately through Edworking support, not a public issue.
