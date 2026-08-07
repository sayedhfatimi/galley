# galley

Markdown in, a typeset PDF **and** the LaTeX source that produced it out — compiled by a real TeX engine running entirely in the browser. No account, no server, no uploads.

## Package manager

Use **`bun`** exclusively. Never run `npm install`, `pnpm`, or `yarn` here.

## Quality checks

Run all four before every commit: `bun run check` (Biome), `bun run typecheck`, `bun run test`, `bun run build`.

## Architecture

Static SPA, no backend. `src/core/` is **pure** — no DOM, no React — so it runs identically in Node under Vitest, on the main thread, and inside the compile worker. UI lives in `src/ui/`, the TeX engines are owned solely by `src/workers/compile.worker.ts`, and the bundled TeX Live tree sits in `public/texlive/`.

**Keep the engine behind the worker interface.** Nothing outside `compile.worker.ts` may know which TeX engine is in use — v1 ships SwiftLaTeX's 2022 XeTeX + dvipdfm, and swapping it for a current engine is planned work, not a rewrite.

## Licence

**AGPL-3.0-or-later**, because the WASM TeX engines are. The vendored engine glue under `public/engines/` is modified from SwiftLaTeX; those modifications must stay documented and published.
