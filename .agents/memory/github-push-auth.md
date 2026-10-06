---
name: GitHub push authentication
description: Distinguishes Replit's GitHub API connector from Git-over-HTTPS credentials.
---

An added GitHub (App) connection enables authenticated API calls through the connector, but it does not provide credentials to shell `git push` over HTTPS. Public reads via `git ls-remote` can succeed while pushes fail with an invalid username/token error. Git pushes from a Replit project require the Git pane's GitHub account connection and a configured remote; never ask for a personal access token in chat.

**Why:** The GitHub API connector and Git transport use separate authentication paths.

**How to apply:** Before pushing, verify Git-pane authorization. Do not assume that adding the GitHub App integration or reading a public remote is enough.
