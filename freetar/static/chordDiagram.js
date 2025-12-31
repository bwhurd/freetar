/* chordDiagram.js
   Pure, reusable chord diagram utilities.
   Safe to load on any page; no Jinja vars needed.
   Exposes: parseShapeTokens, buildDiagramModel, buildChordTableInnerHTML, renderCardDiagram (globals)
*/

const CARD_SHAPE_CACHE = new WeakMap();
const CARD_INTERACTION_MARK = new WeakSet();
const CARD_BASE_FRET_CACHE = new WeakMap();
let chordDiagramInteractionListenerAttached = false;
const DEFAULT_VISIBLE_FRET_ROWS = 4;
const MAX_VISIBLE_FRET_ROWS = 5;

function ensureChordDiagramInteractionListener() {
  if (chordDiagramInteractionListenerAttached) return;
  chordDiagramInteractionListenerAttached = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const tbl = e.target?.closest?.('table.chord-diagram') || null;
      if (!tbl) return;
      const card = tbl.closest('.chord-card');
      if (!card) return;
      CARD_INTERACTION_MARK.add(card);
    },
    true,
  );
}

function getVisibleFretRows() {
  if (typeof window !== 'undefined' && window.MY_CHORDS_VISIBLE_FRETS != null) {
    const parsed = parseInt(window.MY_CHORDS_VISIBLE_FRETS, 10);
    if (
      Number.isFinite(parsed) &&
      parsed >= DEFAULT_VISIBLE_FRET_ROWS &&
      parsed <= MAX_VISIBLE_FRET_ROWS
    ) {
      return parsed;
    }
  }
  return DEFAULT_VISIBLE_FRET_ROWS;
}

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
  const SEP = /[,\s/|-]/; // treat whitespace and punctuation as separators

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

    m = sub.match(/^\[\s*\(\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\)\s*\]/);
    if (m) {
      pushWithOverlay(parseInt(m[1], 10), 'played', parseInt(m[2], 10)); // [(7,{8})]
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\{\s*\(\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\)\s*\}/);
    if (m) {
      pushWithOverlay(parseInt(m[1], 10), 'ghost', parseInt(m[2], 10)); // {(7,{8})}
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\(\s*\[\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\]\s*\)/);
    if (m) {
      pushWithOverlay(parseInt(m[1], 10), 'ghost', parseInt(m[2], 10)); // legacy ([7,{8}])
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\(\s*(\d+)\s*,?\s*\{\s*(\d+)\s*\}\s*\)/);
    if (m) {
      pushWithOverlay(parseInt(m[1], 10), null, parseInt(m[2], 10)); // (7,{8})
      i += m[0].length;
      continue;
    }

    m = sub.match(/^\{\s*\(\s*(\d+)\s*\)\s*\}/);
    if (m) {
      push(parseInt(m[1], 10), 'ghost'); // {(10)}
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\{\s*(\d+)\s*\}/);
    if (m) {
      push(parseInt(m[1], 10), 'ghost'); // {10}
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\[\s*\(\s*(\d+)\s*\)\s*\]/);
    if (m) {
      push(parseInt(m[1], 10), 'played'); // [(10)]
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\[\s*(\d+)\s*\]/);
    if (m) {
      push(parseInt(m[1], 10), 'played'); // [10]
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\(\s*\[\s*(\d+)\s*\]\s*\)/);
    if (m) {
      push(parseInt(m[1], 10), 'ghost'); // legacy ([10])
      i += m[0].length;
      continue;
    }
    m = sub.match(/^\(\s*(\d+)\s*\)/);
    if (m) {
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
      const overlayGhost = overlays?.[i]?.ghostFret;
      const overlayVal = Number.isFinite(Number(overlayGhost)) ? Number(overlayGhost) : null;
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

function deriveAutoBaseFret(tokens, overlays) {
  if (!Array.isArray(tokens) || !tokens.length) return 1;
  const fretted = tokens.filter((t) => typeof t === 'number' && t > 0);
  if (overlays && typeof overlays === 'object') {
    Object.values(overlays).forEach((ov) => {
      const ghostFret = ov && Number.isFinite(Number(ov.ghostFret)) ? Number(ov.ghostFret) : null;
      if (ghostFret != null && ghostFret > 0) fretted.push(ghostFret);
    });
  }
  if (!fretted.length) return 1;
  const maxFret = Math.max(...fretted);
  const visibleRows = getVisibleFretRows();
  const clampThreshold = Math.max(DEFAULT_VISIBLE_FRET_ROWS, visibleRows);
  if (maxFret <= clampThreshold) return 1; // keep open-position chords pinned near the nut
  const minFret = Math.min(...fretted);
  return Math.max(1, minFret);
}

// Standard tuning EADGBE; only semitone differences mod 12 matter.
const INTERVAL_OPEN_PITCHES = [40, 45, 50, 55, 59, 64];

const INTERVAL_BY_SEMITONE = {
  0: 'R1', // not used directly; primary root renders as "R"
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: 'b5',
  7: '5',
  8: 'b6',
  9: '6',
  10: 'b7',
  11: '7',
};

function findPrimaryRoot(tokens, rootKinds, overlays) {
  if (!Array.isArray(tokens) || !Array.isArray(rootKinds)) return null;

  // 1) Prefer an explicit played root on a real token
  for (let i = 0; i < rootKinds.length; i += 1) {
    if (rootKinds[i] === 'played' && tokens[i] != null) {
      const fret = tokens[i];
      if (typeof fret === 'number') return { stringIndex: i, fret };
    }
  }

  // 2) Then prefer an explicit ghost root on a real token
  for (let i = 0; i < rootKinds.length; i += 1) {
    if (rootKinds[i] === 'ghost' && tokens[i] != null) {
      const fret = tokens[i];
      if (typeof fret === 'number') return { stringIndex: i, fret };
    }
  }

  // 3) Finally: if there is an overlay ghost root (e.g. (7,{8})), use that as the primary root
  // This is what makes (7,{8})x998x compute intervals relative to the ghost root at 8.
  if (overlays && typeof overlays === 'object') {
    for (let i = 0; i < 6; i += 1) {
      const ov = overlays[i];
      const ghostFret = ov && Number.isFinite(Number(ov.ghostFret)) ? Number(ov.ghostFret) : null;
      if (ghostFret != null) return { stringIndex: i, fret: ghostFret };
    }
  }

  return null;
}


function getIntervalLabelForNote(primaryRoot, stringIndex, fret) {
  if (!primaryRoot) return null;
  if (typeof stringIndex !== 'number' || typeof fret !== 'number') return null;
  if (
    stringIndex < 0 ||
    stringIndex >= INTERVAL_OPEN_PITCHES.length ||
    primaryRoot.stringIndex < 0 ||
    primaryRoot.stringIndex >= INTERVAL_OPEN_PITCHES.length
  ) {
    return null;
  }

  const rootPitch = INTERVAL_OPEN_PITCHES[primaryRoot.stringIndex] + primaryRoot.fret;
  const notePitch = INTERVAL_OPEN_PITCHES[stringIndex] + fret;
  let diff = (notePitch - rootPitch) % 12;
  if (diff < 0) diff += 12;

  if (diff === 0) {
    // Same pitch class as the primary root: show "1" on repeated roots.
    return '1';
  }
  return INTERVAL_BY_SEMITONE[diff] || null;
}

/*
  Ordered interval relabeling rules (first match wins), assuming a primary root and presentRaw exist:

  A) Upper structure naming for 2, 4, 6 (only these three)
     - If rawLabel is "2"
       - If hasThird is false, return "2"
       - Else return "9"
     - If rawLabel is "4"
       - If hasThird is false, return "4"
       - Else return "11"
     - If rawLabel is "6"
       - If hasSeventh is true, return "13"
       - Else return "6"

  B) Simple alteration spellings (apply only when the specific rawLabel matches)
     - If rawLabel is "b2" AND hasSeventh is true, return "b9"
     - If rawLabel is "b6" AND hasSeventh is true, return "b13"
     - If rawLabel is "b5" AND hasMajThird is true AND hasMinThird is false, return "#11"
     - If rawLabel is "b3" AND hasMajThird is true AND has("b7") is true, return "#9"

  C) Otherwise return rawLabel unchanged.
*/
function applyIntervalDisplayRules(rawLabel, presentRaw) {
  if (!rawLabel) return rawLabel;
  if (rawLabel === '1') return rawLabel; // raw repeated roots stay as-is
  if (!presentRaw || !(presentRaw instanceof Set)) return rawLabel;

  const has = (lbl) => presentRaw.has(lbl);
  const hasThird = has('3') || has('b3');
  const hasSeventh = has('7') || has('b7');
  const hasMajThird = has('3');
  const hasMinThird = has('b3');

  // A) Upper structure naming for 2, 4, 6
  if (rawLabel === '2') {
    if (!hasThird) return '2';
    return '9';
  }
  if (rawLabel === '4') {
    if (!hasThird) return '4';
    return '11';
  }
  if (rawLabel === '6') {
    if (hasSeventh) return '13';
    return '6';
  }

  // B) Simple alteration spellings
  if (rawLabel === 'b2' && hasSeventh) return 'b9';
  if (rawLabel === 'b6' && hasSeventh) return 'b13';
  if (rawLabel === 'b5' && hasMajThird && !hasMinThird) return '#11';
  if (rawLabel === 'b3' && hasMajThird && has('b7')) return '#9';

  return rawLabel;
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
    start = deriveAutoBaseFret(tokens, overlayRoots);
  }
  const visibleRows = getVisibleFretRows();
  const frets = Array.from({ length: visibleRows }, (_, idx) => start + idx);
  const rows = frets.map((fret) => ({
    fret,
    strings: tokens.map((t) => (t === fret ? 1 : 0)),
    overlays: tokens.map((_, idx) => {
      const ov = overlayRoots[idx];
      const ghostFret = ov && Number.isFinite(Number(ov.ghostFret)) ? Number(ov.ghostFret) : null;
      if (ghostFret == null) return 0;
      if (tokens[idx] != null && ghostFret === tokens[idx]) return 0; // avoid double on same cell
      return ghostFret === fret ? 1 : 0;
    }),
  }));

  // Key change: allow overlay ghost roots to become the interval reference root when no other root exists.
  const primaryRoot = findPrimaryRoot(tokens, rootKinds, overlayRoots);

  return { header, rows, rootKinds, tokens, primaryRoot };
}




