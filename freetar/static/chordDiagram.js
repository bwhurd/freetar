/* chordDiagram.js
   Pure, reusable chord diagram utilities.
   Safe to load on any page; no Jinja vars needed.
   Exposes: parseShapeTokens, buildDiagramModel, buildChordTableInnerHTML, renderCardDiagram (globals)
*/

// Mirror backend.py _parse_shape_tokens
function parseShapeTokens(shape) {
  // Dual-mode tokenizer:
  // - If separators exist (spaces/commas/pipes/dashes), allow multi-digit tokens. The UI emits
  //   space-separated tokens so frets >= 10 stay unambiguous.
  // - Otherwise (compact), read single digits; bracketed ([n]) or (([n])) are captured as one token.
  const { tokens } = parseTokensAndRootKinds(shape);
  return tokens;
}

/* Shared tokenizer for values + root kinds */
function parseTokensAndRootKinds(shapeText) {
  const input = typeof shapeText === 'string' ? shapeText : '';
  const tokens = [];
  const roots = []; // 'played' | 'ghost' | null
  const overlays = {}; // { [stringIndex]: { ghostFret: number } }
  const SEP = /[,\s\/|\-]/; // treat whitespace and punctuation as separators

  const push = (val, kind = null) => {
    if (tokens.length >= 6) return; // drop extras from the end
    const numVal = val == null ? null : Number(val);
    tokens.push(Number.isFinite(numVal) ? numVal : null);
    roots.push(kind === 'played' || kind === 'ghost' ? kind : null);
  };

  const recordOverlay = (idx, overlayVal) => {
    const ghostFret = Number(overlayVal);
    if (!Number.isFinite(ghostFret)) return;
    if (idx < 0 || idx >= 6) return;
    overlays[idx] = { ghostFret };
  };

  const pushWithOverlay = (val, kind, overlayVal) => {
    const idx = tokens.length;
    push(val, kind);
    if (tokens.length > idx) {
      recordOverlay(idx, overlayVal);
    }
  };

  const len = input.length;
  let i = 0;
  while (i < len) {
    const ch = input[i];

    if (SEP.test(ch)) {
      i += 1;
      continue;
    }

    const sub = input.slice(i);
    let m;

    if ((m = sub.match(/^\[\s*\(\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\)\s*\]/))) {
      pushWithOverlay(parseInt(m[1], 10), 'played', parseInt(m[2], 10)); // [(7,{8})]
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\{\s*\(\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\)\s*\}/))) {
      pushWithOverlay(parseInt(m[1], 10), 'ghost', parseInt(m[2], 10)); // {(7,{8})}
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\(\s*\[\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\]\s*\)/))) {
      pushWithOverlay(parseInt(m[1], 10), 'ghost', parseInt(m[2], 10)); // legacy ([7,{8}])
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\(\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\)/))) {
      pushWithOverlay(parseInt(m[1], 10), null, parseInt(m[2], 10)); // (7,{8})
      i += m[0].length;
      continue;
    }

    if ((m = sub.match(/^\{\s*\(\s*(\d+)\s*\)\s*\}/))) {
      push(parseInt(m[1], 10), 'ghost'); // {(10)}
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\{\s*(\d+)\s*\}/))) {
      push(parseInt(m[1], 10), 'ghost'); // {10}
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\[\s*\(\s*(\d+)\s*\)\s*\]/))) {
      push(parseInt(m[1], 10), 'played'); // [(10)]
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
      push(parseInt(m[1], 10), 'played'); // [10]
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\(\s*\[\s*(\d+)\s*\]\s*\)/))) {
      push(parseInt(m[1], 10), 'ghost'); // legacy ([10])
      i += m[0].length;
      continue;
    }
    if ((m = sub.match(/^\(\s*(\d+)\s*\)/))) {
      push(parseInt(m[1], 10), null); // (10)
      i += m[0].length;
      continue;
    }

    if (ch === 'x' || ch === 'X') {
      push(null, null);
      i += 1;
      continue;
    }

    if (/\d/.test(ch)) {
      const digitRunMatch = sub.match(/^\d+/);
      const digitRun = digitRunMatch ? digitRunMatch[0] : ch;
      const nextCharIndex = i + digitRun.length;
      const prevChar = i > 0 ? input[i - 1] : null;
      const nextChar = nextCharIndex < len ? input[nextCharIndex] : null;
      const prevIsSep = prevChar == null || SEP.test(prevChar);
      const nextIsSep = nextChar == null || SEP.test(nextChar);
      const isolatedTwoDigit = prevIsSep && nextIsSep && digitRun.length === 2;

      if (isolatedTwoDigit) {
        push(parseInt(digitRun, 10), null); // treat space-separated 10/11/etc. as multi-digit
        i += digitRun.length;
        continue;
      }

      for (let k = 0; k < digitRun.length && tokens.length < 6; k += 1) {
        const d = parseInt(digitRun[k], 10);
        push(Number.isFinite(d) ? d : null, null);
      }
      i += digitRun.length;
      continue;
    }

    i += 1; // skip anything else
  }

  while (tokens.length < 6) {
    tokens.push(null);
    roots.push(null);
  }

  if (tokens.length > 6) {
    tokens.length = 6;
    roots.length = 6;
  }

  Object.keys(overlays).forEach((idx) => {
    const n = Number(idx);
    if (!Number.isInteger(n) || n < 0 || n >= tokens.length) {
      delete overlays[idx];
    }
  });

  return { tokens, roots, overlays };
}

