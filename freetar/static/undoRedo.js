/* Persistent Undo/Redo for My Chords
   - Stores a snapshot history in localStorage so Undo/Redo works after Save or reload.
   - Applies a snapshot by POSTing it to /my-chords/edit, then reloads to re-render diagrams.
   - No external dependencies; self-contained IIFE.
*/
(() => {
  'use strict';

  // ---------- Config ----------
  const ENDPOINT = '/my-chords/edit';
  const STORAGE_KEY = 'freetar:chords:history:v1';
  const MAX_SNAPSHOTS = 50; // cap to avoid unbounded growth
  const BTN_ROW_SELECTOR = '.d-flex.mb-3.gap-2'; // your top button row

  const groupsRoot = document.getElementById('groups-root');
  if (!groupsRoot) return;

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Stable stringify (JSON is ordered enough for your structure)
  const jstr = (o) => JSON.stringify(o);

  // Build the same JSON your backend expects
  function serializeFromDOM() {
    const groups = [];
    $$('.group', groupsRoot).forEach((groupEl) => {
      const nameInput = $('.group-name', groupEl);
      const groupName = nameInput ? nameInput.value.trim() : '';
      const chords = [];
      $$('.chord-card', groupEl).forEach((card) => {
        const nameInput = $('.chord-name-input', card);
        const shapeInput = $('.chord-shape-input', card);
        const titleEl = $('.chord-title', card);
        const name = (
          nameInput && nameInput.value ? nameInput.value : titleEl ? titleEl.textContent : ''
        ).trim();
        const shape = shapeInput ? shapeInput.value.trim() : '';
        if (!shape) return; // ignore placeholders (matches your current save behavior)
        chords.push({ name: name || '(unnamed)', shape });
      });
      groups.push({ group: groupName || 'Group', chords });
    });
    return groups;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [], index: -1 };
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.items) || typeof parsed.index !== 'number')
        throw new Error('bad history');
      return parsed;
    } catch {
      return { items: [], index: -1 };
    }
  }

  function saveHistory(hist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
    } catch (e) {
      console.warn('[undo] failed to persist history', e);
    }
  }

  function statesEqual(a, b) {
    return jstr(a) === jstr(b);
  }

  function pushSnapshot(reason = '') {
    const hist = loadHistory();
    const current = serializeFromDOM();
    const last = hist.items[hist.items.length - 1];

    // If nothing changed, skip
    if (last && statesEqual(last, current)) {
      updateButtons();
      return;
    }

    // truncate redo branch
    if (hist.index < hist.items.length - 1) {
      hist.items = hist.items.slice(0, hist.index + 1);
    }

    hist.items.push(current);
    // cap history
    if (hist.items.length > MAX_SNAPSHOTS) {
      const cut = hist.items.length - MAX_SNAPSHOTS;
      hist.items = hist.items.slice(cut);
      hist.index = hist.items.length - 1;
    } else {
      hist.index = hist.items.length - 1;
    }

    saveHistory(hist);
    updateButtons();
    // console.debug('[undo] snapshot pushed:', reason);
  }

  async function applySnapshotAndPersist(targetState, reason = '') {
    try {
      // 1) Persist state on the server
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetState),
      });

      // 2) Fetch fresh HTML (no cache)
      const res = await fetch(window.location.href, {
        cache: 'no-store',
        headers: { 'X-Requested-With': 'fetch' },
      });
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      const html = await res.text();

      // 3) Parse and morph only #groups-root
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newRoot = doc.getElementById('groups-root');
      const curRoot = document.getElementById('groups-root');

      if (!newRoot || !curRoot) throw new Error('#groups-root missing in fetched HTML');
      if (typeof window.morphdom !== 'function') throw new Error('morphdom not loaded');

      window.morphdom(curRoot, newRoot, { childrenOnly: true });

      // 4) Re-wire interactive bits and update undo/redo button state
      if (window.rewireChordUI) window.rewireChordUI();
      updateButtons();
    } catch (e) {
      console.warn('[undo] Live morph failed; falling back to reload. Reason:', e);
      window.location.reload();
    }
  }

  function canUndo() {
    const hist = loadHistory();
    return hist.index > 0;
  }
  function canRedo() {
    const hist = loadHistory();
    return hist.index >= 0 && hist.index < hist.items.length - 1;
  }

  function doUndo() {
    const hist = loadHistory();
    if (hist.index <= 0) return;
    hist.index -= 1;
    saveHistory(hist);
    updateButtons();
    applySnapshotAndPersist(hist.items[hist.index], 'undo');
  }

  function doRedo() {
    const hist = loadHistory();
    if (hist.index >= hist.items.length - 1) return;
    hist.index += 1;
    saveHistory(hist);
    updateButtons();
    applySnapshotAndPersist(hist.items[hist.index], 'redo');
  }

  // ---------- Buttons UI ----------
  // ---------- Buttons UI ----------
  function insertButtons() {
    const row = $(BTN_ROW_SELECTOR);
    if (!row) return;

    // Ensure a right-aligned wrapper exists
    let wrap = document.getElementById('undo-redo-wrap');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.id = 'undo-redo-wrap';
      wrap.style.marginLeft = 'auto';
      wrap.style.display = 'flex';
      wrap.style.gap = '0.5rem';
      wrap.style.alignItems = 'center';
      row.appendChild(wrap);
    }

    // Create buttons if missing
    let btnUndo = $('#undo-history-btn');
    if (!btnUndo) {
      btnUndo = document.createElement('button');
      btnUndo.id = 'undo-history-btn';
      btnUndo.className = 'btn btn-sm btn-primary';
      btnUndo.title = 'Undo';
      btnUndo.setAttribute('aria-label', 'Undo');
      btnUndo.innerHTML = '<span class="material-icons-outlined" aria-hidden="true">undo</span>';
      btnUndo.addEventListener('click', (e) => {
        e.preventDefault();
        doUndo();
      });
      wrap.appendChild(btnUndo);
    }

    let btnRedo = $('#redo-history-btn');
    if (!btnRedo) {
      btnRedo = document.createElement('button');
      btnRedo.id = 'redo-history-btn';
      btnRedo.className = 'btn btn-sm btn-primary';
      btnRedo.title = 'Redo';
      btnRedo.setAttribute('aria-label', 'Redo');
      btnRedo.innerHTML = '<span class="material-icons-outlined" aria-hidden="true">redo</span>';
      btnRedo.addEventListener('click', (e) => {
        e.preventDefault();
        doRedo();
      });
      wrap.appendChild(btnRedo);
    }
  }

  function updateButtons() {
    const undoBtn = $('#undo-history-btn');
    const redoBtn = $('#redo-history-btn');
    if (!undoBtn || !redoBtn) return;
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  // ---------- Event capture (when state meaningfully changes) ----------
  function installCapture() {
    // 1) Edits (commit on blur)
    groupsRoot.addEventListener(
      'blur',
      (e) => {
        const t = e.target;
        if (
          t &&
          (t.classList.contains('group-name') ||
            t.classList.contains('chord-name-input') ||
            t.classList.contains('chord-shape-input'))
        ) {
          pushSnapshot('edit-blur');
        }
      },
      true,
    );

    // 2) Add chord (button)
    groupsRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('.add-chord');
      if (!btn) return;
      setTimeout(() => pushSnapshot('add-chord'), 0);
    });

    // 3) Delete chord (red minus)
    groupsRoot.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('.delete-chord-btn');
        if (!btn) return;
        setTimeout(() => pushSnapshot('delete-chord'), 0);
      },
      true,
    );

    // 4) Delete group (modal confirm)
    const confirmDeleteGroupBtn = document.getElementById('confirm-delete-group');
    if (confirmDeleteGroupBtn) {
      confirmDeleteGroupBtn.addEventListener('click', () => {
        setTimeout(() => pushSnapshot('delete-group'), 0);
      });
    }

    // 5) Add group (top row)
    const addGroupBtn = document.getElementById('add-group');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => {
        setTimeout(() => pushSnapshot('add-group'), 0);
      });
    }

    // 6) Batch import (if present)
    const importBtn = document.getElementById('import-chords-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        setTimeout(() => pushSnapshot('import'), 0);
      });
    }

    // 7) Manual Save removed — auto snapshots on edits/reorder/import are sufficient.

    // 8) Optional: chord reorder capture (requires Sortable onEnd hook; see note below)
    document.addEventListener('chords-reordered', () => {
      pushSnapshot('reorder');
    });
  }

  // ---------- Initialize / Reconcile ----------
  function reconcileOnLoad() {
    // Ensure we have a stack and the index points at the current DOM state
    const hist = loadHistory();
    const current = serializeFromDOM();

    if (hist.items.length === 0) {
      hist.items = [current];
      hist.index = 0;
      saveHistory(hist);
      return;
    }

    // Try to find current in the stack
    const curStr = jstr(current);
    let found = -1;
    for (let i = hist.items.length - 1; i >= 0; i--) {
      if (jstr(hist.items[i]) === curStr) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      hist.index = found;
      saveHistory(hist);
    } else {
      // Append current as new head (e.g., user loaded a different state)
      hist.items.push(current);
      // cap to MAX_SNAPSHOTS
      if (hist.items.length > MAX_SNAPSHOTS)
        hist.items = hist.items.slice(hist.items.length - MAX_SNAPSHOTS);
      hist.index = hist.items.length - 1;
      saveHistory(hist);
    }
  }

  // ---------- Boot ----------
  insertButtons();
  reconcileOnLoad();
  installCapture();
  updateButtons();

  // Optional: make buttons auto-update if something else mutates the stack
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) updateButtons();
  });
})();
