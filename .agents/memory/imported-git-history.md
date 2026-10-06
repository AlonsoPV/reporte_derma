---
name: Imported Git history
description: Safe synchronization when source files were copied into an independent Replit Git history.
---

When source files are imported into a Replit-owned repository without importing the source commits, GitHub and Replit have independent root histories. Rebasing the Replit root onto GitHub can conflict on baseline files such as `.gitignore`, `.replit`, and `package.json`. If the local source tree came from a known GitHub snapshot, use that snapshot as the base for a three-way tree merge so newer source changes and Replit-specific configuration can both be retained.

**Why:** Treating the histories as unrelated during rebase replays both initial trees and produces add/add conflicts; choosing one entire tree can silently discard newer upstream code or Replit metadata.

**How to apply:** Before syncing, identify the exact imported source snapshot and compare local changes since it with upstream changes since it. Preserve both branch histories in the merge commit and verify the resulting tree before pushing.