function parseRootKinds(shape) {
  const { roots } = parseTokensAndRootKinds(shape);
  return roots; // array of 6: 'played' | 'ghost' | null
}

function buildShapeFromTokensAndRootKinds(tokens, roots, overlays) {
  const vals = Array.isArray(tokens) ? tokens.slice(0, 6) : [];
  const kinds = Array.isArray(roots) ? roots.slice(0, 6) : [];
  while (vals.length < 6) vals.push(null);
  while (kinds.length < 6) kinds.push(null);

  return vals
    .map((t, i) => {
      const rk = kinds[i] === 'played' || kinds[i] === 'ghost' ? kinds[i] : null;
      if (t == null) return 'x';
      const num = Number(t);
      if (!Number.isFinite(num)) return 'x';
      const overlayVal =
        overlays && overlays[i] && Number.isFinite(Number(overlays[i].ghostFret))
          ? Number(overlays[i].ghostFret)
          : null;
      if (num === 0) {
        const coreZero = overlayVal != null ? `(${num},{${overlayVal}})` : '0';
        if (overlayVal != null && rk === 'played') return `[${coreZero}]`;
        if (overlayVal != null && rk === 'ghost') return `{${coreZero}}`;
        if (rk === 'played') return '[0]';
        if (rk === 'ghost') return '{0}';
        return coreZero;
      }
      const core = overlayVal != null ? `(${num},{${overlayVal}})` : num >= 10 ? `(${num})` : String(num);
      if (rk === 'played') return `[${core}]`;
      if (rk === 'ghost') return `{${core}}`;
      return core;
    })
    .join('');
}

function normalizeShapeText(raw) {
  const parsed = parseTokensAndRootKinds(raw);
  return buildShapeFromTokensAndRootKinds(parsed.tokens, parsed.roots, parsed.overlays);
}

function deriveAutoBaseFret(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return 1;
  const fretted = tokens.filter((t) => typeof t === 'number' && t > 0);
  if (!fretted.length) return 1;
  const minFret = Math.min(...fretted);
  return Math.max(1, minFret);
}

function buildDiagramModel(shape, baseFret) {
  const parsedShape = parseTokensAndRootKinds(shape);
  const tokens = parsedShape.tokens;
  const rootKinds = parsedShape.roots;
  const overlayRoots = parsedShape.overlays || {};
  const header = tokens.map((t) => (t == null ? 'X' : t === 0 ? 'O' : String(t)));
  const base =
    typeof baseFret === 'number' && Number.isFinite(baseFret) && baseFret > 0 ? baseFret : null;
  let start;
  if (base != null) {
    start = base;
  } else {
    start = deriveAutoBaseFret(tokens);
  }
  const frets = [start, start + 1, start + 2, start + 3];
  const rows = frets.map((fret) => ({
    fret,
    strings: tokens.map((t) => (t === fret ? 1 : 0)),
    overlays: tokens.map((_, idx) => {
      const ov = overlayRoots[idx];
      const ghostFret =
        ov && Number.isFinite(Number(ov.ghostFret)) ? Number(ov.ghostFret) : null;
      if (ghostFret == null) return 0;
      if (tokens[idx] != null && ghostFret === tokens[idx]) return 0; // avoid double on same cell
      return ghostFret === fret ? 1 : 0;
    }),
  }));
  return { header, rows, rootKinds };
}

