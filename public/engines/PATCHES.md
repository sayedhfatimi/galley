# Vendored SwiftLaTeX engines — what was changed and why

These files come from **SwiftLaTeX** release `v20022022` (<https://github.com/SwiftLaTeX/SwiftLaTeX>), which is licensed **AGPL-3.0**. galley is AGPL-3.0-or-later for that reason, and this file exists so the modifications are visible rather than buried in a binary drop.

| File | Origin |
|---|---|
| `swiftlatexxetex.wasm`, `swiftlatexdvipdfm.wasm` | unmodified |
| `swiftlatexxetex.js`, `swiftlatexdvipdfm.js` | patched, see 3 below |
| `XeTeXEngine.js`, `DvipdfmxEngine.js` | patched, see 1 and 2 below |

Every patch below was found by running the engines, not by reading the source. Three are upstream defects.

## 1. `setTexliveEndpoint` permanently disabled the engine

```js
prototype.setTexliveEndpoint = function (url) {
    if (this.latexWorker !== undefined) {
        this.latexWorker.postMessage({ cmd: 'settexliveurl', url: url });
-       this.latexWorker = undefined;   // copy-paste from closeWorker()
    }
};
```

Upstream bug. Any call left the engine unusable, failing later with `Cannot set properties of undefined (setting 'onmessage')`. It survived because the public demo used the compiled-in default endpoint and never called the setter — but it is the one API galley cannot do without, since it is how the engines are pointed at our own origin.

## 2. `compileFormat()` threw away the format it had just built

It built the format correctly, logged a blob URL to the console for a human to download, and resolved with `undefined`. Two edits, the second easy to miss:

```js
-  resolve();
+  resolve(formatArray);
...
-  _a.sent();
-  return [2 /*return*/];
+  var _fmt = _a.sent();
+  return [2 /*return*/, _fmt];
```

Without the second, `__awaiter` still yields `undefined` because the generator's return value is discarded.

## 3. File resolution made static hosting impossible

Upstream requests `{endpoint}xetex/{kpathsea-format}/{filename}` and reads a custom `fileid` response header to decide the local cache path. A static host cannot set a distinct header per file, so:

```js
-  const remote_url = self.texlive_endpoint + "xetex/" + cacheKey;
+  const remote_url = self.texlive_endpoint + reqname;
...
-  const fileid = xhr.getResponseHeader("fileid");
-  const savepath = TEXCACHEROOT + "/" + fileid;
+  const savepath = TEXCACHEROOT + "/" + reqname;
```

This is what allows `public/texlive/` to be plain static assets on a CDN.

**Consequence to know about:** flattening the path discards the format hint that disambiguates extensionless requests such as `cmr10` (meaning `cmr10.tfm`). `scripts/build-texlive-bundle.ts` therefore writes files under the exact names the engine asks for, and fails loudly on a basename collision rather than silently overwriting.

## 4. Added an ES module export

The two drivers both declare `exports`, `__awaiter`, `__generator`, `EngineStatus` and `CompileResult` at top level, so loading them as classic scripts makes the second clobber the first. Appending

```js
export { XeTeXEngine };     // and: export { DvipdfmxEngine };
```

lets `compile.worker.ts` load them with a dynamic `import()`. Module scope fixes the collision natively, and it avoids evaluating fetched source, so galley needs no `unsafe-eval` in its CSP.

## Rebuilding the format

`swiftlatexxetex.fmt` in `public/texlive/` must be built **by the wasm engine itself** — a TeX Live `xelatex.fmt` will not load, because format files are engine-specific. See `scripts/README.md`.
