# Development performance (Next.js)

## On-demand compilation in `next dev`

`next dev` (with or without `--turbo`) **compiles each route when you first open it**. That “Compiling…” delay is expected.

Running **`next build` before `next dev`** does **not** reliably skip future dev compiles — the dev bundler still does its own work. Old scripts named `dev:precompiled` were **misleading** and were removed.

## If you want everything built before you browse

Use a **production** server locally (no per-route dev compile):

```bash
npm run preview
```

This runs **`next build`** then **`next start`**. All routes are pre-built; navigation is fast. **Trade-off:** no hot reload — change code → run `preview` again (or use `dev` while editing).

See **`docs/LOCAL_NEXT_DEV.md`** for details, ports (`preview:3003`), and how this relates to Telemedicine / Zoom testing.
See **`docs/LOCAL_NEXT_DEV.md`** for details, ports (`preview:3100`), and how this relates to Telemedicine / Zoom testing.

## Daily coding

```bash
npm run dev
```

Uses Turbopack (`--turbo`). After you’ve opened a page once, revisiting it is usually quick.

## `next.config.mjs` tweaks already in the repo

- **`onDemandEntries`**: keeps more pages in memory longer in dev
- **`experimental.optimizePackageImports`**: tree-shakes large icon/UI packages
- **Turbopack** via the `dev` script

## When a full `next build` helps

- Before **`npm run preview`** or **`npm run build:prod`**
- After changing **`next.config.mjs`**, env, or major dependencies
- CI / Docker images