function buildChordTableInnerHTML(model) {
  const headerTokens =
    model && Array.isArray(model.header) && model.header.length
      ? model.header
      : new Array(6).fill('');

  // Header: show small turquoise dot for open-string roots ([0] or ([0])) instead of 'O'
  const headerCells = headerTokens
    .map((x, i, arr) => {
      const pos = i === 0 ? ' string-left' : i === arr.length - 1 ? ' string-right' : '';
      const cls =
        x === 'X' ? 'chord-header-muted' : x === 'O' ? 'chord-header-open' : 'chord-header-fret';
      const rk = (model.rootKinds && model.rootKinds[i]) || null;

      let label = '';
      if (x === 'X') {
        label =
          rk === 'ghost'
            ? `<span class="chord-header-label chord-header-muted-x">X</span>`
            : `<span class="chord-header-label">X</span>`;
      } else if (x === 'O') {
        if (rk === 'played') {
          // open-string root (played) → filled root dot with R label above nut
          label = `<span class="chord-header-root chord-header-root-played"><span class="chord-header-root-label">R</span></span>`;
        } else if (rk === 'ghost') {
          // open-string ghost root → ghost marker plus muted X above nut
          label = `<span class="chord-header-label chord-header-label-ghost-with-x"><span class="chord-header-muted-x">X</span><span class="chord-header-root chord-header-root-ghost"><span class="chord-header-root-mini"></span></span></span>`;
        } else {
          label = `<span class="chord-header-label">O</span>`;
        }
      } else {
        // numeric header shown in footer; keep placeholder unless we need muted X for ghost roots
        label =
          rk === 'ghost'
            ? `<span class="chord-header-label chord-header-muted-x">X</span>`
            : `<span class="chord-header-placeholder"></span>`;
      }

      return `<th class="chord-header-string ${cls} string-col${pos}">${label}</th>`;
    })
    .join('');

  // Body: dots sit ABOVE strings/fretlines and respect root styling
  const bodyRows = model.rows
    .map((row) => {
      const cells = headerTokens
        .map((_, i, arr) => {
          const pos = i === 0 ? ' string-left' : i === arr.length - 1 ? ' string-right' : '';
          let dotClasses = 'chord-dot';
          let dotInner = '';
          if (row.strings[i]) {
            const rk = (model.rootKinds && model.rootKinds[i]) || null;
            if (rk === 'played') {
              dotClasses += ' chord-dot-filled root-played';
              dotInner = `<span class="chord-dot-label">R</span>`;
            } else if (rk === 'ghost') {
              dotClasses += ' root-ghost';
              dotInner = `<span class="chord-dot-mini"></span>`;
            } else {
              dotClasses += ' chord-dot-filled';
            }
          }
          const hasOverlay = row.overlays && row.overlays[i];
          const overlayDot = hasOverlay
            ? `<div class="chord-dot chord-dot-overlay root-ghost"><span class="chord-dot-mini"></span></div>`
            : '';
          return `<td class="chord-string-cell${pos}"><div class="chord-dot-wrap"><div class="${dotClasses}">${dotInner}</div>${overlayDot}</div></td>`;
        })
        .join('');
      return `<tr data-fret="${row.fret}"><td class="chord-fret-label">${row.fret}</td>${cells}</tr>`;
    })
    .join('');

  const footerCells = headerTokens
    .map((x, i) => {
      const rk = (model.rootKinds && model.rootKinds[i]) || null;
      const footerLabel = x === 'X' || x === 'O' || rk === 'ghost' ? '' : x;
      const footerText = footerLabel == null ? '' : footerLabel;
      return `<td class="chord-footer-cell"><span class="chord-footer-label">${footerText}</span></td>`;
    })
    .join('');

  return `
    <thead>
      <tr>
        <th class="chord-header-spacer"></th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="chord-footer-row">
        <td class="chord-footer-spacer"></td>
        ${footerCells}
      </tr>
    </tbody>
  `;
}

