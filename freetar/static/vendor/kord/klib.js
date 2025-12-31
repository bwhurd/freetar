// Browser-safe wrapper for kordweb wasm-bindgen output.
// The upstream README expects: `import init, { ... } from 'kordweb/klib.js'; await init();`
// We implement that contract here without relying on bundler-only `.wasm` module imports.

import * as bg from "./klib_bg.js";
export * from "./klib_bg.js";

let __kord_inited = false;

export default async function init() {
  if (__kord_inited) return;

  const wasmUrl = new URL("./klib_bg.wasm", import.meta.url);
  const resp = await fetch(wasmUrl);
  if (!resp.ok) {
    throw new Error(`[kord] Failed to fetch WASM (${resp.status} ${resp.statusText}) at ${wasmUrl}`);
  }

  const bytes = await resp.arrayBuffer();
  const module = await WebAssembly.compile(bytes);

  // Build the import object dynamically from wasm import declarations.
  // wasm-bindgen emits import names like "__wbg_*" and "__wbindgen_*" which are exported by klib_bg.js.
  const importObject = Object.create(null);
  for (const im of WebAssembly.Module.imports(module)) {
    if (!importObject[im.module]) importObject[im.module] = Object.create(null);
    if (Object.prototype.hasOwnProperty.call(bg, im.name)) {
      importObject[im.module][im.name] = bg[im.name];
      continue;
    }
    throw new Error(`[kord] Missing import for ${im.module}.${im.name}`);
  }

  const instance = await WebAssembly.instantiate(module, importObject);
  if (typeof bg.__wbg_set_wasm !== "function") {
    throw new Error("[kord] klib_bg.js missing __wbg_set_wasm");
  }
  bg.__wbg_set_wasm(instance.exports);
  __kord_inited = true;
}
