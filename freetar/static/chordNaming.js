(() => {
  /* biome-ignore lint/suspicious/noRedundantUseStrict: keep explicit strict mode for this script include */
  'use strict';

  const PRESENT_INTERVAL_COLOR = 'var(--accent, #43dfe7)';
  // Jazz chord naming (root-marked only).
  // - Computes chord intervals from the shape + explicitly marked root (played root or ghost root).
  // - Looks up matching chord types from a small C-root CSV-derived dictionary (vendored as JSON).
  // - Ranks candidates with "all essential notes present" first, then by dictionary overallRank.
  //
  // UI:
  // - Removes omnibox. Shows a persistent suggestions panel to the right of the active chord card.
  // - Panel appears when the card is in inline name edit OR in full edit mode.
  // - Clicking a suggestion writes the chord name into the active name input.

  const DICT_URL = (() => {
    const bust =
      typeof window !== 'undefined' && window.MCL_DICT_BUST != null ? String(window.MCL_DICT_BUST).trim() : '';
    if (!bust) return '/static/myChordsDictionary.json';
    return `/static/myChordsDictionary.json?v=${encodeURIComponent(bust)}`;
  })();

  // Standard tuning EADGBE; used to compute note midis from shape tokens.
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
  const PC_FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  let dictPromise = null;
  let dictEntries = null;

  const BASE_SEMI_BY_DEG = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

  function tokenToSemis(tok) {
    const t = String(tok || '').trim();
    if (!t) return [];
    if (t === '1' || t === 'R' || t === '0') return [0];

    const pm = t.match(/^±(\d+)$/);
    if (pm) {
      const deg = parseInt(pm[1], 10);
      const simple = ((deg - 1) % 7) + 1;
      const base = BASE_SEMI_BY_DEG[simple];
      return [((base - 1) + 12) % 12, base % 12, (base + 1) % 12];
    }

    const m = t.match(/^(bb|b|##|#)?(\d+)$/);
    if (!m) return [];
    const acc = m[1] || '';
    const deg = parseInt(m[2], 10);
    const simple = ((deg - 1) % 7) + 1;
    const base = BASE_SEMI_BY_DEG[simple];
    let adj = 0;
    if (acc === 'b') adj = -1;
    else if (acc === 'bb') adj = -2;
    else if (acc === '#') adj = 1;
    else if (acc === '##') adj = 2;
    return [((base + adj) % 12 + 12) % 12];
  }

  function prettyToken(tok) {
    const s = String(tok || '').trim();
    if (!s) return '';
    return s
      .replace(/^bb/, '𝄫')
      .replace(/^b/, '♭')
      .replace(/^##/, '𝄪')
      .replace(/^#/, '♯');
  }

  function semisToMask(arr) {
    let m = 0;
    for (const n of arr || []) {
      const v = Number(n);
      if (!Number.isFinite(v)) continue;
      m |= (1 << (((v % 12) + 12) % 12));
    }
    return m >>> 0;
  }

  function assertChordDiagramLoaded() {
    if (typeof window.parseTokensAndRootKinds !== 'function') {
      throw new Error('[chordNaming] chordDiagram.js must load before chordNaming.js (missing window.parseTokensAndRootKinds)');
    }
  }

  function clampPc(n) {
    return ((n % 12) + 12) % 12;
  }

  function midiToRootSymbol(midi) {
    return PC_FLATS[clampPc(midi)];
  }

  function normalizeToken(tok) {
    // Normalize into ascii-ish tokens used by matching: 1, b7, #11, bb7, 13, ±13
    return String(tok || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/♭/g, 'b')
      .replace(/♯/g, '#')
      .replace(/𝄫/g, 'bb')
      .replace(/𝄪/g, '##');
  }

  function transposeFromC(notationC, rootSymbol) {
    // Dictionary is C-root. Transpose by replacing the leading 'C' with rootSymbol.
    const s = String(notationC || '').trim();
    if (!s) return s;
    return s.replace(/^C/u, rootSymbol); // "C13", "CΔ", "C7alt", etc.
  }

  async function loadDictionary() {
    if (dictEntries) return dictEntries;
    if (dictPromise) return dictPromise;

    dictPromise = (async () => {
      const res = await fetch(DICT_URL, { cache: 'force-cache' });
      if (!res.ok) {
        throw new Error(`[chordNaming] Failed to load dictionary (${res.status} ${res.statusText}) at ${DICT_URL}`);
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.entries)) {
        throw new Error('[chordNaming] myChordsDictionary.json missing top-level entries[]');
      }

      dictEntries = data.entries
        .map((e) => {
          const overallRank = Number(e.overallRank);
          const preferredNotation = String(e.preferredNotation || '').trim();
          const chordFormulaSemitones = Array.isArray(e.chordFormulaSemitones) ? e.chordFormulaSemitones : [];
          const formulaMask = semisToMask(chordFormulaSemitones);
          const chordFormulaTokens = Array.isArray(e.chordFormulaTokens) ? e.chordFormulaTokens.map(String) : [];
          const essentialNotesTokens = Array.isArray(e.essentialNotesTokens) ? e.essentialNotesTokens.map(String) : [];
          return {
            overallRank: Number.isFinite(overallRank) ? overallRank : 9999,
            preferredNotation,
            chordFormulaSemitones,
            formulaMask,
            chordFormulaTokens,
            essentialNotesTokens,
          };
        })
        .filter((e) => e.preferredNotation && e.formulaMask)
        .sort((a, b) => a.overallRank - b.overallRank);

      return dictEntries;
    })();

    return dictPromise;
  }

  function getExplicitRootMidiFromShape(shapeText) {
    assertChordDiagramLoaded();
    const parsed = window.parseTokensAndRootKinds(String(shapeText || ''));
    const tokens = parsed?.tokens || [];
    const roots = parsed?.roots || [];
    const overlays = parsed?.overlays || null;

    // Prefer played root marker.
    for (let i = 0; i < 6; i++) {
      if (roots[i] !== 'played') continue;
      const tok = tokens[i];
      if (tok == null) continue;
      const fret = Number(tok);
      if (!Number.isFinite(fret) || fret < 0) continue;
      return OPEN_MIDI[i] + fret;
    }

    // Ghost root marker {n}.
    for (let i = 0; i < 6; i++) {
      if (roots[i] !== 'ghost') continue;
      const tok = tokens[i];
      if (tok == null) continue;
      const fret = Number(tok);
      if (!Number.isFinite(fret) || fret < 0) continue;
      return OPEN_MIDI[i] + fret;
    }

    // Ghost root overlay (if present).
    if (overlays && typeof overlays === 'object') {
      for (let i = 0; i < 6; i++) {
        const ov = overlays[i];
        if (!ov || typeof ov !== 'object') continue;
        const overlayFret =
          Number.isFinite(Number(ov.ghostFret))
            ? Number(ov.ghostFret)
            : ov.kind === 'ghost-root' && Number.isFinite(Number(ov.fret))
              ? Number(ov.fret)
              : null;
        const fret = overlayFret;
        if (!Number.isFinite(fret) || fret < 0) continue;
        return OPEN_MIDI[i] + fret;
      }
    }

    return null;
  }

  function computeRequiredMaskFromShape(shapeText, rootMidi) {
    assertChordDiagramLoaded();
    const parsed = window.parseTokensAndRootKinds(String(shapeText || ''));
    const tokens = parsed?.tokens || [];

    let mask = 0;

    for (let i = 0; i < 6; i++) {
      const tok = tokens[i];
      if (tok == null) continue;
      const fret = Number(tok);
      if (!Number.isFinite(fret) || fret < 0) continue;
      const midi = OPEN_MIDI[i] + fret;

      const semis = clampPc(midi - rootMidi);
      mask |= (1 << semis);
    }

    // Root-marked mode always includes pitch class 0 (root), even if the root is ghost-only.
    mask |= 1;
    return mask >>> 0;
  }

  function isTokenPresentInMask(tok, requiredMask) {
    const semis = tokenToSemis(normalizeToken(tok));
    if (!semis.length) return false;
    return semis.some((s) => (requiredMask & (1 << s)) !== 0);
  }

  function areAllEssentialNotesPresent(essentialTokens, requiredMask) {
    const list = (essentialTokens || [])
      .map((t) => normalizeToken(t))
      .filter(Boolean);
    if (!list.length) return false;
    return list.every((tok) => isTokenPresentInMask(tok, requiredMask));
  }

  function essentialCoverageFraction(essentialTokens, requiredMask) {
    const list = (essentialTokens || [])
      .map((t) => normalizeToken(t))
      .filter(Boolean);
    if (!list.length) return 0;
    let present = 0;
    for (const tok of list) {
      if (isTokenPresentInMask(tok, requiredMask)) present += 1;
    }
    return present / list.length;
  }

  async function candidatesForCard(card) {
    if (!card) return { rootSymbol: null, items: [], reason: 'no-card', requiredMask: 0 };

    const shapeInput = card.querySelector('.chord-shape-input');
    const shapeText = shapeInput ? shapeInput.value || '' : '';
    if (!shapeText.trim()) return { rootSymbol: null, items: [], reason: 'no-shape', requiredMask: 0 };

    const rootMidi = getExplicitRootMidiFromShape(shapeText);
    if (rootMidi == null) return { rootSymbol: null, items: [], reason: 'no-root', requiredMask: 0 };

    const requiredMask = computeRequiredMaskFromShape(shapeText, rootMidi);

    const entries = await loadDictionary();
    const matches = [];
    for (const e of entries) {
      // e.formulaMask must be a superset of requiredMask
      if ((e.formulaMask & requiredMask) === requiredMask) {
        matches.push({
          entry: e,
          coverage: essentialCoverageFraction(e.essentialNotesTokens, requiredMask),
        });
      }
    }

    const rootSymbol = midiToRootSymbol(rootMidi);
    const items = matches
      .sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return a.entry.overallRank - b.entry.overallRank;
      })
      .map(({ entry }) => ({
        name: transposeFromC(entry.preferredNotation, rootSymbol),
        chordFormulaTokens: entry.chordFormulaTokens || [],
        essentialNotesTokens: entry.essentialNotesTokens || [],
      }));

    return { rootSymbol, requiredMask, items, reason: matches.length ? 'ok' : 'no-matches' };
  }

  // ---- UI: persistent suggestions panel ----

  let panelEl = null;
  let panelCard = null;
  let panelHovering = false;
  let autoHideTimer = null;
  let panelDismissedByUser = false;

  function ensurePanel() {
    if (panelEl) return panelEl;

    const style = document.createElement('style');
    style.textContent = `
      .chord-name-suggest-panel{
        position:absolute;
        z-index:9998;
        min-width:220px;
        max-width:320px;
        padding:var(--space-2, 10px) var(--space-3, 12px);
        border-radius:var(--radius-m, 12px);
        background:var(--surface-elevated, rgba(16,16,18,0.98));
        border:1px solid var(--border-subtle, rgba(255,255,255,0.10));
        box-shadow:var(--shadow-elevated, 0 12px 30px rgba(0,0,0,0.50));
        color:var(--text-primary, rgba(255,255,255,0.92));
        font-size:var(--fz-14, 13px);
        line-height:1.2;
        display:flex;
        flex-direction:column;
      }
      .chord-name-suggest-panel[aria-hidden="true"]{display:none;}
      .chord-name-suggest-header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-bottom:8px;
      }
      .chord-name-suggest-title{font-size:var(--fz-12, 12px);color:var(--text-secondary, rgba(255,255,255,0.55));margin-bottom:8px;}
      .chord-name-suggest-header .chord-name-suggest-title{margin-bottom:0;}
      .chord-name-suggest-close{
        width:28px;
        height:28px;
        border-radius:var(--radius-pill, 999px);
        background:transparent;
        border:1px solid color-mix(in srgb, var(--border-subtle, rgba(255,255,255,0.10)) 80%, transparent);
        color:var(--text-secondary, rgba(255,255,255,0.70));
        cursor:pointer;
        display:inline-grid;
        place-items:center;
        padding:0;
        line-height:1;
        font-size:18px;
        transition:background 160ms cubic-bezier(0.4, 0.0, 0.2, 1), border-color 160ms cubic-bezier(0.4, 0.0, 0.2, 1), transform 160ms cubic-bezier(0.4, 0.0, 0.2, 1);
      }
      .chord-name-suggest-close:hover{
        background:color-mix(in srgb, var(--accent-soft, rgba(67, 223, 231, 0.12)) 30%, transparent);
        border-color:color-mix(in srgb, var(--border-subtle, rgba(255,255,255,0.10)) 150%, transparent);
        transform:translateY(-1px);
      }
      .chord-name-suggest-close:active{transform:translateY(0.5px);}
      .chord-name-suggest-close:focus-visible{outline:2px solid var(--focus-ring, rgba(67, 223, 231, 0.55)); outline-offset:2px;}
      .chord-name-suggest-list{
        display:flex;
        flex-direction:column;
        gap:6px;
        flex:1;
        min-height:0;
        overflow:auto;
        overscroll-behavior:contain;
        padding-right:2px;
      }
      .chord-name-suggest-item{
        text-align:left;
        padding:8px 10px;
        border-radius:10px;
        background:color-mix(in srgb, var(--text-primary, rgba(255,255,255,0.92)) 8%, transparent);
        border:1px solid color-mix(in srgb, var(--border-subtle, rgba(255,255,255,0.10)) 70%, transparent);
        color:var(--text-primary, rgba(255,255,255,0.92));
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
      }
      .chord-name-suggest-item:hover{
        background:color-mix(in srgb, var(--accent-soft, rgba(67, 223, 231, 0.12)) 30%, transparent);
        border-color:color-mix(in srgb, var(--border-subtle, rgba(255,255,255,0.10)) 150%, transparent);
      }
      .chord-name-suggest-item:focus-visible{outline:2px solid var(--focus-ring, rgba(67, 223, 231, 0.55)); outline-offset:2px;}
      .chord-name-suggest-note{color:var(--text-secondary, rgba(255,255,255,0.60));}
      .chord-name-suggest-left{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;}
      .chord-name-suggest-right{
        white-space:nowrap;
        text-align:right;
        flex:1;
        display:flex;
        justify-content:flex-end;
        gap:0;
        font-family:"Roboto Condensed", Roboto, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
        font-weight:700;
        font-size:1.08em;
      }
      .chord-name-suggest-int{color:var(--text-primary, rgba(255,255,255,0.92));}
      .chord-name-suggest-int.is-present{color:${PRESENT_INTERVAL_COLOR};}
      .chord-name-suggest-int.is-essential{
        text-decoration:underline;
        text-underline-offset:2px;
        text-decoration-thickness:1.5px;
      }
      .chord-name-suggest-int.is-essential.is-present{ text-decoration-color:var(--accent, #43dfe7); }
      .chord-name-suggest-int.is-essential:not(.is-present){ text-decoration-color:#ff6b6b; }
      .chord-name-suggest-sep{color:color-mix(in srgb, var(--text-secondary, rgba(255,255,255,0.60)) 70%, transparent);}
    `;
    document.head.appendChild(style);

    panelEl = document.createElement('div');
    panelEl.className = 'chord-name-suggest-panel';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.addEventListener('mouseenter', () => {
      panelHovering = true;
      if (autoHideTimer) clearTimeout(autoHideTimer);
    });
    panelEl.addEventListener('mouseleave', () => {
      panelHovering = false;
      scheduleAutoHide();
    });
    document.body.appendChild(panelEl);
    return panelEl;
  }

  function getEditModalContainer() {
    return document.querySelector('.chord-edit-modal-container');
  }

  function positionPanelForCard(card) {
    const el = ensurePanel();
    const isEditMode = !!card?.classList?.contains('is-editing');
    const modalContainer = isEditMode ? getEditModalContainer() : null;

    if (isEditMode && modalContainer) {
      const r = modalContainer.getBoundingClientRect();
      const fontSize = parseFloat(getComputedStyle(modalContainer).fontSize) || 16;
      const gap = fontSize; // 1em

      el.style.position = 'fixed';
      el.style.left = `${Math.round(r.right + gap)}px`;
      el.style.top = `${Math.round(r.top)}px`;
      el.style.height = `${Math.round(r.height)}px`;
      return;
    }

    const r = card.getBoundingClientRect();
    el.style.position = 'absolute';
    el.style.height = '';
    el.style.left = `${Math.round(r.right + window.scrollX + 10)}px`;
    el.style.top = `${Math.round(r.top + window.scrollY + 10)}px`;
  }

  function hidePanel() {
    if (!panelEl) return;
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    panelHovering = false;
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.innerHTML = '';
    if (panelCard?.dataset) {
      delete panelCard.dataset.suggestActive;
    }
    panelCard = null;
  }

  function isPanelVisible() {
    return !!(panelEl && panelEl.getAttribute('aria-hidden') !== 'true');
  }

  function dismissPanel() {
    if (!isPanelVisible()) return;
    panelDismissedByUser = true;
    hidePanel();
  }

  function appendPanelHeader(el) {
    const header = document.createElement('div');
    header.className = 'chord-name-suggest-header';

    const title = document.createElement('div');
    title.className = 'chord-name-suggest-title';
    title.textContent = 'Chord suggestions';
    header.appendChild(title);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'chord-name-suggest-close';
    close.setAttribute('aria-label', 'Close chord suggestions');
    close.textContent = '×';
    close.addEventListener('mousedown', (e) => {
      // Keep focus in the current name input (inline or edit-mode)
      e.preventDefault();
    });
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissPanel();
    });
    header.appendChild(close);

    el.appendChild(header);
  }

  function isCardEditing(card) {
    if (!card || !card.isConnected) return false;
    return card.classList.contains('is-inline-name-editing') || card.classList.contains('is-editing');
  }

  function isQuotedName(raw) {
    const t = raw == null ? '' : String(raw).trim();
    return t.length >= 2 && t.startsWith('"') && t.endsWith('"');
  }

  function isQuoteCard(card) {
    if (!card || !card.isConnected) return false;
    if (card.classList?.contains('collection-text-card')) return true;

    const active = document.activeElement;
    if (
      active?.classList?.contains('chord-name-input') &&
      card.contains(active) &&
      isQuotedName(active.value)
    ) {
      return true;
    }

    const inline = card.querySelector('.chord-name-inline-input.chord-name-input, .chord-name-inline-input');
    if (inline && isQuotedName(inline.value)) return true;

    const edit = card.querySelector('.chord-edit-section .chord-name-input, .chord-edit-section input.chord-name-input');
    if (edit && isQuotedName(edit.value)) return true;

    const anyInput = card.querySelector('.chord-name-input');
    if (anyInput && isQuotedName(anyInput.value)) return true;

    const rawDataset = card.dataset ? card.dataset.rawName : null;
    if (rawDataset != null) {
      let val = rawDataset;
      try {
        val = JSON.parse(rawDataset);
      } catch (_) {
        /* keep rawDataset as-is */
      }
      if (isQuotedName(val)) return true;
    }

    return false;
  }

  function isCardActiveForSuggestions(card) {
    if (!card || !card.isConnected) return false;
    if (isQuoteCard(card)) return false;
    if (card.dataset && card.dataset.suggestActive === '1') return true;
    return isCardEditing(card);
  }

  function getActiveNameInput(card) {
    const active = document.activeElement;
    if (
      active?.classList?.contains('chord-name-input') &&
      (!card || card.contains(active))
    ) {
      return active;
    }
    // Fallback: any focused chord-name-input, even if not inside card (covers modal clones)
    if (active?.classList?.contains('chord-name-input')) return active;

    if (!card) return null;
    // Inline name edit input (the one visible when you click the title)
    const inline = card.querySelector('.chord-name-inline-input.chord-name-input, .chord-name-inline-input');
    if (inline && inline.offsetParent !== null) return inline;

    // Full edit mode input
    const edit = card.querySelector('.chord-edit-section .chord-name-input, .chord-edit-section input.chord-name-input');
    if (edit) return edit;

    // Fallback: any chord-name-input in the card
    return card.querySelector('.chord-name-input');
  }

  function copyToClipboard(text) {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      void navigator.clipboard.writeText(String(text));
    } catch (_) {
      /* ignore clipboard errors */
    }
  }

  function applyChordNameToInput(input, name) {
    if (!input) return;

    input.focus({ preventScroll: true });

    // Inline title edits should replace the entire value, not insert/append.
    if (input.classList?.contains('chord-name-inline-input')) {
      input.value = String(name || '');
      const caret = input.value.length;
      try {
        input.setSelectionRange(caret, caret);
      } catch (_) {
        /* noop */
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (start == null || end == null || document.activeElement !== input) {
      start = end = input.value.length;
    }

    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = `${before}${name}${after}`;

    const caret = start + String(name || '').length;
    try {
      input.setSelectionRange(caret, caret);
    } catch (_) {
      /* noop */
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function applyChordNameToCard(card, name) {
    const input = getActiveNameInput(card);
    if (!input) {
      console.warn('[chordNaming] No chord name input found for card');
      return;
    }
    applyChordNameToInput(input, name);
  }

  function buildFormulaHtml(formulaTokens, essentialTokens, requiredMask) {
    const essential = new Set((essentialTokens || []).map(String));
    const parts = [];

    for (let i = 0; i < (formulaTokens || []).length; i++) {
      const tok = String(formulaTokens[i] || '').trim();
      if (!tok) continue;

      const semis = tokenToSemis(tok);
      const present = semis.length ? semis.some((s) => (requiredMask & (1 << s)) !== 0) : false;
      const isEss = essential.has(tok);
      const cls = [
        'chord-name-suggest-int',
        present ? 'is-present' : null,
        isEss ? 'is-essential' : null,
      ]
        .filter(Boolean)
        .join(' ');

      const label = prettyToken(tok);
      const inner = label;

      parts.push(`<span class="${cls}">${inner}</span>`);

      if (i !== (formulaTokens.length - 1)) {
        parts.push('<span class="chord-name-suggest-sep">-</span>');
      }
    }

    return parts.join('');
  }

  function scheduleAutoHide() {
    if (panelHovering) return;
    if (panelCard?.classList?.contains('is-editing')) return;
    if (autoHideTimer) clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      autoHideTimer = null;
      if (!panelHovering) hidePanel();
    }, 5000);
  }

  function ensureEditModePanel() {
    if (panelDismissedByUser) return;
    const activeEditCard = document.querySelector('.chord-edit-modal-container .chord-card.is-editing');
    if (!activeEditCard) {
      if (panelCard?.classList?.contains('is-editing')) {
        hidePanel();
      }
      return;
    }
    if (panelEl && panelEl.getAttribute('aria-hidden') !== 'true' && panelCard === activeEditCard) {
      positionPanelForCard(activeEditCard);
      return;
    }
    void renderPanelForCard(activeEditCard, { forceShow: true, autoHide: false });
  }

  let editModeCheckScheduled = false;
  function scheduleEnsureEditModePanel() {
    if (editModeCheckScheduled) return;
    editModeCheckScheduled = true;
    requestAnimationFrame(() => {
      editModeCheckScheduled = false;
      ensureEditModePanel();
    });
  }

  async function renderPanelForCard(card, opts = {}) {
    const { forceShow = false, autoHide = false } = opts;
    const el = ensurePanel();

    if (isQuoteCard(card)) {
      if (panelCard === card) hidePanel();
      return;
    }

    if (!card || (!isCardActiveForSuggestions(card) && !forceShow)) {
      hidePanel();
      return;
    }

    const prevList = el.querySelector('.chord-name-suggest-list');
    const prevScrollTop = prevList ? prevList.scrollTop : 0;

    if (!autoHide && autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }

    panelCard = card;
    positionPanelForCard(card);
    el.setAttribute('aria-hidden', 'false');
    el.innerHTML = '';

    let model;
    try {
      model = await candidatesForCard(card);
    } catch (err) {
      console.error(err);
      el.innerHTML = '';
      appendPanelHeader(el);
      const note = document.createElement('div');
      note.className = 'chord-name-suggest-note';
      note.textContent = String(err?.message ? err.message : err);
      el.appendChild(note);
      return;
    }

    appendPanelHeader(el);

    if (model.reason === 'no-root') {
      const note = document.createElement('div');
      note.className = 'chord-name-suggest-note';
      note.textContent = 'Mark a root ([#] or {#}) to see suggestions.';
      el.appendChild(note);
      return;
    }

    if (!model.items || !model.items.length) {
      const note = document.createElement('div');
      note.className = 'chord-name-suggest-note';
      note.textContent = 'No matches.';
      el.appendChild(note);
      return;
    }

    const list = document.createElement('div');
    list.className = 'chord-name-suggest-list';

    for (const it of model.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chord-name-suggest-item';

      const left = document.createElement('span');
      left.className = 'chord-name-suggest-left';
      left.textContent = it.name;

      const right = document.createElement('span');
      right.className = 'chord-name-suggest-right';
      right.innerHTML = buildFormulaHtml(it.chordFormulaTokens, it.essentialNotesTokens, model.requiredMask);

      btn.appendChild(left);
      btn.appendChild(right);

      btn.addEventListener('mousedown', (e) => {
        // Keep focus in the current name input (inline or edit-mode)
        e.preventDefault();
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const chordText = it.name || left.textContent || '';
        copyToClipboard(chordText);

        const editing = isCardEditing(card);
        const input = getActiveNameInput(card);
        if (input) applyChordNameToInput(input, it.name);
        else applyChordNameToCard(card, it.name);

        if (!editing && card && typeof card.dispatchEvent === 'function') {
          try {
            card.dispatchEvent(
              new CustomEvent('chord-name-suggestion-applied', {
                bubbles: true,
                detail: { card, name: chordText },
              }),
            );
          } catch (_) {
            /* noop */
          }
        }
      });

      list.appendChild(btn);
    }

    el.appendChild(list);
    if (prevList) {
      try {
        list.scrollTop = prevScrollTop;
      } catch (_) {
        /* noop */
      }
    }
    if (autoHide) scheduleAutoHide();
  }

  // ---- Wiring ----

  let rafScheduled = false;
  let pendingRenderOpts = null;

  function scheduleRefresh(card, opts = {}) {
    if (!card) return;
    panelCard = card;
    const derivedOpts = { ...opts };
    if (derivedOpts.autoHide == null) {
      derivedOpts.autoHide = !!(card.dataset && card.dataset.suggestActive === '1' && !isCardEditing(card));
    }
    pendingRenderOpts = derivedOpts;
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (panelCard && isCardActiveForSuggestions(panelCard)) {
        const o = pendingRenderOpts || {};
        pendingRenderOpts = null;
        void renderPanelForCard(panelCard, o);
      } else {
        pendingRenderOpts = null;
      }
    });
  }

  function install() {
    ensurePanel();
    scheduleEnsureEditModePanel();

    // Show/refresh when focusing into any name input.
    document.addEventListener(
      'focusin',
      (e) => {
        if (panelDismissedByUser) return;
        const t = e.target;
        const card = t?.closest ? t.closest('.chord-card') : null;
        if (!card) return;
        if (!isCardActiveForSuggestions(card)) return;
        scheduleRefresh(card);
      },
      true
    );

    // Show/refresh on mousedown inside cards (covers the click that enters edit mode).
    document.addEventListener(
      'mousedown',
      (e) => {
        const t = e.target;
        if (t?.closest?.('.chord-name-suggest-panel')) return;
        if (!t?.closest?.('table.chord-diagram')) {
          dismissPanel();
          return;
        }
        if (panelDismissedByUser) return;
        const card = t?.closest ? t.closest('.chord-card') : null;
        if (!card) return;
        // Defer one tick so card classes can update (e.g., beginEditing adds is-editing).
        setTimeout(() => {
          if (panelDismissedByUser) return;
          if (isCardActiveForSuggestions(card)) scheduleRefresh(card);
          else if (panelCard === card) hidePanel();
        }, 0);
      },
      true
    );

    document.addEventListener(
      'touchstart',
      (e) => {
        const t = e.target;
        if (t?.closest?.('.chord-name-suggest-panel')) return;
        if (!t?.closest?.('table.chord-diagram')) {
          dismissPanel();
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') dismissPanel();
      },
      true
    );

    // Hide when leaving an active edit state.
    document.addEventListener(
      'focusout',
      () => {
        setTimeout(() => {
          if (panelCard?.classList?.contains('is-editing')) return;
          if (panelCard && !isCardActiveForSuggestions(panelCard)) hidePanel();
        }, 0);
      },
      true
    );

    // Refresh after diagram edits.
    document.addEventListener('chord-diagram-changed', (e) => {
      const card = e?.detail?.card || (e?.target?.closest ? e.target.closest('.chord-card') : null);
      if (!card) return;
      if (isQuoteCard(card)) {
        if (panelCard === card) hidePanel();
        return;
      }
      panelDismissedByUser = false;
      if (isCardEditing(card)) {
        scheduleRefresh(card);
        return;
      }
      card.dataset.suggestActive = '1';
      const opts = { forceShow: true, autoHide: true };
      if (panelCard && card !== panelCard) {
        panelCard = card;
      }
      void renderPanelForCard(card, opts);
    });

    // Keep the panel positioned.
    const onScrollOrResize = () => {
      if (panelEl && panelCard && isCardActiveForSuggestions(panelCard)) {
        positionPanelForCard(panelCard);
      }
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);

    const obs = new MutationObserver(() => {
      scheduleEnsureEditModePanel();
    });
    const modal = document.getElementById('chord-edit-modal');
    const root = modal || document.body;
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // Public hook used by my-chords.page.js during init.
  window.freetarChordNaming = {
    loadDictionary: () => {
      void loadDictionary().catch((e) => console.error(e));
    },
    refreshForCard: (card) => {
      void renderPanelForCard(card);
    },
  };

  try {
    install();
  } catch (err) {
    console.error(err);
  }
})();