function renderCardDiagram(card) {
  const shapeInput = card.querySelector('.chord-shape-input');
  const shape = shapeInput ? (shapeInput.value || '').trim() : '000000';
  const baseAttr = card?.dataset?.baseFret;
  const baseFret =
    baseAttr && Number.isFinite(Number(baseAttr)) && Number(baseAttr) > 0 ? Number(baseAttr) : null;
  const model = buildDiagramModel(shape, baseFret);
  let table = card.querySelector('table.chord-diagram');
  if (!table) {
    table = document.createElement('table');
    table.className = 'chord-diagram';
    // place after edit fields to match server structure
    const fields = card.querySelector('.chord-edit-fields');
    if (fields && fields.nextSibling) {
      card.insertBefore(table, fields.nextSibling);
    } else {
      card.appendChild(table);
    }
  }

  // Snap critical stroke sizes to device pixels to avoid rounding drift at different zooms.
  (function applyCrispSizing(tbl) {
    // Measure --u in px by probing a child whose width is var(--u)
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;height:0;overflow:hidden;width:var(--u);';
    tbl.appendChild(probe);
    const uPx = probe.getBoundingClientRect().width || 0;
    probe.remove();
    if (!uPx) return;

    const cs = getComputedStyle(tbl);
    const getNum = (name, fallback) => {
      const raw = cs.getPropertyValue(name).trim();
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    // Custom props defined on .chord-diagram
    const stringW = getNum('--string-width', 0.1);
    const fretW = getNum('--fretline-width', 0.08);
    const nutW = getNum('--nutline-width', 0.2);
    const ringW = 0.04; // used for header ghost ring and ghost root ring

    const dpr = window.devicePixelRatio || 1;
    const snap = (px) => Math.round(px * dpr) / dpr;
    const minUnit = 1 / dpr; // ensure >= 1 device pixel

    tbl.style.setProperty('--string-width-px', `${Math.max(minUnit, snap(uPx * stringW))}px`);
    tbl.style.setProperty('--fretline-width-px', `${Math.max(minUnit, snap(uPx * fretW))}px`);
    tbl.style.setProperty('--nutline-width-px', `${Math.max(minUnit, snap(uPx * nutW))}px`);
    tbl.style.setProperty('--ring-width-px', `${Math.max(minUnit, snap(uPx * ringW))}px`);
  })(table);

  table.innerHTML = buildChordTableInnerHTML(model);

  // Re-snap on zoom/resize (idempotent, cheap)
  if (!window.__chordCrispSizerAttached) {
    window.addEventListener(
      'resize',
      () => {
        document.querySelectorAll('table.chord-diagram').forEach((el) => {
          (function applyCrispSizing(tbl) {
            const probe = document.createElement('div');
            probe.style.cssText =
              'position:absolute;visibility:hidden;height:0;overflow:hidden;width:var(--u);';
            tbl.appendChild(probe);
            const uPx = probe.getBoundingClientRect().width || 0;
            probe.remove();
            if (!uPx) return;
            const cs = getComputedStyle(tbl);
            const getNum = (name, fallback) => {
              const raw = cs.getPropertyValue(name).trim();
              const n = parseFloat(raw);
              return Number.isFinite(n) ? n : fallback;
            };
            const stringW = getNum('--string-width', 0.1);
            const fretW = getNum('--fretline-width', 0.08);
            const nutW = getNum('--nutline-width', 0.2);
            const dpr = window.devicePixelRatio || 1;
            const snap = (px) => Math.round(px * dpr) / dpr;
            const minUnit = 1 / dpr;
            tbl.style.setProperty(
              '--string-width-px',
              `${Math.max(minUnit, snap(uPx * stringW))}px`,
            );
            tbl.style.setProperty(
              '--fretline-width-px',
              `${Math.max(minUnit, snap(uPx * fretW))}px`,
            );
            tbl.style.setProperty('--nutline-width-px', `${Math.max(minUnit, snap(uPx * nutW))}px`);
            tbl.style.setProperty('--ring-width-px', `${Math.max(minUnit, snap(uPx * 0.04))}px`);
          })(el);
        });
      },
      { passive: true },
    );
    window.__chordCrispSizerAttached = true;
  }
}

function focusBaseFretInput() {
  const input =
    document.querySelector('#base-fret-modal-value.base-fret-input') ||
    document.getElementById('base-fret-modal-value');
  if (!input || typeof input.focus !== 'function') return;
  input.focus({ preventScroll: true });
  const len = input.value ? input.value.length : 0;
  try {
    input.setSelectionRange(len, len);
  } catch (_) {
    /* noop */
  }
}

// Expose tokenizer + root parser for edit-mode helpers
window.parseTokensAndRootKinds = parseTokensAndRootKinds;
window.buildShapeFromTokensAndRootKinds = buildShapeFromTokensAndRootKinds;
window.normalizeShapeText = normalizeShapeText;
window.focusBaseFretInput = focusBaseFretInput;
