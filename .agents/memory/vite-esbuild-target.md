---
name: Vite/esbuild target compatibility
description: Replit workspace-specific guidance for Vite builds and dependency optimization.
---

When esbuild reports that transforming destructuring to its multi-browser target is unsupported, setting only the Vite production build target is insufficient: dependency pre-bundling uses a separate target. Set both `build.target` and `optimizeDeps.esbuildOptions.target` to `esnext`.

**Why:** In this Replit pnpm workspace, esbuild's default browser target failed on modern syntax inside dependencies during Vite development startup, even after the production build was fixed.

**How to apply:** If the Vite dev workflow fails while optimizing dependencies with this error, align the dependency-optimization target with the production build target before changing dependency versions.
