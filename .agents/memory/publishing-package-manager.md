---
name: Publishing package-manager consistency
description: Why this workspace must keep pnpm as its only dependency-installation source.
---

Keep this workspace on pnpm with a single pnpm lockfile. Do not introduce an npm package-lock alongside it.

**Why:** Replit publishing detects npm when a package-lock is present, even though this project's artifact commands use pnpm. Mixed lockfiles produced a different deployment dependency graph and left a newly declared PDF dependency missing from the pnpm installation.

**How to apply:** Install and update dependencies with pnpm, keep its lockfile synchronized, and verify a frozen-lockfile install when changing publishing dependencies. If an npm lockfile appears after another tool installs a package, reconcile the pnpm graph and remove the conflicting npm lockfile rather than maintaining both.
