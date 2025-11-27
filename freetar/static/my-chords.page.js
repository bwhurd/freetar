/* my-chords.page.js
   Page-specific UI for My Chord Library.
   Expects:
   - window.MY_CHORDS_EDIT_URL (set in template)
   - SortableJS available as global Sortable
   - renderCardDiagram(card) global function
*/
(() => {
  'use strict';

  // DOM refs (filled in init)
  let groupsRoot,
    deleteGroupModal,
    confirmDeleteGroupBtn,
    baseFretModal,
    baseFretValueEl;
  // Batch import UI refs
  let showImportBtn, importArea, importInput, importBtn, cancelImportBtn;

  // State
  let currentEditingCard = null;
  let deleteModeGroup = null;
  let deleteModeOffHandler = null;
  let deleteModeDirty = false;
  let groupDeleteModeActive = false;
  let groupDeleteModeGroup = null;
  let hoverGroupInsert;
  let suppressModalOnClose = false;
  let currentEditingSourceCard = null;
  let currentEditingSpotlightCard = null;
  const MODAL_BASE_Z = 3000;
  const MODAL_Z_STEP = 20;
  const modalStack = [];

  function applyModalStackZ() {
    modalStack.forEach((modal, index) => {
      const overlay = modal.querySelector('.modal__overlay');
      const container = overlay && overlay.querySelector('.modal__container');
      if (!overlay) return;

      const overlayZ = MODAL_BASE_Z + index * MODAL_Z_STEP;
      const containerZ = overlayZ + 10;

      overlay.style.zIndex = String(overlayZ);
      if (container) {
        container.style.zIndex = String(containerZ);
      }

      if (index === 0) {
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
      } else {
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.92)';
      }
    });
  }

  function pushModalOnStack(modal) {
    if (!modal) return;
    if (!modalStack.includes(modal)) {
      modalStack.push(modal);
    }
    applyModalStackZ();
  }

  function removeModalFromStack(modal) {
    const idx = modalStack.indexOf(modal);
    if (idx !== -1) {
      modalStack.splice(idx, 1);
    }
    applyModalStackZ();
  }

  function wireModalCloseButtons() {
    const closeButtons = document.querySelectorAll('.modal__close-button');
    closeButtons.forEach((btn) => {
      if (btn.dataset.closeWired === '1') return;
      btn.dataset.closeWired = '1';
      btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal');
        if (!modal) return;
        if (window.MicroModal && modal.id) {
          e.preventDefault();
          MicroModal.close(modal.id);
        }
      });
    });
  }

  // Inject CSS so group tools (handle + buttons) only appear on hover/focus-within
  function ensureGroupHoverCSS() {
    if (document.getElementById('group-hover-tools-css')) return;
    const style = document.createElement('style');
    style.id = 'group-hover-tools-css';
    style.textContent = `
    /* Hide group-level controls by default */
    .group .group-header .group-handle,
    .group .group-header .add-chord,
    .group .group-header .delete-chords {
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease-in-out;
    }
    /* Reveal on mouse hover or when any control/input inside the group has focus */
    .group:hover .group-header .group-handle,
    .group:hover .group-header .add-chord,
    .group:hover .group-header .delete-chords,
    .group:focus-within .group-header .group-handle,
    .group:focus-within .group-header .add-chord,
    .group:focus-within .group-header .delete-chords {
      opacity: 1;
      pointer-events: auto;
    }
    .group.insert-zone-hover .group-header .group-handle,
    .group.insert-zone-hover .group-header .add-chord,
    .group.insert-zone-hover .group-header .delete-chords {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    /* Optional: on devices without hover, keep them available when focusing inside the group */
    @media (hover: none) {
      .group:focus-within .group-header .group-handle,
      .group:focus-within .group-header .add-chord,
      .group:focus-within .group-header .delete-chords {
        opacity: 1;
        pointer-events: auto;
      }
    }
  `;
    document.head.appendChild(style);
  }

  function moveCardIntoChordEditModal(sourceCard) {
    if (!sourceCard) return null;
    const modal = document.getElementById('chord-edit-modal');
    if (!modal) return null;
    const slot = modal.querySelector('.chord-edit-modal-slot');
    if (!slot) return null;

    const clone = sourceCard.cloneNode(true);
    clone.classList.add('chord-card-spotlight');
    clone.__sourceCard = sourceCard;
    slot.innerHTML = '';
    slot.appendChild(clone);

    wireChordCard(clone);
    try {
      renderCardDiagram(clone);
    } catch (_) {
      /* noop */
    }

    currentEditingSourceCard = sourceCard;
    currentEditingSpotlightCard = clone;
    currentEditingCard = clone;
    return clone;
  }

  function returnCardFromChordEditModal() {
    const clone = currentEditingSpotlightCard;
    const slot = document.querySelector('#chord-edit-modal .chord-edit-modal-slot');
    if (slot && clone && slot.contains(clone)) {
      slot.removeChild(clone);
    }
    currentEditingSpotlightCard = null;
  }

  /* Turn ASCII chord text into typographic symbols for display (HTML-safe).
     - Renders add/sus prefixes small (add9/add11/add13, sus2/sus4/…).
     - Converts #/b to ♯/♭, maj -> Δ, dim -> °, aug -> +
     - Improves minor dash handling (C-7 -> C−7).
     Safe for innerHTML because we escape user text first.
  */
  function prettifyChordName(s) {
    if (s == null) return s;
    const escapeHTML = (str) =>
      String(str).replace(
        /[&<>"']/g,
        (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
      );
    let out = escapeHTML(String(s));

    // True minus for minor
    out = out.replace(/(^|\s)-/g, '$1−'); // "-7" at start/after space
    out = out.replace(/([A-Ga-g][#♯b♭]?)-(?=[0-9(])/g, '$1−'); // "C-7" -> "C−7"

    // Accidentals
    out = out.replace(/#/g, '♯');
    out = out.replace(/([A-Ga-g0-9\)])b/g, '$1♭'); // Bb, 7b5, (b9)

    // Qualities
    out = out.replace(/maj/gi, 'Δ');
    out = out.replace(/M7/g, 'Δ7');
    out = out.replace(/dim/gi, '°');
    out = out.replace(/aug/gi, '+');
    out = out.replace(/m7b5/gi, 'm7♭5'); // typed half-diminished

    // Prefixes shown smaller (don’t rely on <small>; inline style for reliability)
    const small = (t) =>
      `<span class="chord-prefix" style="font-size:.82em;line-height:1">${t}</span>`;
    out = out.replace(/add(?=\d)/gi, (_, __, ___) => small('add')); // add9/add11/add13
    out = out.replace(/sus(?=\d)/gi, (_, __, ___) => small('sus')); // sus2/sus4/sus9...

    return out;
  }

  // ---------- Symbol toolbar (appears above name input while editing) ----------
  function insertTokenIntoNameInput(card, token) {
    const input = card.querySelector('.chord-name-input');
    if (!input) return;
    input.focus();

    // Determine insertion point
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (start == null || end == null || document.activeElement !== input) {
      start = end = input.value.length;
    }

    // Insert
    const toInsert = token;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = before + toInsert + after;

    // Caret placement (inside parens for "()")
    let caret = start + toInsert.length;
    if (token === '()') caret = start + 1;
    input.setSelectionRange(caret, caret);

    // Keep typing flow smooth
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function labelHTMLForToken(tok) {
    // Small prefixes for palette labels
    if (/^add(9|11|13)$/i.test(tok)) {
      return '<small>add</small>' + tok.replace(/^add/i, '');
    }
    if (/^sus(2|4|9|11|13)$/i.test(tok)) {
      return '<small>sus</small>' + tok.replace(/^sus/i, '');
    }
    // Already pretty or single glyphs
    return tok;
  }

  function makeSymbolButton(card, tok, titleText = tok) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chord-symbol-btn';
    btn.setAttribute('data-token', tok);
    btn.setAttribute('aria-label', `Insert ${titleText}`);
    btn.title = `Insert ${titleText}`;
    // Compact pill buttons; inherit overall size from toolbar
    btn.style.backgroundColor = 'var(--color-bg, #2a282d)'; // behind symbol
    btn.style.color = 'var(--color-fg, #efeffc)'; // symbol color
    btn.style.padding = '2px 6px';
    btn.style.border = '0';
    btn.style.borderRadius = '10px';
    btn.style.lineHeight = '1.15';
    btn.style.whiteSpace = 'nowrap';
    btn.innerHTML = labelHTMLForToken(tok);

    // Prevent focus from leaving the name input on mouse/touch
    btn.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    btn.addEventListener(
      'mousedown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    btn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );

    // Insert token at caret (mouse, touch, or keyboard activation)
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertTokenIntoNameInput(card, tok);
    });

    return btn;
  }

  function buildSymbolRow(card, items) {
    // items: array of token strings OR arrays (no extra space inside arrays)
    const row = document.createElement('div');
    row.className = 'chord-symbols-row';
    // Let rows wrap inside the card when space is tight
    row.style.cssText =
      'display:flex; flex-wrap:wrap; gap:0.35rem; row-gap:0.25rem; width:100%; margin-bottom:.15rem; align-items:center;';
    items.forEach((item, idx) => {
      if (Array.isArray(item)) {
        const grp = document.createElement('span');
        item.forEach((tok, j) => {
          grp.appendChild(makeSymbolButton(card, tok));
          if (j < item.length - 1) grp.appendChild(document.createTextNode(' ')); // small space inside a group
        });
        row.appendChild(grp);
      } else {
        row.appendChild(makeSymbolButton(card, item));
      }
      // TWO NBSPs between items/groups
      if (idx < items.length - 1) row.appendChild(document.createTextNode('\u00A0\u00A0'));
    });
    return row;
  }

  function ensureSymbolToolbar(card) {
    const section = card.querySelector('.chord-edit-section') || card;
    if (!section) return;

    let bar = section.querySelector('.chord-symbols-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'chord-symbols-toolbar';
      section.appendChild(bar);
    }

    if (!bar.dataset.built) {
      const row1 = ['Δ', '−', '°', 'ø', '7', 'Δ7', '−7', '°7', 'ø7', '6'];
      const row2 = ['9', '11', '13', 'add9', 'add11', 'add13', 'sus2', 'sus4'];
      const row3 = ['♭', '♯', '♮', '♭5', '♯5', '♭9', '♯9', '♯11', '♭13', ['(', ')'], '()', '/'];

      bar.appendChild(buildSymbolRow(card, row1));
      bar.appendChild(buildSymbolRow(card, row2));
      bar.appendChild(buildSymbolRow(card, row3));
      bar.dataset.built = '1';

      // Keep input focus during mouse/touch and prevent click-away commit from background clicks
      bar.addEventListener(
        'pointerdown',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
      bar.addEventListener(
        'mousedown',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
      bar.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
      bar.addEventListener(
        'click',
        (e) => {
          e.stopPropagation();
        },
        false,
      ); // allow button click handler to run
    }

    bar.style.display = '';
    return bar;
  }

  const EDIT_URL = () => window.MY_CHORDS_EDIT_URL || null;

  // ---------- helpers ----------
  function buildShapeFromTokensAndRoots(tokens, roots) {
    return tokens
      .map((t, i) => {
        const rk = roots[i];
        if (t == null) return 'x';
        if (t === 0) {
          if (rk === 'played') return '[0]';
          if (rk === 'ghost') return '([0])';
          return '0';
        }
        if (rk === 'played') return `[${t}]`;
        if (rk === 'ghost') return `([${t}])`;
        return String(t);
      })
      .join('');
  }

  function toggleRootOnString(shape, stringIndex) {
    if (typeof parseTokensAndRootKinds !== 'function') return shape;
    const parsed = parseTokensAndRootKinds(shape);
    if (!parsed || !Array.isArray(parsed.tokens) || !Array.isArray(parsed.roots)) return shape;
    if (stringIndex < 0 || stringIndex >= parsed.tokens.length) return shape;

    const tokens = parsed.tokens;
    const roots = parsed.roots.slice(); // avoid mutating parsed roots
    const token = tokens[stringIndex];
    if (token == null || token === 0) return shape; // muted or open string, do nothing

    const current = roots[stringIndex] || null;
    let next = null;
    if (current === null) next = 'played';
    else if (current === 'played') next = 'ghost';
    else next = null;
    roots[stringIndex] = next;

    return buildShapeFromTokensAndRoots(tokens, roots);
  }

  function isAllOpenOrMuted(shape) {
    if (typeof parseTokensAndRootKinds !== 'function') return false;
    const parsed = parseTokensAndRootKinds(shape);
    if (!parsed || !Array.isArray(parsed.tokens)) return false;
    if (!parsed.tokens.length) return false;
    return parsed.tokens.every((t) => t == null || t === 0);
  }

  let baseFretActiveCard = null;
  let baseFretBuffer = '';
  let baseFretOnConfirm = null;

  function updateBaseFretDisplay() {
    if (baseFretValueEl) baseFretValueEl.textContent = baseFretBuffer || '\u2013';
  }

  function hideBaseFretModal() {
    document.removeEventListener('keydown', baseFretKeyHandler, true);
    baseFretActiveCard = null;
    baseFretBuffer = '';
    baseFretOnConfirm = null;
    if (window.MicroModal) {
      try {
        MicroModal.close('base-fret-modal');
      } catch (_) {
        /* noop */
      }
    }
  }

  function baseFretKeyHandler(e) {
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideBaseFretModal();
      return;
    }

    const isDigit = /^[0-9]$/.test(key);
    if (!isDigit) return;

    e.preventDefault();
    e.stopPropagation();

    baseFretBuffer = key;
    updateBaseFretDisplay();

    const val = parseInt(key, 10);
    if (!Number.isFinite(val) || val <= 0 || val > 24) {
      hideBaseFretModal();
      return;
    }
    const cb = baseFretOnConfirm;
    const target = baseFretActiveCard;
    hideBaseFretModal();
    if (typeof cb === 'function' && target) cb(val);
  }

  function promptForBaseFret(card, onConfirm) {
    if (!baseFretModal || !baseFretValueEl) return;
    baseFretActiveCard = card;
    baseFretOnConfirm = onConfirm;
    baseFretBuffer = '';
    updateBaseFretDisplay();
    document.removeEventListener('keydown', baseFretKeyHandler, true);
    document.addEventListener('keydown', baseFretKeyHandler, true);
    if (window.MicroModal) {
      MicroModal.show('base-fret-modal');
    }
  }

  function handleFretLabelClick(card) {
    if (typeof promptForBaseFret !== 'function') return;
    promptForBaseFret(card, (newBase) => {
      const shapeInput = card.querySelector('.chord-shape-input');
      const oldShape = shapeInput ? shapeInput.value || '' : '';
      const parsedShape =
        typeof parseTokensAndRootKinds === 'function'
          ? parseTokensAndRootKinds(oldShape)
          : null;
      if (
        !parsedShape ||
        !Array.isArray(parsedShape.tokens) ||
        !Array.isArray(parsedShape.roots) ||
        typeof buildShapeFromTokensAndRoots !== 'function'
      )
        return;

      const tokens = parsedShape.tokens.slice();
      const roots = parsedShape.roots.slice();

      let currentTop = null;
      const baseAttr = card?.dataset?.baseFret;
      if (baseAttr) {
        const parsedBase = parseInt(baseAttr, 10);
        if (Number.isFinite(parsedBase) && parsedBase > 0) currentTop = parsedBase;
      }
      if (!currentTop) {
        let minFret = Infinity;
        tokens.forEach((t) => {
          if (typeof t === 'number' && t > 0 && t < minFret) minFret = t;
        });
        currentTop = Number.isFinite(minFret) && minFret !== Infinity ? minFret : 1;
      }

      const F = parseInt(newBase, 10);
      if (!Number.isFinite(F) || F <= 0) return;
      const delta = F - currentTop;

      for (let i = 0; i < tokens.length; i += 1) {
        const t = tokens[i];
        if (typeof t === 'number' && t > 0) tokens[i] = t + delta;
      }

      const newShape = buildShapeFromTokensAndRoots(tokens, roots);
      const shapeChanged = newShape !== oldShape;

      card.dataset.baseFret = String(F);
      if (shapeInput) shapeInput.value = newShape;
      renderCardDiagram(card);
      const isEditing = currentEditingCard === card;
      if (isEditing) {
        if (shapeInput) shapeInput.focus();
      } else {
        persist('rebase-frets-click');
      }
      if (shapeChanged && window.freetarUndoSnapshot) {
        window.freetarUndoSnapshot('diagram-click');
      }
    });
  }

  function buildDataFromDOM() {
    const groups = [];
    groupsRoot.querySelectorAll('.group').forEach((groupEl) => {
      const rawGroupName = groupEl.querySelector('.group-name')?.value || '';
      const gName = rawGroupName.trim();
      const chords = [];
      groupEl.querySelectorAll('.chord-card').forEach((card) => {
        const nameInput = card.querySelector('.chord-name-input');
        const shapeInput = card.querySelector('.chord-shape-input');
        const titleEl = card.querySelector('.chord-title');
        const name = (nameInput?.value || titleEl?.textContent || '').trim();
        const shape = shapeInput?.value.trim() || '';
        if (!shape) return;
        chords.push({ name: name || '(unnamed)', shape });
      });
      groups.push({ group: gName || '\u00A0', chords });
    });
    return groups;
  }

  async function persist(reason) {
    const url = EDIT_URL();
    if (!url) {
      console.warn('Persist skipped: MY_CHORDS_EDIT_URL not set.', reason);
      return;
    }
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDataFromDOM()),
      });
    } catch (e) {
      console.warn('Auto-save failed:', reason, e);
    }
  }

  function beginEditing(sourceCard) {
    const resolvedSource = sourceCard && sourceCard.__sourceCard ? sourceCard.__sourceCard : sourceCard;
    if (!resolvedSource) return;
    if (currentEditingSourceCard === resolvedSource) {
      if (currentEditingCard) {
        const existingInput = currentEditingCard.querySelector('.chord-name-input');
        if (existingInput) {
          existingInput.focus();
          existingInput.select();
        }
      }
      return;
    }
    if (currentEditingCard && currentEditingSourceCard && currentEditingSourceCard !== resolvedSource) {
      finishEditing(true);
    }

    const clone = moveCardIntoChordEditModal(resolvedSource);
    if (!clone) return;

    const fields = clone.querySelector('.chord-edit-fields');
    const nameInput = clone.querySelector('.chord-name-input');
    const shapeInput = clone.querySelector('.chord-shape-input');
    if (!fields || !nameInput || !shapeInput) return;

    currentEditingCard = clone;
    currentEditingSourceCard = resolvedSource;
    clone.dataset.originalName = (resolvedSource.querySelector('.chord-name-input')?.value) || '';
    clone.dataset.originalShape = (resolvedSource.querySelector('.chord-shape-input')?.value) || '';

    // Keep the edit UI directly under the diagram inside this card
    const section = clone.querySelector('.chord-edit-section');
    const table = clone.querySelector('table.chord-diagram');
    if (section && table && table.nextElementSibling !== section) {
      table.insertAdjacentElement('afterend', section);
    }

    clone.classList.add('is-editing', 'editing-expanded');
    if (section) section.style.display = '';

    fields.style.display = '';

    // Show the wide 3-row symbols palette anchored inside this card
    ensureSymbolToolbar(clone);

    if (window.MicroModal) {
      MicroModal.show('chord-edit-modal');
    }

    nameInput.focus();
    nameInput.select();
  }

  function finishEditing(commit, opts = {}) {
    const { fromModalClose = false } = opts;
    const spotlight = currentEditingSpotlightCard || currentEditingCard;
    const sourceCard =
      currentEditingSourceCard || (spotlight && spotlight.__sourceCard) || spotlight;
    if (!spotlight || !sourceCard) {
      currentEditingCard = null;
      currentEditingSourceCard = null;
      currentEditingSpotlightCard = null;
      return;
    }
    const fields = spotlight.querySelector('.chord-edit-fields');
    const title = sourceCard.querySelector('.chord-title');
    const spotlightNameInput = spotlight.querySelector('.chord-name-input');
    const spotlightShapeInput = spotlight.querySelector('.chord-shape-input');
    const sourceNameInput = sourceCard.querySelector('.chord-name-input');
    const sourceShapeInput = sourceCard.querySelector('.chord-shape-input');
    if (
      !fields ||
      !title ||
      !spotlightNameInput ||
      !spotlightShapeInput ||
      !sourceNameInput ||
      !sourceShapeInput
    ) {
      currentEditingCard = null;
      currentEditingSourceCard = null;
      currentEditingSpotlightCard = null;
      return;
    }

    if (commit) {
      const newName = spotlightNameInput.value.trim();
      const newShape = spotlightShapeInput.value;
      sourceNameInput.value = newName;
      sourceShapeInput.value = newShape;
      if (spotlight.dataset && spotlight.dataset.baseFret) {
        sourceCard.dataset.baseFret = spotlight.dataset.baseFret;
      } else {
        delete sourceCard.dataset.baseFret;
      }
      title.innerHTML = prettifyChordName(newName || '(unnamed)');
      renderCardDiagram(sourceCard);
      persist('edit-commit');
    } else {
      const originalName = spotlight.dataset.originalName || '';
      const originalShape = spotlight.dataset.originalShape || '';
      sourceNameInput.value = originalName;
      sourceShapeInput.value = originalShape;
      title.textContent = originalName || '(unnamed)';
      renderCardDiagram(sourceCard);
    }

    const overlay = spotlight.querySelector('.chord-symbols-toolbar');
    if (overlay) overlay.style.display = 'none';
    const section = spotlight.querySelector('.chord-edit-section');
    if (section) section.style.display = 'none';
    fields.style.display = 'none';
    spotlight.classList.remove('is-editing', 'editing-expanded');

    returnCardFromChordEditModal();

    currentEditingCard = null;
    currentEditingSourceCard = null;
    currentEditingSpotlightCard = null;

    if (window.MicroModal && !fromModalClose) {
      suppressModalOnClose = true;
      try {
        MicroModal.close('chord-edit-modal');
      } catch (_) {
        /* noop */
      }
      setTimeout(() => {
        suppressModalOnClose = false;
      }, 0);
    }
  }

  // Ctrl+Enter should commit the active edit, mirroring manual confirmation
  document.addEventListener('keydown', (e) => {
    if (!currentEditingCard) return;
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      finishEditing(true);
    }
  });

  function wireChordCard(card) {
    const editBtn = card.querySelector('.chord-edit');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    if (!editBtn || !nameInput || !shapeInput) return;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentEditingCard === card) finishEditing(true);
      else beginEditing(card);
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        shapeInput.focus();
        shapeInput.select();
      } else if (e.key === 'Escape') {
        const modal = document.getElementById('chord-edit-modal');
        const modalOpen = modal && modal.classList.contains('is-open');
        e.preventDefault();
        if (modalOpen && window.MicroModal) {
          MicroModal.close('chord-edit-modal');
          return;
        }
        finishEditing(false);
      }
    });
    shapeInput.addEventListener('keydown', (e) => {
      // Helpers
      const hasSelection = () => {
        const s = shapeInput.selectionStart ?? 0;
        const t = shapeInput.selectionEnd ?? 0;
        return s !== t;
      };
      const wrapSelection = (mode) => {
        const start = shapeInput.selectionStart ?? 0;
        const end = shapeInput.selectionEnd ?? 0;
        if (start === end) return;
        e.preventDefault();
        const before = shapeInput.value.slice(0, start);
        const sel = shapeInput.value.slice(start, end);
        const after = shapeInput.value.slice(end);

        let wrapped;
        if (mode === 'square') {
          // Alt+R -> wrap selection with [ ]
          wrapped = `[${sel}]`;
        } else {
          // 'parenSquare' -> wrap selection with () and ensure inside is [x]
          // If user already selected [x], just add parentheses around it: ([x])
          // Otherwise: ([selection])
          const trimmed = sel.trim();
          if (/^\[.*\]$/.test(trimmed)) wrapped = `(${trimmed})`;
          else wrapped = `([${sel}])`;
        }

        shapeInput.value = before + wrapped + after;
        const pos = before.length + wrapped.length;
        shapeInput.setSelectionRange(pos, pos);
        shapeInput.dispatchEvent(new Event('input', { bubbles: true }));
      };

      // Alt+R -> [selection]
      if (e.altKey && !e.ctrlKey && e.key && e.key.toLowerCase() === 'r') {
        if (hasSelection()) wrapSelection('square');
        return;
      }

      // Alt+Shift+4 (physical key "Digit4" or "$") -> ([selection]) (best effort; may vary by layout)
      if (e.altKey && e.shiftKey && (e.code === 'Digit4' || e.key === '4' || e.key === '$')) {
        if (hasSelection()) wrapSelection('parenSquare');
        return;
      }

      // Ctrl+Alt+R -> ([selection]) (reliable fallback)
      if (e.ctrlKey && e.altKey && e.key && e.key.toLowerCase() === 'r') {
        if (hasSelection()) wrapSelection('parenSquare');
        return;
      }

      // Optional convenience: Alt+Shift+R -> ([selection])
      if (e.altKey && e.shiftKey && e.key && e.key.toLowerCase() === 'r') {
        if (hasSelection()) wrapSelection('parenSquare');
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        finishEditing(true);
      } else if (e.key === 'Escape') {
        const modal = document.getElementById('chord-edit-modal');
        const modalOpen = modal && modal.classList.contains('is-open');
        e.preventDefault();
        if (modalOpen && window.MicroModal) {
          MicroModal.close('chord-edit-modal');
          return;
        }
        finishEditing(false);
      }
    });

    function applyClickResult(tokens, roots, card, shapeInput, oldShape, isEditing) {
      const newShape = buildShapeFromTokensAndRoots(tokens, roots);
      if (newShape === oldShape) {
        if (isEditing) shapeInput.focus();
        return;
      }
      shapeInput.value = newShape;
      renderCardDiagram(card);
      if (isEditing) {
        shapeInput.focus();
      } else {
        persist('toggle-root-click');
      }
      if (window.freetarUndoSnapshot) window.freetarUndoSnapshot('diagram-click');
    }

    function handleAltClick(stringIndex, tokens, roots, card, shapeInput, oldShape, isEditing) {
      tokens[stringIndex] = null;
      roots[stringIndex] = null;
      applyClickResult(tokens, roots, card, shapeInput, oldShape, isEditing);
    }

    function handleCtrlClick(card, isEditing) {
      const isCurrent = isEditing;
      if (!currentEditingCard) {
        beginEditing(card);
        return;
      }
      if (!isCurrent) {
        beginEditing(card); // beginEditing will commit/cancel the other card as today
        return;
      }
      finishEditing(true);
    }

    function handleShiftClick(
      stringIndex,
      fret,
      tokens,
      roots,
      card,
      shapeInput,
      oldShape,
      isEditing,
    ) {
      const t = tokens[stringIndex];
      const r = roots[stringIndex];

      if (t !== fret) {
        tokens[stringIndex] = fret;
        roots[stringIndex] = null;
      } else if (t === fret) {
        if (r === null) {
          roots[stringIndex] = 'played';
        } else if (r === 'played') {
          roots[stringIndex] = 'ghost';
        } else if (r === 'ghost') {
          tokens[stringIndex] = null;
          roots[stringIndex] = null;
        } else {
          tokens[stringIndex] = fret;
          roots[stringIndex] = null;
        }
      }

      applyClickResult(tokens, roots, card, shapeInput, oldShape, isEditing);
    }

    function handlePlainClick(
      stringIndex,
      fret,
      tokens,
      roots,
      card,
      shapeInput,
      oldShape,
      isEditing,
      clickedHeader,
    ) {
      const t = tokens[stringIndex];
      const isSameFret = typeof t === 'number' && t > 0 && t === fret;
      const isOpenHeaderClick = t === 0 && clickedHeader;

      if (isSameFret || isOpenHeaderClick) {
        tokens[stringIndex] = null;
        roots[stringIndex] = null;
      } else {
        tokens[stringIndex] = fret;
        roots[stringIndex] = null;
      }

      applyClickResult(tokens, roots, card, shapeInput, oldShape, isEditing);
    }

    const table = card.querySelector('table.chord-diagram');
    if (table && !table.__rootClickWired) {
      table.__rootClickWired = true;
      table.addEventListener('click', onChordDiagramClick);
    }

    function onChordDiagramClick(event) {
      event.stopPropagation(); // keep edit mode active; avoid click-away handling
      event.preventDefault(); // avoid text selection during shift-clicks
      const fretLabel = event.target.closest('.chord-fret-label');
      if (fretLabel) {
        handleFretLabelClick(card);
        return;
      }
      const isEditing = currentEditingCard === card;
      if (event.ctrlKey) {
        handleCtrlClick(card, isEditing);
        return;
      }

      let stringIndex = -1;
      let fret = NaN;
      let clickedHeader = false;

      const headerHit =
        event.target.closest('.chord-header-label') ||
        event.target.closest('.chord-header-root') ||
        event.target.closest('.chord-header-root-mini') ||
        event.target.closest('.chord-header-root-label');
      const headerCell = headerHit
        ? headerHit.closest('.chord-header-string')
        : event.target.closest('.chord-header-string');
      const bodyCell = event.target.closest('.chord-string-cell');
      const targetCell = bodyCell || headerCell;
      if (!targetCell) return;

      const rowEl = targetCell.parentElement;
      if (!rowEl) return;

      if (headerCell && !bodyCell) {
        clickedHeader = true;
        fret = 0;
        const headerCells = Array.from(rowEl.querySelectorAll('.chord-header-string'));
        stringIndex = headerCells.indexOf(headerCell);
      } else {
        const fretAttr = rowEl.getAttribute('data-fret');
        fret = fretAttr ? parseInt(fretAttr, 10) : NaN;
        const cells = Array.from(rowEl.querySelectorAll('.chord-string-cell'));
        stringIndex = bodyCell ? cells.indexOf(bodyCell) : -1;
      }

      if (stringIndex < 0 || !Number.isFinite(fret)) return;

      const shapeInput = card.querySelector('.chord-shape-input');
      if (!shapeInput) return;
      const oldShape = shapeInput.value || '';
      const needsBaseFretPrompt =
        !clickedHeader && isAllOpenOrMuted(oldShape) && !card.dataset.baseFret;
      if (needsBaseFretPrompt) {
        promptForBaseFret(card, (baseFret) => {
          card.dataset.baseFret = String(baseFret);
          let newShape = oldShape;
          if (typeof parseTokensAndRootKinds === 'function') {
            const parsedPrompt = parseTokensAndRootKinds(oldShape);
            if (
              parsedPrompt &&
              Array.isArray(parsedPrompt.tokens) &&
              Array.isArray(parsedPrompt.roots)
            ) {
              const tokensP = parsedPrompt.tokens.slice();
              const rootsP = parsedPrompt.roots.slice();
              if (tokensP[stringIndex] == null || tokensP[stringIndex] === 0) {
                tokensP[stringIndex] = baseFret;
                rootsP[stringIndex] = null;
                newShape = buildShapeFromTokensAndRoots(tokensP, rootsP);
              }
            }
          }
          const shapeChanged = newShape !== oldShape;
          shapeInput.value = newShape;
          renderCardDiagram(card);
          // Ensure the freshly rendered diagram remains interactive
          wireChordCard(card);
          if (isEditing) {
            shapeInput.focus();
          } else {
            persist('toggle-root-click');
          }
          if (shapeChanged && window.freetarUndoSnapshot) {
            window.freetarUndoSnapshot('diagram-click');
          }
        });
        return;
      }
      if (typeof parseTokensAndRootKinds !== 'function') return;
      const parsed = parseTokensAndRootKinds(oldShape);
      if (!parsed || !Array.isArray(parsed.tokens) || !Array.isArray(parsed.roots)) return;

      const tokens = parsed.tokens.slice();
      const roots = parsed.roots.slice();

      if (event.altKey) {
        handleAltClick(stringIndex, tokens, roots, card, shapeInput, oldShape, isEditing);
      } else if (event.shiftKey) {
        handleShiftClick(
          stringIndex,
          fret,
          tokens,
          roots,
          card,
          shapeInput,
          oldShape,
          isEditing,
        );
      } else {
        handlePlainClick(
          stringIndex,
          fret,
          tokens,
          roots,
          card,
          shapeInput,
          oldShape,
          isEditing,
          clickedHeader,
        );
      }
    }
  }

  function addChordToGrid(grid, name = '...', shape = '000000', opts = {}) {
    const { silent = false, prepend = false } = opts || {};
    const prettyTitle = prettifyChordName(name);
    const card = document.createElement('div');
    card.className = 'text-center chord-card mb-3';
    card.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-1 position-relative">
      <span class="material-icons-outlined chord-handle">drag_indicator</span>
      <span class="chord-title flex-grow-1 text-truncate mx-1">${prettyTitle}</span>
      <span class="material-icons-outlined chord-edit" style="cursor: pointer; font-size: 18px;">edit</span>
      <button class="delete-chord-btn" type="button" title="Delete chord" tabindex="-1" style="display:none;">&#8722;</button>
    </div>

    <table class="chord-diagram"></table>

    <div class="chord-edit-section">
      <div class="chord-edit-fields mb-2">
        <input class="form-control form-control-sm mb-1 chord-name-input" value="${name}">
        <input class="form-control form-control-sm chord-shape-input" value="${shape}">
      </div>
      <div class="chord-symbols-toolbar"></div>
    </div>`;
    const insertBeforeNode = prepend ? grid.firstElementChild : null;
    grid.insertBefore(card, insertBeforeNode);
    wireChordCard(card);
    renderCardDiagram(card);
    if (!silent) persist('add-chord'); // skip per-card save during batch import
    return card;
  }

  function wireGroup(groupEl) {
    const addChordBtn = groupEl.querySelector('.add-chord');
    const grid = groupEl.querySelector('.chord-grid');

    if (addChordBtn && grid && !addChordBtn.__wired) {
      addChordBtn.addEventListener('click', () => addChordToGrid(grid, '...', '000000', { prepend: true }));
      addChordBtn.__wired = true;
    }

    if (grid && !grid.dataset.sortable) {
      Sortable.create(grid, {
        group: 'chords',
        handle: '.chord-handle',
        animation: 150,
        // Enable and tune autoscroll so long chord lists remain scrollable while dragging
        scroll: true, // page or nearest scroll container will scroll
        bubbleScroll: true, // allow parent containers/window to scroll
        scrollSensitivity: 60, // px from edge to start scrolling (default ~30)
        scrollSpeed: 20, // px/frame scroll speed (default ~10)
        onEnd: () => {
          persist('reorder-chords');
          document.dispatchEvent(new CustomEvent('chords-reordered'));
        },
      });
      grid.dataset.sortable = '1';
    }
  }

  // Ensure top-level Sortable for groups is attached once
  function ensureGroupSortable() {
    if (!groupsRoot || groupsRoot.dataset.groupSortable) return;
    Sortable.create(groupsRoot, {
      draggable: '.group',
      handle: '.group-handle',
      animation: 150,
      // Keep the window scrollable while dragging tall groups
      scroll: true,
      bubbleScroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 20,
      onEnd: () => {
        persist('reorder-groups');
        document.dispatchEvent(new CustomEvent('chords-reordered'));
      },
    });
    groupsRoot.dataset.groupSortable = '1';
  }

  function createGroup(initialName = '', opts = {}) {
    if (!groupsRoot) return null;
    const { append = true } = opts;
    const groupEl = document.createElement('div');
    groupEl.className = 'group mb-4';

    groupEl.innerHTML = `
      <div class="group-header mb-2">
        <div class="group-title-area">
          <span class="material-icons-outlined group-handle">drag_indicator</span>
          <input class="form-control form-control-sm group-name" value="">
        </div>

        <div class="group-buttons">
          <button type="button" class="add-chord" aria-label="Add chord" data-tooltip="Add Chord">
            <span class="material-icons-outlined">add_circle</span>
          </button>
          <button type="button" class="delete-chords" aria-label="Delete chords" data-tooltip="Delete Chords">
            <span class="material-icons-outlined">remove_circle_outline</span>
          </button>
        </div>
      </div>

      <div class="d-grid chord-grid"></div>
    `;

    if (append) groupsRoot.appendChild(groupEl);

    const nameInput = groupEl.querySelector('.group-name');
    if (nameInput) nameInput.value = initialName || '';

    if (groupDeleteModeActive && groupDeleteModeGroup === groupEl) {
      groupEl.classList.add('deletable-group');
      const pill = ensureGroupDeletePill(groupEl);
      if (pill) pill.style.display = '';
    }

    wireGroup(groupEl);
    if (typeof ensureGroupSortable === 'function') ensureGroupSortable();
    if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();

    return groupEl;
  }

  function updateEmptyMsg() {
    const msg = document.getElementById('empty-msg');
    if (!msg) return;
    msg.style.display = groupsRoot.querySelector('.group .chord-card') ? 'none' : '';
  }

  function rewireChordUI() {
    // Rewire cards and ensure diagrams render
    groupsRoot.querySelectorAll('.chord-card').forEach((card) => {
      wireChordCard(card);
      try {
        renderCardDiagram(card);
      } catch (e) {
        /* noop */
      }
    });

    // Prettify server-rendered titles for display (idempotent; uses textContent as source)
    groupsRoot.querySelectorAll('.chord-card .chord-title').forEach((el) => {
      el.innerHTML = prettifyChordName(el.textContent);
    });

    groupsRoot.querySelectorAll('.group').forEach((groupEl) => {
      wireGroup(groupEl);
    });
    if (groupDeleteModeActive) {
      if (groupDeleteModeGroup && groupsRoot.contains(groupDeleteModeGroup)) {
        groupDeleteModeGroup.classList.add('deletable-group');
        const pill = ensureGroupDeletePill(groupDeleteModeGroup);
        if (pill) pill.style.display = '';
      } else {
        groupDeleteModeActive = false;
        groupDeleteModeGroup = null;
      }
    }
    ensureGroupSortable();
    if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
    updateEmptyMsg();
  }
  function enableDeleteMode(group) {
    if (deleteModeGroup && deleteModeGroup !== group) disableDeleteMode();
    deleteModeGroup = group;
    enableGroupDeleteMode(group);
    group.querySelectorAll('.chord-card').forEach((card) => {
      card.classList.add('deletable');
      const btn = card.querySelector('.delete-chord-btn');
      if (btn) btn.style.display = 'block';
    });
    if (!deleteModeOffHandler) {
      deleteModeOffHandler = (ev) => {
        if (!deleteModeGroup) return;
        const t = ev.target;
        if (t.closest('.delete-chords')) return;
        if (t.closest('.delete-group-pill')) return;
        if (t.closest('#delete-group-modal')) return;
        const clickInGroup = deleteModeGroup.contains(t);
        const clickOnCard = t.closest('.chord-card');
        const clickOnMinus = t.closest('.delete-chord-btn');
        if (!clickInGroup || (!clickOnCard && !clickOnMinus)) disableDeleteMode();
      };
      document.addEventListener('click', deleteModeOffHandler, true);
    }
  }

  function disableDeleteMode() {
    if (!deleteModeGroup) return;
    disableGroupDeleteMode(deleteModeGroup);
    deleteModeGroup.querySelectorAll('.chord-card').forEach((card) => {
      card.classList.remove('deletable');
      const btn = card.querySelector('.delete-chord-btn');
      if (btn) btn.style.display = 'none';
    });
    if (deleteModeDirty) {
      persist('delete-chords');
      deleteModeDirty = false;
    }
    deleteModeGroup = null;
    if (deleteModeOffHandler) {
      document.removeEventListener('click', deleteModeOffHandler, true);
      deleteModeOffHandler = null;
    }
  }

  function ensureGroupDeletePill(groupEl) {
    let pill = groupEl.querySelector('.delete-group-pill');
    if (!pill) {
      const header = groupEl.querySelector('.group-header');
      if (!header) return null;
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'delete-group-pill';
      pill.title = 'Delete group';
      pill.setAttribute('aria-label', 'Delete group');
      pill.innerHTML = '\u2212';
      header.appendChild(pill);
    }
    return pill;
  }

  function enableGroupDeleteMode(groupEl) {
    if (!groupEl) return;
    groupDeleteModeActive = true;
    groupDeleteModeGroup = groupEl;
    groupEl.classList.add('deletable-group');
    const pill = ensureGroupDeletePill(groupEl);
    if (pill) pill.style.display = '';
  }

  function disableGroupDeleteMode(targetGroup = groupDeleteModeGroup) {
    const groupEl = targetGroup;
    if (!groupEl) {
      groupDeleteModeActive = false;
      groupDeleteModeGroup = null;
      return;
    }
    groupEl.classList.remove('deletable-group');
    const pill = groupEl.querySelector('.delete-group-pill');
    if (pill) pill.style.display = 'none';
    if (groupEl === groupDeleteModeGroup) {
      groupDeleteModeActive = false;
      groupDeleteModeGroup = null;
    }
  }

  hoverGroupInsert = (() => {
    let insertPlusEl = null;
    let insertTooltipEl = null;
    let activeMode = null; // "before-first" | "after-last" | "between"
    let activeAfterGroup = null;
    let activeBeforeGroup = null;
    let activeZone = null;
    let activeGroup = null;
    let hoveringPlus = false;
    let emptyZone = null;

    const ensureElements = () => {
      if (insertPlusEl && insertTooltipEl) return;
      insertPlusEl = document.createElement('span');
      insertPlusEl.className = 'group-insert-plus material-icons-outlined';
      insertPlusEl.textContent = 'add_circle';
      insertPlusEl.style.display = 'none';

      insertTooltipEl = document.createElement('div');
      insertTooltipEl.className = 'group-insert-tooltip';
      insertTooltipEl.textContent = 'Add Group';
      insertTooltipEl.style.display = 'none';

      document.body.appendChild(insertPlusEl);
      document.body.appendChild(insertTooltipEl);

      insertPlusEl.addEventListener('mouseenter', () => {
        hoveringPlus = true;
        if (!insertPlusEl || insertPlusEl.style.display === 'none') return;
        const rect = insertPlusEl.getBoundingClientRect();
        insertTooltipEl.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
        insertTooltipEl.style.top = `${rect.top + window.scrollY}px`;
        insertTooltipEl.style.display = 'block';
      });

      insertPlusEl.addEventListener('mouseleave', (ev) => {
        hoveringPlus = false;
        if (insertTooltipEl) insertTooltipEl.style.display = 'none';
        const to = ev?.relatedTarget;
        if (activeZone && (to === activeZone || activeZone?.contains(to))) return;
        hideInsertUI();
      });

      insertPlusEl.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!groupsRoot) return;

        const newGroup = createGroup('New group', { append: false });
        if (!newGroup) return;

        let sibling = null;
        if (activeMode === 'before-first') {
          sibling = activeBeforeGroup || groupsRoot.firstElementChild;
        } else if (activeMode === 'after-last') {
          sibling = activeAfterGroup ? activeAfterGroup.nextElementSibling : null;
        } else if (activeMode === 'between') {
          sibling = activeAfterGroup ? activeAfterGroup.nextElementSibling : null;
        }

        groupsRoot.insertBefore(newGroup, sibling);
        const grid = newGroup.querySelector('.chord-grid');
        if (grid) addChordToGrid(grid, '...', '000000', { silent: true });
        updateEmptyMsg();
        ensureZones();
        await persist('add-group-hover');
        const nameInput = newGroup.querySelector('.group-name');
        if (nameInput) {
          nameInput.focus();
          if (typeof nameInput.select === 'function') nameInput.select();
        }
        hideInsertUI();
      });
    };

    const hideInsertUI = () => {
      if (hoveringPlus) return;
      activeMode = null;
      activeAfterGroup = null;
      activeBeforeGroup = null;
      activeZone = null;
      if (activeGroup) {
        activeGroup.classList.remove('insert-zone-hover');
        activeGroup = null;
      }
      if (insertPlusEl) insertPlusEl.style.display = 'none';
      if (insertTooltipEl) insertTooltipEl.style.display = 'none';
    };

    const showAt = (left, top, mode, { afterGroup = null, beforeGroup = null, zone = null, group = null } = {}) => {
      ensureElements();
      activeMode = mode;
      activeAfterGroup = afterGroup;
      activeBeforeGroup = beforeGroup;
      activeZone = zone;
      if (activeGroup && activeGroup !== group) activeGroup.classList.remove('insert-zone-hover');
      activeGroup = group || null;
      if (activeGroup) activeGroup.classList.add('insert-zone-hover');
      insertPlusEl.style.left = `${left}px`;
      insertPlusEl.style.top = `${top}px`;
      insertPlusEl.style.display = 'flex';
    };

    const handleZoneEnter = (zone) => {
      if (!groupsRoot) return;
      ensureElements();
      const groups = Array.from(groupsRoot.querySelectorAll('.group'));
      const isEmpty = zone.classList.contains('group-insert-empty');
      if (isEmpty && !groups.length) {
        const zoneRect = zone.getBoundingClientRect();
        showAt(
          zoneRect.left + zoneRect.width / 2 + window.scrollX,
          zoneRect.top + zoneRect.height / 2 + window.scrollY,
          'after-last',
          {
            afterGroup: null,
            beforeGroup: null,
            zone,
            group: null,
          },
        );
        return;
      }

      const group = zone.__groupRef;
      if (!group) return;
      const idx = groups.indexOf(group);
      if (idx === -1) return;
      const rect = group.getBoundingClientRect();
      const isTop = zone.classList.contains('group-insert-top');
      let y;
      let mode;
      let afterGroup = null;
      let beforeGroup = null;

      if (isTop) {
        if (idx === 0) {
          mode = 'before-first';
          beforeGroup = group;
          y = rect.top + window.scrollY;
        } else {
          const prev = groups[idx - 1];
          const prevRect = prev.getBoundingClientRect();
          mode = 'between';
          afterGroup = prev;
          y = (prevRect.bottom + rect.top) / 2 + window.scrollY;
        }
      } else {
        if (idx === groups.length - 1) {
          mode = 'after-last';
          afterGroup = group;
          y = rect.bottom + window.scrollY;
        } else {
          const next = groups[idx + 1];
          const nextRect = next.getBoundingClientRect();
          mode = 'between';
          afterGroup = group;
          y = (rect.bottom + nextRect.top) / 2 + window.scrollY;
        }
      }

      const x = rect.left + rect.width / 2 + window.scrollX;
      showAt(x, y, mode, { afterGroup, beforeGroup, zone, group });
    };

    const handleZoneLeave = (e) => {
      const to = e?.relatedTarget;
      if (insertPlusEl && (to === insertPlusEl || insertPlusEl?.contains(to))) return;
      activeZone = null;
      if (activeGroup) {
        activeGroup.classList.remove('insert-zone-hover');
        activeGroup = null;
      }
      if (!hoveringPlus) hideInsertUI();
    };

    const wireZone = (zone) => {
      if (zone.__wired) return;
      zone.addEventListener('mouseenter', () => handleZoneEnter(zone));
      zone.addEventListener('mouseleave', handleZoneLeave);
      zone.__wired = true;
    };

    const ensureZones = () => {
      if (!groupsRoot) return;
      ensureElements();
      const groups = Array.from(groupsRoot.querySelectorAll('.group'));
      if (!groups.length) {
        if (!emptyZone) {
          emptyZone = document.createElement('div');
          emptyZone.className = 'group-insert-zone group-insert-empty';
          wireZone(emptyZone);
          groupsRoot.appendChild(emptyZone);
        }
        emptyZone.style.display = '';
        return;
      }
      if (emptyZone) emptyZone.style.display = 'none';

      groups.forEach((group, idx) => {
        let topZone = group.querySelector('.group-insert-zone.group-insert-top');
        if (!topZone) {
          topZone = document.createElement('div');
          topZone.className = 'group-insert-zone group-insert-top';
          group.appendChild(topZone);
        }
        let bottomZone = group.querySelector('.group-insert-zone.group-insert-bottom');
        if (!bottomZone) {
          bottomZone = document.createElement('div');
          bottomZone.className = 'group-insert-zone group-insert-bottom';
          group.appendChild(bottomZone);
        }

        const isFirst = idx === 0;
        topZone.__groupRef = group;
        bottomZone.__groupRef = group;
        topZone.style.display = isFirst ? '' : 'none';
        topZone.style.pointerEvents = isFirst ? 'auto' : 'none';
        bottomZone.style.display = '';
        bottomZone.style.pointerEvents = 'auto';

        wireZone(topZone);
        wireZone(bottomZone);
      });
    };

    return {
      init() {
        ensureElements();
        ensureZones();
      },
      refresh() {
        ensureZones();
      },
    };
  })();

  document.addEventListener('chords-reordered', () => {
    if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
  });

  // ---------- init & global wiring ----------
  function init() {
    ensureGroupHoverCSS(); // make group tools appear only on hover/focus-within
    groupsRoot = document.getElementById('groups-root');
    if (!groupsRoot) return console.warn('my-chords.page.js: #groups-root not found.');
    deleteGroupModal = document.getElementById('delete-group-modal');
    confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
    baseFretModal = document.getElementById('base-fret-modal');
    baseFretValueEl = document.getElementById('base-fret-modal-value');
    wireModalCloseButtons();

    if (window.MicroModal) {
      MicroModal.init({
        onShow: (modal) => {
          pushModalOnStack(modal);
        },
        onClose: (modal) => {
          removeModalFromStack(modal);
          if (!modal) return;
          if (modal.id === 'chord-edit-modal') {
            if (suppressModalOnClose) return;
            if (currentEditingCard) {
              finishEditing(true, { fromModalClose: true });
            }
          }
          if (modal.id === 'delete-group-modal' && deleteGroupModal) {
            deleteGroupModal._target = null;
          }
          if (modal.id === 'base-fret-modal') {
            document.removeEventListener('keydown', baseFretKeyHandler, true);
            baseFretActiveCard = null;
            baseFretOnConfirm = null;
            baseFretBuffer = '';
            updateBaseFretDisplay();
          }
        },
        openTrigger: 'data-micromodal-trigger',
        closeTrigger: 'data-micromodal-close',
        openClass: 'is-open',
        disableScroll: true,
        disableFocus: false,
        awaitOpenAnimation: false,
        awaitCloseAnimation: false,
        debugMode: false,
      });
    }

    // ----- Batch Import wiring (restore old behavior) -----
    showImportBtn = document.getElementById('show-import-chords');
    importArea = document.getElementById('import-chords-area');
    importInput = document.getElementById('import-chords-input');
    importBtn = document.getElementById('import-chords-btn');
    cancelImportBtn = document.getElementById('cancel-import-chords');

    const getDefaultGroup = () => {
      return groupsRoot.querySelector('.group') || createGroup('');
    };
    // Find the FIRST existing group whose name begins with the first word of "name" (case-insensitive).
    // Do not create a new group here; caller will fall back to the top group.
    const getOrCreateGroupByName = (name) => {
      const firstWord = (name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
      if (!firstWord) return null;
      const groups = groupsRoot.querySelectorAll('.group');
      for (const g of groups) {
        const val = (g.querySelector('.group-name')?.value || '').trim().toLowerCase();
        if (val.startsWith(firstWord)) return g; // first match in document order
      }
      return null; // no match; caller handles fallback
    };

    const handleImport = async () => {
      if (!importInput) return;
      const lines = importInput.value.split(/\r?\n/);
      let added = 0;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const parts = line
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length < 2) continue;
        const name = parts[0] || '(unnamed)';
        const shape = parts[1] || '';
        if (!shape) continue;
        const grp = parts[2] || '';
        // If a group hint exists, try prefix match; otherwise or on no match, use the top group.
        const targetGroup = grp
          ? getOrCreateGroupByName(grp) || getDefaultGroup()
          : getDefaultGroup();
        const grid = targetGroup.querySelector('.chord-grid');
        if (grid) {
          addChordToGrid(grid, name, shape, { silent: true });
          added++;
        }
      }
      if (added > 0) {
        await persist('import');
        updateEmptyMsg();
      }
      if (importArea) importArea.style.display = 'none';
      if (importInput) importInput.value = '';
    };

    if (showImportBtn && importArea) {
      showImportBtn.addEventListener('click', () => {
        importArea.style.display = '';
        if (importInput) {
          importInput.focus();
          if (typeof importInput.select === 'function') importInput.select();
        }
      });
    }
    if (cancelImportBtn && importArea) {
      cancelImportBtn.addEventListener('click', () => {
        importArea.style.display = 'none';
      });
    }
    if (importBtn) {
      importBtn.addEventListener('click', handleImport);
    }

    // Re-attach the rest of the interactive wiring
    rewireChordUI();
    if (hoverGroupInsert && hoverGroupInsert.init) hoverGroupInsert.init();

    // Persist cleared group names on blur
    groupsRoot.addEventListener(
      'blur',
      (e) => {
        const t = e.target;
        if (t && t.classList.contains('group-name')) {
          persist('group-name-blur');
        }
      },
      true,
    );

    // Delegated deletes (chords + groups)
    groupsRoot.addEventListener('click', (e) => {
      const deleteChordsBtn = e.target.closest('.delete-chords');
      if (deleteChordsBtn) {
        const group = deleteChordsBtn.closest('.group');
        if (!group) return;
        if (deleteModeGroup === group) disableDeleteMode();
        else enableDeleteMode(group);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const deleteChordBtn = e.target.closest('.delete-chord-btn');
      if (deleteChordBtn) {
        const card = deleteChordBtn.closest('.chord-card');
        if (card) {
          card.remove();
          deleteModeDirty = true;
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const deleteGroupBtn = e.target.closest('.delete-group-pill');
      if (
        deleteGroupBtn &&
        deleteGroupModal &&
        groupDeleteModeActive &&
        deleteGroupBtn.closest('.group') === groupDeleteModeGroup
      ) {
        deleteGroupModal._target = deleteGroupBtn.closest('.group') || null;
        if (window.MicroModal) {
          MicroModal.show('delete-group-modal');
        }
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Modal controls
    if (confirmDeleteGroupBtn) {
      confirmDeleteGroupBtn.addEventListener('click', async () => {
        if (deleteGroupModal && deleteGroupModal._target) {
          if (deleteModeGroup === deleteGroupModal._target) disableDeleteMode();
          else if (groupDeleteModeActive && deleteGroupModal._target === groupDeleteModeGroup) {
            disableGroupDeleteMode(deleteGroupModal._target);
          }
          deleteGroupModal._target.remove();
          if (!groupsRoot.querySelector('.group')) disableGroupDeleteMode();
          await persist('delete-group');
          updateEmptyMsg();
          if (hoverGroupInsert && hoverGroupInsert.refresh) hoverGroupInsert.refresh();
        }
        if (window.MicroModal) MicroModal.close('delete-group-modal');
        if (deleteGroupModal) deleteGroupModal._target = null;
      });
    }

    // Click-away commit + Esc cancel while editing
    document.addEventListener('click', (e) => {
      if (!currentEditingCard) return;
      const modal = document.getElementById('chord-edit-modal');
      if (modal && modal.classList.contains('is-open')) {
        return;
      }
      if (baseFretModal && baseFretModal.contains(e.target)) return;
      if (currentEditingCard.contains(e.target)) return;
      finishEditing(true);
    });
    document.addEventListener('keydown', (e) => {
      if (!currentEditingCard) return;
      if (e.key === 'Escape') {
        const modal = document.getElementById('chord-edit-modal');
        const modalOpen = modal && modal.classList.contains('is-open');
        e.preventDefault();
        if (modalOpen && window.MicroModal) {
          MicroModal.close('chord-edit-modal');
          return;
        }
        finishEditing(false);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose for Undo/Redo DOM morphs (called after morphdom applies HTML)
  window.rewireChordUI = rewireChordUI;
})();