function buildChordTableInnerHTML(model) {
  const headerTokens =
    model && Array.isArray(model.header) && model.header.length
      ? model.header
      : new Array(6).fill('');

  const primaryRoot = model?.primaryRoot ?? null;
  const showIntervals =
    typeof window !== 'undefined' && window.MY_CHORD_INTERVALS_ENABLED === true;
  const presentRaw =
    showIntervals && primaryRoot
      ? (() => {
        const set = new Set();
        const tokens = Array.isArray(model.tokens) ? model.tokens : [];
        tokens.forEach((t, idx) => {
          if (typeof t !== 'number') return;
          const raw = getIntervalLabelForNote(primaryRoot, idx, t);
          if (!raw || raw === '1') return;
          set.add(raw);
        });
        const rows = Array.isArray(model.rows) ? model.rows : [];
        rows.forEach((row) => {
          if (!row || !Array.isArray(row.overlays)) return;
          row.overlays.forEach((ov, idx) => {
            if (!ov) return;
            const raw = getIntervalLabelForNote(primaryRoot, idx, row.fret);
            if (!raw || raw === '1') return;
            set.add(raw);
          });
        });
        return set;
      })()
      : null;

  // Header: show small turquoise dot for open-string roots ([0] or ([0])) instead of 'O'

  const headerCells = headerTokens
    .map((x, i, arr) => {
      const pos = i === 0 ? ' string-left' : i === arr.length - 1 ? ' string-right' : '';
      const cls =
        x === 'X' ? 'chord-header-muted' : x === 'O' ? 'chord-header-open' : 'chord-header-fret';
      const rk = model.rootKinds?.[i] || null;
      const rawIntervalLabel =
        showIntervals && primaryRoot ? getIntervalLabelForNote(primaryRoot, i, 0) : null;
      const intervalLabel =
        rawIntervalLabel && showIntervals
          ? applyIntervalDisplayRules(rawIntervalLabel, presentRaw)
          : null;

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
          // open string non-root: show a filled dot; include interval text when available
          if (showIntervals) {
            const intervalSpan = intervalLabel
              ? `<span class="chord-dot-label chord-dot-interval-label chord-dot-interval-label--open">${intervalLabel}</span>`
              : '';
            label = `<span class="chord-header-root chord-header-open-note">${intervalSpan}</span>`;
          } else {
            label = `<span class="chord-header-label">O</span>`;
          }
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
            const rk = model.rootKinds?.[i] || null;
            if (rk === 'played') {
              dotClasses += ' chord-dot-filled root-played';
              dotInner = `<span class="chord-dot-label">R</span>`;
            } else if (rk === 'ghost') {
              dotClasses += ' root-ghost';
              dotInner = `<span class="chord-dot-mini"></span>`;
            } else {
              dotClasses += ' chord-dot-filled';
              if (showIntervals && primaryRoot) {
                const rawIntervalLabel = getIntervalLabelForNote(primaryRoot, i, row.fret);
                const intervalLabel = applyIntervalDisplayRules(rawIntervalLabel, presentRaw);
                if (intervalLabel) {
                  dotInner = `<span class="chord-dot-label chord-dot-interval-label">${intervalLabel}</span>`;
                }

              }
            }
          }
          const hasOverlay = row.overlays?.[i];
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
      const rk = model.rootKinds?.[i] || null;
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

function readBaseFret(val) {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getCachedBaseFret(card) {
  if (!card) return null;
  const cached = CARD_BASE_FRET_CACHE.get(card);
  return readBaseFret(cached);
}

function setCachedBaseFret(card, base) {
  if (!card) return;
  const valid = readBaseFret(base);
  if (valid == null) {
    CARD_BASE_FRET_CACHE.delete(card);
    return;
  }
  CARD_BASE_FRET_CACHE.set(card, valid);
}

function renderCardDiagram(card, options) {
  ensureChordDiagramInteractionListener();
  const opts = options && typeof options === 'object' ? options : {};
  const forceRecomputeBase = opts.forceRecomputeBase === true;
  const shapeInput = card.querySelector('.chord-shape-input');
  const shape = shapeInput ? (shapeInput.value || '').trim() : '000000';
  const baseAttr = card?.dataset?.baseFret;
  const explicitBase = readBaseFret(baseAttr);
  const cachedBase = !forceRecomputeBase && explicitBase == null ? getCachedBaseFret(card) : null;
  const baseForModel = explicitBase != null ? explicitBase : cachedBase;
  const model = buildDiagramModel(shape, baseForModel);
  const derivedBase =
    explicitBase != null
      ? explicitBase
      : Array.isArray(model?.rows) && model.rows.length
        ? model.rows[0].fret
        : null;
  setCachedBaseFret(card, derivedBase);
  let table = card.querySelector('table.chord-diagram');
  if (!table) {
    table = document.createElement('table');
    table.className = 'chord-diagram';
    // place after edit fields to match server structure
    const fields = card.querySelector('.chord-edit-fields');
    if (fields?.nextSibling) {
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

  const lastShape = CARD_SHAPE_CACHE.has(card) ? CARD_SHAPE_CACHE.get(card) : undefined;
  CARD_SHAPE_CACHE.set(card, shape);
  const interacted = CARD_INTERACTION_MARK.has(card);
  if (interacted) CARD_INTERACTION_MARK.delete(card);
  if (interacted && lastShape !== undefined && lastShape !== shape) {
    try {
      card.dispatchEvent(
        new CustomEvent('chord-diagram-changed', {
          bubbles: true,
          detail: { card },
        }),
      );
    } catch (_) {
      /* noop */
    }
  }

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
window.parseShapeTokens = parseShapeTokens;
window.parseTokensAndRootKinds = parseTokensAndRootKinds;
window.parseRootKinds = parseRootKinds;
window.buildShapeFromTokensAndRootKinds = buildShapeFromTokensAndRootKinds;
window.normalizeShapeText = normalizeShapeText;
window.renderCardDiagram = renderCardDiagram;
window.focusBaseFretInput = focusBaseFretInput;
window.getChordDiagramVisibleRows = getVisibleFretRows;
