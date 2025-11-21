/* chordDiagram.js
   Pure, reusable chord diagram utilities.
   Safe to load on any page; no Jinja vars needed.
   Exposes: parseShapeTokens, buildDiagramModel, buildChordTableInnerHTML, renderCardDiagram (globals)
*/

// Mirror backend.py _parse_shape_tokens
function parseShapeTokens(shape) {
  // Dual-mode tokenizer:
  // - If separators exist (spaces/commas/pipes/dashes), allow multi-digit tokens.
  // - Otherwise (compact), read single digits; bracketed ([n]) or (([n])) are captured as one token.
  const { tokens } = parseTokensAndRootKinds(shape);
  return tokens;
}

// Detect per-string root annotations without altering numeric frets.
// Returns array of 6 entries: 'played' | 'ghost' | null
function parseRootKinds(shape) {
  const s = (shape || '').trim();
  // Order matters: ([n]) first, then [n], then x/number.
  const re = /\(\s*\[(\d+)\]\s*\)|\[\s*(\d+)\s*\]|[xX]|\d+/g;
  const kindsRaw = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1])
      kindsRaw.push('ghost'); // ([n])
    else if (m[2])
      kindsRaw.push('played'); // [n]
    else kindsRaw.push(null); // x/X or plain number
  }
  if (kindsRaw.length === 0) return [null, null, null, null, null, null];
  let kinds = kindsRaw;
  if (kinds.length < 6) kinds = new Array(6 - kinds.length).fill(null).concat(kinds);
  if (kinds.length > 6) kinds = kinds.slice(-6);
  return kinds;
}

/* Shared tokenizer for values + root kinds */
function parseTokensAndRootKinds(shape) {
  const s = (shape || '').trim();
  const SEP = /[,\s\/|\-]+/; // spaces, commas, slashes, pipes, dashes
  const hasSep = SEP.test(s);
  const vals = [];
  const kinds = []; // 'played' | 'ghost' | null

  const push = (val, kind = null) => {
    vals.push(val);
    kinds.push(kind);
  };

  // Try to parse a segment into one token (with optional root kind)
  function parseSegment(seg) {
    let m;
    if ((m = seg.match(/^\(\s*\[(\d+)\]\s*\)$/))) return push(parseInt(m[1], 10), 'ghost'); // ([n])
    if ((m = seg.match(/^\[\s*(\d+)\s*\]$/))) return push(parseInt(m[1], 10), 'played'); // [n]
    if (/^[xX]$/.test(seg)) return push(null, null);
    if (/^\d+$/.test(seg)) return push(parseInt(seg, 10), null);
    // Fallback: scan within segment (handles "x[2]" etc.)
    let i = 0;
    while (i < seg.length) {
      const sub = seg.slice(i);
      if ((m = sub.match(/^\(\s*\[(\d+)\]\s*\)/))) {
        push(parseInt(m[1], 10), 'ghost');
        i += m[0].length;
        continue;
      }
      if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
        push(parseInt(m[1], 10), 'played');
        i += m[0].length;
        continue;
      }
      const ch = seg[i];
      if (ch === 'x' || ch === 'X') {
        push(null, null);
        i += 1;
        continue;
      }
      if (/\d/.test(ch)) {
        push(parseInt(ch, 10), null);
        i += 1;
        continue;
      } // single digit in compact/fallback
      i += 1; // skip anything else
    }
  }

  if (hasSep) {
    s.split(SEP)
      .filter(Boolean)
      .forEach((part) => parseSegment(part.trim()));
  } else {
    // Compact: scan char-by-char with bracket recognition
    let i = 0,
      m;
    while (i < s.length) {
      const sub = s.slice(i);
      if ((m = sub.match(/^\(\s*\[(\d+)\]\s*\)/))) {
        push(parseInt(m[1], 10), 'ghost');
        i += m[0].length;
        continue;
      }
      if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
        push(parseInt(m[1], 10), 'played');
        i += m[0].length;
        continue;
      }
      const ch = s[i];
      if (ch === 'x' || ch === 'X') {
        push(null, null);
        i += 1;
        continue;
      }
      if (/\d/.test(ch)) {
        push(parseInt(ch, 10), null);
        i += 1;
        continue;
      }
      i += 1; // ignore other characters
    }
  }

  // Normalize to 6 strings
  const padToSix = (arr, fill = null) =>
    arr.length === 0
      ? [fill, fill, fill, fill, fill, fill]
      : arr.length < 6
        ? new Array(6 - arr.length).fill(fill).concat(arr)
        : arr.length > 6
          ? arr.slice(-6)
          : arr;

  return { tokens: padToSix(vals, null), roots: padToSix(kinds, null) };
}

