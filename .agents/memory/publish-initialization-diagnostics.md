---
name: Failed-publish diagnostics
description: Distinguish the currently serving build from a newer publish that fails during initialization.
---

Compare the failed revision with the last successful publish before making speculative code changes. Read runtime logs for the failed revision explicitly, not just the currently serving app.

**Why:** This clinic can remain healthy on an older deployment while a newer image builds and pushes successfully but fails initialization. The serving deployment's healthy status and empty recent logs do not explain that failed publish.

**How to apply:** Use build history and build details to identify the failing phase, then revision-scoped runtime logs. The older `fetchDeploymentLogs` callback is pinned to the serving build; use `getDeploymentLogs` with the failed build's `revisionId` for failed-startup evidence. If source/config are unchanged and no failure trace is available, report that uncertainty rather than inventing a code fix.
