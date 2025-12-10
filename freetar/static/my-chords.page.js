/* my-chords.page.js
   Page-specific UI for My Chord Library.
   Expects:
   - window.MY_CHORDS_EDIT_URL (set in template)
   - SortableJS available as global Sortable
   - renderCardDiagram(card) global function
*/

function computeChordTitlePlacement(card) {
  if (!card) return null;
  const table = card.querySelector('.chord-diagram');
  const title = card.querySelector('.chord-title');
  if (!table || !title) return null;

  const left = table.querySelector('.string-left');
  const rights = table.querySelectorAll('.string-right');
  const right = rights[rights.length - 1];
  if (!left || !right) return null;

  const prevTransform = title.style.transform;
  title.style.transform = 'none';

  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  const stringsCenter = (leftRect.left + rightRect.right) / 2;
  const titleRect = title.getBoundingClientRect();
  const titleCenter = (titleRect.left + titleRect.right) / 2;
  const deltaX = stringsCenter - titleCenter;

  // Restore any previous inline transform while caller decides what to apply
  title.style.transform = prevTransform;

  return {
    deltaX,
    stringsCenter,
    titleCenter,
    titleRect,
    leftRect,
    rightRect,
    containerRect: (title.parentElement || card).getBoundingClientRect(),
  };
}