function parseRootKinds(shape) {
  const { roots } = parseTokensAndRootKinds(shape);
  return roots; // array of 6: 'played' | 'ghost' | null
}

/* Shared tokenizer for values + root kinds */
function parseTokensAndRootKinds(shape) {
  const s = (shape || '').trim();
  const SEP = /[,\s\/|\-]+/; // spaces, commas, slashes, pipes, dashes
  const hasSep = SEP.test(s);
  const vals = [];
  const kinds = []; // 'played' | 'ghost' | null

  const push = (val, kind = null) => {
    vals.push(val);
    kinds.push(kind);
  };

  // Try to parse a segment into one token (with optional root kind)
  function parseSegment(seg) {
    let m;
    if ((m = seg.match(/^\(\s*\[(\d+)\]\s*\)$/))) return push(parseInt(m[1], 10), 'ghost'); // ([n])
    if ((m = seg.match(/^\[\s*(\d+)\s*\]$/))) return push(parseInt(m[1], 10), 'played'); // [n]
    if (/^[xX]$/.test(seg)) return push(null, null);
    if (/^\d+$/.test(seg)) return push(parseInt(seg, 10), null);
    // Fallback: scan within segment (handles "x[2]" etc.)
    let i = 0;
    while (i < seg.length) {
      const sub = seg.slice(i);
      if ((m = sub.match(/^\(\s*\[(\d+)\]\s*\)/))) {
        push(parseInt(m[1], 10), 'ghost');
        i += m[0].length;
        continue;
      }
      if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
        push(parseInt(m[1], 10), 'played');
        i += m[0].length;
        continue;
      }
      const ch = seg[i];
      if (ch === 'x' || ch === 'X') {
        push(null, null);
        i += 1;
        continue;
      }
      if (/\d/.test(ch)) {
        push(parseInt(ch, 10), null);
        i += 1;
        continue;
      } // single digit in compact/fallback
      i += 1; // skip anything else
    }
  }

  if (hasSep) {
    s.split(SEP)
      .filter(Boolean)
      .forEach((part) => parseSegment(part.trim()));
  } else {
    // Compact: scan char-by-char with bracket recognition
    let i = 0,
      m;
    while (i < s.length) {
      const sub = s.slice(i);
      if ((m = sub.match(/^\(\s*\[(\d+)\]\s*\)/))) {
        push(parseInt(m[1], 10), 'ghost');
        i += m[0].length;
        continue;
      }
      if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
        push(parseInt(m[1], 10), 'played');
        i += m[0].length;
        continue;
      }
      const ch = s[i];
      if (ch === 'x' || ch === 'X') {
        push(null, null);
        i += 1;
        continue;
      }
      if (/\d/.test(ch)) {
        push(parseInt(ch, 10), null);
        i += 1;
        continue;
      }
      i += 1; // ignore other characters
    }
  }

  // Normalize to 6 strings
  const padToSix = (arr, fill = null) =>
    arr.length === 0
      ? [fill, fill, fill, fill, fill, fill]
      : arr.length < 6
        ? new Array(6 - arr.length).fill(fill).concat(arr)
        : arr.length > 6
          ? arr.slice(-6)
          : arr;

  return { tokens: padToSix(vals, null), roots: padToSix(kinds, null) };
}

function parseRootKinds(shape) {
  const { roots } = parseTokensAndRootKinds(shape);
  return roots; // array of 6: 'played' | 'ghost' | null
}

