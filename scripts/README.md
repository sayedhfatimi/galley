# Maintainer scripts

Two build artefacts in `public/texlive/` are produced here rather than by hand.
Both are committed, so neither CI nor a contributor needs a local TeX Live —
you only need one if you are changing what galley bundles.

| Script | Produces | Run it when |
|---|---|---|
| `build-texlive-bundle.ts` | the 226-file flat tree in `public/texlive/` | the preamble grows a package or a font |
| `build-format.ts` | `swiftlatexxetex.fmt` | almost never — see below |

---

## `build-texlive-bundle.ts`

```bash
bun run scripts/build-texlive-bundle.ts
```

Converts the fixture manuscript with the real preamble, compiles it under
`xelatex -recorder` across every configuration a reader can reach, and takes the
recorded `INPUT` lines as the closed set. Fonts, Type 1 outlines and the
`Ligatures=TeX` mapping are added explicitly, because XeTeX's font loader
bypasses kpathsea and never appears in the log.

It deliberately **preserves `swiftlatexxetex.fmt`** across its own `rm -rf`. That
file is not harvested and this script cannot regenerate it.

---

## `build-format.ts`

```bash
bun run scripts/build-format.ts
# then open http://localhost:7171/ and leave the tab open
```

### Why it is a separate script, and why a browser is involved

A TeX format file is **engine-specific**. A `xelatex.fmt` from your local TeX
Live will not load in the wasm engine — it has to be built *by* the engine that
will read it. The engine is a Web Worker using synchronous `XMLHttpRequest`, so
the build has to happen in a browser; there is no Node path.

Building a format also needs inputs that are **not in `public/texlive/`** —
`xelatex.ini`, `latex.ltx`, `unicode-letters.tex`, `hyphen.cfg`, the hyphenation
patterns. The bundle holds only what *compiling* needs, which is a different and
much smaller set.

So the script stands up a small server that:

- resolves any bare filename through `kpsewhich` against your local TeX Live,
- serves the vendored engine at `/engines/`, the path `XeTeXEngine.js` hardcodes
  (patch 5 in `../public/engines/PATCHES.md`),
- serves a page that drives `XeTeXEngine.compileFormat()`,
- writes what comes back to `scripts/out/swiftlatexxetex.fmt`.

It matches the engine's resolver contract exactly: `GET {endpoint}{name}`, an
extension appended from the kpathsea format number when the name has none, and a
non-200 for a miss — never a 200 carrying HTML, which the engine sniffs for and
would otherwise cache under a font's name (patches 3, 6 and 7).

### It does not install the result, on purpose

The format is built from whatever TeX Live is installed on your machine, while
the engine is SwiftLaTeX's 2022 XeTeX. A newer LaTeX kernel can depend on
primitives that binary does not have — the same version skew that keeps
`microtype` out of the preamble, and the reason
`../public/engines/PATCHES.md` and the engine-upgrade note exist.

To promote a new format, test it first:

```bash
cp scripts/out/swiftlatexxetex.fmt public/texlive/swiftlatexxetex.fmt
bun run dev
```

Then render something that exercises the whole preamble — the fixture
manuscript at `src/core/__fixtures__/manuscript.md`, set up as a **Book** so it
pulls in chapters, a table of contents, two-sided margins and recto openings.
A one-paragraph document proves almost nothing: it does not touch the maths
fonts, which are preloaded *into* the format and are exactly what a bad rebuild
breaks. Check that maths, tables, code blocks and the title page all render
before committing. `git checkout -- public/texlive/swiftlatexxetex.fmt` puts the
old one back.

### Known-good run

A rebuild on 2026-08-26 resolved 67 files with 3 misses and produced a
23,211,038-byte format — two bytes off the committed one, which is good evidence
this is the same procedure that built it originally. It rendered the fixture as
a 7-page book correctly, maths included.