function centerTitleForCard(card) {
  const data = computeChordTitlePlacement(card);
  if (!data) return null;
  const title = card.querySelector('.chord-title');
  if (!title) return null;
  title.style.position = 'relative';
  title.style.left = '0px';
  title.style.right = 'auto';
  title.style.transform = `translateX(${data.deltaX}px)`;
  return data;
}

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
  let hoverRowInsert;
  let libraryFileInput = null;
  let suppressModalOnClose = false;
  let currentEditingSourceCard = null;
  let currentEditingSpotlightCard = null;
  let pendingEditSnapshots = [];
  let inlineNameEditState = null;
  let inlineNameInputEl = null;
  let inlineNameOutsideHandler = null;
  let diagramLockEnabled = true;
  let diagramLockToggleBtn = null;
  let chordSettingsMenu = null;
  let chordSettingsToggleBtn = null;
  let maxPerRowCheckbox = null;
  let maxPerRowInput = null;
  let maxPerRowRow = null;
  let settingsOutsideHandler = null;
  let maxChordsPerRowEnabled = false;
  let maxChordsPerRow = 8;
  let activeAltChordDrag = null;
  const ghostRowState = {
    group: null,
    ghostRow: null,
    placeholder: null,
    hideTimer: null,
    lastHover: null,
  };
  let rowHandleHoverFrame = null;
  let lastRowHandlePointer = null;
  let rowHandleHoverListenerAttached = false;
  let dragMoveHandlerAttached = false;
  const MODAL_BASE_Z = 3000;
  const MODAL_Z_STEP = 20;
  const modalStack = [];
  const LOCK_TOOLTIP_ON = 'Diagram lock is ON (Ctrl+click to edit safely)';
  const LOCK_TOOLTIP_OFF = 'Diagram lock is OFF (diagram clicks edit immediately)';
  const SETTINGS_KEY = 'my_chords_settings';
  const MAX_PER_ROW_DEFAULT = 8;
  const MAX_PER_ROW_MIN = 1;
  const MAX_PER_ROW_MAX = 24;

  function loadSettings() {
    try {
      const raw = window.localStorage ? localStorage.getItem(SETTINGS_KEY) : null;
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
      /* ignore storage errors */
    }
    return {};
  }

  function saveSettings(next = {}) {
    try {
      const current = loadSettings();
      const merged = Object.assign({}, current, next || {});
      if (window.localStorage) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      }
    } catch (_) {
      /* ignore storage errors */
    }
  }

  function loadDiagramLockSetting(defaultValue) {
    const settings = loadSettings();
    if (settings && typeof settings.diagramLockEnabled === 'boolean') {
      return settings.diagramLockEnabled;
    }
    return defaultValue;
  }

  function saveDiagramLockSetting(value) {
    diagramLockEnabled = !!value;
    persistUISettings();
  }

  function clampMaxPerRow(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return MAX_PER_ROW_DEFAULT;
    return Math.min(Math.max(parsed, MAX_PER_ROW_MIN), MAX_PER_ROW_MAX);
  }

  function persistUISettings() {
    saveSettings({
      diagramLockEnabled,
      maxChordsPerRowEnabled,
      maxChordsPerRow,
    });
  }

  function applyMaxPerRowLayout() {
    const root = document.body;
    if (!root) return;
    document.documentElement.style.setProperty(
      '--chord-grid-max-columns',
      String(maxChordsPerRow || MAX_PER_ROW_DEFAULT),
    );
    root.classList.toggle('chords-max-per-row-active', !!maxChordsPerRowEnabled);
  }

  function updateChordSettingsUI() {
    const menuOpen = chordSettingsMenu?.classList.contains('chord-settings-menu--open');
    if (chordSettingsToggleBtn) {
      chordSettingsToggleBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    }
    if (chordSettingsMenu) {
      chordSettingsMenu.setAttribute('aria-hidden', menuOpen ? 'false' : 'true');
    }
    if (maxPerRowCheckbox) {
      maxPerRowCheckbox.checked = !!maxChordsPerRowEnabled;
    }
    if (maxPerRowInput) {
      maxPerRowInput.disabled = !maxChordsPerRowEnabled;
      maxPerRowInput.value = String(maxChordsPerRow || MAX_PER_ROW_DEFAULT);
    }
    if (maxPerRowRow) {
      maxPerRowRow.classList.toggle('is-disabled', !maxChordsPerRowEnabled);
    }
  }

  function detachSettingsOutsideHandler() {
    if (settingsOutsideHandler) {
      document.removeEventListener('mousedown', settingsOutsideHandler, true);
      document.removeEventListener('touchstart', settingsOutsideHandler, true);
      settingsOutsideHandler = null;
    }
  }

  function closeChordSettingsMenu() {
    if (!chordSettingsMenu) return;
    chordSettingsMenu.classList.remove('chord-settings-menu--open');
    detachSettingsOutsideHandler();
    updateChordSettingsUI();
  }

  function openChordSettingsMenu() {
    if (!chordSettingsMenu) return;
    chordSettingsMenu.classList.add('chord-settings-menu--open');
    if (!settingsOutsideHandler) {
      settingsOutsideHandler = (ev) => {
        if (!chordSettingsMenu || !chordSettingsMenu.classList.contains('chord-settings-menu--open')) return;
        if (chordSettingsMenu.contains(ev.target)) return;
        if (chordSettingsToggleBtn && chordSettingsToggleBtn.contains(ev.target)) return;
        closeChordSettingsMenu();
      };
      document.addEventListener('mousedown', settingsOutsideHandler, true);
      document.addEventListener('touchstart', settingsOutsideHandler, true);
    }
    updateChordSettingsUI();
  }

  function toggleChordSettingsMenu() {
    if (!chordSettingsMenu) return;
    const isOpen = chordSettingsMenu.classList.contains('chord-settings-menu--open');
    if (isOpen) closeChordSettingsMenu();
    else openChordSettingsMenu();
  }
  const CONTROL_TOOLTIP_TEXT = {
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Shift+Z)',
  };

  function setControlTooltip(button, text) {
    if (!button || !text) return;
    button.dataset.tooltip = text;
    button.dataset.tooltipSrc = text;
    button.setAttribute('data-tooltip', text);
    button.setAttribute('title', text);
    button.title = text;
    button.setAttribute('aria-label', text);
  }

  function ensureHistoryTooltips() {
    setControlTooltip(document.getElementById('undo-history-btn'), CONTROL_TOOLTIP_TEXT.undo);
    setControlTooltip(document.getElementById('redo-history-btn'), CONTROL_TOOLTIP_TEXT.redo);
  }

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
      if (btn.__modalCloseWired) return;
      btn.__modalCloseWired = true;
      btn.dataset.closeWired = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const modal = btn.closest('.modal');
        if (!modal) return;
        const isChordEdit = modal.id === 'chord-edit-modal';
        const focusTarget =
          isChordEdit
            ? currentEditingSourceCard?.querySelector('.chord-edit') || currentEditingSourceCard
            : null;
        if (isChordEdit && currentEditingCard) {
          finishEditing(true, { fromModalClose: true });
        }
        if (window.MicroModal && modal.id) {
          MicroModal.close(modal.id);
        } else if (modal.classList.contains('is-open')) {
          modal.classList.remove('is-open');
        }
        if (focusTarget && typeof focusTarget.focus === 'function') {
          setTimeout(() => {
            const hadTabIndex = focusTarget.hasAttribute('tabindex');
            const needsTabIndex = focusTarget.tabIndex < 0;
            if (needsTabIndex) focusTarget.setAttribute('tabindex', '-1');
            focusTarget.focus({ preventScroll: true });
            if (!hadTabIndex && needsTabIndex) focusTarget.removeAttribute('tabindex');
          }, 0);
        }
      });
    });
  }

  function updateDiagramLockButtonUI() {
    if (!diagramLockToggleBtn) return;
    const tooltip = diagramLockEnabled ? LOCK_TOOLTIP_ON : LOCK_TOOLTIP_OFF;
    diagramLockToggleBtn.dataset.tooltipSrc = tooltip;
    diagramLockToggleBtn.dataset.tooltip = tooltip;
    diagramLockToggleBtn.setAttribute('data-tooltip', tooltip);
    diagramLockToggleBtn.setAttribute('title', tooltip);
    diagramLockToggleBtn.title = tooltip;
    diagramLockToggleBtn.setAttribute('aria-label', tooltip);
    diagramLockToggleBtn.setAttribute('aria-pressed', String(diagramLockEnabled));
    diagramLockToggleBtn.dataset.locked = diagramLockEnabled ? 'true' : 'false';
    const iconEl = diagramLockToggleBtn.querySelector('.material-icons-outlined');
    if (iconEl) iconEl.textContent = diagramLockEnabled ? 'lock' : 'lock_open';
    if (window.initTooltips) window.initTooltips();
  }
  // Inject CSS so drag handle appears on header hover, but buttons appear on group hover
  function ensureGroupHoverCSS() {
    if (document.getElementById('group-hover-tools-css')) return;
    const style = document.createElement('style');
    style.id = 'group-hover-tools-css';
    style.textContent = `
    /* Hide group-level controls by default */
    .group .group-header .group-handle,
    .group .group-header .add-chord,
    .group .group-header .delete-chords,
    .group .group-header .export-group {
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease-in-out;
    }

    /* Drag handle: only when the header row itself is hovered or has focus */
    .group .group-header:hover .group-handle,
    .group .group-header:focus-within .group-handle {
      opacity: 1;
      pointer-events: auto;
    }

    /* Group buttons: when header is hovered/focused OR anywhere over the group */
    .group .group-header:hover .add-chord,
    .group .group-header:hover .delete-chords,
    .group .group-header:hover .export-group,
    .group .group-header:focus-within .add-chord,
    .group .group-header:focus-within .delete-chords,
    .group .group-header:focus-within .export-group,
    .group:hover .group-header .add-chord,
    .group:hover .group-header .delete-chords,
    .group:hover .group-header .export-group,
    .group:focus-within .group-header .add-chord,
    .group:focus-within .group-header .delete-chords,
    .group:focus-within .group-header .export-group {
      opacity: 1;
      pointer-events: auto;
    }

    .group.insert-zone-hover .group-header .group-handle,
    .group.insert-zone-hover .group-header .add-chord,
    .group.insert-zone-hover .group-header .delete-chords,
    .group.insert-zone-hover .group-header .export-group {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* On devices without hover, keep them available on focus */
    @media (hover: none) {
      .group .group-header:focus-within .group-handle {
        opacity: 1;
        pointer-events: auto;
      }
      .group .group-header:focus-within .add-chord,
      .group .group-header:focus-within .delete-chords,
      .group .group-header:focus-within .export-group,
      .group:focus-within .group-header .add-chord,
      .group:focus-within .group-header .delete-chords,
      .group:focus-within .group-header .export-group {
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

  function parseChordNameNote(rawName) {
    const raw = rawName == null ? '' : String(rawName);
    const closeIdx = raw.lastIndexOf('}');
    if (closeIdx === -1) return { baseName: raw, noteText: '' };
    const openIdx = raw.lastIndexOf('{', closeIdx);
    if (openIdx === -1) return { baseName: raw, noteText: '' };

    const noteText = raw.slice(openIdx + 1, closeIdx).trim();
    if (!noteText) return { baseName: raw, noteText: '' };

    const baseName = raw.slice(0, openIdx).trim();
    return { baseName, noteText };
  }

  function updateChordTitleFromName(card, rawName) {
    if (!card) return;
    const titleEl = card.querySelector('.chord-title');
    if (!titleEl) return;

    const { baseName, noteText } = parseChordNameNote(rawName);
    const displayName = baseName ? baseName : '(unnamed)';
    titleEl.innerHTML = prettifyChordName(displayName);

    if (noteText) {
      titleEl.dataset.tooltip = noteText;
      titleEl.setAttribute('data-tooltip', noteText);
    } else {
      delete titleEl.dataset.tooltip;
      titleEl.removeAttribute('data-tooltip');
    }
  }

  function copyNameInputAttributes(source, target) {
    if (!source || !target) return;
    const mirrorAttrs = ['placeholder', 'inputmode', 'aria-label', 'title', 'pattern', 'autocomplete'];
    mirrorAttrs.forEach((attr) => {
      if (source.hasAttribute && source.hasAttribute(attr)) {
        target.setAttribute(attr, source.getAttribute(attr));
      }
    });
    if (source.maxLength && source.maxLength > 0) {
      target.maxLength = source.maxLength;
    }
  }

  function positionInlineNameInput(card, container) {
    if (!card || !container || !inlineNameInputEl) return false;
    const placement = computeChordTitlePlacement(card);
    if (!placement) return false;
    const containerRect = placement.containerRect;
    const stringsWidth = placement.rightRect.right - placement.leftRect.left;
    const idealWidth = Math.max(placement.titleRect.width, 120);
    const clampedMax = Math.max(60, Math.min(containerRect.width - 8, stringsWidth - 8));
    const width = Math.min(clampedMax, Math.max(80, Math.min(idealWidth, clampedMax)));
    const finalCenter = placement.titleCenter + placement.deltaX;
    const proposedLeft = finalCenter - width / 2 - containerRect.left;
    const maxLeft = Math.max(0, containerRect.width - width - 4);
    const left = Math.max(4, Math.min(maxLeft, proposedLeft));
    const top = placement.titleRect.top - containerRect.top;

    inlineNameInputEl.style.left = `${left}px`;
    inlineNameInputEl.style.top = `${top}px`;
    inlineNameInputEl.style.width = `${width}px`;
    return true;
  }

  function detachInlineNameOutsideHandlers() {
    if (inlineNameOutsideHandler) {
      document.removeEventListener('mousedown', inlineNameOutsideHandler, true);
      document.removeEventListener('touchstart', inlineNameOutsideHandler, true);
      inlineNameOutsideHandler = null;
    }
  }

  function finishInlineNameEdit(card, { commit = false } = {}) {
    const state = inlineNameEditState;
    if (!state) return;
    if (card && state.card !== card) return;

    detachInlineNameOutsideHandlers();

    const { titleEl, nameInput, originalName, originalVisibility } = state;
    const input = inlineNameInputEl;
    const nextName = commit && input ? (input.value || '').trim() : originalName;
    inlineNameEditState = null;

    if (input && input.parentElement && input.parentElement.contains(input)) {
      input.parentElement.removeChild(input);
      input.style.display = 'none';
    }
    if (titleEl) {
      titleEl.style.visibility = originalVisibility || '';
    }
    if (state.card) state.card.classList.remove('is-inline-name-editing');
    if (!state.card || !nameInput || !titleEl) return;

    nameInput.value = nextName;
    updateChordTitleFromName(state.card, nextName);
    centerTitleForCard(state.card);
    if (commit) {
      if (window.freetarUndoSnapshot) {
        window.freetarUndoSnapshot('inline-name-edit', buildDataFromDOM());
      }
      persist('inline-name-edit');
    }
  }

  function beginInlineNameEdit(card) {
    if (!card) return;
    centerTitleForCard(card);
    if (inlineNameEditState && inlineNameEditState.card === card) {
      if (inlineNameInputEl) {
        inlineNameInputEl.focus({ preventScroll: true });
        inlineNameInputEl.select();
      }
      return;
    }
    if (inlineNameEditState) {
      finishInlineNameEdit(inlineNameEditState.card, { commit: true });
    }
    const titleEl = card.querySelector('.chord-title');
    const nameInput = card.querySelector('.chord-name-input');
    if (!titleEl || !nameInput) return;

    const container = titleEl.parentElement || card;

    if (!inlineNameInputEl) {
      inlineNameInputEl = document.createElement('input');
      inlineNameInputEl.type = 'text';
      inlineNameInputEl.className = 'chord-name-inline-input';
      inlineNameInputEl.setAttribute('aria-live', 'off');
      inlineNameInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finishInlineNameEdit(inlineNameEditState?.card, { commit: false });
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          finishInlineNameEdit(inlineNameEditState?.card, { commit: true });
        } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          finishInlineNameEdit(inlineNameEditState?.card, { commit: true });
        }
      });
      inlineNameInputEl.addEventListener('blur', (e) => {
        const state = inlineNameEditState;
        if (!state) return;
        const nextTarget = e.relatedTarget;
        if (nextTarget && state.card && state.card.contains(nextTarget)) return;
        finishInlineNameEdit(state.card, { commit: true });
      });
    }

    copyNameInputAttributes(nameInput, inlineNameInputEl);
    inlineNameInputEl.value = nameInput.value || '';

    const positioned = positionInlineNameInput(card, container);
    if (!positioned) return;
    inlineNameInputEl.style.display = 'block';

    const originalVisibility = titleEl.style.visibility;
    titleEl.style.visibility = 'hidden';
    container.appendChild(inlineNameInputEl);

    inlineNameEditState = {
      card,
      titleEl,
      nameInput,
      originalName: nameInput.value || '',
      originalVisibility,
    };
    card.classList.add('is-inline-name-editing');

    if (!inlineNameOutsideHandler) {
      inlineNameOutsideHandler = (ev) => {
        if (!inlineNameEditState) return;
        const t = ev.target;
        if (inlineNameInputEl && (t === inlineNameInputEl || inlineNameInputEl.contains(t))) return;
        finishInlineNameEdit(inlineNameEditState.card, { commit: true });
      };
      document.addEventListener('mousedown', inlineNameOutsideHandler, true);
      document.addEventListener('touchstart', inlineNameOutsideHandler, true);
    }

    inlineNameInputEl.focus({ preventScroll: true });
    inlineNameInputEl.select();
  }

  window.addEventListener('resize', () => {
    if (!inlineNameEditState || !inlineNameInputEl) return;
    const card = inlineNameEditState.card;
    const container =
      (inlineNameEditState.titleEl && inlineNameEditState.titleEl.parentElement) || card;
    positionInlineNameInput(card, container);
  });

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

  function getCollectionIdFromContext() {
    const editUrl = EDIT_URL();
    const match = editUrl && editUrl.match(/\/my-collections\/([^/]+)\/edit/);
    if (match && match[1]) return decodeURIComponent(match[1]);
    const pathMatch =
      window.location &&
      window.location.pathname &&
      window.location.pathname.match(/\/my-collections\/([^/]+)(?:\/|$)/);
    if (pathMatch && pathMatch[1]) return decodeURIComponent(pathMatch[1]);
    const params = new URLSearchParams(window.location.search || '');
    const qsId = params.get('collection_id');
    return qsId || null;
  }

  function buildLibraryExportUrl() {
    const cid = getCollectionIdFromContext();
    const base = '/my-chords/export';
    return cid ? `${base}?collection_id=${encodeURIComponent(cid)}` : base;
  }

  function buildLibraryImportUrl() {
    const cid = getCollectionIdFromContext();
    const base = '/my-chords/import';
    return cid ? `${base}?collection_id=${encodeURIComponent(cid)}` : base;
  }

  function buildGroupExportUrl(groupIndex) {
    const cid = getCollectionIdFromContext();
    const base = `/my-chords/export-group/${groupIndex}`;
    return cid ? `${base}?collection_id=${encodeURIComponent(cid)}` : base;
  }

  function showInlineError(msg) {
    console.warn('[my-chords] ' + msg);
    const target =
      document.querySelector('#undo-redo-wrap button[aria-label="Import chord library"]') || null;
    if (!target) return;
    const prevTitle = target.getAttribute('title') || target.getAttribute('data-tooltip') || '';
    target.setAttribute('title', msg);
    target.setAttribute('data-tooltip', msg);
    if (window.initTooltips) window.initTooltips();
    setTimeout(() => {
      target.setAttribute('title', prevTitle || 'Import chord library');
      target.setAttribute('data-tooltip', prevTitle || 'Import chord library');
      if (window.initTooltips) window.initTooltips();
    }, 2400);
  }

  async function refreshGroupsFromServer() {
    try {
      const res = await fetch(window.location.href, {
        cache: 'no-store',
        headers: { 'X-Requested-With': 'fetch' },
      });
      if (!res.ok) throw new Error('fetch failed');
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newRoot = doc.getElementById('groups-root');
      if (!newRoot || !groupsRoot) throw new Error('#groups-root missing');
      if (typeof window.morphdom !== 'function') throw new Error('morphdom not loaded');
      window.morphdom(groupsRoot, newRoot, { childrenOnly: true });
      if (window.rewireChordUI) window.rewireChordUI();
      const state = buildDataFromDOM();
      document.dispatchEvent(new CustomEvent('chords-imported', { detail: { state } }));
    } catch (err) {
      showInlineError('Import applied, but refresh failed. Reload to see changes.');
      console.warn('Import refresh failed:', err);
    }
  }

  function ensureLibraryFileInput() {
    if (libraryFileInput) return libraryFileInput;
    libraryFileInput = document.createElement('input');
    libraryFileInput.type = 'file';
    libraryFileInput.accept = 'application/json,.json';
    libraryFileInput.style.display = 'none';
    libraryFileInput.addEventListener('change', handleLibraryFileSelection);
    document.body.appendChild(libraryFileInput);
    return libraryFileInput;
  }

  async function handleLibraryFileSelection(event) {
    const inputEl = event?.target || libraryFileInput;
    if (!inputEl) return;
    const file = inputEl.files && inputEl.files[0];
    inputEl.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        if (!text) throw new Error('Empty file');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          throw new Error('Invalid JSON');
        }
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid payload shape');
        const res = await fetch(buildLibraryImportUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        });
        if (!res.ok) throw new Error(`Import failed (${res.status})`);
        await refreshGroupsFromServer();
      } catch (err) {
        showInlineError('Import failed. Please check the JSON file.');
        console.warn('Chord library import failed:', err);
      }
    };
    reader.onerror = () => {
      showInlineError('Import failed. Could not read file.');
    };
    reader.readAsText(file);
  }

  function wireLibraryImportExportButtons() {
    const importBtn = document.querySelector(
      '#undo-redo-wrap button[aria-label="Import chord library"]',
    );
    const exportBtn = document.querySelector('#undo-redo-wrap .toolbar-export');
    if (importBtn && !importBtn.__wired) {
      importBtn.__wired = true;
      importBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const inputEl = ensureLibraryFileInput();
        if (inputEl && typeof inputEl.click === 'function') inputEl.click();
      });
    }
    if (exportBtn && !exportBtn.__wired) {
      exportBtn.__wired = true;
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = buildLibraryExportUrl();
        if (url) window.location.href = url;
      });
    }
  }

  // ---------- helpers ----------
  function buildShapeFromTokensAndRoots(tokens, roots) {
    if (typeof window.buildShapeFromTokensAndRootKinds === 'function') {
      return window.buildShapeFromTokensAndRootKinds(tokens, roots);
    }
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
        if (num === 0) {
          if (rk === 'played') return '[0]';
          if (rk === 'ghost') return '{0}';
          return '0';
        }
        const core = num >= 10 ? `(${num})` : String(num);
        if (rk === 'played') return `[${core}]`;
        if (rk === 'ghost') return `{${core}}`;
        return core;
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

  function sanitizeBaseFretValue(raw) {
    return (raw || '').replace(/\D/g, '').slice(0, 2);
  }

  function syncBaseFretBufferFromInput() {
    if (!baseFretValueEl) return;
    const cleaned = sanitizeBaseFretValue(baseFretValueEl.value || '');
    baseFretBuffer = cleaned;
    if (baseFretValueEl.value !== cleaned) baseFretValueEl.value = cleaned;
  }

  function updateBaseFretDisplay() {
    if (!baseFretValueEl) return;
    baseFretValueEl.value = baseFretBuffer;
    baseFretValueEl.placeholder = '\u00A0';
  }

  function focusBaseFretInputField() {
    if (typeof window.focusBaseFretInput === 'function') {
      window.focusBaseFretInput();
      return;
    }
    if (baseFretValueEl && typeof baseFretValueEl.focus === 'function') {
      baseFretValueEl.focus({ preventScroll: true });
      const len = baseFretValueEl.value ? baseFretValueEl.value.length : 0;
      try {
        baseFretValueEl.setSelectionRange(len, len);
      } catch (_) {
        /* noop */
      }
    }
  }

  function hideBaseFretModal() {
    document.removeEventListener('keydown', baseFretKeyHandler, true);
    baseFretActiveCard = null;
    baseFretBuffer = '';
    baseFretOnConfirm = null;
    updateBaseFretDisplay();
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

    if (key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      syncBaseFretBufferFromInput();
      if (!baseFretBuffer) {
        updateBaseFretDisplay();
        focusBaseFretInputField();
        return;
      }
      const val = parseInt(baseFretBuffer, 10);
      if (!Number.isFinite(val) || val < 1 || val > 24) {
        baseFretBuffer = '';
        updateBaseFretDisplay();
        focusBaseFretInputField();
        return;
      }
      const cb = baseFretOnConfirm;
      const target = baseFretActiveCard;
      hideBaseFretModal();
      if (typeof cb === 'function' && target) cb(val);
      return;
    }

    const isDigit = /^[0-9]$/.test(key);
    if (isDigit || key === 'Backspace' || key === 'Delete') {
      // Allow typing; sync after the keystroke so we pick up the new value.
      setTimeout(syncBaseFretBufferFromInput, 0);
      return;
    }

    const navigationKeys = ['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Shift'];
    if (navigationKeys.includes(key)) return;

    e.stopPropagation();
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
    setTimeout(() => {
      focusBaseFretInputField();
    }, 0);
  }

  function handleFretLabelClick(card, rowIndex, currentLabel) {
    const safeRowIndex = Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : 0;
    const currentLabelNum = Number.isFinite(currentLabel) ? currentLabel : null;
    if (typeof promptForBaseFret !== 'function') return;
    promptForBaseFret(card, (newFret) => {
      const targetFret = parseInt(newFret, 10);
      if (!Number.isFinite(targetFret) || targetFret <= 0) return;
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
        typeof buildShapeFromTokensAndRootKinds !== 'function'
      )
        return;

      const tokens = parsedShape.tokens.slice();
      const roots = parsedShape.roots.slice();

      const currentBase = (() => {
        const baseAttr = card?.dataset?.baseFret;
        if (baseAttr) {
          const parsedBase = parseInt(baseAttr, 10);
          if (Number.isFinite(parsedBase) && parsedBase > 0) return parsedBase;
        }
        if (currentLabelNum != null) {
          const derived = currentLabelNum - safeRowIndex;
          if (Number.isFinite(derived) && derived > 0) return derived;
        }
        let maxFret = -Infinity;
        tokens.forEach((t) => {
          if (typeof t === 'number' && t > 0 && t > maxFret) maxFret = t;
        });
        if (Number.isFinite(maxFret) && maxFret !== -Infinity) return Math.max(1, maxFret - 3);
        return 1;
      })();

      let newBase = targetFret - safeRowIndex;
      if (!Number.isFinite(newBase)) newBase = currentBase;
      if (newBase < 1) newBase = 1;

      const delta = newBase - currentBase;

      for (let i = 0; i < tokens.length; i += 1) {
        const t = tokens[i];
        if (typeof t === 'number' && t > 0) tokens[i] = t + delta;
      }

      const newShape = buildShapeFromTokensAndRootKinds(tokens, roots);
      const shapeChanged = newShape !== oldShape;

      card.dataset.baseFret = String(newBase);
      if (shapeInput) shapeInput.value = newShape;
      renderCardDiagram(card);
      const isEditing = currentEditingCard === card;
      if (isEditing) {
        if (shapeInput) shapeInput.focus();
      } else {
        persist('rebase-frets-click');
      }
      if (shapeChanged) {
        if (isEditing) {
          bufferPendingEditSnapshot();
        } else if (window.freetarUndoSnapshot) {
          window.freetarUndoSnapshot('diagram-click');
        }
      }
    });
  }

  function buildDataFromDOM() {
    const groups = [];
    groupsRoot.querySelectorAll('.group').forEach((groupEl) => {
      const rawGroupName = groupEl.querySelector('.group-name')?.value || '';
      const gName = rawGroupName.trim();
      const rowEls = Array.from(groupEl.querySelectorAll('.chord-grid'));
      const rows = rowEls.map((grid) => {
        const chords = [];
        grid.querySelectorAll('.chord-card').forEach((card) => {
          if (card.classList.contains('chord-card-placeholder')) return;
          const nameInput = card.querySelector('.chord-name-input');
          const shapeInput = card.querySelector('.chord-shape-input');
          const titleEl = card.querySelector('.chord-title');
          const name = (nameInput?.value || titleEl?.textContent || '').trim();
          const shape = shapeInput?.value.trim() || '';
          if (!shape) return;
          chords.push({ name: name || '(unnamed)', shape });
        });
        return { chords };
      });
      let prunedRows = rows;
      if (rowEls.length > 1) {
        prunedRows = rows.filter((row) => Array.isArray(row.chords) && row.chords.length > 0);
        if (!prunedRows.length) prunedRows = [{ chords: [] }];
      }
      if (!prunedRows.length) prunedRows = [{ chords: [] }];
      groups.push({ group: gName || '\u00A0', rows: prunedRows });
    });
    return groups;
  }

  function getGroupIndex(groupEl) {
    return Array.prototype.indexOf.call(groupsRoot.querySelectorAll('.group'), groupEl);
  }

  function wireGroupExportButton(groupEl) {
    const btn = groupEl.querySelector('.export-group');
    if (!btn || btn.__wiredExport) return;
    btn.__wiredExport = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = getGroupIndex(groupEl);
      if (idx < 0) return;
      const url = buildGroupExportUrl(idx);
      if (url) window.location.href = url;
    });
  }

  function clearPendingEditSnapshots() {
    pendingEditSnapshots.length = 0;
  }

  function buildEditingAwareSnapshot() {
    const baseline = buildDataFromDOM();
    if (!currentEditingCard || !currentEditingSourceCard || !groupsRoot) return baseline;
    const sourceGroup = currentEditingSourceCard.closest('.group');
    if (!sourceGroup || !groupsRoot.contains(sourceGroup)) return baseline;

    const groups = Array.from(groupsRoot.querySelectorAll('.group'));
    const groupIndex = groups.indexOf(sourceGroup);
    if (groupIndex < 0 || groupIndex >= baseline.length) return baseline;

    const editCard = currentEditingSpotlightCard || currentEditingCard;
    const nameInput = editCard?.querySelector('.chord-name-input');
    const shapeInput = editCard?.querySelector('.chord-shape-input');
    if (!nameInput || !shapeInput) return baseline;

    const name = (nameInput.value || '').trim();
    const shape = (shapeInput.value || '').trim();

    const targetGroup = baseline[groupIndex];
    if (!targetGroup || !Array.isArray(targetGroup.rows)) return baseline;

    const rowEls = Array.from(sourceGroup.querySelectorAll('.chord-grid'));
    const rowEl = currentEditingSourceCard.closest('.chord-grid');
    const rowIndex = rowEls.indexOf(rowEl);
    if (rowIndex < 0 || rowIndex >= targetGroup.rows.length) return baseline;
    const targetRow = targetGroup.rows[rowIndex];
    if (!targetRow || !Array.isArray(targetRow.chords)) return baseline;

    const chordsInRow = Array.from(rowEl.querySelectorAll('.chord-card'));
    const chordIndex = chordsInRow.indexOf(currentEditingSourceCard);
    if (chordIndex < 0) return baseline;

    if (!shape) {
      if (chordIndex < targetRow.chords.length) {
        targetRow.chords.splice(chordIndex, 1);
      }
      return baseline;
    }

    const entry = { name: name || '(unnamed)', shape };
    if (chordIndex < targetRow.chords.length) {
      targetRow.chords[chordIndex] = entry;
    } else {
      targetRow.chords.push(entry);
    }
    return baseline;
  }

  function bufferPendingEditSnapshot() {
    if (!currentEditingCard) return;
    const snapshot = buildEditingAwareSnapshot();
    const last = pendingEditSnapshots[pendingEditSnapshots.length - 1];
    const snapshotKey = JSON.stringify(snapshot);
    const lastKey = last ? JSON.stringify(last) : null;
    if (lastKey && lastKey === snapshotKey) return;
    pendingEditSnapshots.push(snapshot);
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
    if (inlineNameEditState) {
      finishInlineNameEdit(inlineNameEditState.card, { commit: true });
    }
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

    clearPendingEditSnapshots();

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
      clearPendingEditSnapshots();
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
      clearPendingEditSnapshots();
      currentEditingCard = null;
      currentEditingSourceCard = null;
      currentEditingSpotlightCard = null;
      return;
    }

    if (commit) {
      const newName = spotlightNameInput.value.trim();
      const newShape =
        typeof window.normalizeShapeText === 'function'
          ? window.normalizeShapeText(spotlightShapeInput.value)
          : spotlightShapeInput.value;
      spotlightShapeInput.value = newShape;
      sourceNameInput.value = newName;
      sourceShapeInput.value = newShape;
      if (spotlight.dataset && spotlight.dataset.baseFret) {
        sourceCard.dataset.baseFret = spotlight.dataset.baseFret;
      } else {
        delete sourceCard.dataset.baseFret;
      }
      updateChordTitleFromName(sourceCard, newName);
      renderCardDiagram(sourceCard);
      persist('edit-commit');
      if (pendingEditSnapshots.length && window.freetarUndoSnapshot) {
        pendingEditSnapshots.forEach((state) => {
          window.freetarUndoSnapshot('edit-session', state);
        });
      }
      clearPendingEditSnapshots();
    } else {
      const originalName = spotlight.dataset.originalName || '';
      const originalShape = spotlight.dataset.originalShape || '';
      sourceNameInput.value = originalName;
      sourceShapeInput.value = originalShape;
      updateChordTitleFromName(sourceCard, originalName);
      renderCardDiagram(sourceCard);
      clearPendingEditSnapshots();
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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finishEditing(true);
    }
  });

  function wireChordCard(card) {
    const editBtn = card.querySelector('.chord-edit');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    const titleEl = card.querySelector('.chord-title');
    if (!editBtn || !nameInput || !shapeInput) return;

    if (titleEl && !titleEl.__inlineNameWired) {
      titleEl.__inlineNameWired = true;
      titleEl.addEventListener('click', (e) => {
        if (diagramLockEnabled) return;
        e.preventDefault();
        e.stopPropagation();
        const editingThisCard =
          currentEditingCard === card ||
          currentEditingSourceCard === card ||
          (currentEditingSpotlightCard && currentEditingSpotlightCard === card) ||
          (currentEditingSpotlightCard && currentEditingSpotlightCard.__sourceCard === card);
        if (editingThisCard) return;
        if (currentEditingCard) {
          finishEditing(true);
        }
        if (inlineNameEditState && inlineNameEditState.card && inlineNameEditState.card !== card) {
          finishInlineNameEdit(inlineNameEditState.card, { commit: true });
        }
        beginInlineNameEdit(card);
      });
    }

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
      if (isEditing) {
        bufferPendingEditSnapshot();
      } else if (window.freetarUndoSnapshot) {
        window.freetarUndoSnapshot('diagram-click');
      }
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

      const isOnClickedFret = t === fret;

      if (!isOnClickedFret) {
        tokens[stringIndex] = fret;
        roots[stringIndex] = 'played';
      } else if (r === 'played') {
        roots[stringIndex] = 'ghost';
      } else if (r === 'ghost') {
        tokens[stringIndex] = null;
        roots[stringIndex] = null;
      } else {
        tokens[stringIndex] = fret;
        roots[stringIndex] = 'played';
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
      const isEditing = currentEditingCard === card;
      if (event.ctrlKey || event.metaKey) {
        handleCtrlClick(card, isEditing);
        return;
      }
      if (diagramLockEnabled && !isEditing) {
        return;
      }
      const fretLabel = event.target.closest('.chord-fret-label');
      if (fretLabel) {
        const fretRowEl = fretLabel.closest('tr[data-fret]');
        const fretRows = Array.from(card.querySelectorAll('tbody tr[data-fret]'));
        const rowIndex = fretRowEl ? fretRows.indexOf(fretRowEl) : -1;
        const currentLabel = fretRowEl
          ? parseInt(fretRowEl.getAttribute('data-fret') || '', 10)
          : NaN;
        handleFretLabelClick(card, rowIndex, currentLabel);
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
      const fretRowEl = rowEl.closest('tr[data-fret]');
      const fretRows = Array.from(card.querySelectorAll('tbody tr[data-fret]'));
      const rowIndex = fretRowEl ? fretRows.indexOf(fretRowEl) : -1;
      const rowFretLabel =
        fretRowEl && fretRowEl.getAttribute('data-fret')
          ? parseInt(fretRowEl.getAttribute('data-fret'), 10)
          : NaN;

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
        const targetRowIndex = Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : 0;
        promptForBaseFret(card, (baseFret) => {
          const fretValue = parseInt(baseFret, 10);
          if (!Number.isFinite(fretValue) || fretValue <= 0) return;
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
              tokensP[stringIndex] = fretValue;
              rootsP[stringIndex] = null;
              newShape = buildShapeFromTokensAndRootKinds(tokensP, rootsP);
            }
          }
          const shapeChanged = newShape !== oldShape;
          const hasRowContext =
            Number.isFinite(rowFretLabel) && Number.isInteger(targetRowIndex) && targetRowIndex >= 0;
          const currentBase = hasRowContext ? rowFretLabel - targetRowIndex : 1;
          const baseStart = Math.max(
            1,
            hasRowContext ? currentBase + (fretValue - rowFretLabel) : fretValue - targetRowIndex,
          );
          card.dataset.baseFret = String(baseStart);
          shapeInput.value = newShape;
          renderCardDiagram(card);
          // Ensure the freshly rendered diagram remains interactive
          wireChordCard(card);
          if (isEditing) {
            shapeInput.focus();
          } else {
            persist('toggle-root-click');
          }
          if (shapeChanged) {
            if (isEditing) {
              bufferPendingEditSnapshot();
            } else if (window.freetarUndoSnapshot) {
              window.freetarUndoSnapshot('diagram-click');
            }
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
    const card = document.createElement('div');
    card.className = 'text-center chord-card mb-3';
    card.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-1 position-relative">
      <span class="material-icons-outlined chord-handle">drag_indicator</span>
      <span class="chord-title flex-grow-1 text-truncate mx-1" aria-live="polite"></span>
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
    const nameInput = card.querySelector('.chord-name-input');
    updateChordTitleFromName(card, nameInput ? nameInput.value : name);
    wireChordCard(card);
    renderCardDiagram(card);
    updateRowHandlePosition(grid);
    if (!silent) persist('add-chord'); // skip per-card save during batch import
    return card;
  }

  function pointerElementFromEvent(evt) {
    const oe = evt?.originalEvent;
    if (!oe || typeof document === 'undefined') return null;
    const touchPoint = (oe.touches && oe.touches[0]) || (oe.changedTouches && oe.changedTouches[0]);
    const point = touchPoint || oe;
    const { clientX, clientY } = point || {};
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return document.elementFromPoint(clientX, clientY);
  }

  function getGhostTargetFromEl(el) {
    if (!el) return null;
    const placeholder = el.closest('.chord-card-placeholder');
    const ghostRow = el.closest('.group-ghost-row');
    const footer = el.closest('.group-footer-actions');
    const host = placeholder || ghostRow || footer;
    if (!host) return null;
    const group = host.closest('.group');
    if (!group) return null;
    return { group, overPlaceholder: !!placeholder };
  }

  function ensureGhostRowForGroup(groupEl) {
    if (!groupEl) return null;
    if (ghostRowState.group && ghostRowState.group !== groupEl) {
      clearGhostRow(true);
    }
    if (ghostRowState.hideTimer) {
      clearTimeout(ghostRowState.hideTimer);
      ghostRowState.hideTimer = null;
    }
    if (ghostRowState.group === groupEl && ghostRowState.ghostRow) {
      ghostRowState.ghostRow.classList.add('is-visible');
      return ghostRowState.ghostRow;
    }
    const footer = groupEl.querySelector('.group-footer-actions');
    if (!footer) return null;
    const ghostRow = document.createElement('div');
    ghostRow.className = 'group-ghost-row chord-grid d-grid';
    const placeholder = document.createElement('div');
    placeholder.className = 'chord-card-placeholder';
    ghostRow.appendChild(placeholder);
    footer.parentElement.insertBefore(ghostRow, footer);
    ghostRowState.group = groupEl;
    ghostRowState.ghostRow = ghostRow;
    ghostRowState.placeholder = placeholder;
    ghostRow.classList.add('is-visible');
    return ghostRow;
  }

  function setGhostRowActive(isActive) {
    if (ghostRowState.placeholder) ghostRowState.placeholder.classList.toggle('is-active', !!isActive);
  }

  function scheduleGhostRowRemoval(delay = 140) {
    if (!ghostRowState.ghostRow) return;
    if (ghostRowState.hideTimer) clearTimeout(ghostRowState.hideTimer);
    ghostRowState.hideTimer = window.setTimeout(() => {
      clearGhostRow(true);
    }, delay);
  }

  function clearGhostRow(immediate = false) {
    void immediate;
    if (ghostRowState.hideTimer) {
      clearTimeout(ghostRowState.hideTimer);
      ghostRowState.hideTimer = null;
    }
    if (ghostRowState.ghostRow) ghostRowState.ghostRow.classList.remove('is-visible');
    if (ghostRowState.placeholder) ghostRowState.placeholder.classList.remove('is-active');
    if (ghostRowState.ghostRow?.parentElement) {
      ghostRowState.ghostRow.parentElement.removeChild(ghostRowState.ghostRow);
    }
    ghostRowState.group = null;
    ghostRowState.ghostRow = null;
    ghostRowState.placeholder = null;
    ghostRowState.lastHover = null;
  }

  function detachDragMoveHandler() {
    if (!dragMoveHandlerAttached) return;
    document.removeEventListener('pointermove', handleGlobalDragMove, true);
    document.removeEventListener('touchmove', handleGlobalDragMove, true);
    dragMoveHandlerAttached = false;
  }

  function handleGlobalDragMove(ev) {
    updateGhostRowHover({ originalEvent: ev });
  }

  function ensureDragMoveHandler() {
    if (dragMoveHandlerAttached) return;
    document.addEventListener('pointermove', handleGlobalDragMove, true);
    document.addEventListener('touchmove', handleGlobalDragMove, true);
    dragMoveHandlerAttached = true;
  }

  function updateGhostRowHover(evt) {
    const el = pointerElementFromEvent(evt);
    const targetInfo = getGhostTargetFromEl(el);
    if (!targetInfo) {
      setGhostRowActive(false);
      ghostRowState.lastHover = null;
      scheduleGhostRowRemoval(160);
      return null;
    }
    const ghostRow = ensureGhostRowForGroup(targetInfo.group);
    if (!ghostRow) return null;
    setGhostRowActive(targetInfo.overPlaceholder);
    ghostRowState.lastHover = targetInfo;
    return targetInfo;
  }

  function getGhostDropTarget(evt) {
    const el = pointerElementFromEvent(evt);
    const target = getGhostTargetFromEl(el);
    if (target) return target;
    if (ghostRowState.lastHover && ghostRowState.group?.isConnected) return ghostRowState.lastHover;
    return null;
  }

  function normalizeRowIndices(groupEl) {
    if (!groupEl) return;
    const grids = Array.from(groupEl.querySelectorAll('.chord-grid'));
    grids.forEach((grid, idx) => {
      grid.dataset.rowIndex = String(idx);
    });
  }

  function updateRowHandlePosition(grid) {
    if (!grid) return;
    const handle = grid.querySelector('.row-drag-handle');
    if (!handle) return;
    const firstCard = grid.querySelector('.chord-card:not(.chord-card-placeholder)');
    if (!firstCard) {
      handle.style.top = '';
      handle.style.left = '';
      return;
    }
    const gridRect = grid.getBoundingClientRect();
    const firstRect = firstCard.getBoundingClientRect();
    const groupRect = grid.closest('.group')?.getBoundingClientRect();
    if (!gridRect || !firstRect) return;
    const handleHeight = handle.offsetHeight || 0;
    const handleWidth = handle.offsetWidth || 0;
    const firstCenterY = firstRect.top + firstRect.height / 2;
    const top = firstCenterY - gridRect.top - handleHeight / 2;
    const groupLeft = groupRect ? groupRect.left : gridRect.left;
    const midX = groupLeft + (firstRect.left - groupLeft) / 2;
    const left = midX - gridRect.left - handleWidth / 2;
    if (Number.isFinite(top)) handle.style.top = `${top}px`;
    if (Number.isFinite(left)) handle.style.left = `${left}px`;
  }

  function updateAllRowHandles(scope = groupsRoot) {
    if (!scope) return;
    scope.querySelectorAll('.chord-grid').forEach(updateRowHandlePosition);
    updateRowHandleHoverState();
  }

  function clearRowHandleHoverState(scope = groupsRoot) {
    if (!scope) return;
    scope.querySelectorAll('.chord-grid.row-handle-active').forEach((grid) => {
      grid.classList.remove('row-handle-active');
    });
  }

  function updateRowHandleHoverState() {
    if (!groupsRoot || !lastRowHandlePointer) {
      clearRowHandleHoverState();
      return;
    }
    const { x, y } = lastRowHandlePointer;
    let activated = false;
    groupsRoot.querySelectorAll('.chord-grid').forEach((grid) => {
      const firstCard = grid.querySelector('.chord-card:not(.chord-card-placeholder)');
      if (!firstCard) {
        grid.classList.remove('row-handle-active');
        return;
      }
      const rect = firstCard.getBoundingClientRect();
      const withinVertical = y >= rect.top && y <= rect.bottom;
      const withinCard = withinVertical && x >= rect.left && x <= rect.right;
      const withinLeft = withinVertical && x >= 0 && x <= rect.left;
      const isActive = !activated && (withinCard || withinLeft);
      grid.classList.toggle('row-handle-active', isActive);
      if (isActive) activated = true;
    });
    if (!activated) clearRowHandleHoverState();
  }

  function scheduleRowHandleHoverUpdate() {
    if (rowHandleHoverFrame) return;
    rowHandleHoverFrame = requestAnimationFrame(() => {
      rowHandleHoverFrame = null;
      updateRowHandleHoverState();
    });
  }

  function handleRowHandlePointerMove(ev) {
    if (!ev) return;
    const { clientX, clientY } = ev;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    lastRowHandlePointer = { x: clientX, y: clientY };
    scheduleRowHandleHoverUpdate();
  }

  function handleRowHandlePointerLeave() {
    lastRowHandlePointer = null;
    clearRowHandleHoverState();
  }

  function ensureRowHandleHoverListener() {
    if (rowHandleHoverListenerAttached) return;
    window.addEventListener('pointermove', handleRowHandlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handleRowHandlePointerLeave, { passive: true });
    rowHandleHoverListenerAttached = true;
  }

  function cleanupEmptyChordGrids(groupEl) {
    if (!groupEl) return;
    const grids = Array.from(groupEl.querySelectorAll('.chord-grid')).filter(
      (grid) => !grid.classList.contains('group-ghost-row'),
    );
    if (grids.length > 1) {
      const hasChords = (grid) => grid.querySelector('.chord-card:not(.chord-card-placeholder)');
      const nonEmpty = grids.filter(hasChords);
      const empty = grids.filter((grid) => !hasChords(grid));
      const removable = nonEmpty.length ? empty : empty.slice(1);
      removable.forEach((grid) => {
        if (grid.parentElement) grid.parentElement.removeChild(grid);
      });
    }
    if (!groupEl.querySelector('.chord-grid')) ensureBottomChordGrid(groupEl);
    normalizeRowIndices(groupEl);
    updateAllRowHandles(groupEl);
  }

  function ensureBottomChordGrid(groupEl) {
    if (!groupEl) return null;
    const grids = Array.from(groupEl.querySelectorAll('.chord-grid'));
    const lastGrid = grids[grids.length - 1];
    if (lastGrid && !lastGrid.querySelector('.chord-card')) {
      wireChordGrid(lastGrid, groupEl);
      ensureRowHandle(lastGrid);
      updateRowHandlePosition(lastGrid);
      return lastGrid;
    }
    const footer = groupEl.querySelector('.group-footer-actions');
    const anchor =
      ghostRowState.group === groupEl && ghostRowState.ghostRow ? ghostRowState.ghostRow : footer;
    const newGrid = document.createElement('div');
    newGrid.className = 'd-grid chord-grid';
    newGrid.dataset.rowIndex = String(grids.length);
    if (anchor && anchor.parentElement === groupEl) {
      groupEl.insertBefore(newGrid, anchor);
    } else {
      groupEl.appendChild(newGrid);
    }
    wireChordGrid(newGrid, groupEl);
    ensureRowHandle(newGrid);
    updateRowHandlePosition(newGrid);
    normalizeRowIndices(groupEl);
    return newGrid;
  }

  function ensureRowHandle(grid) {
    if (!grid) return null;
    let handle = grid.querySelector('.row-drag-handle');
    if (handle) return handle;
    handle = document.createElement('span');
    handle.className = 'row-drag-handle material-icons-outlined';
    handle.textContent = 'drag_indicator';
    handle.title = 'Drag row';
    handle.setAttribute('aria-label', 'Drag row');
    handle.style.cursor = 'grab';
    grid.insertBefore(handle, grid.firstChild);
    requestAnimationFrame(() => updateRowHandlePosition(grid));
    return handle;
  }

  function addRowToGroup(groupEl) {
    if (!groupEl) return;
    const footer = groupEl.querySelector('.group-footer-actions');
    const newGrid = document.createElement('div');
    const nextIndex = groupEl.querySelectorAll('.chord-grid').length;
    newGrid.className = 'd-grid chord-grid';
    newGrid.dataset.rowIndex = String(nextIndex);
    if (footer && footer.parentElement === groupEl) {
      groupEl.insertBefore(newGrid, footer);
    } else {
      groupEl.appendChild(newGrid);
    }
    ensureRowHandle(newGrid);
    wireChordGrid(newGrid, groupEl);
    addChordToGrid(newGrid, '...', '000000', { silent: true });
    updateRowHandlePosition(newGrid);
    normalizeRowIndices(groupEl);
    if (typeof rewireChordUI === 'function') rewireChordUI();
    persist('add-row');
    document.dispatchEvent(new CustomEvent('rows-reordered'));
  }

  hoverRowInsert = (() => {
    let plusEl = null;
    let activeFooter = null;
    let activeGroup = null;
    let hoveringPlus = false;

    const hide = () => {
      if (hoveringPlus) return;
      activeFooter = null;
      activeGroup = null;
      if (plusEl) plusEl.style.display = 'none';
    };

    const ensureElements = () => {
      if (plusEl) return;
      plusEl = document.createElement('span');
      plusEl.className = 'row-insert-plus material-icons-outlined';
      plusEl.textContent = 'add_circle';
      plusEl.setAttribute('data-tooltip', 'Insert Row');
      plusEl.setAttribute('data-tooltip-src', 'Insert Row');
      plusEl.title = 'Insert Row';
      plusEl.setAttribute('aria-label', 'Insert Row');
      plusEl.style.display = 'none';
      plusEl.style.color = '#0d6efd';
      if (window.initTooltips) window.initTooltips();

      plusEl.addEventListener('mouseenter', () => {
        hoveringPlus = true;
      });

      plusEl.addEventListener('mouseleave', (ev) => {
        hoveringPlus = false;
        const to = ev?.relatedTarget;
        if (activeFooter && (to === activeFooter || activeFooter.contains(to))) return;
        hide();
      });

      plusEl.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (activeGroup) addRowToGroup(activeGroup);
        hide();
      });
    };

    const showAt = (footer, { group = null } = {}) => {
      ensureElements();
      if (!footer) return;
      activeGroup = group;
      activeFooter = footer;
      if (plusEl.parentElement !== footer) footer.appendChild(plusEl);
      plusEl.style.left = '50%';
      plusEl.style.top = '50%';
      plusEl.style.position = 'absolute';
      plusEl.style.display = 'flex';
    };

    const handleFooterLeave = (footer, ev) => {
      const to = ev?.relatedTarget;
      if (plusEl && (to === plusEl || plusEl.contains(to))) return;
      if (footer && activeFooter && footer !== activeFooter) return;
      hide();
    };

    return {
      showAt,
      hide,
      handleFooterLeave,
      ensureElements,
    };
  })();

  function wireAddRowHover(groupEl) {
    if (!groupEl) return;
    const footer = groupEl.querySelector('.group-footer-actions');
    if (!footer || footer.__rowHoverWired) return;
    footer.__rowHoverWired = true;
    const show = () => {
      if (!hoverRowInsert || !hoverRowInsert.showAt) return;
      hoverRowInsert.showAt(footer, { group: groupEl });
    };
    const hide = (ev) => {
      if (hoverRowInsert && hoverRowInsert.handleFooterLeave) {
        hoverRowInsert.handleFooterLeave(footer, ev);
      }
    };
    footer.addEventListener('mouseenter', show);
    footer.addEventListener('mouseleave', hide);
    footer.addEventListener('focusin', show);
    footer.addEventListener('focusout', hide);
  }

  function handleAltChordDuplicate(evt, dragMeta, targetContainer = null, targetIndex = null) {
    const { item, from, nextSibling } = dragMeta || {};
    const to = targetContainer || evt?.to;
    const rawIndex = Number.isInteger(targetIndex)
      ? targetIndex
      : Number.isInteger(evt?.newIndex)
        ? evt.newIndex
        : null;
    if (!item || !from || !to) return false;

    const dropSiblings = Array.from(to.querySelectorAll('.chord-card')).filter((card) => card !== item);
    const dropIndex = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : dropSiblings.length;
    const dropNext = dropSiblings[dropIndex] || null;

    // Restore the original card to its source slot
    if (nextSibling && nextSibling.parentElement === from) {
      from.insertBefore(item, nextSibling);
    } else {
      from.appendChild(item);
    }

    const duplicateCard = item.cloneNode(true);
    wireChordCard(duplicateCard);
    try {
      renderCardDiagram(duplicateCard);
    } catch (_) {
      /* noop */
    }

    if (dropNext && dropNext.parentElement === to) {
      to.insertBefore(duplicateCard, dropNext);
    } else {
      to.appendChild(duplicateCard);
    }

    if (deleteModeGroup && deleteModeGroup.contains(duplicateCard)) {
      duplicateCard.classList.add('deletable');
      const btn = duplicateCard.querySelector('.delete-chord-btn');
      if (btn) btn.style.display = 'block';
    }

    persist('duplicate-chord-drag');
    document.dispatchEvent(new CustomEvent('chords-reordered'));
    return true;
  }

  function wireChordGrid(grid, groupEl = grid?.closest('.group')) {
    if (!grid || grid.__chordSortable) return;
    const parentGroup = groupEl || grid.closest('.group');
    const sortable = Sortable.create(grid, {
      group: 'chords',
      handle: '.chord-handle',
      animation: 150,
      // Enable and tune autoscroll so long chord lists remain scrollable while dragging
      scroll: true, // page or nearest scroll container will scroll
      bubbleScroll: true, // allow parent containers/window to scroll
      scrollSensitivity: 60, // px from edge to start scrolling (default ~30)
      scrollSpeed: 20, // px/frame scroll speed (default ~10)
      onStart: (evt) => {
        clearGhostRow();
        ghostRowState.lastHover = null;
        ensureDragMoveHandler();
        const isAltDrag = !!(evt?.originalEvent?.altKey);
        if (isAltDrag) {
          activeAltChordDrag = {
            item: evt.item,
            from: evt.from,
            nextSibling: evt.item ? evt.item.nextElementSibling : null,
          };
        } else {
          activeAltChordDrag = null;
        }
      },
      onMove: (evt) => {
        updateGhostRowHover(evt);
      },
      onEnd: (evt) => {
        const ghostDrop = getGhostDropTarget(evt);
        const ghostGroup = ghostDrop?.group || null;
        const ghostGrid =
          ghostGroup && ghostDrop?.overPlaceholder ? ensureBottomChordGrid(ghostGroup) : null;
        const ghostInsertionIndex = ghostGrid
          ? ghostGrid.querySelectorAll('.chord-card').length
          : null;
        const handledAlt =
          activeAltChordDrag &&
          activeAltChordDrag.item === evt.item &&
          handleAltChordDuplicate(evt, activeAltChordDrag, ghostGrid, ghostInsertionIndex);
        activeAltChordDrag = null;
        const sourceGroup = evt.from?.closest('.group');
        const destGroup = evt.to?.closest('.group');

        if (handledAlt) {
          clearGhostRow(true);
          cleanupEmptyChordGrids(sourceGroup);
          cleanupEmptyChordGrids(destGroup);
          if (ghostGroup) cleanupEmptyChordGrids(ghostGroup);
          detachDragMoveHandler();
          updateEmptyMsg();
          updateRowHandlePosition(evt.from);
          updateRowHandlePosition(evt.to);
          if (ghostGrid) updateRowHandlePosition(ghostGrid);
          return;
        }

        if (ghostDrop && ghostGroup && ghostGrid && ghostDrop.overPlaceholder) {
          ghostGrid.appendChild(evt.item);
          clearGhostRow(true);
          cleanupEmptyChordGrids(sourceGroup);
          cleanupEmptyChordGrids(destGroup);
          cleanupEmptyChordGrids(ghostGroup);
          persist('reorder-chords');
          document.dispatchEvent(new CustomEvent('chords-reordered'));
          detachDragMoveHandler();
          updateEmptyMsg();
          updateRowHandlePosition(evt.from);
          updateRowHandlePosition(evt.to);
          updateRowHandlePosition(ghostGrid);
          return;
        }

        clearGhostRow(true);
        cleanupEmptyChordGrids(sourceGroup);
        cleanupEmptyChordGrids(destGroup);
        persist('reorder-chords');
        document.dispatchEvent(new CustomEvent('chords-reordered'));
        detachDragMoveHandler();
        updateEmptyMsg();
        updateRowHandlePosition(evt.from);
        updateRowHandlePosition(evt.to);
      },
    });
    grid.__chordSortable = sortable;
    grid.dataset.sortable = '1';
  }

  function wireRowSortable(groupEl) {
    if (!groupEl || groupEl.dataset.rowSortable) return;
    Sortable.create(groupEl, {
      draggable: '.chord-grid',
      handle: '.row-drag-handle',
      animation: 150,
      group: 'chord-rows',
      onEnd: (evt) => {
        const sourceGroup = evt.from?.closest('.group');
        const targetGroup = evt.to?.closest('.group');
        if (sourceGroup && !sourceGroup.querySelector('.chord-grid')) {
          ensureBottomChordGrid(sourceGroup);
        }
        if (targetGroup && !targetGroup.querySelector('.chord-grid')) {
          ensureBottomChordGrid(targetGroup);
        }
        normalizeRowIndices(sourceGroup);
        if (targetGroup && targetGroup !== sourceGroup) {
          normalizeRowIndices(targetGroup);
        }
        updateRowHandlePosition(evt.from);
        updateRowHandlePosition(evt.to);
        persist('rows-reordered');
        document.dispatchEvent(new CustomEvent('rows-reordered'));
      },
    });
    groupEl.dataset.rowSortable = '1';
  }

  function wireGroup(groupEl) {
    const addChordBtn = groupEl.querySelector('.add-chord');
    const primaryGrid = groupEl.querySelector('.chord-grid');
    wireGroupExportButton(groupEl);

    if (addChordBtn && primaryGrid && !addChordBtn.__wired) {
      addChordBtn.addEventListener('click', () => addChordToGrid(primaryGrid, '...', '000000', { prepend: true }));
      addChordBtn.__wired = true;
    }

    groupEl.querySelectorAll('.chord-grid').forEach((grid) => {
      ensureRowHandle(grid);
      wireChordGrid(grid, groupEl);
      updateRowHandlePosition(grid);
    });
    normalizeRowIndices(groupEl);
    wireRowSortable(groupEl);
    wireAddRowHover(groupEl);
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
          <button type="button" class="add-chord" aria-label="Add chord" data-tooltip="Add Chord" title="Add Chord">
            <span class="material-icons-outlined">add_circle</span>
          </button>
          <button type="button" class="delete-chords" aria-label="Delete chords" data-tooltip="Delete Chords" title="Delete Chords">
            <span class="material-icons-outlined">remove_circle_outline</span>
          </button>
        </div>
      </div>

      <div class="d-grid chord-grid"></div>
      <div class="group-footer-actions" aria-label="Group actions and drop target">
        <button type="button" class="export-group" aria-label="Export this group to file" data-tooltip="Export this Group to File" data-tooltip-src="Export this Group to File" title="Export this Group to File">
          <span class="material-icons-outlined">file_download</span>
        </button>
      </div>
    `;

    if (append) {
      groupsRoot.appendChild(groupEl);
      if (window.initTooltips) window.initTooltips();
    }

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
    clearGhostRow(true);
    if (inlineNameEditState && inlineNameEditState.card && !groupsRoot.contains(inlineNameEditState.card)) {
      detachInlineNameOutsideHandlers();
      if (inlineNameInputEl && inlineNameInputEl.parentElement) {
        inlineNameInputEl.parentElement.removeChild(inlineNameInputEl);
        inlineNameInputEl.style.display = 'none';
      }
      inlineNameEditState.card.classList.remove('is-inline-name-editing');
      inlineNameEditState = null;
    }
    // Rewire cards and ensure diagrams render
    groupsRoot.querySelectorAll('.chord-card').forEach((card) => {
      wireChordCard(card);
      try {
        renderCardDiagram(card);
      } catch (e) {
        /* noop */
      }
      const nameInput = card.querySelector('.chord-name-input');
      const rawName =
        (nameInput && nameInput.value != null ? nameInput.value : '') ||
        card.querySelector('.chord-title')?.textContent ||
        '';
      updateChordTitleFromName(card, rawName);
    });

    groupsRoot.querySelectorAll('.group').forEach((groupEl) => {
      wireGroup(groupEl);
    });
    groupsRoot.querySelectorAll('.group').forEach((groupEl) => wireGroupExportButton(groupEl));
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
    updateAllRowHandles();
    updateEmptyMsg();
    ensureHistoryTooltips();
    if (window.initTooltips) window.initTooltips();
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
        if (window.initTooltips) window.initTooltips();
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

  // Ctrl-click anywhere within the active edit card (outside the diagram) commits the edit.
  document.addEventListener('click', (e) => {
    if (!currentEditingCard) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!currentEditingCard.contains(e.target)) return;
    if (e.target.closest('table.chord-diagram')) return; // diagram has its own ctrl handler
    e.preventDefault();
    e.stopPropagation();
    finishEditing(true);
  }, true);

  // ---------- init & global wiring ----------
  function init() {
    ensureGroupHoverCSS(); // make group tools appear only on hover/focus-within
    groupsRoot = document.getElementById('groups-root');
    if (!groupsRoot) return console.warn('my-chords.page.js: #groups-root not found.');
    ensureRowHandleHoverListener();
    if (window.setupTooltipBoundary) window.setupTooltipBoundary({ boundary: document.body });
    deleteGroupModal = document.getElementById('delete-group-modal');
    confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
    baseFretModal = document.getElementById('base-fret-modal');
    baseFretValueEl = document.getElementById('base-fret-modal-value');
    updateBaseFretDisplay();
    if (baseFretValueEl) {
      baseFretValueEl.addEventListener('input', syncBaseFretBufferFromInput);
    }
    wireModalCloseButtons();
    const storedSettings = loadSettings();

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
    if (window.initTooltips) window.initTooltips();
    if (storedSettings && typeof storedSettings.maxChordsPerRowEnabled === 'boolean') {
      maxChordsPerRowEnabled = storedSettings.maxChordsPerRowEnabled;
    }
    if (storedSettings && storedSettings.maxChordsPerRow !== undefined) {
      maxChordsPerRow = clampMaxPerRow(storedSettings.maxChordsPerRow);
    } else {
      maxChordsPerRow = MAX_PER_ROW_DEFAULT;
    }
    chordSettingsMenu = document.getElementById('chord-settings-menu');
    chordSettingsToggleBtn = document.getElementById('chord-settings-toggle');
    maxPerRowCheckbox = document.getElementById('max-per-row-checkbox');
    maxPerRowInput = document.getElementById('max-per-row-input');
    maxPerRowRow = document.getElementById('max-per-row-row');
    diagramLockToggleBtn = document.getElementById('diagram-lock-toggle');
    if (diagramLockToggleBtn) {
      const storedLock =
        storedSettings && typeof storedSettings.diagramLockEnabled === 'boolean'
          ? storedSettings.diagramLockEnabled
          : loadDiagramLockSetting(null);
      if (typeof storedLock === 'boolean') {
        diagramLockEnabled = storedLock;
      } else if (diagramLockToggleBtn.dataset.locked !== undefined) {
        diagramLockEnabled = diagramLockToggleBtn.dataset.locked !== 'false';
      } else {
        diagramLockEnabled = false;
      }
      updateDiagramLockButtonUI();
      diagramLockToggleBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        diagramLockEnabled = !diagramLockEnabled;
        updateDiagramLockButtonUI();
        saveDiagramLockSetting(diagramLockEnabled);
        if (diagramLockEnabled && inlineNameEditState) {
          finishInlineNameEdit(inlineNameEditState.card, { commit: true });
        }
      });
    }
    if (chordSettingsToggleBtn && chordSettingsMenu && !chordSettingsToggleBtn.__settingsWired) {
      chordSettingsToggleBtn.__settingsWired = true;
      chordSettingsToggleBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        toggleChordSettingsMenu();
      });
      chordSettingsToggleBtn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          closeChordSettingsMenu();
        }
      });
    }
    if (chordSettingsMenu && !chordSettingsMenu.__settingsWired) {
      chordSettingsMenu.__settingsWired = true;
      chordSettingsMenu.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          closeChordSettingsMenu();
          if (chordSettingsToggleBtn && typeof chordSettingsToggleBtn.focus === 'function') {
            chordSettingsToggleBtn.focus({ preventScroll: true });
          }
        }
      });
    }
    if (maxPerRowCheckbox && !maxPerRowCheckbox.__settingsWired) {
      maxPerRowCheckbox.__settingsWired = true;
      maxPerRowCheckbox.addEventListener('change', (ev) => {
        maxChordsPerRowEnabled = !!ev.target.checked;
        updateChordSettingsUI();
        applyMaxPerRowLayout();
        persistUISettings();
      });
    }
    if (maxPerRowInput && !maxPerRowInput.__settingsWired) {
      maxPerRowInput.__settingsWired = true;
      maxPerRowInput.addEventListener('input', (ev) => {
        const nextVal = clampMaxPerRow(ev.target.value);
        maxChordsPerRow = nextVal;
        maxPerRowInput.value = String(nextVal);
        applyMaxPerRowLayout();
        updateChordSettingsUI();
        persistUISettings();
      });
    }
    applyMaxPerRowLayout();
    updateChordSettingsUI();
    wireLibraryImportExportButtons();

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

    const isImportAreaVisible = () => {
      if (!importArea) return false;
      return getComputedStyle(importArea).display !== 'none';
    };

    const showImportArea = () => {
      if (!importArea) return;
      importArea.style.display = '';
      if (showImportBtn) showImportBtn.setAttribute('aria-expanded', 'true');
      if (importInput) {
        importInput.focus();
        if (typeof importInput.select === 'function') importInput.select();
      }
    };

    const hideImportArea = () => {
      if (!importArea) return;
      importArea.style.display = 'none';
      if (showImportBtn) showImportBtn.setAttribute('aria-expanded', 'false');
    };

    if (showImportBtn && importArea) {
      showImportBtn.setAttribute('aria-expanded', isImportAreaVisible() ? 'true' : 'false');
    }

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
        const rawShape = parts[1] || '';
        const shape =
          typeof window.normalizeShapeText === 'function'
            ? window.normalizeShapeText(rawShape)
            : rawShape;
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
      hideImportArea();
      if (importInput) importInput.value = '';
    };

    if (showImportBtn && importArea && !showImportBtn.__importToggleWired) {
      showImportBtn.__importToggleWired = true;
      showImportBtn.addEventListener('click', () => {
        if (isImportAreaVisible()) hideImportArea();
        else showImportArea();
      });
    }
    if (cancelImportBtn && importArea && !cancelImportBtn.__importWired) {
      cancelImportBtn.__importWired = true;
      cancelImportBtn.addEventListener('click', () => {
        hideImportArea();
      });
    }
    if (importBtn && !importBtn.__importWired) {
      importBtn.__importWired = true;
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
          const group = card.closest('.group');
          const grid = card.closest('.chord-grid');
          card.remove();
          deleteModeDirty = true;
          cleanupEmptyChordGrids(group);
          updateEmptyMsg();
          updateRowHandlePosition(grid);
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

  window.addEventListener('resize', () => {
    updateAllRowHandles();
    updateRowHandleHoverState();
  });
  // Expose for Undo/Redo DOM morphs (called after morphdom applies HTML)
  window.rewireChordUI = rewireChordUI;
})();



// === Center .chord-title exactly between .string-left and .string-right columns ===
(function () {
  function centerAllChordTitles() {
    // Catch both page and modal chord-cards
    const cards = document.querySelectorAll('.chord-card');
    cards.forEach(centerTitleForCard);
  }

  function scheduleCentering() {
    requestAnimationFrame(centerAllChordTitles);
  }

  // Recenter on load, resize, and after modal open
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleCentering);
  } else {
    scheduleCentering();
  }

  window.addEventListener('resize', scheduleCentering);

  // Optionally, observe DOM for modal entry (requires MutationObserver)
  const observer = new MutationObserver(scheduleCentering);
  observer.observe(document.body, { childList: true, subtree: true });

  // If using a framework/modal callback, also call scheduleCentering after modal open
  window.centerAllChordTitles = scheduleCentering; // for manual hooks if needed
})();
