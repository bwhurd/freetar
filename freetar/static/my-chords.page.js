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
  let groupsRoot, addGroupBtn, deleteGroupModal, confirmDeleteGroupBtn, cancelDeleteGroupBtn;
  // Batch import UI refs
  let showImportBtn, importArea, importInput, importBtn, cancelImportBtn;

  // State
  let currentEditingCard = null;
  let deleteModeGroup = null;
  let deleteModeOffHandler = null;
  let deleteModeDirty = false;

  // Inject CSS so group tools (handle + buttons) only appear on hover/focus-within
  function ensureGroupHoverCSS() {
    if (document.getElementById('group-hover-tools-css')) return;
    const style = document.createElement('style');
    style.id = 'group-hover-tools-css';
    style.textContent = `
    /* Hide group-level controls by default */
    .group .group-header .group-handle,
    .group .group-header .add-chord,
    .group .group-header .delete-chords,
    .group .group-header .delete-group {
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease-in-out;
    }
    /* Reveal on mouse hover or when any control/input inside the group has focus */
    .group:hover .group-header .group-handle,
    .group:hover .group-header .add-chord,
    .group:hover .group-header .delete-chords,
    .group:hover .group-header .delete-group,
    .group:focus-within .group-header .group-handle,
    .group:focus-within .group-header .add-chord,
    .group:focus-within .group-header .delete-chords,
    .group:focus-within .group-header .delete-group {
      opacity: 1;
      pointer-events: auto;
    }
    /* Optional: on devices without hover, keep them available when focusing inside the group */
    @media (hover: none) {
      .group:focus-within .group-header .group-handle,
      .group:focus-within .group-header .add-chord,
      .group:focus-within .group-header .delete-chords,
      .group:focus-within .group-header .delete-group {
        opacity: 1;
        pointer-events: auto;
      }
    }
  `;
    document.head.appendChild(style);
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
    // Auto width, centered, and single-line to keep exactly 3 rows total
    row.style.cssText =
      'display:block; width:auto; margin-bottom:.15rem; white-space:nowrap; text-align:inherit;';
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
    const fields = card.querySelector('.chord-edit-fields');
    if (!fields) return;

    // Create (or reuse) the single body-level overlay so it can be wider than the card
    let bar = document.querySelector('.chord-symbols-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'chord-symbols-toolbar';
      // Wide overlay, normal font; floats above page content
      bar.style.cssText =
        'position:absolute; z-index:3000; user-select:none; width:auto; margin:0; padding:0;';
      bar.style.fontSize = '1em'; // normal size again
      bar.style.setProperty('--color-bg', '#2a282d'); // behind symbol
      bar.style.setProperty('--color-fg', '#efeffc'); // symbol color

      const row1 = ['Δ', '−', '°', 'ø', '7', 'Δ7', '−7', '°7', 'ø7', '6'];
      const row2 = ['9', '11', '13', 'add9', 'add11', 'add13', 'sus2', 'sus4'];
      const row3 = ['♭', '♯', '♮', '♭5', '♯5', '♭9', '♯9', '♯11', '♭13', ['(', ')'], '()', '/'];

      bar.appendChild(buildSymbolRow(card, row1));
      bar.appendChild(buildSymbolRow(card, row2));
      bar.appendChild(buildSymbolRow(card, row3));

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

      document.body.appendChild(bar);
    } else {
      bar.style.display = '';
    }

    // Insert or reuse an in-card spacer just below the inputs to push the next chord row down
    let spacer = card.querySelector('.chord-symbols-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.className = 'chord-symbols-spacer';
      spacer.style.width = '100%';
      spacer.style.height = '0px'; // will be set based on overlay height
      spacer.style.pointerEvents = 'none';
      fields.insertAdjacentElement('afterend', spacer);
    }

    // Reposition overlay: centered by default, but clamp to group container.
    const reposition = () => {
      const centerEl = card.querySelector('table.chord-diagram') || card;
      const centerRect = centerEl.getBoundingClientRect();
      const anchorRect = fields.getBoundingClientRect();
      const groupEl = card.closest('.group') || card;
      const groupRect = groupEl.getBoundingClientRect();

      const em = parseFloat(getComputedStyle(card).fontSize) || 16;
      const gap = Math.round(0.5 * em); // small gap below inputs

      // Measure current overlay
      bar.style.visibility = 'hidden';
      bar.style.left = '0px';
      bar.style.top = '0px';
      const width = bar.offsetWidth;

      const top = window.scrollY + anchorRect.bottom + gap;

      const centerX = window.scrollX + centerRect.left + centerRect.width / 2;
      const groupLeft = window.scrollX + groupRect.left;
      const groupRight = window.scrollX + groupRect.right;
      const pad = 8; // small breathing room from group edges

      // Default centered position
      let left = centerX - width / 2;
      let align = 'center';

      // Clamp to group container
      if (left < groupLeft + pad) {
        left = groupLeft + pad;
        align = 'left';
      } else if (left + width > groupRight - pad) {
        left = groupRight - width - pad;
        align = 'right';
      }

      // Finalize
      bar.style.left = `${left}px`;
      bar.style.top = `${top}px`;
      bar.style.visibility = '';
      bar.style.textAlign = align;

      // Reserve space below inputs so the overlay never sits on top of the next chord row
      const overlayHeight = bar.offsetHeight;
      const bottomMargin = em; // extra breathing room so overlays never get occluded
      spacer.style.height = `${overlayHeight + bottomMargin}px`;
    };

    bar.__reposition = reposition;
    reposition();
    window.addEventListener('scroll', bar.__reposition, true);
    window.addEventListener('resize', bar.__reposition, true);
    window.addEventListener('orientationchange', bar.__reposition, true);
  }

  const EDIT_URL = () => window.MY_CHORDS_EDIT_URL || null;

  // ---------- helpers ----------
  function buildDataFromDOM() {
    const groups = [];
    groupsRoot.querySelectorAll('.group').forEach((groupEl) => {
      const gName = groupEl.querySelector('.group-name')?.value.trim() || '';
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
      groups.push({ group: gName || 'Group', chords });
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

  function beginEditing(card) {
    if (currentEditingCard === card) return;
    if (currentEditingCard && currentEditingCard !== card) finishEditing(true);
    const fields = card.querySelector('.chord-edit-fields');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    if (!fields || !nameInput || !shapeInput) return;

    currentEditingCard = card;
    card.dataset.originalName = nameInput.value;
    card.dataset.originalShape = shapeInput.value;

    // Move the two input rows directly below the chord diagram (title/diagram stay in place)
    const table = card.querySelector('table.chord-diagram');
    if (table && table.nextSibling !== fields) {
      table.insertAdjacentElement('afterend', fields);
    }

    fields.style.display = '';

    // Show the wide 3-row symbols palette (overlay) and insert a spacer to push content below
    ensureSymbolToolbar(card);

    nameInput.focus();
    nameInput.select();
  }

  function finishEditing(commit) {
    const card = currentEditingCard;
    if (!card) return;
    const fields = card.querySelector('.chord-edit-fields');
    const title = card.querySelector('.chord-title');
    const nameInput = card.querySelector('.chord-name-input');
    const shapeInput = card.querySelector('.chord-shape-input');
    if (!fields || !title || !nameInput || !shapeInput) {
      currentEditingCard = null;
      return;
    }

    if (commit) {
      const newName = nameInput.value.trim();
      title.innerHTML = prettifyChordName(newName || '(unnamed)');
      renderCardDiagram(card); // update diagram for new shape
      persist('edit-commit'); // auto-save edit
    } else {
      const originalName = card.dataset.originalName || '';
      const originalShape = card.dataset.originalShape || '';
      nameInput.value = originalName;
      shapeInput.value = originalShape;
      title.textContent = originalName || '(unnamed)'; // raw text on cancel
    }

    // Tear down the wide overlay and its listeners
    const overlay = document.querySelector('.chord-symbols-toolbar');
    if (overlay) {
      window.removeEventListener('scroll', overlay.__reposition, true);
      window.removeEventListener('resize', overlay.__reposition, true);
      window.removeEventListener('orientationchange', overlay.__reposition, true);
      overlay.remove();
    }
    // Remove the in-card spacer that pushed content below
    const spacer = card.querySelector('.chord-symbols-spacer');
    if (spacer) spacer.remove();

    // Hide inputs; they remain positioned under the diagram for next edit
    fields.style.display = 'none';

    // Cleanup state
    delete card.dataset.originalName;
    delete card.dataset.originalShape;
    currentEditingCard = null;
  }

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
        e.preventDefault();
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
        e.preventDefault();
        finishEditing(false);
      }
    });
  }

  function addChordToGrid(grid, name = '(new)', shape = '000000', opts = {}) {
    const prettyTitle = prettifyChordName(name);
    const card = document.createElement('div');
    card.className = 'text-center chord-card mb-3';
    card.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-1 position-relative">
      <span class="material-icons-outlined chord-handle" style="cursor: move; font-size: 18px;">drag_indicator</span>
      <span class="chord-title flex-grow-1 text-truncate mx-1">${prettyTitle}</span>
      <span class="material-icons-outlined chord-edit" style="cursor: pointer; font-size: 18px;">edit</span>
      <button class="delete-chord-btn" type="button" title="Delete chord" tabindex="-1" style="display:none;">&#8722;</button>
    </div>
    <div class="chord-edit-fields mb-2" style="display: none;">
      <input class="form-control form-control-sm mb-1 chord-name-input" value="${name}">
      <input class="form-control form-control-sm chord-shape-input" value="${shape}">
    </div>
    <table class="chord-diagram"></table>`;
    grid.appendChild(card);
    wireChordCard(card);
    renderCardDiagram(card);
    if (!opts || !opts.silent) persist('add-chord'); // skip per-card save during batch import
    return card;
  }

  function wireGroup(groupEl) {
    const addChordBtn = groupEl.querySelector('.add-chord');
    const grid = groupEl.querySelector('.chord-grid');

    if (addChordBtn && grid && !addChordBtn.__wired) {
      addChordBtn.addEventListener('click', () => addChordToGrid(grid, '(new)', '000000'));
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

    groupsRoot.querySelectorAll('.group').forEach(wireGroup);
    ensureGroupSortable();
    updateEmptyMsg();
  }
  function enableDeleteMode(group) {
    if (deleteModeGroup && deleteModeGroup !== group) disableDeleteMode();
    deleteModeGroup = group;
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

  // ---------- init & global wiring ----------
  function init() {
    ensureGroupHoverCSS(); // make group tools appear only on hover/focus-within
    groupsRoot = document.getElementById('groups-root');
    if (!groupsRoot) return console.warn('my-chords.page.js: #groups-root not found.');
    addGroupBtn = document.getElementById('add-group');
    deleteGroupModal = document.getElementById('delete-group-modal');
    confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
    cancelDeleteGroupBtn = document.getElementById('cancel-delete-group');

    // ----- Batch Import wiring (restore old behavior) -----
    showImportBtn = document.getElementById('show-import-chords');
    importArea = document.getElementById('import-chords-area');
    importInput = document.getElementById('import-chords-input');
    importBtn = document.getElementById('import-chords-btn');
    cancelImportBtn = document.getElementById('cancel-import-chords');

    // Create a new group block (matches current header controls + drag handle)
    const createGroup = (initialName = 'Imported') => {
      const groupEl = document.createElement('div');
      groupEl.className = 'group mb-4';
      groupEl.innerHTML = `
          <div class="d-flex align-items-center mb-2 group-header gap-2">
            <span class="material-icons-outlined group-handle" style="cursor: move; font-size: 18px;">drag_indicator</span>
            <input class="form-control form-control-sm group-name" value="New group">
            <div class="group-top-buttons">
              <button type="button" class="btn btn-sm btn-primary add-chord">Add chord</button>
              <button type="button" class="btn btn-sm btn-primary delete-chords">Delete Chords</button>
              <button type="button" class="btn btn-sm btn-primary delete-group">Delete Group</button>
            </div>
          </div>
          <div class="d-grid chord-grid"
               style="row-gap: .5rem; column-gap: 2rem; grid-template-columns: repeat(auto-fill, minmax(min(120px, 100%), 1fr));"></div>`;
      groupsRoot.appendChild(groupEl);
      const nameInput = groupEl.querySelector('.group-name');
      if (nameInput) nameInput.value = initialName;
      wireGroup(groupEl); // wire Add chord + chord Sortable
      if (typeof ensureGroupSortable === 'function') ensureGroupSortable(); // keep group dragging alive
      return groupEl;
    };

    const getDefaultGroup = () => {
      return groupsRoot.querySelector('.group') || createGroup('Imported');
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

    // Add Group
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group mb-4';
        groupEl.innerHTML = `
          <div class="d-flex align-items-center mb-2 group-header gap-2">
            <span class="material-icons-outlined group-handle" style="cursor: move; font-size: 18px;">drag_indicator</span>
            <input class="form-control form-control-sm group-name" value="New group">
            <button type="button" class="btn btn-sm btn-primary add-chord">Add chord</button>
            <button type="button" class="btn btn-sm btn-primary delete-chords">Delete Chords</button>
            <button type="button" class="btn btn-sm btn-primary delete-group">Delete Group</button>
          </div>
         <div class="d-grid chord-grid"
               style="row-gap: .5rem; column-gap: 2rem; grid-template-columns: repeat(auto-fill, minmax(min(120px, 100%), 1fr));"></div>`;
        groupsRoot.appendChild(groupEl);
        wireGroup(groupEl);
      });
    }

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
      const deleteGroupBtn = e.target.closest('.delete-group');
      if (deleteGroupBtn && deleteGroupModal) {
        disableDeleteMode();
        deleteGroupModal.style.setProperty('display', 'flex', 'important');
        deleteGroupModal._target = deleteGroupBtn.closest('.group') || null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    });

    // Modal controls
    if (cancelDeleteGroupBtn) {
      cancelDeleteGroupBtn.addEventListener('click', () => {
        deleteGroupModal.style.setProperty('display', 'none', 'important');
        deleteGroupModal._target = null;
      });
    }
    if (confirmDeleteGroupBtn) {
      confirmDeleteGroupBtn.addEventListener('click', async () => {
        if (deleteGroupModal._target) {
          if (deleteModeGroup === deleteGroupModal._target) disableDeleteMode();
          deleteGroupModal._target.remove();
          await persist('delete-group');
        }
        deleteGroupModal.style.setProperty('display', 'none', 'important');
        deleteGroupModal._target = null;
      });
    }

    // Click-away commit + Esc cancel while editing
    document.addEventListener('click', (e) => {
      if (!currentEditingCard) return;
      if (currentEditingCard.contains(e.target)) return;
      finishEditing(true);
    });
    document.addEventListener('keydown', (e) => {
      if (!currentEditingCard) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        finishEditing(false);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose for Undo/Redo DOM morphs (called after morphdom applies HTML)
  window.rewireChordUI = rewireChordUI;
})();
