# Vendored SwiftLaTeX engines — what was changed and why

These files come from **SwiftLaTeX** release `v20022022` (<https://github.com/SwiftLaTeX/SwiftLaTeX>), which is licensed **AGPL-3.0**. galley is AGPL-3.0-or-later for that reason, and this file exists so the modifications are visible rather than buried in a binary drop.

| File | Origin |
|---|---|
| `swiftlatexxetex.wasm`, `swiftlatexdvipdfm.wasm` | unmodified |
| `swiftlatexxetex.wasm`, `swiftlatexdvipdfm.wasm` | unmodified |
| `swiftlatexxetex.js`, `swiftlatexdvipdfm.js` | patched, see 3, 6 and 7 below |
| `XeTeXEngine.js`, `DvipdfmxEngine.js` | patched, see 1, 2, 4 and 5 below |

Every patch below was found by running the engines, not by reading the source. Three are upstream defects (1, 2 and the `fileid` half of 3); the rest are adaptations needed to serve the engines as static assets from our own origin.

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

**Consequence to know about:** flattening the path discards the format *segment* that disambiguates extensionless requests such as `cmr10` (meaning `cmr10.tfm`). That cost a real bug — see 7, which recovers the same information from the format number the engine passes to JS anyway. `scripts/build-texlive-bundle.ts` also writes files under the exact names the engine asks for, and fails loudly on a basename collision rather than silently overwriting.

## 4. Added an ES module export

The two drivers both declare `exports`, `__awaiter`, `__generator`, `EngineStatus` and `CompileResult` at top level, so loading them as classic scripts makes the second clobber the first. Appending

```js
export { XeTeXEngine };     // and: export { DvipdfmxEngine };
```

lets `compile.worker.ts` load them with a dynamic `import()`. Module scope fixes the collision natively, and it avoids evaluating fetched source, so galley needs no `unsafe-eval` in its CSP.

## 5. The worker path was resolved relative to the document

Both drivers spawn their worker with a bare filename:

```js
-  this.latexWorker = new Worker('swiftlatexxetex.js');
+  this.latexWorker = new Worker(ENGINE_PATH);   // '/engines/swiftlatexxetex.js'
```

A bare specifier resolves against the *document* URL, so the engine loaded from `/`, failed from `/anything/else`, and the failure looked like a missing file rather than a path bug. An absolute path is the only form that holds wherever the app is mounted.

## 6. A missing file was served as the application's own HTML

Not an engine bug — a consequence of hosting the tree as static assets. A single-page host answers an unknown path with `index.html` and **HTTP 200**, so the engine cached a page of HTML under a font's name and TeX then choked on it, far from the cause. The resolver now inspects the first bytes and treats an HTML response as a miss:

```js
const _hh = String.fromCharCode.apply(null, new Uint8Array(_x.response.slice(0, 14))).toLowerCase();
if (_hh.startsWith("<!doctype html") || _hh.startsWith("<html")) continue;
```

A clean miss is always better than a wrong file: TeX handles an absent optional file by itself, but cannot recover from a corrupt one.

## 7. Extensions were guessed instead of derived from the format

The first attempt at recovering what 3 discarded tried extensions in a fixed order, which silently substitutes across incompatible types — `cmex10.tfm` and `cmex10.vf` are different files sharing a stem, and handing dvipdfmx metrics where it asked for a virtual font produced `VF file ended prematurely`.

Reading the engine's own C settles it: `kpse_find_file` in `kpseemu.c` tries the local filesystem, then calls `kpse_find_file_js(name, format, must_exist)` — **the format number was always passed to JS**; flattening the URL merely stopped it being used. The resolver now maps format → extension from a table generated out of `kpseemu.h`'s enum order and `kpseemu.c`'s `fix_extension` switch, so it is the same mapping the C side uses:

```js
const _FMT_EXT = { 0:".gf", 1:".pk", 3:".tfm", …, 33:".vf", …, 47:".otf", … };
const _ext = _FMT_EXT[format];
const _cands = reqname.indexOf(".") >= 0 ? [reqname] : _ext ? [reqname + _ext] : [reqname];
```

Generated rather than transcribed, deliberately — including upstream's own quirk that `kpse_cmap_format` appends `cmap` with no leading dot. A virtual-font request now resolves to `.vf`, misses cleanly, and never receives metrics in its place.

## 8. `DvipdfmxEngine` could not flush its filesystem

Upstream exposes `flushCache()` on `XeTeXEngine` but not on `DvipdfmxEngine`, although **both** workers implement the same `flushcache` command — `cleanDir(WORKROOT)`. Nothing needed it while the only file written was `main.xdv`, which is overwritten each run.

Images changed that. They are written to both engines, because XeTeX reads an image while typesetting and records a reference in the XDV, and dvipdfmx then reads the actual bytes to embed at the PDF stage.

Flushing only XeTeX looks sufficient, and is not. The visible fault — a deleted image still appearing — is XeTeX resolving `\includegraphics`, so flushing XeTeX alone appears to fix it. But replace an image with a *different* file of the same name: XeTeX is flushed and rewritten and typesets the new picture, while dvipdfmx still holds the old bytes and **embeds the previous image**. The document is wrong, silently, with no error anywhere.

```js
DvipdfmxEngine.prototype.flushCache = function () {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
        this.latexWorker.postMessage({ 'cmd': 'flushcache' });
    }
};
```

`cleanDir` spares `TEXCACHEROOT`, so this evicts the work directory without discarding the fetched TeX Live cache — the expensive thing, and the reason the worker is kept alive between renders at all.

## Rebuilding the format

`swiftlatexxetex.fmt` in `public/texlive/` must be built **by the wasm engine itself** — a TeX Live `xelatex.fmt` will not load, because format files are engine-specific. See `scripts/README.md`.