/* Shared tokenizer for values + root kinds */
function parseTokensAndRootKinds(shape) {
  const s = (shape || '').trim();
  const SEP = /[,\s\/|\-]+/; // spaces, commas, slashes, pipes, dashes
  const hasSep = SEP.test(s);
  const vals = [];
  const kinds = []; // 'played' | 'ghost' | null

  const push = (val, kind = null) => {
    vals.push(val);
    kinds.push(kind);
  };

  // Try to parse a segment into one token (with optional root kind)
  function parseSegment(seg) {
    let m;
    if ((m = seg.match(/^\(\s*\[(\d+)\]\s*\)$/))) return push(parseInt(m[1], 10), 'ghost'); // ([n])
    if ((m = seg.match(/^\[\s*(\d+)\s*\]$/))) return push(parseInt(m[1], 10), 'played'); // [n]
    if (/^[xX]$/.test(seg)) return push(null, null);
    if (/^\d+$/.test(seg)) return push(parseInt(seg, 10), null);
    // Fallback: scan within segment (handles "x[2]" etc.)
    let i = 0;
    while (i < seg.length) {
      const sub = seg.slice(i);
      if ((m = sub.match(/^\(\s*\[(\d+)\]\s*\)/))) {
        push(parseInt(m[1], 10), 'ghost');
        i += m[0].length;
        continue;
      }
      if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
        push(parseInt(m[1], 10), 'played');
        i += m[0].length;
        continue;
      }
      const ch = seg[i];
      if (ch === 'x' || ch === 'X') {
        push(null, null);
        i += 1;
        continue;
      }
      if (/\d/.test(ch)) {
        push(parseInt(ch, 10), null);
        i += 1;
        continue;
      } // single digit in compact/fallback
      i += 1; // skip anything else
    }
  }

  if (hasSep) {
    s.split(SEP)
      .filter(Boolean)
      .forEach((part) => parseSegment(part.trim()));
  } else {
    // Compact: scan char-by-char with bracket recognition
    let i = 0,
      m;
    while (i < s.length) {
      const sub = s.slice(i);
      if ((m = sub.match(/^\(\s*\[(\d+)\]\s*\)/))) {
        push(parseInt(m[1], 10), 'ghost');
        i += m[0].length;
        continue;
      }
      if ((m = sub.match(/^\[\s*(\d+)\s*\]/))) {
        push(parseInt(m[1], 10), 'played');
        i += m[0].length;
        continue;
      }
      const ch = s[i];
      if (ch === 'x' || ch === 'X') {
        push(null, null);
        i += 1;
        continue;
      }
      if (/\d/.test(ch)) {
        push(parseInt(ch, 10), null);
        i += 1;
        continue;
      }
      i += 1; // ignore other characters
    }
  }

  // Normalize to 6 strings
  const padToSix = (arr, fill = null) =>
    arr.length === 0
      ? [fill, fill, fill, fill, fill, fill]
      : arr.length < 6
        ? new Array(6 - arr.length).fill(fill).concat(arr)
        : arr.length > 6
          ? arr.slice(-6)
          : arr;

  return { tokens: padToSix(vals, null), roots: padToSix(kinds, null) };
}

function parseRootKinds(shape) {
  const { roots } = parseTokensAndRootKinds(shape);
  return roots; // array of 6: 'played' | 'ghost' | null
}

function buildDiagramModel(shape) {
  const tokens = parseShapeTokens(shape);
  const rootKinds = parseRootKinds(shape);
  const header = tokens.map((t) => (t == null ? 'X' : t === 0 ? 'O' : String(t)));
  const used = tokens.filter((t) => t != null && t !== 0);
  let start = used.length ? Math.min(...used) : 1;
  if (start <= 1) start = 1;
  const frets = [start, start + 1, start + 2, start + 3];
  const rows = frets.map((fret) => ({
    fret,
    strings: tokens.map((t) => (t === fret ? 1 : 0)),
  }));
  return { header, rows, rootKinds };
}

function buildChordTableInnerHTML(model) {
  // Header: show small turquoise dot for open-string roots ([0] or ([0])) instead of 'O'
  const headerCells = model.header
    .map((x, i, arr) => {
      const pos = i === 0 ? ' string-left' : i === arr.length - 1 ? ' string-right' : '';
      const cls =
        x === 'X' ? 'chord-header-muted' : x === 'O' ? 'chord-header-open' : 'chord-header-fret';

      let label = '';
      if (x === 'X') {
        label = `<span class="chord-header-label">X</span>`;
      } else if (x === 'O') {
        const rk = (model.rootKinds && model.rootKinds[i]) || null;
        if (rk === 'played') {
          // open-string root (played) → small filled turquoise dot above nut
          label = `<span class="chord-header-root chord-header-root-played"></span>`;
        } else if (rk === 'ghost') {
          // open-string root (not played) → outline + smaller inner turquoise dot
          label = `<span class="chord-header-root chord-header-root-ghost"><span class="chord-header-root-mini"></span></span>`;
        } else {
          label = `<span class="chord-header-label">O</span>`;
        }
      } else {
        // numeric header shown in footer; nothing in header cell
        label = '';
      }

      return `<th class="${cls} string-col${pos}">${label}</th>`;
    })
    .join('');

  // Body: dots sit ABOVE strings/fretlines and respect root styling
  const bodyRows = model.rows
    .map((row) => {
      const cells = model.header
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
          return `<td class="chord-string-cell${pos}"><div class="chord-dot-wrap"><div class="${dotClasses}">${dotInner}</div></div></td>`;
        })
        .join('');
      return `<tr><td class="chord-fret-label">${row.fret}</td>${cells}</tr>`;
    })
    .join('');

  const footerCells = model.header
    .map((x) =>
      x === 'X' || x === 'O'
        ? `<td class="chord-footer-cell"></td>`
        : `<td class="chord-footer-cell"><span class="chord-footer-label">${x}</span></td>`,
    )
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
  const model = buildDiagramModel(shape);
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
