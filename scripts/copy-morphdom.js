/* Copies morphdom (required) and undo-manager (optional) into Flask's static/vendor */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const destDir = path.join(repoRoot, 'freetar', 'static', 'vendor');
fs.mkdirSync(destDir, { recursive: true });
console.log('[postinstall] vendor target: ' + destDir);

function resolveFirst(list) {
  for (let i = 0; i < list.length; i++) {
    try {
      return require.resolve(list[i]);
    } catch (e) {
      /* try next */
    }
  }
  return null;
}

function copyResolved(resolvedPath, outName, required) {
  try {
    const dest = path.join(destDir, outName);
    fs.copyFileSync(resolvedPath, dest);
    console.log('[postinstall] Copied ' + resolvedPath + ' -> ' + dest);
    return true;
  } catch (e) {
    if (required) {
      console.error('[postinstall] Failed to copy required file: ' + resolvedPath, e);
      process.exitCode = 1;
    } else {
      console.log('[postinstall] Optional file not copied: ' + resolvedPath);
    }
    return false;
  }
}

// Required: morphdom UMD
const m = resolveFirst(['morphdom/dist/morphdom-umd.min.js']);
if (!m) {
  console.error('[postinstall] morphdom UMD not found. Is "morphdom" installed?');
  process.exitCode = 1;
} else {
  copyResolved(m, 'morphdom-umd.min.js', true);
}

// Optional: undo-manager (package path varies)
const u = resolveFirst([
  'undo-manager/lib/undomanager.js',
  'undo-manager/lib/undo-manager.js',
  'undo-manager/undomanager.js',
  'undo-manager/undo-manager.js',
]);
if (u) {
  copyResolved(u, 'undomanager.js', false);
} else {
  console.log('[postinstall] undo-manager not found (optional) — skipping copy.');
}
